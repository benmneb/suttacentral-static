/**
 * Pagefind Search Integration
 *
 * Client-side full-text search using Pagefind static search index.
 * Handles search queries, filters, result rendering, pagination, and browser
 * history management. Searches across all texts and displays results
 * with excerpts and metadata, and a one word query's definition from the
 * dictionaries above them. Syncs URL structure with SuttaCentral.net.
 *
 * @module PagefindSearch
 * @requires /pagefind/pagefind.js - Static search index generated at build time
 * @requires Intl.DisplayNames - For language name localization
 */
;(async function () {
  'use strict'

  const pageSize = 5
  const options = {
    pageSize,
    ranking: {
      // https://pagefind.app/docs/ranking/
      termFrequency: 0.5,
      termSimilarity: 10.0,
      pageLength: 0.5,
    },
  }
  const pagefind = await import('/pagefind/pagefind.js')
  await pagefind.options(options)

  const input = document.getElementById('search-input')
  const form = document.getElementById('search-form')
  const countEl = document.getElementById('search-count')
  const resultsContainer = document.getElementById('search-results')
  const showMoreBtn = document.getElementById('show-more')
  const scRedirectLink = document.getElementById('sc-redirect')
  const filtersEl = document.getElementById('search-filters')
  const dictionaryEl = document.getElementById('search-dictionary')
  const dictionaryToggle = document.getElementById('search-dictionary-results')
  const sitePagesEl = document.getElementById('search-site-pages')
  const sitePagesToggle = document.getElementById('search-site-pages-results')
  const sitePageCards = [
    ...document.getElementById('search-site-page-cards').content.children,
  ]
  // Remembered by id, as they're not filters of the results, and kept out of the URL as filters are
  const answerToggles = [dictionaryToggle, sitePagesToggle]
  for (const toggle of answerToggles) {
    try {
      if (localStorage.getItem(toggle.id) === 'off') toggle.checked = false
    } catch {}
  }

  const textsBox = document.getElementById('search-texts')
  const titlesBox = document.getElementById('search-titles')
  const notesBox = document.getElementById('search-notes')
  const siteBox = document.getElementById('search-site')

  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
  const listFormat = new Intl.ListFormat('en')
  let latestSearch = 0

  // Hidden until now, as filtering can't work without this script
  filtersEl.hidden = false

  // By script, as romanised titles like Madhyamāgama are tagged lzh too
  const UPRIGHT_SCRIPTS =
    /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Tibetan}]/u

  /** Lets a long Pāli compound title wrap before its suffix, as in `helpers/strings.js` */
  const softHyphenateTitle = title =>
    title.replace(
      /(?<=\p{L})(sutta|vagga|paṇṇāsa|saṁyutta|nipāta)(?=\s*$)/u,
      '\u00ad$1'
    )

  /**
   * The root title in italics over the translation, linked, as on the menu pages. Just the one in italics
   * where `showTranslation` is false, there's only one, or they're the same
   */
  function titleHTML(root, translation, href, rootLang, showTranslation) {
    root = root?.trim()
    translation = translation?.trim()
    const link = text => `<a href="${href}">${text}</a>`
    const single =
      !root ||
      (showTranslation && root.toLowerCase() === translation?.toLowerCase())
    const title = single ? translation || root || '' : root
    const attributes = [
      !single && rootLang && ` lang="${rootLang}"`,
      UPRIGHT_SCRIPTS.test(title) && ' class="upright"',
    ]
    const dfn = `<dfn${attributes.filter(Boolean).join('')}>${softHyphenateTitle(title)}</dfn>`
    if (single || !translation || !showTranslation) return link(dfn)
    return `<span class="root-title">${link(dfn)}<span> ${translation}</span></span>`
  }

  /*
   * The deepest checked branches, as checking a child narrows its parent down to it.
   * Anything checked under an unchecked (so hidden) branch doesn't count.
   * A group with no name of its own comes back as one branch holding all its values.
   */
  function checkedBranches(list) {
    return [...list.children].flatMap(li => {
      const box = li.querySelector(':scope > input')
      if (!box.checked) return []
      const children = li.querySelector(':scope > ul')
      const deeper = children ? checkedBranches(children) : []
      if (deeper.length) return deeper
      // A group with no name of its own (ie Translators) means everyone in it
      if (!box.name) {
        return [
          [...children.querySelectorAll('input')].map(child => child.value),
        ]
      }
      return [box.value]
    })
  }

  /*
   * As per `data-pagefind-filter` in text.liquid, ie { in: { any: ['dn', 'mn'] }, lang: { any: ['en'] } },
   * with how many the user applied: one per checked branch, so Sutta → Middle is one
   */
  function getFilters() {
    const branches = id => checkedBranches(document.getElementById(id))
    const applied = Object.entries({
      in: branches('search-filters-collection'),
      author: branches('search-filters-author'),
      lang: [...filtersEl.querySelectorAll('input[name="lang"]:checked')].map(
        box => box.value
      ),
    }).filter(([, values]) => values.length)
    return {
      filters: Object.fromEntries(
        applied.map(([key, values]) => [key, { any: values.flat() }])
      ),
      count: applied.reduce((sum, [, values]) => sum + values.length, 0),
    }
  }

  // .net's in: shortcuts, from its /search-filter page, with pli-tv-vi for pli-tv, which here would take in
  // the abhidhamma too
  const COLLECTION_SETS = {
    ebs: 'dn da mn ma sn sa sa-2 sa-3 an ea ea-2 kp iti ud snp dhp thig thag sf',
    ebt: 'dn da mn ma sn sa sa-2 sa-3 an ea ea-2 kp iti ud snp dhp thig thag pli-tv-vi lzh-mg lzh-mi lzh-dg lzh-sarv lzh-mu lzh-ka lzh-upp san-mg san-lo up ea-ot d sf',
    ebct: 'da ma sa sa-2 sa-3 ea ea-2 lzh-mg lzh-mi lzh-dg lzh-sarv lzh-mu lzh-ka lzh-upp ea-ot d',
  }

  /** Ticks a filter's box and the branches above it, as a box under an unchecked one doesn't count */
  function tick(box) {
    box.checked = true
    let li = box.closest('li')
    while ((li = li.parentElement.closest('li'))) {
      li.querySelector(':scope > input').checked = true
    }
  }

  function collectionBoxes(uid) {
    const boxes = [...filtersEl.querySelectorAll('input[name="in"]')]
    const exact = boxes.filter(box => box.value === uid)
    if (exact.length) return exact
    // ie .net's pli-tv or lzh-mg, which aren't branches here, as the highest branches under them
    const under = boxes.filter(box => box.value.startsWith(`${uid}-`))
    return under.filter(
      box =>
        !under.some(other => other !== box && other.closest('li').contains(box))
    )
  }

  function filterBoxes(name, value) {
    if (name === 'in') {
      return (COLLECTION_SETS[value]?.split(' ') ?? [value]).flatMap(
        collectionBoxes
      )
    }
    const box = document.getElementById(
      `${name === 'lang' ? 'lang' : 'author'}-${value}`
    )
    return box ? [box] : []
  }

  /*
   * Ticks the filters for each of .net's by:, author:, in: and lang: in a query (ie ?query=by:sujato, as
   * the language pages link), and for its list <language>, sets what to include for its title: and
   * in:article (and SCX's own note:), and returns the rest of the query to search for.
   * One with nothing here (ie by:sabbamitta, who translates into German) is dropped, so the rest is still found
   */
  function takeFilterTokens(query) {
    const list = query.match(/^list\s+(\S+)$/i)
    if (list && filterBoxes('lang', list[1].toLowerCase()).length) {
      query = `lang:${list[1]}`
    }
    return query
      .replace(
        /(^|\s)(by|author|in|lang):(\S+)/gi,
        (match, space, name, value) => {
          if (/^in:article$/i.test(match.trim())) {
            includeOnly(siteBox)
            return space
          }
          const boxes = filterBoxes(name.toLowerCase(), value.toLowerCase())
          boxes.forEach(tick)
          if (boxes.length) filtersEl.open = true
          return space
        }
      )
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(title|note):\s*/i, (match, name) => {
        if (name.toLowerCase() === 'title') includeOnly(textsBox, titlesBox)
        else includeOnly(notesBox)
        return ''
      })
  }

  /** Ticks only these boxes of "Include in search" */
  function includeOnly(...boxes) {
    for (const box of [textsBox, titlesBox, notesBox, siteBox]) {
      box.checked = boxes.includes(box)
    }
    filtersEl.open = true
  }

  /*
   * .net's operators, which Pagefind has none of, ie `greed OR desire NOT anicca` as
   * { any: ['greed', 'desire'], not: ['anicca'] }. AND just goes, as Pagefind finds pages with every word anyway
   */
  function parseOperators(query) {
    const [wanted, ...not] = query.replace(/\s+AND\s+/g, ' ').split(/\s+NOT\s+/)
    return { any: wanted.split(/\s+OR\s+/), not }
  }

  // .net's searches of only references or volume and page
  const MODE = /^(ref|volpage):\s*/i

  /** The bundles the "Include in search" boxes pick, by name */
  const includedBundles = () =>
    [
      textsBox.checked && (titlesBox.checked ? 'titles' : 'texts'),
      notesBox.checked && 'notes',
      siteBox.checked && 'site',
    ].filter(Boolean)

  const BUNDLE_NAMES = { site: 'site pages' }

  const bundles = {}

  /** A site page's result, at its section with the most hits, with its icon, kind, edition and author */
  function sitePageHTML(data) {
    const { title, icon, kind, edition, author } = data.meta
    const section = data.sub_results.reduce(
      (best, sub) =>
        sub.locations.length > best.locations.length ? sub : best,
      data.sub_results[0] ?? data
    )
    const details = [
      `<dt class="sr-only">Kind</dt><dd class="with-icon"><i class="icon i-${icon}"></i><span>${escape(kind)}</span></dd>`,
      edition && `<dt class="sr-only">Edition</dt><dd>${escape(edition)}</dd>`,
      author && `<dt class="sr-only">Author</dt><dd>${escape(author)}</dd>`,
    ]
    return `
			 <article>
				 <h2><a href="${section.url}"><cite>${escape(title)}</cite></a></h2>
				 <dl>${details.filter(Boolean).join('')}</dl>
				 <p lang="en">…${section.excerpt}…</p>
			 </article>
		 `
  }

  /** One of the extra indexes searchExtras.js writes, fetched only when a search needs it */
  function loadBundle(name) {
    bundles[name] ??= import(`/pagefind-${name}/pagefind.js`).then(
      async bundle => {
        await bundle.options(options)
        return bundle
      }
    )
    return bundles[name]
  }

  /** A bundle's results for a query, with one search per term of .net's operators, best first */
  async function find(query, filters, bundle = pagefind) {
    // A null term lists every page the filters let through
    const search = async term =>
      (await bundle.search(term || null, { filters })).results
    const { any, not } = parseOperators(query)
    if (any.length === 1 && !not.length) return search(any[0])

    const [wanted, unwanted] = await Promise.all([
      Promise.all(any.map(search)),
      Promise.all(not.map(search)),
    ])
    const excluded = new Set(unwanted.flat().map(result => result.id))
    const best = new Map()
    for (const result of wanted.flat()) {
      if (excluded.has(result.id)) continue
      if (!(best.get(result.id)?.score >= result.score)) {
        best.set(result.id, result)
      }
    }
    return [...best.values()].sort((a, b) => b.score - a.score)
  }

  /** .net's `list authors`: everyone in the Author filter, each linked to their texts */
  function listAuthors() {
    const groups = [...document.querySelectorAll('#search-filters-author > li')]
    let total = 0
    resultsContainer.innerHTML = groups
      .map(group => {
        const rows = [...group.querySelectorAll('input[name="author"]')].map(
          box =>
            `<tr><td><a href="/search?query=by:${box.value}">${escape(box.labels[0].textContent.trim())}</a></td><td><code>${box.value}</code></td></tr>`
        )
        total += rows.length
        const name = group.querySelector(':scope > label').textContent.trim()
        return `<li><table><caption>${escape(name)}</caption><thead><tr><th>Name</th><th>ID</th></tr></thead><tbody>${rows.join('')}</tbody></table></li>`
      })
      .join('')
    countEl.textContent = `${total} authors`
  }

  const fetched = new Map()

  /** JSON from the site, fetched once, or again after one that failed */
  function fetchJSON(url) {
    if (!fetched.has(url)) {
      fetched.set(
        url,
        fetch(url)
          .then(response => {
            if (!response.ok) throw new Error(response.statusText)
            return response.json()
          })
          .catch(() => {
            fetched.delete(url)
            return null
          })
      )
    }
    return fetched.get(url)
  }

  /** A key's entry in one of the sets of shards searchExtras.js writes, in the shard of its longest prefix */
  async function shardEntry(dir, key) {
    const index = await fetchJSON(`/search/${dir}/index.json`)
    for (let i = key.length; i > 0 && index; i--) {
      const shard = index.prefixes[key.slice(0, i)]
      if (shard !== undefined) {
        return (await fetchJSON(`/search/${dir}/${shard}.json`))?.[key]
      }
    }
  }

  /** The pages a reference is on, as { page, anchor }, ie dn16/pli/ms and its anchor pts-vp-pli2.72 */
  async function findReference(id) {
    const key = id.toLowerCase()
    const [first, ...rest] = (await shardEntry('refs', key)) ?? []
    if (!first) return []
    // An id that isn't in lower case comes first
    const [anchor, pages] = first.includes('/')
      ? [key, [first, ...rest]]
      : [first, rest]
    return pages.map(page => ({ page, anchor }))
  }

  // .net's nikāya letters, ie M for MN, and the Vinaya as a whole
  const BOOKS = { d: 'dn', m: 'mn', s: 'sn', a: 'an', vin: 'pli-tv' }
  const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii']
  const ROMAN_VALUES = { i: 1, v: 5, x: 10, l: 50 }
  const romanToInt = roman =>
    [...roman].reduce((sum, char, i) => {
      const value = ROMAN_VALUES[char]
      return sum + (value < (ROMAN_VALUES[roman[i + 1]] ?? 0) ? -value : value)
    }, 0)

  /** .net's volpage: query, ie "SN ii 4", "M II 246", "S.II,236" or "PTS 2.72", as { book, vol, page } */
  function parseVolpage(query) {
    const words = query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
    if (words[0] === 'pts') words.shift()
    let book = ''
    if (/^[a-z]+$/.test(words[0]) && !/^[ivxl]+$/.test(words[0])) {
      book = BOOKS[words[0]] ?? words[0]
      words.shift()
    }
    let vol = 0
    if (/^[ivxl]+$/.test(words[0])) vol = romanToInt(words.shift())
    else if (words.length > 1) vol = Number(words.shift())
    const page = words.length ? parseInt(words[0], 10) : undefined
    return { book, vol, page }
  }

  const byUid = new Intl.Collator('en', { numeric: true }).compare

  // ie sn for sn12.39, but not for snp1.1
  const inBook = (uid, book) =>
    uid.startsWith(book) && !/[a-z]/.test(uid[book.length] ?? '')

  /**
   * The texts on a PTS volume's page, or in all of a volume, as [uid, { text, pages }], with the pages
   * of theirs that have that page's reference
   */
  async function findVolpage(query) {
    const { book, vol, page } = parseVolpage(query)
    if (Number.isNaN(page) || (!vol && page === undefined)) return []
    const names = book
      ? [book]
      : ((await fetchJSON('/search/volpages/index.json'))?.books ?? [])
    const files = await Promise.all(
      names.map(name => fetchJSON(`/search/volpages/${name}.json`))
    )
    const found = new Map()
    for (const file of files.filter(Boolean)) {
      for (const [uid, textVol, first, last] of file.pages) {
        if (book && !inBook(uid, book)) continue
        if (vol && textVol !== vol) continue
        if (page !== undefined && (page < first || page > last)) continue
        found.set(uid, { text: file.texts[uid], pages: [] })
      }
    }
    if (page !== undefined) {
      // As bilara has them, and as legacy texts do, ie mn.i.1
      const ids = [
        `pts-vp-pli${vol ? `${vol}.` : ''}${page}`,
        book && vol && `${book}.${ROMAN_NUMERALS[vol - 1]}.${page}`,
      ]
      const pages = await Promise.all(ids.filter(Boolean).map(findReference))
      for (const at of pages.flat()) {
        found.get(at.page.split('/')[0])?.pages.push(at)
      }
    }
    return [...found].sort(([a], [b]) => byUid(a, b))
  }

  /** The texts with a reference, as [uid, { pages }] */
  async function findReferences(query) {
    let id = query.replace(/\s+/g, '')
    // .net's ref:PTS 1.1, which bilara has as pts-vp-pli1.1
    id = id.replace(/^pts(?=\d)/i, 'pts-vp-pli')
    const found = new Map()
    for (const at of await findReference(id)) {
      const uid = at.page.split('/')[0]
      if (!found.has(uid)) found.set(uid, { pages: [] })
      found.get(uid).pages.push(at)
    }
    return [...found].sort(([a], [b]) => byUid(a, b))
  }

  /**
   * A text with the reference or on the page, linked to the spot in each of its pages, with its root text
   * first. A text with no such spot links to its own page
   */
  function referenceHTML(uid, { text = [], pages }, mode) {
    const [acronym = uid, root, title, rootLang, volpages] = text
    const langs = pages.map(({ page }) => page.split('/')[1])
    const editions = pages
      .map(({ page, anchor }) => {
        const [, lang, author] = page.split('/')
        const name = languageNames.of(lang)
        const translator =
          lang === 'en' || langs.filter(other => other === lang).length > 1
            ? (document
                .getElementById(`author-${author}`)
                ?.labels[0]?.textContent.trim() ?? author)
            : ''
        const href = `/${page}#${anchor}`
        return {
          lang,
          name,
          href,
          html: `<a href="${href}">${escape(name)}</a>${translator ? ` (${escape(translator)})` : ''}`,
        }
      })
      .sort(
        (a, b) =>
          (b.lang === rootLang) - (a.lang === rootLang) ||
          a.name.localeCompare(b.name)
      )
    const where =
      mode === 'volpage'
        ? escape(volpages)
        : `<mark>${escape(pages[0].anchor)}</mark>`
    return `
			 <article>
				 <h2>${titleHTML(root, title || acronym, editions[0]?.href ?? `/${uid}`, rootLang, true)}</h2>
				 <dl>
					 <dt class="sr-only">Acronym</dt><dd>${escape(acronym)}</dd>
					 <dt class="sr-only">${mode === 'volpage' ? 'Volume and page' : 'Reference'}</dt>
					 <dd class="with-icon"><i class="icon i-hashtag"></i><span>${where}</span></dd>
				 </dl>
				 ${editions.length ? `<p>${editions.map(edition => edition.html).join(', ')}</p>` : ''}
			 </article>
		 `
  }

  const REFERENCES_PAGE_SIZE = 20

  /** .net's ref: and volpage: searches, which are of their own data, so the filters don't apply */
  async function showReferences(mode, term, searchId, forQuery, inData) {
    const found = await (mode === 'ref'
      ? findReferences(term)
      : findVolpage(term))
    if (searchId !== latestSearch) return
    const finalCountMsg = `${found.length} result${found.length !== 1 ? 's' : ''}${forQuery}${inData}`
    countEl.innerHTML = finalCountMsg
    let shown = 0
    async function showMore() {
      const batch = found.slice(shown, shown + REFERENCES_PAGE_SIZE)
      if (mode === 'ref') {
        await Promise.all(
          batch.map(async ([uid, result]) => {
            result.text = await shardEntry('texts', uid)
          })
        )
        if (searchId !== latestSearch) return
      }
      resultsContainer.insertAdjacentHTML(
        'beforeend',
        batch
          .map(
            ([uid, result]) => `<li>${referenceHTML(uid, result, mode)}</li>`
          )
          .join('')
      )
      shown += batch.length
      showMoreBtn.hidden = shown >= found.length
    }
    await showMore()
    showMoreBtn.onclick = showMore
  }

  // A query of one word, which may be a Pāli one
  const ONE_WORD = /^[\p{L}\p{M}’'-]+$/u
  const MAX_DEFINITIONS = 3

  let dictionary = null

  // Fetched only once a search is of one word
  function loadDictionary() {
    dictionary ??= new Promise(resolve => {
      const script = document.createElement('script')
      script.src = '/scripts/dictionary.js'
      script.onload = () => resolve(window.scxDictionary)
      script.onerror = () => {
        dictionary = null
        resolve(null)
      }
      document.head.append(script)
    })
    return dictionary
  }

  const escape = text =>
    String(text).replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`)

  /*
   * What the dictionaries have for a one word query, above the results, as on .net: DPD's answer from word
   * lookup, and a link to its /define page
   */
  async function showDefinition(query, searchId) {
    if (!dictionaryEl) return
    dictionaryEl.hidden = true
    dictionaryEl.innerHTML = ''
    if (dictionaryToggle && !dictionaryToggle.checked) return
    if (!ONE_WORD.test(query)) return
    const lookup = await loadDictionary()
    if (!lookup) return
    const page = await lookup.definePage(query)
    const answer = (await lookup.lookup('pli-en', page ?? query)) ?? []
    const matches = answer.filter(match => match.d)
    if (searchId !== latestSearch || (!page && !matches.length)) return

    // Show only the first few, as a word like dhamma has loads
    let shown = 0
    const total = matches.reduce((sum, match) => sum + match.d.length, 0)
    const definitions = matches
      .map(match => {
        const defs = match.d.slice(0, MAX_DEFINITIONS - shown)
        shown += defs.length
        if (!defs.length) return ''
        return (
          `<dt lang="pli" translate="no">${escape(match.b)}</dt>` +
          (match.g ? `<dd><em>${escape(match.g)}</em></dd>` : '') +
          `<dd><ol>${defs.map(d => `<li>${d}</li>`).join('')}</ol></dd>`
        )
      })
      .join('')
    const left = total - shown
    const more = left
      ? `<p>…and ${left} more definition${left === 1 ? '' : 's'}</p>`
      : ''
    const href = page && `/define/${encodeURI(page)}`
    // Only a link to its page where DPD has nothing for it, ie a, which PTS has
    dictionaryEl.innerHTML = matches.length
      ? `<h2 id="search-dictionary-heading">Digital Pāḷi Dictionary</h2><dl>${definitions}</dl>${more}` +
        (page
          ? `<p><a href="${href}">${escape(dictionaryEl.dataset.allLabel)}<i class="icon i-arrowRight"></i></a></p>`
          : '')
      : `<h2 id="search-dictionary-heading"><a href="${href}">${escape(dictionaryEl.dataset.definitionsLabel)} <b lang="pli" translate="no">${escape(page)}</b><i class="icon i-arrowRight"></i></a></h2>`
    dictionaryEl.classList.toggle('only-link', !matches.length)
    dictionaryEl.hidden = false
  }

  // Too common to tell which page is meant
  const STOP_WORDS = new Set(['a', 'and', 'for', 'in', 'of', 'on', 'the', 'to'])
  // As `searchName` in sitePagesData.js makes a card's names
  const nameWords = text =>
    (
      text
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .match(/[\p{L}\p{N}]+/gu) ?? []
    ).filter(word => !STOP_WORDS.has(word))
  // The same word, or it without a short ending, ie simile for similes, but not dhamma for dhammapada
  const sameWord = (word, name) =>
    name === word ||
    (word.length > 2 && name.startsWith(word) && name.length - word.length <= 2)

  // Whether the words are those of a name, ie simile for similes or "digha nikaya" for Dīghanikāya
  const sameName = (words, name) => {
    const parts = nameWords(name)
    return (
      words.length > 0 &&
      ((parts.length === words.length &&
        parts.every((part, i) => sameWord(words[i], part))) ||
        sameWord(words.join(''), parts.join('')))
    )
  }

  /** Whether a query is one of a card's names, maybe with one of its tags, ie "dn guide" */
  function namesCard(card, wanted) {
    const tags = card.dataset.tags.split(' ')
    const words = wanted.filter(word => !tags.some(tag => sameWord(word, tag)))
    return card.dataset.names.split('|').some(name => sameName(words, name))
  }

  /**
   * The site pages a query names (ie map, similes, dn guide, Dīgha Nikāya, or a menu heading like Essays), above
   * the results, as the further reading on the collection pages
   */
  function showSitePages(query) {
    const shown = new Set()
    if (sitePagesToggle.checked) {
      const wanted = nameWords(query)
      sitePageCards
        .filter(card => namesCard(card, wanted))
        .forEach(card => shown.add(card))
      sitePageCards
        .filter(card => sameName(wanted, card.dataset.category))
        .forEach(card => shown.add(card))
    }
    const cards = [...shown]
    sitePagesEl
      .querySelector('ul')
      .replaceChildren(...cards.map(card => card.cloneNode(true)))
    sitePagesEl.hidden = !cards.length
  }

  /*
   * @param {string} query - What to search for, or '' to list all that the filters let through
   * @param {string} [netQuery] - The same search on .net, for the footer link
   */
  async function performSearch(query, netQuery = query) {
    const searchId = ++latestSearch
    document.title = `${query || 'Search'} @ SuttaCentral Express`
    countEl.hidden = false
    showMoreBtn.hidden = true

    // Update footer link
    const url = new URL(scRedirectLink.href)
    url.searchParams.set('query', netQuery)
    scRedirectLink.href = url.toString()

    const { filters, count } = getFilters()
    const term = query.replace(MODE, '')
    const mode = query.match(MODE)?.[1].toLowerCase()
    const included = includedBundles()
    const forQuery = term ? ` for <b>${escape(term)}</b>` : ''
    const inBundles = mode
      ? ` in ${mode === 'ref' ? 'references' : 'PTS volumes and pages'}`
      : included.join() === 'texts'
        ? ''
        : ` in ${listFormat.format(included.map(name => BUNDLE_NAMES[name] ?? name))}`
    const withFilters =
      count && !mode ? ` with ${count} filter${count !== 1 ? 's' : ''}` : ''
    countEl.innerHTML = `Searching${forQuery}${inBundles}${withFilters}…`
    resultsContainer.innerHTML = ''
    showDefinition(mode ? '' : term, searchId)
    showSitePages(mode ? '' : term)

    if (/^list authors$/i.test(query)) return listAuthors()
    if (mode) return showReferences(mode, term, searchId, forQuery, inBundles)

    if (!included.length) {
      countEl.textContent = 'Tick something under “Include in search”'
      filtersEl.open = true
      return
    }

    const results = (
      await Promise.all(
        included.map(async name => {
          const bundle = name === 'texts' ? pagefind : await loadBundle(name)
          const found = await find(term, filters, bundle)
          for (const result of found) result.bundle = name
          return found
        })
      )
    )
      .flat()
      .sort((a, b) => b.score - a.score)
    // A newer search (ie from ticking another filter) has started since
    if (searchId !== latestSearch) return

    const finalCountMsg = `${results.length} result${
      results.length !== 1 ? 's' : ''
    }${forQuery}${inBundles}${withFilters}`

    if (results.length === 0) {
      resultsContainer.innerHTML = ''
      countEl.innerHTML = finalCountMsg
      return
    }

    countEl.innerHTML = `Loading ${finalCountMsg}…`

    let resultsLoaded = 0
    const equalise = t => t.toLowerCase().replace(/\s/g, '')
    const equalisedQuery = equalise(term)

    async function showMore() {
      const batch = results.slice(resultsLoaded, resultsLoaded + pageSize)

      const dataPromises = batch.map(result => result.data())
      const allData = await Promise.all(dataPromises)
      if (searchId !== latestSearch) return

      countEl.innerHTML = finalCountMsg

      if (resultsLoaded === 0) {
        resultsContainer.innerHTML = ''
      }

      allData.forEach((data, i) => {
        const listItem = document.createElement('li')
        if (batch[i].bundle === 'site') {
          listItem.innerHTML = sitePageHTML(data)
          resultsContainer.appendChild(listItem)
          return
        }
        const readableLang = languageNames.of(data.meta.lang) // 'en' to 'English' etc
        const englishTitle = data.meta.translatorsTitle || data.meta.title // usually falls back to Sujato's
        const title = titleHTML(
          data.meta.originalTitle,
          englishTitle,
          data.url,
          data.meta.rootLang,
          data.meta.lang === 'en'
        )
        const acronym =
          equalise(data.meta.acronym) === equalisedQuery
            ? `<mark>${data.meta.acronym}</mark>`
            : data.meta.acronym
        const language = `<dt class="sr-only">Language</dt><dd>${readableLang}</dd>`
        const details = data.meta.segment
          ? `<dt class="sr-only">Note</dt>
						 <dd class="with-icon"><i class="icon i-chatBubbleBottomCenterText"></i><span>${data.meta.segment.includes(':') ? data.meta.segment : `${acronym}:${data.meta.segment}`} note by ${data.meta.author}</span></dd>
						 ${language}`
          : `<dt class="sr-only">Acronym</dt>
						 <dd>${acronym}</dd>
						 ${language}
						 <dt class="sr-only">Author</dt>
						 <dd>${data.meta.author}</dd>`

        listItem.innerHTML = `
				 <article>
					 <h2>${title}</h2>
					 <dl>${details}</dl>
					 ${batch[i].bundle === 'titles' ? '' : `<p lang="${data.meta.lang}">…${data.excerpt}…</p>`}
				 </article>
			 `
        resultsContainer.appendChild(listItem)
      })

      resultsLoaded += batch.length
      showMoreBtn.hidden = resultsLoaded >= results.length
    }

    // Load initial batch
    await showMore()
    if (searchId !== latestSearch) return

    showMoreBtn.onclick = showMore
  }

  // Pagefind splits words on a soft hyphen, which a title copied from a page has in it
  const cleanQuery = query =>
    query
      .normalize('NFC')
      .replace(/\p{Cf}/gu, '')
      .trim()

  // The filters in a query go into the filter boxes, so unticking one later isn't undone by the query
  async function searchFor(query) {
    query = cleanQuery(query)
    const term = takeFilterTokens(query)
    input.value = term
    await performSearch(term, query)
  }

  // Handle initial page load
  const params = new URLSearchParams(window.location.search)
  const initialQuery = params.get('query')
  if (initialQuery) await searchFor(initialQuery)

  form.addEventListener('submit', async e => {
    const url = new URL(window.location)
    if (url.pathname.includes('/search')) e.preventDefault()
    const query = cleanQuery(input.value)

    // Update URL without reload
    url.pathname = '/search'
    url.searchParams.set('query', query)
    history.pushState({}, '', url)

    await searchFor(query)
  })

  // Re-run the search on each filter change. Filters stay out of the URL, to keep it in sync with
  // SuttaCentral.net
  filtersEl.addEventListener('change', async e => {
    const query = cleanQuery(input.value)
    if (answerToggles.includes(e.target)) {
      try {
        if (e.target.checked) localStorage.removeItem(e.target.id)
        else localStorage.setItem(e.target.id, 'off')
      } catch {}
      const term = query.replace(MODE, '')
      if (e.target === dictionaryToggle) showDefinition(term, latestSearch)
      else showSitePages(term)
      return
    }
    if (query || getFilters().count) {
      await performSearch(query)
    } else {
      latestSearch++
      countEl.hidden = true
      if (dictionaryEl) dictionaryEl.hidden = true
      sitePagesEl.hidden = true
      showMoreBtn.hidden = true
      resultsContainer.innerHTML = ''
    }
  })

  // Handle back/forward navigation
  window.addEventListener('popstate', async () => {
    const params = new URLSearchParams(window.location.search)
    const query = params.get('query')
    if (query) await searchFor(query)
  })

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      input.focus()
    }
  })
})()

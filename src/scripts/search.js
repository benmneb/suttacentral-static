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

  const pageSize = 10
  const ranking = {
    // https://pagefind.app/docs/ranking/
    termFrequency: 0.5,
    termSimilarity: 10.0,
    pageLength: 0.5,
    // Low, so ie "bodhi" puts texts with the word before Bhikkhu Bodhi's translations
    metaWeights: { author: 0.2 },
  }
  const options = { ranking }
  // A note's meta has its text's titles, which at 5x outrank the texts
  const bundleMetaWeights = {
    notes: {
      title: 0.5,
      originalTitle: 0.5,
      translatorsTitle: 0.5,
      titleParts: 0.5,
      author: 0.2,
    },
  }
  const pagefind = await import('/pagefind/pagefind.js')
  await pagefind.options(options)

  const input = document.getElementById('search-input')
  const form = document.getElementById('search-form')
  const countEl = document.getElementById('search-count')
  const resultsContainer = document.getElementById('search-results')
  const showMoreBtn = document.getElementById('show-more')
  // Focus goes to the first new result, as the button moves down below them
  const onShowMore = showMore => async () => {
    const first = resultsContainer.children.length
    await showMore()
    resultsContainer.children[first]?.querySelector('a[href]')?.focus()
  }
  const scRedirectLink = document.getElementById('sc-redirect')
  const filtersEl = document.getElementById('search-filters')
  const resetFiltersBtn = document.getElementById('search-filters-reset')
  const appliedEl = document.getElementById('search-applied')
  const infoEl = document.getElementById('search-info')
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
  /** A language's name as the Language filter labels it, else as Intl does */
  // Not Intl alone, as Chrome's turns 'pli' into a bare 'pi'
  const languageName = lang =>
    document.getElementById(`lang-${lang}`)?.labels[0]?.textContent.trim() ??
    languageNames.of(lang)
  /** A language code as `lang` takes it, ie "pli" as "pi" */
  const langTag = code => {
    try {
      return Intl.getCanonicalLocales(code)[0]
    } catch {
      return code
    }
  }
  const listFormat = new Intl.ListFormat('en')
  let latestSearch = 0

  // Long enough that a quick search doesn't flash through Searching… and Loading…
  const PENDING_DELAY = 300
  let pendingTimer = null
  let pendingHTML = ''
  let pendingShown = false

  /** A count for while a search runs, shown once it's taken a while, which then clears the last one's results */
  function showPending(html) {
    pendingHTML = html
    if (pendingShown) countEl.innerHTML = html
    else {
      pendingTimer ??= setTimeout(() => {
        pendingTimer = null
        pendingShown = true
        countEl.hidden = false
        countEl.innerHTML = pendingHTML
        resultsContainer.innerHTML = ''
      }, PENDING_DELAY)
    }
  }

  /** A search's final count, in place of the last one's results if they still show */
  function showCount(html) {
    if (pendingTimer !== null) resultsContainer.innerHTML = ''
    stopPending()
    countEl.hidden = false
    countEl.innerHTML = html
  }

  function stopPending() {
    clearTimeout(pendingTimer)
    pendingTimer = null
    pendingShown = false
  }

  // Hidden until now, as filtering can't work without this script
  filtersEl.hidden = false
  infoEl.hidden = false

  // By script, as romanised titles like Madhyamāgama are tagged lzh too
  const UPRIGHT_SCRIPTS =
    /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Tibetan}]/u

  /** Lets a long Pāli compound title wrap before its suffix, as in `helpers/strings.js` */
  const softHyphenateTitle = title =>
    title.replace(
      /(\p{L})(sutta|vagga|paṇṇāsa|saṁyutta|nipāta)(?=\s*$)/u,
      '$1\u00ad$2'
    )

  /**
   * The root title in italics over the translation, linked, as on the menu pages. Just the one where
   * `showTranslation` is false, there's only one, or they're the same, and plain if that's the translation
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
      !single && rootLang && ` lang="${langTag(rootLang)}"`,
      UPRIGHT_SCRIPTS.test(title) && ' class="upright"',
    ]
    const name = softHyphenateTitle(title)
    const i = single
      ? name
      : `<i${attributes.filter(Boolean).join('')}>${name}</i>`
    if (single || !translation || !showTranslation) return link(i)
    return `<span class="root-title">${link(i)}<span> ${translation}</span></span>`
  }

  /*
   * The deepest checked boxes, as checking a child narrows its parent down to it.
   * Anything checked under an unchecked (so hidden) branch doesn't count, nor one the included bundles lack
   */
  function checkedBoxes(list) {
    return [...list.children].flatMap(li => {
      const box = li.querySelector(':scope > input')
      if (!box.checked || li.hidden) return []
      const children = li.querySelector(':scope > ul')
      const deeper = children ? checkedBoxes(children) : []
      return deeper.length ? deeper : [box]
    })
  }

  /** A checked box's values: its own, or for a group with no name of its own (ie Translators), everyone in it */
  const boxValues = box =>
    box.name
      ? [box.value]
      : [
          ...box
            .closest('li')
            .querySelectorAll(':scope > ul > li:not([hidden]) > input'),
        ].map(child => child.value)

  /*
   * As per `data-pagefind-filter` in text.liquid, ie { in: { any: ['dn', 'mn'] }, lang: { any: ['en'] } },
   * with the boxes the user applied: one per checked branch, so Sutta → Middle is one
   */
  function getFilters() {
    const applied = Object.entries({
      in: 'search-filters-collection',
      author: 'search-filters-author',
      lang: 'search-filters-lang',
    })
      .map(([key, id]) => [key, checkedBoxes(document.getElementById(id))])
      .filter(([, boxes]) => boxes.length)
    return {
      filters: Object.fromEntries(
        applied.map(([key, boxes]) => [key, { any: boxes.flatMap(boxValues) }])
      ),
      boxes: applied.flatMap(([, boxes]) => boxes),
    }
  }

  /** A filter's name on its own: a collection's reference (ie SN 12), else its whole name */
  function filterName(box) {
    const label = box.labels[0]
    return (
      label.querySelector('.collection-reference')?.textContent ??
      (label.title || label.firstChild.textContent.trim())
    )
  }

  /** A box per applied filter, to untick it from above the results */
  function showApplied(boxes) {
    appliedEl.hidden = !boxes.length
    appliedEl.innerHTML = boxes
      .map(box => {
        const id = `applied-${box.id}`
        const label = filterName(box)
        return `<li><input type="checkbox" id="${id}" checked><label for="${id}">${escape(label)}</label></li>`
      })
      .join('')
  }

  /** Unticks a filter's box, and each branch above it left with nothing ticked under it */
  function untick(box) {
    box.checked = false
    let li = box.closest('li')
    while ((li = li.parentElement.closest('li'))) {
      if (checkedBoxes(li.querySelector(':scope > ul')).length) break
      li.querySelector(':scope > input').checked = false
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

  const collectionList = document.getElementById('search-filters-collection')

  // As the build's `searchId`, ie "AN 1.1–10" as an1.1-10
  const searchId = text =>
    text.toLowerCase().replace(/\s+/g, '').replaceAll('–', '-')

  /** A text's box, at the top of Collection, for in: with a text's (or chapter's) id rather than a collection's */
  function textBox(value) {
    const id = `in-text-${value}`
    const box = document.getElementById(id)
    if (box) return box
    const li = document.createElement('li')
    li.innerHTML = `<input type="checkbox" name="in" id="${escape(id)}" data-text><label for="${escape(id)}">${escape(value)}</label>`
    li.firstChild.value = value
    const last = [
      ...collectionList.querySelectorAll(':scope > li > [data-text]'),
    ].at(-1)
    if (last) last.parentElement.after(li)
    else collectionList.prepend(li)
    return li.firstChild
  }

  /** Labels each new text box with the text's title and acronym, where the texts' shards have it */
  async function labelTexts() {
    const boxes = collectionList.querySelectorAll(
      '[data-text]:not([data-labelled])'
    )
    await Promise.all(
      [...boxes].map(async box => {
        box.dataset.labelled = ''
        const [acronym, , title] = (await shardEntry('texts', box.value)) ?? []
        if (!acronym) return
        box.labels[0].innerHTML = `${title?.trim() ? `${escape(title.trim())} ` : ''}<span class="collection-reference">${escape(acronym)}</span>`
      })
    )
  }

  /** Drops the text boxes left unticked, as only an in: makes them */
  function dropUntickedTexts() {
    for (const box of collectionList.querySelectorAll(
      '[data-text]:not(:checked)'
    )) {
      box.closest('li').remove()
    }
  }

  function filterBoxes(name, value) {
    if (name === 'in') {
      const boxes = (COLLECTION_SETS[value]?.split(' ') ?? [value]).flatMap(
        collectionBoxes
      )
      return boxes.length ? boxes : [textBox(searchId(value))]
    }
    const box = document.getElementById(
      `${name === 'lang' ? 'lang' : 'author'}-${value}`
    )
    return box ? [box] : []
  }

  /*
   * Ticks the filters for each of .net's by:, author:, in: and lang: in a query (ie ?query=by:sujato, as
   * the language pages link), in place of what that filter had, and for its list <language>, sets what
   * to include for its title: and in:article (and SCX's own text:, note:, site:, in:text, in:title, in:note
   * and in:site), and returns the rest of the query to search for.
   * One with nothing here (ie by:sabbamitta, who translates into German) is dropped, so the rest is still found
   */
  function takeFilterTokens(query) {
    const list = query.match(/^list\s+(\S+)$/i)
    if (list && filterBoxes('lang', list[1].toLowerCase()).length) {
      query = `lang:${list[1]}`
    }
    const cleared = new Set()
    return query
      .replace(
        /(^|\s)(by|author|in|lang):(\S+)/gi,
        (match, space, name, value) => {
          const include = match
            .trim()
            .match(/^in:(articles?|notes?|titles?|texts?|site)$/i)
          if (include) {
            includeFor(include[1])
            return space
          }
          const boxes = filterBoxes(name.toLowerCase(), value.toLowerCase())
          const filter = boxes[0]?.closest('[id^="search-filters-"]')
          if (filter && !cleared.has(filter)) {
            for (const box of filter.querySelectorAll('input')) {
              box.checked = false
            }
            cleared.add(filter)
          }
          boxes.forEach(tick)
          return space
        }
      )
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(texts?|titles?|notes?|site):\s*/i, (match, name) => {
        includeFor(name)
        return ''
      })
  }

  /** Ticks what to include for text:, title:, note: or site:, or in:text, in:title, in:note, in:site or in:article */
  function includeFor(name) {
    name = name.toLowerCase().replace(/s$/, '')
    if (name === 'text') includeOnly(textsBox)
    else if (name === 'title') includeOnly(textsBox, titlesBox)
    else if (name === 'note') includeOnly(notesBox)
    else includeOnly(siteBox)
  }

  /** Ticks only these boxes of "Include in search" */
  function includeOnly(...boxes) {
    for (const box of [textsBox, titlesBox, notesBox, siteBox]) {
      box.checked = boxes.includes(box)
    }
  }

  /*
   * .net's operators, which Pagefind has none of, ie `greed OR desire NOT anicca` as
   * { any: ['greed', 'desire'], not: ['anicca'] }. AND just goes, as Pagefind finds pages with every word anyway
   */
  function parseOperators(query) {
    const [wanted, ...not] = minusToNot(query)
      .replace(/\s+AND\s+/g, ' ')
      .split(/\s+NOT\s+/)
    return { any: wanted.split(/\s+OR\s+/), not }
  }

  /** A minus sign before a word as NOT, as Pagefind would drop it and find the word, but not in quotes */
  const minusToNot = query =>
    query.replace(/"[^"]*"|\s+-(?=\S)/g, match =>
      match.startsWith('"') ? match : ' NOT '
    )

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

  // Each loaded bundle's filter values, as filter → Set, or null for the texts' and titles', which have every one
  const bundleValues = new Map([
    ['texts', null],
    ['titles', null],
  ])

  /** Hides each filter box none of the included bundles has a value of, and each fieldset left with none */
  async function showApplicableFilters() {
    await labelTexts()
    await Promise.all(
      includedBundles()
        .filter(name => !bundleValues.has(name))
        .map(async name => {
          const values = await fetchJSON(`/pagefind-${name}/filter-values.json`)
          bundleValues.set(
            name,
            values &&
              Object.fromEntries(
                Object.entries(values).map(([key, list]) => [
                  key,
                  new Set(list),
                ])
              )
          )
        })
    )
    const included = includedBundles().map(name => bundleValues.get(name))
    const has = (key, value) =>
      included.some(values => !values || values[key]?.has(value))
    const onlySite = includedBundles().join() === 'site'
    // A branch stays while anything under it shows, as its box is the way to them
    function showBoxes(list, key) {
      let shown = false
      for (const li of list.children) {
        const box = li.querySelector(':scope > input')
        const children = li.querySelector(':scope > ul')
        const under = children ? showBoxes(children, key) : false
        // Site pages' Collection takes in those above and below, so there a lone last box adds nothing
        const lone = children?.querySelectorAll(':scope > li:not([hidden])')
        if (
          onlySite &&
          key === 'in' &&
          lone?.length === 1 &&
          !lone[0].querySelector(':scope > ul > li:not([hidden])')
        ) {
          lone[0].hidden = true
        }
        // A text's box stays, though filter-values.json leaves texts out, so the site pages find none
        li.hidden =
          !under &&
          !(box.name && ('text' in box.dataset || has(key, box.value)))
        shown ||= !li.hidden
      }
      return shown
    }
    for (const [id, key] of [
      ['search-filters-collection', 'in'],
      ['search-filters-lang', 'lang'],
      ['search-filters-author', 'author'],
    ]) {
      const list = document.getElementById(id)
      list.closest('fieldset').hidden = !showBoxes(list, key)
    }
  }

  /**
   * Only the filters a bundle has, ie not Language for the site pages, or null when nothing in it can pass.
   * Each site page has just the collection it's about, so there Collection takes in those above and below the
   * ticked ones, ie the Discourses essay and the Long Discourses guide for Long Discourses
   */
  function bundleFilters(name, filters) {
    const values = bundleValues.get(name)
    if (!values) return filters
    const own = Object.fromEntries(
      Object.entries(filters)
        .filter(([key]) => key in values)
        .map(([key, filter]) =>
          key === 'in' && name === 'site'
            ? [key, { any: relatedCollections(filter.any, values.in) }]
            : [key, filter]
        )
    )
    // Pagefind takes an empty `any` as no filter at all
    return own.in?.any.length === 0 ? null : own
  }

  /** The collections in `uids`, above them and below them, of those in `has` */
  function relatedCollections(uids, has) {
    const related = new Set()
    for (const box of filtersEl.querySelectorAll('input[name="in"]')) {
      if (!uids.includes(box.value)) continue
      let li = box.closest('li')
      for (const below of li.querySelectorAll('input[name="in"]')) {
        related.add(below.value)
      }
      while ((li = li.parentElement.closest('li'))) {
        related.add(li.querySelector(':scope > input').value)
      }
    }
    return [...related].filter(uid => has.has(uid))
  }

  const bundles = {}

  /** A site page's result, at its section with the most hits, with its icon, kind, edition and author */
  function sitePageHTML(data) {
    const { title, kind, edition, author } = data.meta
    const [icon] = data.filters.icon
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
        const own = bundleMetaWeights[name]
          ? {
              ...options,
              ranking: { ...ranking, metaWeights: bundleMetaWeights[name] },
            }
          : options
        await bundle.options(
          // Its words are character pairs, so 30 of them would be 30 characters
          name === 'chinese' ? { ...own, excerptLength: 60 } : own
        )
        return bundle
      }
    )
    return bundles[name]
  }

  /** The terms, plus each one's traditional form where it has simplified Chinese, as the texts are traditional */
  async function withTraditional(terms) {
    if (!terms.some(term => /\p{Script=Han}/u.test(term))) return terms
    const traditional = (await fetchJSON('/search/hant.json')) ?? {}
    return [
      ...new Set(
        terms.flatMap(term => [
          term,
          term.replace(/\p{Script=Han}/gu, char => traditional[char] ?? char),
        ])
      ),
    ]
  }

  /**
   * The Chinese texts' results for a term, with each run of Chinese in it as a phrase they must all have.
   * Their bundle has them as character pairs, so 四念處 is the exact phrase "四念 念處", and 四 the
   * character on its own
   */
  async function findChinese(term, filters) {
    const chinese = await loadBundle('chinese')
    const found = await Promise.all(
      term.match(/\p{Script=Han}+/gu).map(async phrase => {
        const chars = [...phrase]
        const pairs = chars.slice(1).map((char, i) => chars[i] + char)
        const { results } = await chinese.search(
          `"${pairs.join(' ') || phrase}"`,
          { filters }
        )
        return results
      })
    )
    const [first, ...rest] = found
    const scores = rest.map(
      results => new Map(results.map(result => [result.id, result.score]))
    )
    return first
      .filter(result => scores.every(score => score.has(result.id)))
      .map(result => {
        result.score += scores.reduce(
          (sum, score) => sum + score.get(result.id),
          0
        )
        result.bundle = 'chinese'
        return result
      })
      .sort((a, b) => b.score - a.score)
  }

  /** A Chinese result's excerpt as the text again, from its pairs (ie 謂四 四念 念處 處 、) or characters */
  function unpair(excerpt) {
    const tokens = excerpt.trim().split(/ +/)
    const isMarked = token => token?.startsWith('<mark>')
    const textOf = token => token?.replace(/<\/?mark>/g, '') ?? ''
    return tokens
      .map((token, i) => {
        const text = textOf(token)
        if (!/\p{Script=Han}/u.test(text)) return text
        const char = [...text][0]
        // A marked pair marks the character after it too
        const marked =
          isMarked(token) ||
          (isMarked(tokens[i - 1]) && [...textOf(tokens[i - 1])].length === 2)
        return marked ? `<mark>${char}</mark>` : char
      })
      .join('')
      .replaceAll('</mark><mark>', '')
  }

  /** A bundle's results for a query, with one search per term of .net's operators, best first */
  async function find(query, filters, bundle = pagefind) {
    // A null term lists every page the filters let through
    const search = async term =>
      bundle === pagefind && /\p{Script=Han}/u.test(term)
        ? findChinese(term, filters)
        : (await bundle.search(term || null, { filters })).results
    const parsed = parseOperators(query)
    const any = await withTraditional(parsed.any)
    const not = await withTraditional(parsed.not)
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
    const html = groups
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
    showCount(`${total.toLocaleString('en')} authors`)
    resultsContainer.innerHTML = html
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
        const name = languageName(lang)
        const translator =
          lang === 'en' || langs.filter(other => other === lang).length > 1
            ? (document
                .getElementById(`author-${author}`)
                ?.labels[0]?.textContent.trim() ?? author)
            : ''
        return { lang, name, translator, href: `/${page}#${anchor}` }
      })
      .sort(
        (a, b) =>
          (b.lang === rootLang) - (a.lang === rootLang) ||
          a.name.localeCompare(b.name)
      )
    let languagesHTML = ''
    for (const [i, edition] of editions.entries()) {
      const prev = editions[i - 1]
      if (edition.lang === prev?.lang) languagesHTML += ', '
      else if (prev) languagesHTML += ' <span aria-hidden="true">∙</span> '
      if (edition.lang !== prev?.lang && edition.translator)
        languagesHTML += `${escape(edition.name)}: `
      languagesHTML += `<a href="${edition.href}">${escape(edition.translator || edition.name)}</a>`
    }
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
				 ${languagesHTML && `<p>${languagesHTML}</p>`}
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
    const finalCountMsg = `${found.length.toLocaleString('en')} result${found.length !== 1 ? 's' : ''}${forQuery}${inData}`
    showCount(finalCountMsg)
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
    showMoreBtn.onclick = onShowMore(showMore)
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

  /** A place on a bit of the map, as `includes/miniMap.liquid` draws it */
  function miniMapHTML({ id, icon, type, view, x, y }, base) {
    const shape =
      type === 'point'
        ? `<use href="${base}#marker-${icon}" transform="translate(${x} ${y})" x="-3" y="-3" width="6" height="6" />`
        : `<use class="${type}" href="${base}#${id.replace('place', 'shape')}" />`
    return `<div class="mini-map"><svg viewBox="${view}" aria-hidden="true"><use href="${base}#base" /><a href="/map#${id}" tabindex="-1">${shape}</a></svg><a href="/map#${id}"><i class="icon i-map"></i>View on full map</a></div>`
  }

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
    const mapBase = dictionaryEl.dataset.mapBase
    const [answer, places] = await Promise.all([
      lookup.lookup('pli-en', page ?? query),
      page && mapBase && fetchJSON('/map/places.json'),
    ])
    const place = places?.[page]
    const matches = (answer ?? []).filter(match => match.d)
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
          `<dt lang="pi" translate="no">${escape(match.b)}</dt>` +
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
    const map = place ? miniMapHTML(place, mapBase) : ''
    dictionaryEl.innerHTML = matches.length
      ? `<h2 id="search-dictionary-heading">Digital Pāḷi Dictionary</h2><dl>${definitions}</dl>${more}${map}` +
        (page
          ? `<p><a href="${href}">${escape(dictionaryEl.dataset.allLabel)}<i class="icon i-arrowRight"></i></a></p>`
          : '')
      : `<h2 id="search-dictionary-heading"><a href="${href}">${escape(dictionaryEl.dataset.definitionsLabel)} <b lang="pi" translate="no">${escape(page)}</b><i class="icon i-arrowRight"></i></a></h2>${map}`
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
    showMoreBtn.hidden = true

    // Update footer link
    const url = new URL(scRedirectLink.href)
    url.searchParams.set('query', minusToNot(netQuery))
    scRedirectLink.href = url.toString()

    const { filters, boxes } = getFilters()
    const term = query.replace(MODE, '')
    const mode = query.match(MODE)?.[1].toLowerCase()
    showApplied(mode ? [] : boxes)
    const included = includedBundles()
    const forQuery = term ? ` for <b>${escape(term)}</b>` : ''
    const inBundles = mode
      ? ` in ${mode === 'ref' ? 'references' : 'PTS volumes and pages'}`
      : included.join() === 'texts'
        ? ''
        : ` in ${listFormat.format(included.map(name => BUNDLE_NAMES[name] ?? name))}`
    const withFilters =
      boxes.length && !mode
        ? ` with ${boxes.length} filter${boxes.length !== 1 ? 's' : ''}`
        : ''
    showPending(`Searching${forQuery}${inBundles}${withFilters}…`)
    showDefinition(mode ? '' : term, searchId)
    showSitePages(mode ? '' : term)

    if (/^list authors$/i.test(query)) return listAuthors()
    if (mode) return showReferences(mode, term, searchId, forQuery, inBundles)

    if (!included.length) {
      showCount('Tick something under “Include in search”')
      filtersEl.open = true
      return
    }

    const results = (
      await Promise.all(
        included.map(async name => {
          const bundle = name === 'texts' ? pagefind : await loadBundle(name)
          const own = bundleFilters(name, filters)
          const found = own ? await find(term, own, bundle) : []
          for (const result of found) result.bundle ??= name
          return found
        })
      )
    )
      .flat()
      .sort((a, b) => b.score - a.score)
    // A newer search (ie from ticking another filter) has started since
    if (searchId !== latestSearch) return

    const finalCountMsg = `${results.length.toLocaleString('en')} result${
      results.length !== 1 ? 's' : ''
    }${forQuery}${inBundles}${withFilters}`

    if (results.length === 0) {
      showCount(finalCountMsg)
      return
    }

    showPending(`Loading ${finalCountMsg}…`)

    let resultsLoaded = 0
    const equalise = t => t.toLowerCase().replace(/\s/g, '')
    const equalisedQuery = equalise(term)

    async function showMore() {
      const batch = results.slice(resultsLoaded, resultsLoaded + pageSize)

      const dataPromises = batch.map(result => result.data())
      const allData = await Promise.all(dataPromises)
      if (searchId !== latestSearch) return

      showCount(finalCountMsg)

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
        const readableLang = languageName(data.meta.lang) // 'en' to 'English' etc
        // A root's translatorsTitle is its own heading, ie （三八六） 無有關鍵 (SA 386)
        const englishTitle =
          data.meta.lang === 'en'
            ? data.meta.translatorsTitle || data.meta.title
            : data.meta.title
        const title = titleHTML(
          data.meta.originalTitle,
          englishTitle,
          data.url,
          data.meta.rootLang,
          true
        )
        const acronym =
          equalise(data.meta.acronym) === equalisedQuery
            ? `<mark>${data.meta.acronym}</mark>`
            : data.meta.acronym
        const language = `<dt class="sr-only">Language</dt><dd>${readableLang}</dd>`
        const details = data.meta.segment
          ? `<dt class="sr-only">Note</dt>
						 <dd class="with-icon"><i class="icon i-chatBubbleBottomCenterText"></i><span>${data.meta.segment.includes(':') ? data.meta.segment : `${acronym}:${data.meta.segment}`} note by ${data.meta.author}</span></dd>`
          : `<dt class="sr-only">Acronym</dt>
						 <dd>${acronym}</dd>
						 ${language}
						 <dt class="sr-only">Author</dt>
						 <dd>${data.meta.author}</dd>`

        listItem.innerHTML = `
				 <article>
					 <h2>${title}</h2>
					 <dl>${details}</dl>
					 ${batch[i].bundle === 'titles' ? '' : `<p lang="${langTag(data.meta.lang)}">…${batch[i].bundle === 'chinese' ? unpair(data.excerpt) : data.excerpt}…</p>`}
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

    showMoreBtn.onclick = onShowMore(showMore)
  }

  // Pagefind splits words on a soft hyphen, which a title copied from a page has in it
  const cleanQuery = query =>
    query
      .normalize('NFC')
      .replace(/\p{Cf}/gu, '')
      .trim()

  const searchBoxes = () =>
    [...filtersEl.querySelectorAll('input[type="checkbox"]')].filter(
      box => !answerToggles.includes(box)
    )

  function updateResetFiltersButton() {
    // Not disabled, which would drop the focus of whoever just pressed it
    resetFiltersBtn.ariaDisabled = String(
      textsBox.checked &&
        searchBoxes().every(box => box === textsBox || !box.checked) &&
        answerToggles.every(toggle => toggle.checked)
    )
  }

  // In history.state, as filters stay out of the URL, so going back shows the filters a search had
  const saveBoxes = () =>
    history.replaceState(
      {
        boxes: searchBoxes()
          .filter(box => box.checked)
          .map(box => box.id),
      },
      ''
    )

  function restoreBoxes(ids) {
    for (const id of ids) {
      if (id.startsWith('in-text-')) textBox(id.slice('in-text-'.length))
    }
    for (const box of searchBoxes()) box.checked = ids.includes(box.id)
  }

  /*
   * The filters in a query go into the filter boxes, so unticking one later isn't undone by the query.
   * `boxes` are the ids of the boxes ticked when this search was last shown, to tick those instead
   */
  async function searchFor(query, boxes) {
    query = cleanQuery(query)
    const term = takeFilterTokens(query)
    if (boxes) restoreBoxes(boxes)
    dropUntickedTexts()
    await showApplicableFilters()
    saveBoxes()
    updateResetFiltersButton()
    input.value = term
    // .net has no site: or in:site, only in:article, and no in:text
    await performSearch(
      term,
      query
        .replace(/(^|\s)(site:\s*|in:site(\s+|$))/i, '$1in:article ')
        .replace(/(^|\s)in:texts?(?=\s|$)/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
  }

  function clearResults() {
    latestSearch++
    document.title = 'Search @ SuttaCentral Express'
    stopPending()
    countEl.hidden = true
    showApplied([])
    if (dictionaryEl) dictionaryEl.hidden = true
    sitePagesEl.hidden = true
    showMoreBtn.hidden = true
    resultsContainer.innerHTML = ''
  }

  // Handle initial page load
  const params = new URLSearchParams(window.location.search)
  const initialQuery = params.get('query')
  if (initialQuery) await searchFor(initialQuery, history.state?.boxes)
  else {
    await showApplicableFilters()
    saveBoxes()
    updateResetFiltersButton()
  }

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

  // The info's examples run here, without reloading the page
  infoEl.addEventListener('click', async e => {
    const link = e.target.closest('a[href^="/search?"]')
    if (!link || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    history.pushState({}, '', link.href)
    infoEl.open = false
    await searchFor(new URL(link.href).searchParams.get('query'))
  })

  resetFiltersBtn.addEventListener('click', async () => {
    if (resetFiltersBtn.ariaDisabled === 'true') return
    for (const box of searchBoxes()) box.checked = false
    textsBox.checked = true
    dropUntickedTexts()

    for (const toggle of answerToggles) {
      toggle.checked = true
      try {
        localStorage.removeItem(toggle.id)
      } catch {}
    }

    await showApplicableFilters()
    saveBoxes()
    updateResetFiltersButton()
    const query = cleanQuery(input.value)
    if (query || getFilters().boxes.length) await performSearch(query)
    else clearResults()
  })

  // Re-run the search on each filter change. Filters stay out of the URL, to keep it in sync with
  // SuttaCentral.net
  async function filtersChanged(box) {
    updateResetFiltersButton()
    const query = cleanQuery(input.value)
    if (answerToggles.includes(box)) {
      try {
        if (box.checked) localStorage.removeItem(box.id)
        else localStorage.setItem(box.id, 'off')
      } catch {}
      const term = query.replace(MODE, '')
      if (box === dictionaryToggle) showDefinition(term, latestSearch)
      else showSitePages(term)
      return
    }
    if ([textsBox, titlesBox, notesBox, siteBox].includes(box)) {
      await showApplicableFilters()
    }
    saveBoxes()
    if (query || getFilters().boxes.length) await performSearch(query)
    else clearResults()
  }

  filtersEl.addEventListener('change', e => filtersChanged(e.target))

  // Focus moves on, as the search replaces the unticked box
  appliedEl.addEventListener('change', async e => {
    const chips = [...appliedEl.querySelectorAll('input')]
    const index = chips.indexOf(e.target)
    const box = document.getElementById(e.target.id.replace(/^applied-/, ''))
    untick(box)
    const changed = filtersChanged(box)
    const left = appliedEl.querySelectorAll('input')
    ;(
      left[Math.min(index, left.length - 1)] ?? filtersEl.firstElementChild
    ).focus()
    await changed
  })

  // Handle back/forward navigation
  window.addEventListener('popstate', async () => {
    const params = new URLSearchParams(window.location.search)
    const query = params.get('query')
    const boxes = history.state?.boxes
    if (query) return searchFor(query, boxes)
    if (boxes) restoreBoxes(boxes)
    await showApplicableFilters()
    updateResetFiltersButton()
    input.value = ''
    if (getFilters().boxes.length) await performSearch('')
    else clearResults()
  })

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      input.focus()
    }
  })
})()

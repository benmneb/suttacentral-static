/**
 * Pagefind Search Integration
 *
 * Client-side full-text search using Pagefind static search index.
 * Handles search queries, filters, result rendering, pagination, and browser
 * history management. Searches across all texts and displays results
 * with excerpts and metadata. Syncs URL structure with SuttaCentral.net.
 *
 * @module PagefindSearch
 * @requires /pagefind/pagefind.js - Static search index generated at build time
 * @requires Intl.DisplayNames - For language name localization
 */
;(async function () {
  'use strict'

  const pageSize = 5
  const pagefind = await import('/pagefind/pagefind.js')
  await pagefind.options({
    pageSize,
    ranking: {
      // https://pagefind.app/docs/ranking/
      termFrequency: 0.5,
      termSimilarity: 10.0,
      pageLength: 0.5,
    },
  })

  const input = document.getElementById('search-input')
  const form = document.getElementById('search-form')
  const countEl = document.getElementById('search-count')
  const resultsContainer = document.getElementById('search-results')
  const showMoreBtn = document.getElementById('show-more')
  const scRedirectLink = document.getElementById('sc-redirect')
  const filtersEl = document.getElementById('search-filters')
  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
  let latestSearch = 0

  // Hidden until now, as filtering can't work without this script
  filtersEl.hidden = false

  // By script, as romanised titles like Madhyamāgama are tagged lzh too
  const UPRIGHT_SCRIPTS =
    /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Tibetan}]/u

  /** Lets a long Pāli compound title wrap before its suffix, as in `tools/strings.js` */
  const softHyphenateTitle = title =>
    title.replace(
      /(?<=\p{L})(sutta|vagga|paṇṇāsa|saṁyutta|nipāta)(?=\s*$)/u,
      '\u00ad$1'
    )

  /** The root title in italics over the translation, linked, as on the menu pages */
  function titleHTML(root, translation, href) {
    root = root?.trim()
    translation = translation?.trim()
    if (
      !root ||
      !translation ||
      root.toLowerCase() === translation.toLowerCase()
    ) {
      return `<a href="${href}">${softHyphenateTitle(translation || root || '')}</a>`
    }
    const upright = UPRIGHT_SCRIPTS.test(root) ? ' class="upright"' : ''
    return `<span class="root-title"><a href="${href}"><dfn${upright}>${softHyphenateTitle(root)}</dfn></a><span> ${translation}</span></span>`
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

  /*
   * Ticks the author filter for each of .net's by:<author> in a query (ie ?query=by:sujato, as
   * the language pages link), and returns the rest of the query to search for
   */
  function takeAuthorTokens(query) {
    return query
      .replace(/(^|\s)by:(\S+)/g, (match, space, uid) => {
        const box = document.getElementById(`author-${uid}`)
        if (!box) return match
        box.checked = true
        // Its group too, as a box under an unchecked group doesn't count
        box
          .closest('ul')
          .closest('li')
          .querySelector(':scope > input').checked = true
        filtersEl.open = true
        return space
      })
      .trim()
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
    const { filters, count } = getFilters()
    const forQuery = query ? ` for <b>${query}</b>` : ''
    const withFilters = count
      ? ` with ${count} filter${count !== 1 ? 's' : ''}`
      : ''
    countEl.innerHTML = `Searching${forQuery}${withFilters}…`
    resultsContainer.innerHTML = ''

    // A null term lists every page the filters let through
    const results = await pagefind.search(query || null, { filters })
    // A newer search (ie from ticking another filter) has started since
    if (searchId !== latestSearch) return

    const finalCountMsg = `${results.results.length} result${
      results.results.length !== 1 ? 's' : ''
    }${forQuery}${withFilters}`

    if (results.results.length === 0) {
      resultsContainer.innerHTML = ''
      countEl.innerHTML = finalCountMsg
      return
    }

    countEl.innerHTML = `Loading ${finalCountMsg}…`

    let resultsLoaded = 0
    const equalise = t => t.toLowerCase().replace(/\s/g, '')
    const equalisedQuery = equalise(query)

    async function showMore() {
      const batch = results.results.slice(
        resultsLoaded,
        resultsLoaded + pageSize
      )

      const dataPromises = batch.map(result => result.data())
      const allData = await Promise.all(dataPromises)
      if (searchId !== latestSearch) return

      countEl.innerHTML = finalCountMsg

      if (resultsLoaded === 0) {
        resultsContainer.innerHTML = ''
      }

      allData.forEach(data => {
        const readableLang = languageNames.of(data.meta.lang) // 'en' to 'English' etc
        const englishTitle = data.meta.translatorsTitle || data.meta.title // usually falls back to Sujato's
        const title =
          data.meta.lang === 'en'
            ? titleHTML(data.meta.originalTitle, englishTitle, data.url)
            : titleHTML(data.meta.originalTitle, null, data.url)
        const acronym = data.meta.acronym

        const listItem = document.createElement('li')
        listItem.innerHTML = `
				 <article>
					 <h2>${title}</h2>
					 <dl>
						 <dt class="sr-only">Acronym</dt>
						 <dd>${
               equalise(acronym) === equalisedQuery
                 ? `<mark>${acronym}</mark>`
                 : acronym
             }</dd>
						 <dt class="sr-only">Language</dt>
						 <dd>${readableLang}</dd>
						 <dt class="sr-only">Author</dt>
						 <dd>${data.meta.author}</dd>
					 </dl>
					 <p lang="${data.meta.lang}">…${data.excerpt}…</p>
				 </article>
			 `
        resultsContainer.appendChild(listItem)
      })

      resultsLoaded += batch.length
      showMoreBtn.hidden = resultsLoaded >= results.results.length
    }

    // Load initial batch
    await showMore()
    if (searchId !== latestSearch) return

    showMoreBtn.onclick = showMore

    // Update footer link
    const url = new URL(scRedirectLink.href)
    url.searchParams.set('query', netQuery)
    scRedirectLink.href = url.toString()
  }

  // The by:<author> goes into the filters, so unticking it later isn't undone by the query
  async function searchFor(query) {
    const term = takeAuthorTokens(query)
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
    const query = input.value.trim()

    // Update URL without reload
    url.pathname = '/search'
    url.searchParams.set('query', query)
    history.pushState({}, '', url)

    await searchFor(query)
  })

  // Re-run the search on each filter change. Filters stay out of the URL, to keep it in sync with
  // SuttaCentral.net
  filtersEl.addEventListener('change', async () => {
    const query = input.value.trim()
    if (query || getFilters().count) {
      await performSearch(query)
    } else {
      latestSearch++
      countEl.hidden = true
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

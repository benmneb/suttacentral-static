/**
 * Pagefind Search Integration
 *
 * Client-side full-text search using Pagefind static search index.
 * Handles search queries, result rendering, pagination, and browser
 * history management. Searches across all texts and displays results
 * with excerpts and metadata. Syncs URL structure with SuttaCentral.net.
 *
 * @module PagefindSearch
 * @requires /pagefind/pagefind.js - Static search index generated at build time
 * @requires Intl.DisplayNames - For language name localization
 */
;(async function () {
  'use strict'

  // First, turn off default no-JS-so-use-external-search behaviour
  document
    .querySelector('button[popovertarget="search-modal"]')
    ?.setAttribute('type', 'button')
  document
    .querySelector('form:has(button[popovertarget="search-modal"])')
    ?.addEventListener('submit', e => e.preventDefault())

  const input = document.getElementById('search-input')
  const form = document.getElementById('search-form')
  form.action = '/search'
  form.querySelector('input[type="hidden"]')?.remove()
  input.name = 'query'

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

  const languageNames = new Intl.DisplayNames(['en'], { type: 'language' })
  const resultsContainer = document.getElementById('search-results')
  const countEl = document.getElementById('search-count')
  const showMoreBtn = document.getElementById('show-more')
  const scRedirectLink = document.getElementById('sc-redirect')

  async function performSearch(query) {
    document.title = `${query} on SuttaCentral Express`
    countEl.hidden = false
    showMoreBtn.hidden = true
    countEl.innerHTML = `Searching for <b>${query}</b>…`
    resultsContainer.innerHTML = ''

    const results = await pagefind.search(query)
    const finalCountMsg = `${results.results.length} result${
      results.results.length !== 1 ? 's' : ''
    } for <b>${query}</b>`

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

      countEl.innerHTML = finalCountMsg

      if (resultsLoaded === 0) {
        resultsContainer.innerHTML = ''
      }

      allData.forEach(data => {
        const readableLang = languageNames.of(data.meta.lang) // 'en' to 'English' etc
        const englishTitle = data.meta.translatorsTitle || data.meta.title // usually falls back to Sujato's
        const bestTitle =
          data.meta.lang === 'en' ? englishTitle : data.meta.originalTitle
        const acronym = data.meta.acronym

        const listItem = document.createElement('li')
        listItem.innerHTML = `
				 <article>
					 <h2>
						 <a href="${data.url}">
							 ${bestTitle}
						 </a>
					 </h2>
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

    showMoreBtn.onclick = showMore

    // Update footer link
    const url = new URL(scRedirectLink.href)
    url.searchParams.set('query', query)
    scRedirectLink.href = url.toString()
  }

  // Handle initial page load
  const params = new URLSearchParams(window.location.search)
  const initialQuery = params.get('query')
  if (initialQuery) {
    input.value = initialQuery
    await performSearch(initialQuery)
  }

  form.addEventListener('submit', async e => {
    const url = new URL(window.location)
    if (url.pathname.includes('/search')) e.preventDefault()
    const query = input.value.trim()

    // Update URL without reload
    url.pathname = '/search'
    url.searchParams.set('query', query)
    history.pushState({}, '', url)

    await performSearch(query)
  })

  // Handle back/forward navigation
  window.addEventListener('popstate', async () => {
    const params = new URLSearchParams(window.location.search)
    const query = params.get('query')
    if (query) {
      input.value = query
      await performSearch(query)
    }
  })
})()

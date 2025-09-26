import Fetch, { AssetCache } from '@11ty/eleventy-fetch'
import ora from 'ora'

const CACHE_DURATION = '*' // https://www.11ty.dev/docs/plugins/fetch/#change-the-cache-duration
const DEV_MODE = process.env.NODE_ENV !== 'prod'
const MAX_CONCURRENT_REQUESTS = 50

let cachedMasterData = null
let isBuilding = false

const spinner = ora('Fetching...')
spinner.spinner = { frames: ['⏳'] }

const startTime = Date.now()
let endpointsHit = 0
let fetchErrors = 0
let pubInfoErrors = 0
let cacheTimeErrors = 0

function menuUrl(path = '') {
  return `https://suttacentral.net/api/menu/${path}?language=en`
}
function leafUrl(uid) {
  return `https://suttacentral.net/api/suttaplex/${uid}?language=en`
}
function segmentedTranslationUrl(uid, author, lang) {
  return `https://suttacentral.net/api/bilarasuttas/${uid}/${author}?lang=${lang}`
}
function suttasUrl(uid, author, lang) {
  return `https://suttacentral.net/api/suttas/${uid}/${author}?lang=${lang}&siteLanguage=en`
}
function parallelsUrl(uid) {
  return `https://suttacentral.net/api/parallels/${uid}`
}
function publicationInfoUrl(suttaUid, lang, translatorUid) {
  return `https://suttacentral.net/api/publication_info/${suttaUid}/${lang}/${translatorUid}`
}

/**
 * Fetches JSON data with caching and cache timestamp tracking.
 *
 * Uses Eleventy Fetch to cache responses and adds a `scx_fetched_at` property
 * indicating when the data was originally fetched from Sutta Central (not when
 * it was served from cache) to print on the page for all to see.
 *
 * @param {string} url - The SuttaCentral API URL to fetch data from
 * @returns {Promise<Object>} The returned JSON data with an additional `scx_fetched_at` property
 */
async function fetchJson(url) {
  endpointsHit++

  const options = {
    duration: CACHE_DURATION,
    type: 'json',
    filenameFormat: (cacheKey, hash) => {
      return `${url.split('/api/')[1]}-${cacheKey}-${hash}`
    },
  }

  const data = await Fetch(url, options)

  let scx_fetched_at = new Date().toUTCString() // Current time for new fetches

  try {
    const cache = new AssetCache(url, '.cache', options)
    const cachedTimestamp = cache.getCachedTimestamp()
    if (cachedTimestamp) {
      scx_fetched_at = new Date(cachedTimestamp).toUTCString()
    }
  } catch (error) {
    cacheTimeErrors++
    // Use current time as fallback as well
    console.warn(`Could not read cache timestamp for ${url}:`, error.message)
  }

  if (Array.isArray(data)) {
    return data.map((item) => ({ ...item, scx_fetched_at }))
  } else {
    return { ...data, scx_fetched_at }
  }
}

/**
 * Used to limit simultaneous processing of data, to avoid NodeJS memory heap errors.
 * Eleventy Fetch already includes HTTP concurrency: https://www.11ty.dev/docs/plugins/fetch/#change-global-concurrency
 */
async function limitConcurrency(promises, limit) {
  const results = []
  for (let i = 0; i < promises.length; i += limit) {
    const batch = promises.slice(i, i + limit)
    const batchResults = await Promise.all(batch)
    results.push(...batchResults)
  }
  return results
}

async function fetchDataTree(uid, depth = 0) {
  let menuData
  try {
    menuData = await fetchJson(menuUrl(uid))
  } catch (e) {
    fetchErrors++
    spinner
      .fail(`Fetch error for /menu with uid: ${uid} at depth ${depth}`)
      .start()
    return null
  }

  if (!menuData || !Array.isArray(menuData) || !menuData[0]) {
    spinner
      .warn(
        `Malformed or empty data from /menu for uid: ${uid} at depth ${depth}`
      )
      .start()
    return null
  }

  let node = menuData[0]

  async function getTextData() {
    let suttaplexData = null
    try {
      suttaplexData = await fetchJson(leafUrl(node.uid))
    } catch (e) {
      fetchErrors++
      spinner.fail(`Fetch error for /suttaplex with uid: ${node.uid}`).start()
    }

    if (!suttaplexData || !Array.isArray(suttaplexData) || !suttaplexData[0]) {
      return node
    }

    let parallelsData = null
    try {
      parallelsData = await fetchJson(parallelsUrl(node.uid))
    } catch (e) {
      fetchErrors++
      spinner.fail(`Fetch error for /parallels/${node.uid}`).start()
    }

    const translations = suttaplexData[0]?.translations
    if (!Array.isArray(translations) || !translations.length) {
      return { ...node, ...suttaplexData[0], _parallels_data: parallelsData }
    }

    function filterTranslations(translations) {
      if (!translations.length) return []
      return translations.filter((t) => t.lang === 'en' || t.is_root)
      // return translations // oh no my memory 🤯
    }

    const translationsToProcess = filterTranslations(translations)

    const translationPromises = translationsToProcess.map(async (trans) => {
      let bilaraData
      if (trans.segmented) {
        try {
          bilaraData = await fetchJson(
            segmentedTranslationUrl(node.uid, trans.author_uid, trans.lang)
          )
        } catch (e) {
          fetchErrors++
          spinner
            .fail(
              `Fetch error for '/bilarasuttas' with translation: ${node.uid}/${trans.author_uid} at depth ${depth}`
            )
            .start()
          return null
        }
      }

      let suttasData
      try {
        suttasData = await fetchJson(
          suttasUrl(node.uid, trans.author_uid, trans.lang)
        )
        suttasData.suttaplex.translations = filterTranslations(
          suttasData.suttaplex.translations
        )
      } catch (e) {
        fetchErrors++
        spinner
          .fail(
            `Fetch error for /suttas with translation: ${node.uid}/${trans.author_uid} at depth ${depth}`
          )
          .start()
        return null
      }

      let publicationData
      try {
        publicationData = await fetchJson(
          publicationInfoUrl(node.uid, trans.lang, trans.author_uid)
        )
      } catch {
        fetchErrors++
        pubInfoErrors++
        publicationData = { error: true }
        // It's possibly only root texts and Sujato's translations actually have data here.
        // This error object is what SC returns for errors also, ie: https://suttacentral.net/api/publication_info/dn1/en/bodhi
      }

      // Add translated texts and publication info into `/suttaplex`.translations
      // to keep the texts data with its meta-data.
      return {
        ...trans,
        _suttas_data: suttasData,
        ...(trans.segmented && { _bilarasuttas_data: bilaraData }),
        ...(!publicationData.error && {
          _publication_info: publicationData[0],
        }),
      }
    })

    const mergedTranslations = await limitConcurrency(
      translationPromises,
      MAX_CONCURRENT_REQUESTS
    )

    return {
      ...node,
      ...suttaplexData[0],
      translations: mergedTranslations.filter(Boolean),
      _parallels_data: parallelsData,
    }
  }

  if (node.node_type === 'leaf') {
    return await getTextData()
  }

  // Recursion for children nodes.
  // These nodes are all type "root" or "branch".
  // The Pātimokkha's get /suttaplex data while still a branch node.
  if (node.children?.length) {
    if (node.uid?.endsWith('-pm') || node.uid?.includes('-pm-')) {
      node = await getTextData()
    }

    node.children = (
      await limitConcurrency(
        node.children.map((child) => fetchDataTree(child.uid, depth + 1)),
        MAX_CONCURRENT_REQUESTS
      )
    ).filter(Boolean)
  }

  return node
}

/*
 * Generated structured, nested data for the the whole site
 * by recursively calling SuttaCentral's `/menu/${uid}` API
 * and nesting the result in the `children` value.
 *
 * When it gets to a `"node_type": "leaf"`, it switches to `/suttaplex/${uid}` API
 * to get the more detailed meta-data for the text (including translations array).
 *
 * Then, if `segmented` is `true` on the translation object,
 * it then uses the `/bilarasuttas` API, in addition to the `/suttas` API
 * to get the actual translated text and associated data.
 *
 * This master output is then used by the various `flat...Data.js` files
 * to add `scx_path` key, json-ld data, and flatten this deeply nested tree
 * to sync URL structure with SuttaCentral.net.
 */
export default async function () {
  if (cachedMasterData) return cachedMasterData

  if (isBuilding) {
    return new Promise((resolve) => {
      const checkCache = setInterval(() => {
        if (cachedMasterData) {
          clearInterval(checkCache)
          resolve(cachedMasterData)
        }
      }, 100)
    })
  }

  isBuilding = true

  try {
    spinner.start()
    const roots = ['sutta', 'vinaya', 'abhidhamma']
    const tree = await Promise.all(roots.map((uid) => fetchDataTree(uid)))
    cachedMasterData = tree
    return tree
  } catch (e) {
    spinner.fail(e.message)
    return []
  } finally {
    const elapsedMins = ((Date.now() - startTime) / 60_000).toFixed(2)
    const successCount = endpointsHit - fetchErrors
    const successRate =
      endpointsHit > 0 ? ((successCount / endpointsHit) * 100).toFixed(1) : 0
    let errorDetails = ''
    if (fetchErrors > 0) {
      errorDetails += `, ${fetchErrors} total failed`
      if (pubInfoErrors > 0) {
        const pubInfoRate = ((pubInfoErrors / fetchErrors) * 100).toFixed(1)
        errorDetails += `, ${pubInfoErrors} (${pubInfoRate}%) failed from \`/publication_info\``
      }
      if (cacheTimeErrors > 0) {
        errorDetails += `, and ${cacheTimeErrors} errors reading cache data timestamp`
      }
    }

    spinner
      .succeed(`Fetched from ${endpointsHit} endpoints in ~${elapsedMins} mins`)
      .info(
        `Results: ${successCount}/${endpointsHit} successful (${successRate}%)${errorDetails}`
      )

    isBuilding = false
    endpointsHit = 0
    fetchErrors = 0
    pubInfoErrors = 0
  }
}

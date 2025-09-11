import Fetch from '@11ty/eleventy-fetch'
import ora from 'ora'

const CACHE_DURATION = '*' // https://www.11ty.dev/docs/plugins/fetch/#change-the-cache-duration
const DEV_MODE = process.env.NODE_ENV !== 'production'
const MAX_CONCURRENT_REQUESTS = 50 // Limit concurrent requests

// Cache the master data globally to avoid refetching
let cachedMasterData = null
let isBuilding = false

function menuUrl(path = '') {
  return `https://suttacentral.net/api/menu/${path}?language=en`
}
function leafUrl(uid) {
  return `https://suttacentral.net/api/suttaplex/${uid}?language=en`
}
function segmentedTranslationUrl(uid, author, lang) {
  return `https://suttacentral.net/api/bilarasuttas/${uid}/${author}?lang=${lang}`
}
function legacyTranslationUrl(uid, author, lang) {
  return `https://suttacentral.net/api/suttas/${uid}/${author}?lang=${lang}&siteLanguage=en`
}
function parallelsUrl(uid) {
  return `https://suttacentral.net/api/parallels/${uid}`
}

async function fetchJson(url) {
  return await Fetch(url, {
    duration: CACHE_DURATION,
    type: 'json',
  })
}

// Utility to limit concurrent promises
async function limitConcurrency(promises, limit) {
  const results = []
  for (let i = 0; i < promises.length; i += limit) {
    const batch = promises.slice(i, i + limit)
    const batchResults = await Promise.all(batch)
    results.push(...batchResults)
  }
  return results
}

const spinner = ora('Fetching...')
spinner.spinner = { frames: ['⏳'] }

const startTime = Date.now()
let endpointsHit = 0

async function fetchDataTree(uid, depth = 0) {
  let json
  try {
    json = await fetchJson(menuUrl(uid))
    endpointsHit++
  } catch (e) {
    spinner
      .fail(`Fetch error for /menu with uid: ${uid} at depth ${depth}`)
      .start()
    return null
  }

  // Sometimes the API returns a non-array or malformed data
  if (!json || !Array.isArray(json) || !json[0]) {
    spinner
      .warn(
        `Malformed or empty data from /menu for uid: ${uid} at depth ${depth}`
      )
      .start()
    return null
  }

  const node = json[0]

  if (node.node_type === 'leaf') {
    let suttaplexData = null
    try {
      suttaplexData = await fetchJson(leafUrl(node.uid))
      endpointsHit++
    } catch (e) {
      spinner.fail(`Fetch error for /suttaplex with uid: ${node.uid}`).start()
    }

    // Ensure suttaplexData[0] exists
    if (!suttaplexData || !Array.isArray(suttaplexData) || !suttaplexData[0]) {
      return node
    }

    const translations = suttaplexData[0]?.translations
    if (!Array.isArray(translations) || !translations.length) {
      return { ...node, ...suttaplexData[0] }
    }

    // In dev mode, limit translations reduce memory usage
    const translationsToProcess = DEV_MODE
      ? translations.filter((t) => t.lang === 'en' || t.is_root)
      : translations

    // Add translated text to `/suttaplex` object, with concurrency limiting
    const translationPromises = translationsToProcess.map(async (trans) => {
      let texts
      try {
        texts = await fetchJson(
          trans.segmented
            ? segmentedTranslationUrl(node.uid, trans.author_uid, trans.lang)
            : legacyTranslationUrl(node.uid, trans.author_uid, trans.lang)
        )
        endpointsHit++
      } catch (e) {
        spinner
          .fail(
            `Fetch error for ${trans.segmented ? '/bilarasuttas' : '/suttas'} with translation: ${node.uid}/${trans.author_uid} at depth ${depth}`
          )
          .start()
        return null
      }
      // Add translated texts data into `/suttaplex`.translations
      // to keep the texts data with its meta-data.
      return {
        ...trans,
        ...(trans.segmented
          ? { _bilarasuttas_data: texts }
          : { _suttas_data: texts.translation }),
      }
    })

    const mergedTranslations = await limitConcurrency(
      translationPromises,
      MAX_CONCURRENT_REQUESTS
    )

    // Add parallels data (skip in dev mode for faster builds)
    let parallelsData = null
    if (!DEV_MODE) {
      try {
        parallelsData = await fetchJson(parallelsUrl(node.uid))
        endpointsHit++
      } catch (e) {
        spinner.fail(`Fetch error for /parallels/${node.uid}`).start()
      }
    }

    return {
      ...node,
      ...suttaplexData[0],
      translations: mergedTranslations.filter(Boolean),
      _parallels_data: parallelsData,
    }
  }

  // Recursion for children nodes
  // These nodes are all type "root" or "branch"
  if (node.children?.length) {
    const childPromises = node.children.map((child) =>
      fetchDataTree(child.uid, depth + 1)
    )
    node.children = (
      await limitConcurrency(childPromises, MAX_CONCURRENT_REQUESTS)
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
 * it then uses the `/bilarasuttas` API, otherwise the legacy `/suttas` API
 * to get the actual translated text.
 *
 * This master output is then used by the various `flat...Data.js` files
 * to add `scx_path` key and flatten the nested structure appropriately
 * to sync URL structure with SuttaCentral.net.
 */
export default async function (file) {
  // Return cached data if available
  if (cachedMasterData) {
    return cachedMasterData
  }

  // Prevent multiple simultaneous builds
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
    // const roots = ['sutta', 'vinaya', 'abhidhamma']
    const roots = ['sutta']
    const tree = await Promise.all(roots.map((uid) => fetchDataTree(uid)))
    cachedMasterData = tree
    spinner.succeed(`Fetch complete for ${file?.eleventy ? 'master' : file}`)
    return tree
  } catch (e) {
    spinner.fail(e.message)
    return []
  } finally {
    isBuilding = false
    spinner.info(
      `Fetched from ${endpointsHit} endpoints in ~${((Date.now() - startTime) / 60_000).toFixed(2)} mins`
    )
    endpointsHit = 0
  }
}

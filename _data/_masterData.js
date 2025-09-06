import Fetch from '@11ty/eleventy-fetch'
import ora from 'ora'

const CACHE_DURATION = '*' // https://www.11ty.dev/docs/plugins/fetch/#change-the-cache-duration

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

const spinner = ora('Fetching...')
spinner.spinner = { frames: ['⏳'] }

const startTime = Date.now()
let endpointsHit = 0

async function fetchDataTree(uid, depth = 0) {
  let json
  try {
    json = await Fetch(menuUrl(uid), {
      duration: CACHE_DURATION,
      type: 'json',
    })
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
      suttaplexData = await Fetch(leafUrl(node.uid), {
        duration: CACHE_DURATION,
        type: 'json',
      })
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

    // Add translated text to `/suttaplex` object
    const mergedTranslations = await Promise.all(
      translations.map(async (trans) => {
        let texts
        try {
          texts = await Fetch(
            trans.segmented
              ? segmentedTranslationUrl(node.uid, trans.author_uid, trans.lang)
              : legacyTranslationUrl(node.uid, trans.author_uid, trans.lang),
            {
              duration: CACHE_DURATION,
              type: 'json',
            }
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
    )

    // Add parallels data
    let parallelsData
    try {
      parallelsData = await Fetch(parallelsUrl(node.uid), {
        duration: CACHE_DURATION,
        type: 'json',
      })
      endpointsHit++
    } catch (e) {
      spinner.fail(`Fetch error for /parallels/${node.uid}`).start()
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
    node.children = (
      await Promise.all(
        node.children.map((child) => fetchDataTree(child.uid, depth + 1))
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
 * it then uses the `/bilarasuttas` API, otherwise the legacy `/suttas` API
 * to get the actual translated text.
 *
 * This master output is then used by the various `flat...Data.js` files
 * to add `scx_path` key and flatten the nested structure appropriately
 * to sync URL structure with SuttaCentral.net.
 */
export default async function (file) {
  try {
    spinner.start()
    // const roots = ['sutta', 'vinaya', 'abhidhamma']
    const roots = ['sutta']
    const tree = await Promise.all(roots.map((uid) => fetchDataTree(uid)))
    spinner.succeed(`Fetch complete for ${file?.eleventy ? 'master' : file}`)
    return tree
  } catch (e) {
    spinner.fail(e.message)
    return []
  } finally {
    spinner.info(
      `Fetched from ${endpointsHit} endpoints in ~${((Date.now() - startTime) / 60_000).toFixed(2)} mins`
    )
    endpointsHit = 0
  }
}

import Fetch from '@11ty/eleventy-fetch'
import ora from 'ora'

const CACHE_DURATION = '*' // https://www.11ty.dev/docs/plugins/fetch/#change-the-cache-duration

function menuUrl(path = '') {
  return `https://suttacentral.net/api/menu/${path}?language=en`
}
function leafUrl(uid) {
  return `https://suttacentral.net/api/suttaplex/${uid}?language=en`
}
function translationUrl(uid, author) {
  return `https://suttacentral.net/api/bilarasuttas/${uid}/${author}`
}

const spinner = ora('Fetching...')
spinner.spinner = { frames: ['⏳'] }

async function fetchDataTree(uid, depth = 0) {
  let json
  try {
    json = await Fetch(menuUrl(uid), {
      duration: CACHE_DURATION,
      type: 'json',
    })
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

    // Add translations text from `/bilarasuttas` to `/suttaplex` object
    const mergedTranslations = await Promise.all(
      translations.map(async (trans) => {
        let texts
        try {
          texts = await Fetch(translationUrl(node.uid, trans.author_uid), {
            duration: CACHE_DURATION,
            type: 'json',
          })
        } catch (e) {
          spinner
            .fail(
              `Fetch error from /bilarasuttas for translation: ${node.uid}/${trans.author_uid} at depth ${depth}`
            )
            .start()
          return null
        }
        // Add `/bilarasuttas` texts data into `/suttaplex`.translations
        // This puts the translations texts data with its meta-data.
        return { ...trans, _bilarasuttas_data: texts }
      })
    )

    return {
      ...node,
      ...suttaplexData[0],
      translations: mergedTranslations.filter(Boolean),
    }
  }

  // Recursion for children nodes
  // These nodes are all type "root" or "branch"
  if (!!node.children?.length) {
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
 * to get the more detailed meta-data for the text (translators etc).
 *
 * It then uses `/bilarasuttas/${author_id}` API on the `translations` array in the "leaf node"
 * to get all versions of the actual text itself.
 *
 * This master output is then used by the various `flat...Data.js` files
 * to add `scx_path` key and flatten the nested structure appropriately
 * to sync URL structure with SuttaCentral.net.
 */
export default async function (file) {
  if (file?.eleventy) file = 'menu'

  try {
    spinner.start()
    // const roots = ['sutta', 'vinaya', 'abhidhamma']
    const roots = ['sutta']
    const tree = await Promise.all(roots.map((uid) => fetchDataTree(uid)))
    spinner.succeed(`Fetch complete for ${JSON.stringify(file)}`)
    return tree
  } catch (e) {
    spinner.fail(e.message)
    return []
  }
}

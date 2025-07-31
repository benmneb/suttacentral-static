import Fetch from '@11ty/eleventy-fetch'

const CACHE_DURATION = '1w'

function baseUrl(path = '') {
  return `https://suttacentral.net/api/menu/${path}?language=en`
}
function leafUrl(uid) {
  return `https://suttacentral.net/api/suttaplex/${uid}?language=en`
}

async function fetchMenu(uid, depth = 0) {
  let json
  try {
    json = await Fetch(baseUrl(uid), {
      duration: CACHE_DURATION,
      type: 'json',
    })
  } catch (e) {
    console.error(`Fetch error for uid: ${uid} at depth ${depth}:`, e)
    return null
  }

  // Defensive: sometimes the API returns a non-array or malformed data
  if (!json || !Array.isArray(json) || !json[0]) {
    console.warn(`Malformed or empty data for uid: ${uid} at depth ${depth}`)
    return null
  }

  const node = json[0]

  if (node.node_type) {
    console.log(
      `Fetched uid: ${node.uid}, type: ${node.node_type}, depth: ${depth}`
    )
  }

  if (node.node_type === 'leaf') {
    let suttaplexData = null
    try {
      suttaplexData = await Fetch(leafUrl(node.uid), {
        duration: CACHE_DURATION,
        type: 'json',
      })
    } catch (e) {
      console.error(`Leaf fetch error for uid: ${node.uid}:`, e)
    }
    // Switch to `/suttaplex` data
    return suttaplexData[0]
  }

  if (node.children?.length > 0) {
    node.children = (
      await Promise.all(
        node.children.map((child) => fetchMenu(child.uid, depth + 1))
      )
    ).filter(Boolean)
  }

  return node
}

/*
 * Generated structured, nested data for the the main navigation
 * by recursively calling SuttaCentral's `/menu/${uid}` API
 * and nesting the result in the `children` value.
 *
 * When it gets to a `"node_type": "leaf"`, it switches to `/suttaplex/${uid}` API
 * to get the more detailed meta-data for the text (translators etc).
 *
 * TODO: After that it uses `/bilarasuttas/${author_id}` API
 * on each of the translators to get all versions of the actual text itself.
 */
export default async function () {
  try {
    // const roots = ['sutta', 'vinaya', 'abhidhamma']
    const roots = ['sutta']
    const tree = await Promise.all(roots.map((uid) => fetchMenu(uid)))
    return tree.filter(Boolean)
  } catch (e) {
    console.error('menuData error:', e)
    return []
  }
}

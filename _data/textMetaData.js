import masterData from './_masterData.js'

/*
 * Don't need translations yet, and logging them breaks dev server.
 */
function removeTranslationTexts(node) {
  const { _bilarasuttas_data, _suttas_data, children, translations, ...rest } =
    node

  const redacted = {
    ...rest,
    ...(_bilarasuttas_data && {
      _bilarasuttas_data: { scx_redacted: true },
    }),
    ...(_suttas_data && {
      _suttas_data: { scx_redacted: true },
    }),
  }

  if (translations) {
    redacted.translations = translations.map(removeTranslationTexts)
  }

  if (children) {
    redacted.children = children.map(removeTranslationTexts)
  }

  return redacted
}

let usedPaths = []

function flatten(nodes) {
  return nodes.flatMap((node) => {
    if (node.node_type === 'leaf' || node.type === 'leaf') {
      const scx_path = node.uid
      if (usedPaths.includes(scx_path)) {
        // TODO: Dhammapada texts exist in two locations:
        // https://suttacentral.net/pitaka/sutta/minor/kn?lang=en
        // and https://suttacentral.net/pitaka/sutta/minor/dharmapadas?lang=en
        // console.log('Duplicate:', scx_path)
        return null
      }
      usedPaths.push(scx_path)
      return removeTranslationTexts({ ...node, scx_path })
    }

    return flatten(node.children || [])
  })
}

/*
 * Returns the metadata of the text (not the actual text content), including parallels.
 *
 * Flattens `masterData` and adds a `scx_path` key with the appropriate URL slug
 * to sync URL structure with SuttaCentral.net.
 *
 * The root path here (ie `/dn1`) is the next nested path after chapterData, ie `sutta/long/dn/`,
 * or the leaf node itself (just without the translator) however you want to look at it.
 *
 * @returns
 * [
 *  { uid: 'dn1', scx_path: '/dn1', ... },
 *  { uid: 'mn44', scx_path: '/mn44', ... },
 *  { uid: 'sn22.23', scx_path: '/sn22.23', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await masterData('text-metadata')
  return flatten(menu).filter(Boolean)
}

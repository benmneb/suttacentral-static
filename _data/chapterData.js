import masterData from './_masterData.js'

/*
 * Don't need translations yet, and logging them breaks dev server.
 */
function removeTranslationTexts(node) {
  const { _bilarasuttas_data, children, translations, ...rest } = node

  const redacted = {
    ...rest,
    ...(_bilarasuttas_data && {
      _bilarasuttas_data: { scx_redacted: true },
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

function flatten(nodes) {
  return nodes.flatMap((node) => {
    // Stop recursion before it reaches leaf nodes (sutta texts) to sync URL structure with SuttaCentral.net
    if (node.children?.some((c) => c.node_type === 'leaf')) {
      return removeTranslationTexts({ ...node, scx_path: `${node.uid}` })
    }

    return flatten(node.children || [])
  })
}

/*
 * Returns just the "chapters".
 *
 * Flattens `masterData` and adds a `scx_path` key with the appropriate URL slug
 * to sync URL structure with SuttaCentral.net.
 *
 * The root path here (ie `/dn-silakkhandhavagga`) is the next nested path after ie `sutta/long/dn/`.
 *
 * @returns
 * [
 *  { uid: 'dn-silakkhandhavagga', scx_path: '/dn-silakkhandhavagga', ... },
 *  { uid: 'dn-mahavagga', scx_path: '/dn-mahavagga', ... },
 *  { uid: 'dn-pathikavagga', scx_path: '/dn-pathikavagga', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await masterData('chapter')
  return flatten(menu).filter(Boolean)
}

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

function flatten(nodes, parentPath = '') {
  return nodes.flatMap((node) => {
    const currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`

    // Stop recursion before it reaches leaf nodes (sutta texts) to sync URL structure with SuttaCentral.net
    if (node.children?.some((c) => c.node_type === 'leaf')) {
      // TODO: /dharmapadas page is messed up here, it should be /pitaka/sutta/minor/dharmapadas
      // because https://suttacentral.net/api/menu/dharmapadas?language=en
      // returns the child with `uid: g2dhp` with node type `leaf`, when the rest are `branch`.
      // So fix this check to account for situations like this.
      return removeTranslationTexts({
        ...node,
        scx_path: `${node.uid}`,
        scx_breadcrumb: currentPath,
      })
    }

    return flatten(node.children || [], currentPath)
  })
}

/*
 * Returns just the "chapters".
 *
 * Flattens `masterData` and adds a `scx_path` key with the appropriate URL slug
 * to sync URL structure with SuttaCentral.net.
 *
 * The root path here (ie `/dn-silakkhandhavagga`) is the next nested path
 * after the end of pitakaData, ie `sutta/long/dn/`,
 * or the first parent of the leaf nodes, however you want to look at it.
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

import menuData from './menuData.js'

/*
 * Don't need translations yet, and logging them breaks dev server.
 */
function removeTranslations(node) {
  const { translations, children, ...rest } = node

  const redacted = {
    ...rest,
    ...(translations && { translations: [{ scx_redacted: true }] }),
  }

  if (children) {
    redacted.children = children.map(removeTranslations)
  }

  return redacted
}

function flatten(nodes, parentPath = '') {
  return nodes.flatMap((node) => {
    if (!!node.children?.some((c) => c.node_type === 'leaf')) {
      // Stop where chapters start, to sync URL structure with SuttaCentral.net
      return null
    }

    const currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`

    const flatNode = removeTranslations({ ...node, scx_path: currentPath })

    return !!node.children?.length
      ? [flatNode, ...flatten(node.children, currentPath)]
      : [flatNode]
  })
}

/*
 * Flattens `menuData` and adds a `scx_path` key with the URL slug
 * for the nested URL "menu" only (ie `/sutta/long/dn`),
 * to sync URL structure with SuttaCentral.net.
 *
 * These are then prefixed with /pitika in `pitika.md`
 * to sync URL structure with SuttaCentral.net properly.
 *
 * @returns
 * [
 *  { uid: 'sutta', scx_path: '/sutta', ... },
 *  { uid: 'long', scx_path: '/sutta/long', ... },
 *  { uid: 'dn', scx_path: '/sutta/long/dn', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await menuData('flatMenu')
  return flatten(menu).filter(Boolean)
}

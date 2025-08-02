import menuData from './menuData.js'

function flatten(nodes, parentPath = '') {
  return nodes.flatMap((node) => {
    if (!!node.children?.some((c) => c.node_type === 'leaf')) {
      // Stop where chapters start, to sync URL structure with SuttaCentral.net
      return null
    }

    const currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`

    const flatNode = { ...node, scx_path: currentPath }

    return !!node.children?.length
      ? [flatNode, ...flatten(node.children, currentPath)]
      : [flatNode]
  })
}

/*
 * Flattens `menuData` and adds a `scx_path` key with the URL slug
 * for the nested URL "menu" only.
 *
 * @returns
 * [
 *  { uid: 'sutta', scx_path: '/sutta', ... },
 *  { uid: 'long', scx_path: '/sutta/long', ... },
 *  { uid: 'dn', scx_path: '/sutta/long/dn', ... },
 * ]
 */
export default async function () {
  const menu = await menuData()
  return flatten(menu).filter(Boolean)
}

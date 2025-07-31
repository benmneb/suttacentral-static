import menuData from './menuData.js'

function flatten(nodes, parentPath = '') {
  let flat = []

  for (const node of nodes) {
    const currentPath = parentPath
      ? `${parentPath}/${node.uid}`
      : `/${node.uid}`
    flat.push({ ...node, scx_path: currentPath })

    if (node.children && node.children.length > 0) {
      flat = flat.concat(flatten(node.children, currentPath))
    }
  }

  return flat
}

/*
 * Changes `menuData` to add a `scx_path` key with the URL slug.
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
  return flatten(menu)
}

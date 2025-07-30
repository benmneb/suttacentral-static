import menuData from './menuData.js'

function flatten(nodes, parentPath = '') {
  let flat = []

  for (const node of nodes) {
    const currentPath = parentPath
      ? `${parentPath}/${node.uid}`
      : `/${node.uid}`
    flat.push({ ...node, path: currentPath })

    if (node.children && node.children.length > 0) {
      flat = flat.concat(flatten(node.children, currentPath))
    }
  }

  return flat
}

export default async function () {
  const menu = await menuData()
  return flatten(menu)
}

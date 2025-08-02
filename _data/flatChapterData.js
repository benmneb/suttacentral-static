import menuData from './menuData.js'

function flatten(nodes) {
  return nodes.flatMap((node) => {
    // Stop recursion before it reaches leaf nodes (suttas) to sync URL structure with SuttaCentral.net
    if (!!node.children?.some((c) => c.node_type === 'leaf')) {
      return { ...node, scx_path: `${node.uid}` }
    }

    return flatten(node.children || [])
  })
}

/*
 * Returns just the "chapters".
 *
 * Flattens `menuData` and adds a `scx_path` key with the appropriate URL slug,
 * ie `/dn-silakkhandhavagga`.
 */
export default async function () {
  const menu = await menuData()
  return flatten(menu).filter(Boolean)
}

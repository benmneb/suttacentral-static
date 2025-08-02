import menuData from './menuData.js'

/*
 * Don't need this deep nesting, and logging them breaks dev server.
 */
function removeGrandChildren(node) {
  const { children, ...rest } = node

  if (children) {
    return {
      ...rest,
      children: children.map(({ children: grandChildren, ...child }) => {
        const result = { ...child }
        if (grandChildren) result.children = [{ scx_redacted: true }]
        return result
      }),
    }
  }

  return { ...rest }
}

function flatten(nodes) {
  return nodes.flatMap((node) => {
    return removeGrandChildren(node)
  })
}

/*
 * Returns just the data necessary for the root tripitka links:
 * `/sutta`, `/vinaya`, `/abhidhamma`.
 */
export default async function () {
  const menu = await menuData('flatIndex')
  return flatten(menu).filter(Boolean)
}

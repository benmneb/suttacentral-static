import masterData from './_masterData.js'

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
 * Returns just the data necessary for the root tipitka links.
 *
 * These are then prefixed with /pitaka in `index.md`
 * to sync URL structure with SuttaCentral.net.
 *
 * @returns
 * [
 *  { uid: 'sutta', scx_path: '/sutta', ... },
 *  { uid: 'vinaya', scx_path: '/vinaya', ... },
 *  { uid: 'abhidhamma', scx_path: '/abhidhamma', ... },
 * ]
 */
export default async function () {
  const menu = await masterData('index')
  return flatten(menu).filter(Boolean)
}

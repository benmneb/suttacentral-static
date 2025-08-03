import menuData from './menuData.js'

let usedPaths = []

function flatten(nodes, parent) {
  return nodes.flatMap((node) => {
    if (parent) {
      const scx_path = `${parent.uid}/${node.lang}/${node.author_uid}`
      // Dirty hack to get around duplicate paths in /suttaplex data
      // ie: https://suttacentral.net/api/suttaplex/mn1?language=en has /mn1/ru/sv/ twice
      if (usedPaths.includes(scx_path)) return null
      usedPaths.push(scx_path)
      const { translations, ...parentWithoutTranslations } = parent
      if (scx_path === 'dn1/en/sujato')
        console.log({ ...parentWithoutTranslations, ...node, scx_path })
      return { ...parentWithoutTranslations, ...node, scx_path }
    }

    if (!!node.translations?.length) {
      return flatten(node.translations, node)
    }

    return flatten(node.children || [])
  })
}

/*
 * Returns just the "texts".
 *
 * Flattens the .translation info from `menuData`, with the root /suttaplex sutta data and
 * adds a `scx_path` key with the appropriate URL slug.
 *
 * Note: `id` is the unique identifier here because `uid` comes from the parent
 * and is no longer unique because this meta-data bas been merged with the .translations data.
 *
 * @returns
 * [
 *  { id: 'dn1_translation-en-sujato', scx_path: '/dn1/en/sujato', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await menuData('flatText')
  return flatten(menu).filter(Boolean)
}

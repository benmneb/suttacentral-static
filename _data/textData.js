import masterData from './_masterData.js'

let usedPaths = []

function flatten(nodes, parent, parentPath) {
  return nodes.flatMap((node) => {
    let currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`

    if (parent) {
      currentPath = parentPath
      const scx_path = `${parent.uid}/${node.lang}/${node.author_uid}`
      // Dirty hack to get around duplicate paths in /suttaplex data
      // ie: https://suttacentral.net/api/suttaplex/mn1?language=en has /mn1/ru/sv/ twice
      // TODO: pick the one with the latest publication date
      // TODO: log these duplicates and see what's up
      if (usedPaths.includes(scx_path)) return null
      usedPaths.push(scx_path)
      const { translations, ...parentWithoutTranslations } = parent
      // if (scx_path.includes('dn1/de/sabbamitta'))
      // console.log({ ...parentWithoutTranslations, ...node, scx_path })
      return {
        ...parentWithoutTranslations,
        ...node,
        scx_path,
        scx_breadcrumb: currentPath,
      }
    }

    if (node.translations?.length) {
      return flatten(node.translations, node, currentPath)
    }

    return flatten(node.children || [], null, currentPath)
  })
}

/*
 * Returns just the "texts".
 *
 * Flattens the .translation info from `masterData`, with the root /suttaplex sutta data and
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
  const menu = await masterData('text')
  return flatten(menu).filter(Boolean)
}

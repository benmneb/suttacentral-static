/**
 * Pagination Links
 *
 * A text's prev/next comes through from the API as the neighbouring uid by the same translator,
 * whether or not they translated it, so /ja79/en/sujato links /ja80/en/sujato, which doesn't exist
 * (only Chalmers did). See `textLinks.js` for where they go instead.
 */

/**
 * Points every text's prev/next at a page that exists.
 * Mutates `_suttas_data.translation` in place. A link to a bare /<uid> page is left
 * with no `lang` and `author_uid`, which `text.liquid` takes to mean just that.
 * @param {(uid, lang, author, selfUid) => object|null} resolve from `createLinkResolver`
 * @returns {number} how many links were changed
 */
export function fixPaginationLinks(tree, resolve) {
  let fixed = 0

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node) continue
      for (const trans of node.translations ?? []) {
        const translation = trans._suttas_data?.translation
        for (const link of [translation?.previous, translation?.next]) {
          if (!link?.uid) continue
          const target = resolve(link.uid, link.lang, link.author_uid, node.uid)
          if (!target) continue
          fixed++
          link.uid = target.uid
          link.lang = target.lang
          link.author_uid = target.author
        }
      }
      walk(node.children)
    }
  }

  walk(tree)
  return fixed
}

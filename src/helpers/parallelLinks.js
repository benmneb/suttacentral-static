/**
 * Parallel Links
 *
 * /api/parallels lists a parallel's translations without the segmented ones, bar its root text,
 * so DN 22 from MN 10 only has its Pāli and legacy translations, not Sujato's. The texts
 * built here have them, so each parallel gets its English ones as `scx_translations`, for a link
 * to each translator beside the link to its root text. A parallel to a passage only gets the
 * segmented ones, as a legacy text has no segment for its #anchor to land on.
 */

/**
 * Gives every parallel the English translations built for it.
 * Mutates `_parallels_data` in place, as it's shared by every page made from it.
 * @param {Object} resolve from `createLinkResolver`
 * @returns {number} how many parallels were given one
 */
export function linkParallelTranslations(tree, resolve) {
  // Shared by every parallel to the same text, as there are hundreds of thousands
  const byUid = new Map()
  let linked = 0

  function translationsOf(uid, passage) {
    if (!byUid.has(uid)) {
      const all = resolve.translationsIn(uid, 'en').map(t => ({
        lang: t.lang,
        author: t.author || t.author_uid,
        author_uid: t.author_uid,
        segmented: !!t.segmented,
      }))
      byUid.set(uid, { all, segmented: all.filter(t => t.segmented) })
    }
    const { all, segmented } = byUid.get(uid)
    return passage ? segmented : all
  }

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node) continue
      for (const parallels of Object.values(node._parallels_data ?? {})) {
        if (!Array.isArray(parallels)) continue
        for (const { to } of parallels) {
          if (!to?.uid) continue
          let translations = translationsOf(to.uid, to.to?.includes('#'))
          // The one `parallelItems.liquid` links the title to
          const titleLink = to.translations?.find(
            t => t.lang === 'en' || t.lang === to.root_lang
          )
          const same = t =>
            t.lang === titleLink?.lang && t.author_uid === titleLink?.author_uid
          if (translations.some(same)) {
            translations = translations.filter(t => !same(t))
          }
          if (!translations.length) continue
          to.scx_translations = translations
          linked++
        }
      }
      walk(node.children)
    }
  }

  walk(tree)
  return linked
}

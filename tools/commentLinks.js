/**
 * Comment Links
 *
 * Links in translator comments come through from the API as /<uid>/en/sujato whatever the text,
 * so a sutta comment linking the vinaya points at a Sujato translation that doesn't exist
 * (it's Brahmali's), and the reverse in the vinaya, and likewise for the abhidhamma, jatakas etc.
 * Some name a whole chapter (ie /sn12/en/sujato) too. See `textLinks.js` for where they go instead.
 *
 * The #anchor and anything else after the author is always kept.
 */

const LINK =
  /(href=['"]https:\/\/suttacentral\.net\/)([^/#?'"\s]+)\/([a-z]+)\/([^/#?'"]+)/g

/**
 * Points every link in every translator comment at a page that exists.
 * Mutates the bilara data in place, as it's shared by every page made from it.
 * @param {(uid, lang, author) => object|null} resolve from `createLinkResolver`
 * @returns {number} how many links were changed
 */
export function fixCommentLinks(tree, resolve) {
  const seen = new Set()
  let fixed = 0

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node) continue
      for (const trans of node.translations ?? []) {
        const comments = trans._bilarasuttas_data?.comment_text
        if (!comments || seen.has(comments)) continue
        seen.add(comments)

        for (const [key, comment] of Object.entries(comments)) {
          comments[key] = comment.replace(
            LINK,
            (match, start, uid, lang, author) => {
              const target = resolve(uid, lang, author)
              if (!target) return match
              fixed++
              return target.lang
                ? `${start}${target.uid}/${target.lang}/${target.author}`
                : `${start}${target.uid}`
            }
          )
        }
      }
      walk(node.children)
    }
  }

  walk(tree)
  return fixed
}

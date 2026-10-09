/**
 * Comment Links
 *
 * Links in translator comments come through from the API as /<uid>/en/sujato whatever the text,
 * so a sutta comment linking the vinaya points at a Sujato translation that doesn't exist
 * (it's Brahmali's), and the reverse in the vinaya, and likewise for the abhidhamma, jatakas etc.
 * .net covers this with client side redirects, so here they're pointed at a page that exists
 * instead, before any are rendered.
 *
 * Where a link to /<uid>/<lang>/<author> goes:
 * 1. That page exists: left as is
 * 2. Another translator in the same language: theirs, preferring a segmented text so the #anchor
 *    still lands (ie /pli-tv-kd14/en/sujato -> /pli-tv-kd14/en/brahmali, /ja543/en/sujato -> /ja543/en/cowell-rouse)
 * 3. No translation in that language: the root text (ie /cnd23/en/sujato -> /cnd23/pli/ms)
 * 4. The uid isn't a text at all: left as is, they're malformed in the data (ie "sn47.14 /en/sujato")
 *
 * The #anchor and anything else after the author is always kept.
 */

const LINK =
  /(href=['"]https:\/\/suttacentral\.net\/)([^/#?'"\s]+)\/([a-z]+)\/([^/#?'"]+)/g

/** Every built text, as `uid -> translations`, including individual range suttas (ie /dhp5) */
function indexTexts(nodes, index = new Map()) {
  for (const node of nodes ?? []) {
    if (!node) continue
    if (node.translations?.length) {
      index.set(node.uid, node.translations)
      // As `textData.js`, only segmented texts get individual range suttas
      const segmented = node.translations.filter(t => t.segmented)
      for (const uid of node.scx_range_sutta_range_uids ?? []) {
        if (!index.has(uid)) index.set(uid, segmented)
      }
    }
    indexTexts(node.children, index)
  }
  return index
}

/*
 * The same language by another translator if there is one, preferring segmented so the #anchor
 * still lands, else the root text (ie /cnd23 has no English at all). Null if the uid isn't a
 * text, as some links are just malformed in the data (ie "sn47.14 /en/sujato"), so they're left be
 */
function targetFor(index, uid, lang, author) {
  const translations = index.get(uid)
  if (!translations?.length) return null
  if (translations.some(t => t.lang === lang && t.author_uid === author)) {
    return null
  }
  const sameLang = translations.filter(t => t.lang === lang)
  const target =
    sameLang.find(t => t.segmented) ??
    sameLang[0] ??
    translations.find(t => t.is_root)
  return target && { lang: target.lang, author: target.author_uid }
}

/**
 * Points every link in every translator comment at a text that exists.
 * Mutates the bilara data in place, as it's shared by every page made from it.
 * @returns {number} how many links were changed
 */
export function fixCommentLinks(tree) {
  const index = indexTexts(tree)
  const seen = new Set()
  let fixed = 0

  for (const translations of index.values()) {
    for (const trans of translations) {
      const comments = trans._bilarasuttas_data?.comment_text
      if (!comments || seen.has(comments)) continue
      seen.add(comments)

      for (const [key, comment] of Object.entries(comments)) {
        comments[key] = comment.replace(
          LINK,
          (match, start, uid, lang, author) => {
            const target = targetFor(index, uid, lang, author)
            if (!target) return match
            fixed++
            return `${start}${uid}/${target.lang}/${target.author}`
          }
        )
      }
    }
  }

  return fixed
}

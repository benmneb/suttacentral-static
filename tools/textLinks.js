/**
 * Text Links
 *
 * The API links to texts as /<uid>/<lang>/<author> whether or not that text exists, in translator
 * comments and in prev/next. .net sorts it out with client side redirects once the page is opened
 * (`sc-text-page-selector.js`), so here the same is done at build time, before any are rendered.
 *
 * Where a link to /<uid>/<lang>/<author> goes, as .net does:
 * 1. That page exists: left as is
 * 2. Another translator in the same language: theirs, preferring a segmented text so the #anchor
 *    still lands (ie /pli-tv-kd14/en/sujato -> /pli-tv-kd14/en/brahmali). .net picks one at random
 * 3. No translation in that language: the root text (ie /cnd23/en/sujato -> /cnd23/pli/ms)
 * 4. No text at all, but the uid has a page: that (ie /sn12/en/sujato -> /sn12)
 * And one .net doesn't do, as it has a page for those uids and this site doesn't:
 * 5. The uid is in a range text: the range, as 2. and 3. (ie /pli-tv-bu-vb-as7/en/sujato -> /pli-tv-bu-vb-as1-7/en/brahmali)
 * 6. Otherwise: left as is, they're malformed in the data (ie "sn47.14 /en/sujato", /mn155/en/sujato)
 */

import { collectPageUids } from './pageUids.js'
import { parseUidNumbers, uidIsInRange } from './rangeSuttas.js'

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

/** The text to show for `uid` in place of the missing one, or null if it has no texts */
function translationFor(translations, lang) {
  if (!translations?.length) return null
  const sameLang = translations.filter(t => t.lang === lang)
  const target =
    sameLang.find(t => t.segmented) ??
    sameLang[0] ??
    translations.find(t => t.is_root)
  return target && { lang: target.lang, author: target.author_uid }
}

/**
 * @returns a function taking a link's uid, lang and author, which returns where it should go
 * instead as `{ uid, lang, author }` (lang and author are null for a bare /<uid> page),
 * or null to leave it be. `selfUid` is never returned, so a page can't link to itself.
 * It also has `hasText(uid)`, `hasTranslation(uid, lang, author)`, and
 * `hasSegment(uid, lang, author, segment)` for whether that text has a segment with that id
 * (ie "sn35.80", "en", "sujato", "1.1")
 */
export function createLinkResolver(tree) {
  const index = indexTexts(tree)
  const pageUids = collectPageUids(tree)
  const ranges = [...index.keys()].filter(uid => {
    const span = parseUidNumbers(uid)
    return span && span.start !== span.end
  })

  function resolve(uid, lang, author, selfUid) {
    const translations = index.get(uid)
    if (translations?.some(t => t.lang === lang && t.author_uid === author)) {
      return null
    }

    const target = translationFor(translations, lang)
    if (target) return { uid, ...target }

    if (pageUids.has(uid)) return { uid, lang: null, author: null }

    const range = ranges.find(r => r !== selfUid && uidIsInRange(uid, r))
    const rangeTarget = range && translationFor(index.get(range), lang)
    if (rangeTarget) return { uid: range, ...rangeTarget }

    return null
  }

  resolve.hasText = uid => !!index.get(uid)?.length
  resolve.hasTranslation = (uid, lang, author) =>
    !!index.get(uid)?.some(t => t.lang === lang && t.author_uid === author)
  resolve.hasSegment = (uid, lang, author, segment) =>
    !!index
      .get(uid)
      ?.find(t => t.lang === lang && t.author_uid === author)
      ?._bilarasuttas_data?.keys_order?.includes(`${uid}:${segment}`)

  return resolve
}

/**
 * Comment Links
 *
 * Links in translator comments come through from the API as /<uid>/en/sujato whatever the text,
 * so a sutta comment linking the vinaya points at a Sujato translation that doesn't exist
 * (it's Brahmali's), and the reverse in the vinaya, and likewise for the abhidhamma, jatakas etc.
 * Some name a whole chapter (ie /sn12/en/sujato) too. See `textLinks.js` for where they go instead.
 *
 * Some chapter links have the sutta number in the #anchor instead, ie "SN 12:47" as
 * /sn12/en/sujato#47, or "SN 35:80.1" as /sn35/en/sujato#80.1. Where <uid>.<n> is a text,
 * they go there instead (/sn12.47/en/sujato, /sn35.80/en/sujato#1), keeping what's left of
 * the anchor only if it's a segment of that text. .net just takes them to the chapter.
 *
 * Otherwise the #anchor and anything else after the author is always kept.
 *
 * Whitespace in a link is taken out first, as no link has any on purpose, ie DN 16's "/sn47.14 /en/sujato".
 * Before that, a link with square brackets in it is split into the Markdown links run together in it, ie
 * SN 45.33's "[SN 47.33:1.1], [SN 51.2:1.1]" as one link to #1.1], [sn51.2:1.1
 */

const HREF_WITH_SPACE = /href=(['"])([^'"]*\s[^'"]*)\1/g

const BRACKETED_LINK =
  /<a href=(['"])([^'"#]*)#([^'"]*[[\]][^'"]*)\1>([^<]*)<\/a>/g

/** The links in one with square brackets, the first to its own text, the others to the "<uid>:<segment>" each names */
function splitBracketedLink(match, quote, url, anchor, text) {
  const anchors = anchor.split(/\]([^[]*)\[/)
  const texts = text.split(/\][^[]*\[/)
  if (anchors.length !== texts.length * 2 - 1) return match
  const unbracket = part => part.replace(/[[\]]/g, '')
  return anchors
    .map((part, i) => {
      if (i % 2) return part
      const target = unbracket(part)
      const [uid, segment] = i ? target.split(':') : [null, target]
      const href = uid ? url.replace(/[^/]+(?=\/[a-z]+\/[^/]+$)/, uid) : url
      return `<a href=${quote}${href}#${segment}${quote}>${unbracket(texts[i / 2])}</a>`
    })
    .join('')
}

const LINK =
  /(href=['"]https:\/\/suttacentral\.net\/)([^/#?'"\s]+)\/([a-z]+)\/([^/#?'"]+)(#[^'"]*)?/g

/*
 * Where a chapter link with the sutta number in its anchor was meant to go,
 * as `{ uid, anchor }`, or null if it isn't one
 */
function suttaInAnchor(resolve, uid, lang, author, anchor) {
  const match = anchor?.match(/^#(\d+)(?:\.(.+))?$/)
  if (!match || resolve.hasText(uid)) return null
  const suttaUid = `${uid}.${match[1]}`
  if (!resolve.hasText(suttaUid)) return null
  const target = resolve(suttaUid, lang, author) ?? {
    uid: suttaUid,
    lang,
    author,
  }
  const segment = match[2]
  const keep =
    segment &&
    target.lang &&
    resolve.hasSegment(target.uid, target.lang, target.author, segment)
  return { ...target, anchor: keep ? `#${segment}` : '' }
}

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
          comments[key] = comment
            .replace(BRACKETED_LINK, splitBracketedLink)
            .replace(
              HREF_WITH_SPACE,
              (match, quote, url) =>
                `href=${quote}${url.replace(/\s+/g, '')}${quote}`
            )
            .replace(LINK, (match, start, uid, lang, author, anchor = '') => {
              const target = suttaInAnchor(
                resolve,
                uid,
                lang,
                author,
                anchor
              ) ?? {
                ...resolve(uid, lang, author),
                anchor,
              }
              if (!target.uid) return match
              fixed++
              return target.lang
                ? `${start}${target.uid}/${target.lang}/${target.author}${target.anchor}`
                : `${start}${target.uid}${target.anchor}`
            })
        }
      }
      walk(node.children)
    }
  }

  walk(tree)
  return fixed
}

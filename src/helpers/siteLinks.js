/**
 * Site Links
 *
 * Links in the site pages' words are .net's, written for .net: to its own pages, as absolute URLs or
 * paths, some relative (ie "snp" on /general-guide-sujato), some to paths it has since moved. Each is
 * read as .net would, then pointed at the page here if it's built, or left on .net if not (ie /define/* for
 * a word with no page here, texts in other languages). Texts go where `textLinks.js` sends them.
 *
 * Legacy texts' links only get the paths .net moved, as everything else in them is left as the API has it.
 */

import { defineHref, linkedWord } from './defineWords.js'
import { collectPageUids, collectPitakaPaths } from './pageUids.js'
import { SC_ORIGIN } from './scApi.js'
import { sitePageRoots } from './sitePages.js'
import { createLinkResolver } from './textLinks.js'

const SC_HOST = new URL(SC_ORIGIN).hostname

// Paths .net moved, which old links still use
const MOVED = {
  '/downloads': '/editions',
  '/edition': '/editions',
}

const BASKETS = new Set(['sutta', 'vinaya', 'abhidhamma'])

const LINK = /<a\s[^>]*>/g
const HREF = /(\shref=)(["'])(.*?)\2/

/**
 * Where .net sends a path it moved, or the path as it is, as .net's own redirects do
 * (ie /downloads -> /editions, /pi-tv-pvr2.1 -> /pli-tv-pvr2.1, /sutta/long -> /pitaka/sutta/long)
 * @param {string} path - ie "/downloads", no query or #anchor
 */
export function movedPath(path) {
  if (MOVED[path]) return MOVED[path]
  const segments = path.split('/').filter(Boolean)
  if (BASKETS.has(segments[0])) segments.unshift('pitaka')
  // Nothing is keyed pi- or skt- any more
  const renamed = segments.map(s =>
    s.replace(/^pi-/, 'pli-').replace(/^skt-/, 'san-')
  )
  return `/${renamed.join('/')}`
}

/**
 * Points the links in legacy texts that use a path .net moved at where it went (ie Horner's
 * "/downloads#book_of_the_discipline" in every colophon). Mutates the text data in place.
 * @param {object[]} tree - `_masterData`
 * @returns {number} how many texts changed
 */
export function fixMovedLegacyLinks(tree) {
  let fixed = 0

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node) continue
      for (const trans of node.translations ?? []) {
        const translation = trans._suttas_data?.translation
        if (typeof translation?.text !== 'string') continue
        const text = translation.text.replace(LINK, tag =>
          tag.replace(HREF, (match, attr, quote, href) => {
            if (!href.startsWith('/') || href.startsWith('//')) return match
            const [, path, rest] = href.match(/^([^?#]*)(.*)$/)
            const moved = movedPath(path)
            return moved === path
              ? match
              : `${attr}${quote}${moved}${rest}${quote}`
          })
        )
        if (text !== translation.text) {
          translation.text = text
          fixed++
        }
      }
      walk(node.children)
    }
  }

  walk(tree)
  return fixed
}

/**
 * @param {object[]} tree - `_masterData`
 * @param {Map<string, unknown>} defineWords - The words with a /define page
 * @returns {(html: string, pageUrl: string) => string} which points every link in a site page's
 *   `<main>` at a page here where one's built, or at .net
 */
export function createSiteLinkFixer(tree, defineWords) {
  const resolve = createLinkResolver(tree)
  const pageUids = collectPageUids(tree)
  const pitakaPaths = collectPitakaPaths(tree)
  // .net shows any menu at /<uid>, where this site has /pitaka/<path> (ie /thag)
  const pitakaPathOf = new Map(
    [...pitakaPaths].map(path => [path.split('/').pop(), `/pitaka/${path}`])
  )

  // A path here for a .net path, or null if nothing's built there
  function localPath(path) {
    const parts = path.split('/').filter(Boolean)
    if (!parts.length || path === '/search') return path
    if (parts[0] === 'pitaka') {
      return pitakaPaths.has(parts.slice(1).join('/')) ? path : null
    }
    if (parts[0] === 'define') {
      if (!defineWords.size || parts.length > 2) return null
      if (parts.length === 1) return path
      const word = linkedWord(parts[1], defineWords)
      return word ? defineHref(word) : null
    }
    if (sitePageRoots.has(parts[0])) return path
    if (parts.length === 1) {
      if (pageUids.has(parts[0])) return path
      return pitakaPathOf.get(parts[0]) ?? null
    }
    if (parts.length !== 3) return null
    const [uid, lang, author] = parts
    if (resolve.hasTranslation(uid, lang, author)) return path
    const target = resolve(uid, lang, author)
    if (!target) return null
    return target.lang
      ? `/${target.uid}/${target.lang}/${target.author}`
      : `/${target.uid}`
  }

  function fixHref(href, base) {
    let url
    try {
      url = new URL(href, base)
    } catch {
      return href
    }
    if (url.hostname !== SC_HOST || href.startsWith('#')) {
      return href
    }
    const path = localPath(movedPath(decodeURIComponent(url.pathname)))
    const rest = `${url.search}${url.hash}`
    return path ? `${path}${rest}` : `${SC_ORIGIN}${url.pathname}${rest}`
  }

  return function fixLinks(html, pageUrl) {
    const start = html.indexOf('<main')
    const end = html.lastIndexOf('</main>')
    if (start === -1 || end === -1) return html
    const base = `${SC_ORIGIN}${pageUrl.replace(/(.)\/$/, '$1')}`
    const main = html.slice(start, end).replace(LINK, tag =>
      // The licence's attribution, and links marked to stay on .net, ie its app on /offline
      /rel=["'][^"']*\b(dct:publisher|external)\b/.test(tag)
        ? tag
        : tag.replace(
            HREF,
            (match, attr, quote, href) =>
              `${attr}${quote}${fixHref(href, base)}${quote}`
          )
    )
    return html.slice(0, start) + main + html.slice(end)
  }
}

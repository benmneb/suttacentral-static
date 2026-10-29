/**
 * Page Metadata
 *
 * What every page's Open Graph tags and JSON-LD share: absolute URLs, the site itself, SuttaCentral as
 * publisher, breadcrumbs, and the ids that link a text to its work across pages.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import siteMetaData from '../data/_siteMetaData.js'
import { SC_ORIGIN } from './scApi.js'

const OG_IMAGE = { src: '/images/og-image2.jpg', width: 1200, height: 630 }

/** A route as the browser has it, with one leading slash and no trailing one */
export function routePath(url) {
  return `/${String(url ?? '').replace(/^\/+|\/+$/g, '')}`
}

/** A route or path on this site as a full URL */
export function absoluteUrl(url) {
  return `${siteMetaData().origin}${routePath(url)}`
}

export function textFromHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;| /gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerpt(text, length = 160) {
  if (text.length <= length) return text
  const shortened = text.slice(0, length - 1)
  const boundary = shortened.lastIndexOf(' ')
  return `${shortened.slice(0, boundary > 0 ? boundary : shortened.length)}…`
}

/** "Mūlapariyāyasutta (The Root of All Things)", or just the original where there's no other */
export function withTranslatedTitle(original, translated) {
  const name = textFromHtml(original)
  const translation = textFromHtml(translated)
  return translation && translation !== name ? `${name} (${translation})` : name
}

/** A text or collection's title as its page has it, ie "Mūlapariyāyavagga—The Root of All Things" */
export function menuTitle(node) {
  const name = textFromHtml(node.original_title || node.root_name)
  const translated = textFromHtml(node.translated_title || node.translated_name)
  return `${name}${translated ? `—${translated}` : ''}`
}

/** The site, as every page's `isPartOf` */
export function website() {
  const { origin, title } = siteMetaData()
  return {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: title,
    url: `${origin}/`,
  }
}

export const SUTTACENTRAL = {
  '@type': 'Organization',
  name: 'SuttaCentral',
  url: SC_ORIGIN,
}

// Wikipedia articles, as `sameAs`, so search engines can tell who each translator is
const TRANSLATOR_PAGES = {
  analayo: 'https://en.wikipedia.org/wiki/Bhikkhu_Analayo',
  beal: 'https://en.wikipedia.org/wiki/Samuel_Beal',
  bodhi: 'https://en.wikipedia.org/wiki/Bhikkhu_Bodhi',
  buddharakkhita: 'https://en.wikipedia.org/wiki/Acharya_Buddharakkhita',
  chalmers: 'https://en.wikipedia.org/wiki/Robert_Chalmers,_1st_Baron_Chalmers',
  horner: 'https://en.wikipedia.org/wiki/Isaline_Blew_Horner',
  narada: 'https://en.wikipedia.org/wiki/Narada_Maha_Thera',
  nyanamoli: 'https://en.wikipedia.org/wiki/Ñāṇamoli_Bhikkhu',
  rockhill: 'https://en.wikipedia.org/wiki/William_Woodville_Rockhill',
  rouse: 'https://en.wikipedia.org/wiki/W._H._D._Rouse',
  sujato: 'https://en.wikipedia.org/wiki/Bhante_Sujato',
  thanissaro: 'https://en.wikipedia.org/wiki/Ṭhānissaro_Bhikkhu',
  tw_rhysdavids: 'https://en.wikipedia.org/wiki/Thomas_William_Rhys_Davids',
  woodward: 'https://en.wikipedia.org/wiki/F._L._Woodward',
}

/** A translator, linked to their Wikipedia article if they have one */
export function person(name, uid) {
  return {
    '@type': 'Person',
    name: textFromHtml(name),
    identifier: uid,
    ...(TRANSLATOR_PAGES[uid] && { sameAs: TRANSLATOR_PAGES[uid] }),
  }
}

/** The edition a root text comes from, which SuttaCentral lists where a translation has its translator */
export function edition(name, uid) {
  return { '@type': 'CreativeWork', name: textFromHtml(name), identifier: uid }
}

/** The work a text is an edition or translation of, as its suttaplex page describes it */
export function workId(uid) {
  return `${absoluteUrl(uid)}#work`
}

/** A text, as distinct from the page it's on */
export function textId(path) {
  return `${absoluteUrl(path)}#text`
}

/**
 * A BreadcrumbList from `{ name, url }` crumbs. A crumb with no page is left out, as each one needs an `item`
 */
export function breadcrumbList(crumbs) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
      .filter(crumb => crumb.url)
      .map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: textFromHtml(crumb.name),
        item: absoluteUrl(crumb.url),
      })),
  }
}

/**
 * A page's Open Graph tags, as JSON for `base.liquid`, whose description is also the page's meta description
 * @param {Object} page
 * @param {string} page.title
 * @param {string} page.description
 * @param {string} page.url - The page's route
 * @param {string} [page.type] - Its `og:type`
 * @param {Object} [page.extra] - Any more tags, ie `article:author`
 */
export function ogTags({ title, description, url, type = 'website', extra }) {
  const { title: siteTitle } = siteMetaData()
  const tags = {
    'og:title': title,
    'og:description': description,
    'og:url': absoluteUrl(url),
    'og:type': type,
    'og:locale': 'en_US',
    'og:site_name': siteTitle,
    'og:image': absoluteUrl(OG_IMAGE.src),
    'og:image:width': OG_IMAGE.width,
    'og:image:height': OG_IMAGE.height,
    'og:image:type': 'image/jpeg',
    'og:image:alt': siteTitle,
    ...extra,
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(tags).map(([key, value]) => [
        key,
        typeof value === 'string' ? textFromHtml(value) : value,
      ])
    )
  )
}

export function jsonLd(data) {
  return (
    JSON.stringify({ '@context': 'https://schema.org', ...data })
      // A "</script>" in any text would end the script element early
      .replace(/</g, '\\u003c')
  )
}

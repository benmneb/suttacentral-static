/**
 * Site Scan
 *
 * Reads every file of a built site once, so each test file can check the
 * whole site without reading 1.8gb again. Keeps a few facts per HTML page,
 * not the HTML itself, and every internal link target only once.
 *
 * The site is `_site`, or wherever `SITE_DIR` points.
 */

import Fetch from '@11ty/eleventy-fetch'
import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import siteMetaData from '../../src/data/_siteMetaData.js'
import { fetchOptions } from '../../src/helpers/scApi.js'
import { sitePageRoots } from '../../src/helpers/sitePages.js'

export const SITE_DIR = path.resolve(process.env.SITE_DIR || '_site')

// Pages left out of the sitemap on purpose (`eleventyExcludeFromCollections`)
export const UNLISTED_PAGES = ['/404.html', '/search/']

const READ_CONCURRENCY = 64

let scan = null

/**
 * The URL a file is served at, ie `mn1/en/sujato/index.html` -> `/mn1/en/sujato/`
 * @param {string} file - Path relative to the site root
 */
export function urlForFile(file) {
  const url = `/${file.split(path.sep).join('/')}`
  return url.endsWith('/index.html') ? url.slice(0, -'index.html'.length) : url
}

/**
 * A page's URL as the route the browser uses, which has no trailing slash, ie
 * `mn1/en/sujato/index.html`'s `/mn1/en/sujato/` is `/mn1/en/sujato`
 * @param {string} url
 */
export function pageRoute(url) {
  return url === '/' ? url : url.replace(/\/$/, '')
}

/**
 * What sort of page a URL is, from its shape:
 * - `text`: a translation or root text, ie `/mn1/en/sujato/`
 * - `pitaka`: the tree of collections, ie `/pitaka/sutta/`
 * - `nav`: a collection, chapter or text's own page, ie `/mn/` or `/mn1/`
 * - `site`: a page about the site or the texts, ie `/about/` or `/edition/mn/en/sujato/`
 * - `util`: the home, search and 404 pages
 * @param {string} url
 */
export function pageKind(url) {
  if (url === '/' || UNLISTED_PAGES.includes(url)) return 'util'
  if (url.startsWith('/pitaka/')) return 'pitaka'
  const parts = url.split('/').filter(Boolean)
  if (sitePageRoots.has(parts[0])) return 'site'
  if (parts.length === 3) return 'text'
  return 'nav'
}

/**
 * The letters a page's uid starts with, to group pages by collection,
 * ie `/mn1/en/sujato/` -> `mn`, `/pli-tv-bu-vb-pj1/` -> `pli-tv-bu-vb-pj`
 * @param {string} url
 */
export function collectionOf(url) {
  if (url.startsWith('/pitaka/')) return 'pitaka'
  const uid = url.split('/').filter(Boolean)[0] ?? ''
  return uid.replace(/\d.*$/, '') || uid
}

/**
 * Decodes the few entities the templates and API put in titles and text
 * @param {string} str
 */
export function decodeEntities(str) {
  return str
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Text content of some HTML, with whitespace collapsed
 * @param {string} html
 */
export function textOf(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The part of a page between `<main ...>` and `</main>`, or '' if there's none
 * @param {string} html
 */
export function mainOf(html) {
  const start = html.indexOf('<main')
  const end = html.lastIndexOf('</main>')
  if (start === -1 || end === -1) return ''
  return html.slice(html.indexOf('>', start) + 1, end)
}

// Values that only end up in a link when the data behind it is missing
const BROKEN_VALUE = /(^|[/=#])(undefined|null|NaN)([/?#&]|$)|\[object /

const ATTR_URL = /\s(?:href|src)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g

// The analytics pixel in <noscript> is meant to be remote
const REMOTE_IMG = /<img\s[^>]*?\bsrc=["']?((?:https?:)?\/\/[^"'\s>]+)/g

/**
 * The site path a link points at, or null if it's external or only an anchor
 * @param {string} link - The href/src as written
 * @param {string} pageUrl - The URL of the page it's on
 */
export function internalTarget(link, pageUrl) {
  if (!link || link.startsWith('#')) return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('//')) return null
  try {
    const url = new URL(link, `https://site.invalid${pageUrl}`)
    return decodeURIComponent(url.pathname)
  } catch {
    return link
  }
}

// A copy, as a match is a slice of the page that would keep all its HTML in memory
const copyOf = str => str && JSON.parse(JSON.stringify(str))

const JSON_LD = /<script type="?application\/ld\+json"?>([\s\S]*?)<\/script>/g

/** A page's JSON-LD scripts, each parsed, or the error parsing it threw */
function parseJsonLd(html) {
  return [...html.matchAll(JSON_LD)].map(([, json]) => {
    try {
      return JSON.parse(json)
    } catch (error) {
      return error
    }
  })
}

const canonicalTags = new Map()

/**
 * Whether a `lang` value is a BCP 47 tag in its canonical form, ie `pi`, not `pli` or `en-us`
 * @param {string} tag
 */
export function isCanonicalLangTag(tag) {
  if (!canonicalTags.has(tag)) {
    let canonical = false
    try {
      canonical = Intl.getCanonicalLocales(tag)[0] === tag
    } catch {}
    canonicalTags.set(tag, canonical)
  }
  return canonicalTags.get(tag)
}

/** What a breadcrumb list lacks of Google's required fields */
function breadcrumbProblems(list) {
  const items = [list.itemListElement ?? []].flat()
  return items.flatMap((item, i) => {
    const problems = []
    if (item?.['@type'] !== 'ListItem') {
      problems.push(`breadcrumb ${i + 1} is a ${item?.['@type']}`)
    }
    if (item?.position !== i + 1) {
      problems.push(`breadcrumb ${i + 1} has position ${item?.position}`)
    }
    if (!item?.name) problems.push(`breadcrumb ${i + 1} has no name`)
    if (!item?.item && i < items.length - 1) {
      problems.push(`breadcrumb ${i + 1} has no item`)
    }
    return problems
  })
}

/** What's wrong with a page's JSON-LD: an unparsable script, a relative URL, or missing data */
function jsonLdProblems(scripts) {
  if (!scripts.length) return ['none']
  const problems = []
  const walk = (value, key) => {
    if (Array.isArray(value)) return value.forEach(item => walk(item, key))
    if (value && typeof value === 'object') {
      if (value['@type'] === 'BreadcrumbList') {
        problems.push(...breadcrumbProblems(value))
      }
      for (const [k, v] of Object.entries(value)) walk(v, k)
      return
    }
    if (typeof value !== 'string') return
    if (['@id', 'url', 'item'].includes(key) && !/^https?:\/\//.test(value)) {
      problems.push(`relative ${key}: ${value}`)
    }
    if (key === 'inLanguage' && !isCanonicalLangTag(value)) {
      problems.push(`inLanguage: ${value}`)
    }
    // A dictionary can define a word as "undefined"
    if (key !== 'description' && /\b(undefined|NaN)\b|\[object /.test(value)) {
      problems.push(`${key}: ${value}`)
    }
  }
  for (const data of scripts) {
    if (data instanceof Error) {
      problems.push(`unparsable: ${data.message}`)
      continue
    }
    if (data['@context'] !== 'https://schema.org') {
      problems.push(`@context: ${data['@context']}`)
    }
    walk(data)
  }
  return problems.slice(0, 3)
}

const valueTypeOf = value => {
  if (value && typeof value === 'object') {
    return [value['@type'] ?? 'node'].flat().join('|')
  }
  return typeof value
}

/**
 * Each property of each typed node in some JSON-LD, as `Type.property:valueType`, ie
 * `WebPage.isPartOf:WebSite`, where an untyped object's value type is `node`, and a node's several types are joined by `|`
 * @param {any} data
 * @param {Set<string>} [shapes] - Added to
 */
export function jsonLdShapes(data, shapes = new Set()) {
  if (Array.isArray(data)) {
    for (const item of data) jsonLdShapes(item, shapes)
    return shapes
  }
  if (!data || typeof data !== 'object') return shapes
  const type = [data['@type'] ?? []].flat().join('|')
  for (const [key, value] of Object.entries(data)) {
    if (key.startsWith('@')) continue
    for (const item of [value].flat()) {
      if (type) shapes.add(`${type}.${key}:${valueTypeOf(item)}`)
      jsonLdShapes(item, shapes)
    }
  }
  return shapes
}

const ATTR = /([^\s=/>]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

/** A tag's attributes, ie `meta property="og:url" content="…"` -> `{ property: 'og:url', content: '…' }` */
function attributesOf(tag) {
  return Object.fromEntries(
    [...tag.matchAll(ATTR)].map(match => [
      match[1].toLowerCase(),
      decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''),
    ])
  )
}

const LANG_ATTR = /\s(?:lang|hreflang)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g

const TWITTER_CARDS = ['summary', 'summary_large_image', 'app', 'player']

// ogp.me's object types, and the namespaces only they can have tags in
const OG_TYPES = /^(website|article|book|profile|(music|video)\.[a-z_.]+)$/
const OG_NAMESPACES = ['article', 'book', 'profile', 'music', 'video']
const OG_REQUIRED = ['og:title', 'og:type', 'og:image', 'og:url']
const OG_LOCALE = /^[a-z]{2,3}_[A-Z]{2}$/

/**
 * What's wrong with a page's language tags, meta tags and Open Graph tags
 * @param {string} html
 * @param {string} url - The page's URL, ie `/mn1/en/sujato/`
 */
export function metaProblems(html, url) {
  const problems = []
  const headEnd = html.indexOf('</head>')
  const head = headEnd === -1 ? html : html.slice(0, headEnd)

  if (!/<html\s[^>]*\blang=/.test(html)) problems.push('no <html lang>')
  const langs = new Set(
    [...html.matchAll(LANG_ATTR)].map(match => match[1] ?? match[2] ?? match[3])
  )
  for (const lang of langs) {
    // An empty lang is valid, as "unknown"
    if (lang && lang !== 'x-default' && !isCanonicalLangTag(lang)) {
      problems.push(`lang: ${lang}`)
    }
  }

  const metas = [...head.matchAll(/<meta\s([^>]*)>/g)].map(match =>
    attributesOf(match[1])
  )
  const named = name => metas.filter(meta => meta.name === name)
  for (const name of ['viewport', 'description', 'twitter:card']) {
    const count = named(name).length
    if (count !== 1) problems.push(`${count} ${name} meta tags`)
  }
  const card = named('twitter:card')[0]?.content
  if (card && !TWITTER_CARDS.includes(card)) {
    problems.push(`twitter:card: ${card}`)
  }

  const og = new Map()
  for (const { property, content } of metas) {
    if (!property) continue
    if (!og.has(property)) og.set(property, [])
    og.get(property).push(content)
  }
  if (og.size || !UNLISTED_PAGES.includes(url)) {
    for (const property of OG_REQUIRED) {
      const count = og.get(property)?.length ?? 0
      if (count !== 1) problems.push(`${count} ${property} tags`)
    }
  }
  const type = og.get('og:type')?.[0]
  if (type && !OG_TYPES.test(type)) problems.push(`og:type: ${type}`)
  for (const property of og.keys()) {
    const namespace = property.split(':')[0]
    if (OG_NAMESPACES.includes(namespace) && !type?.startsWith(namespace)) {
      problems.push(`${property} on an og:type ${type}`)
    }
  }
  for (const locale of [
    ...(og.get('og:locale') ?? []),
    ...(og.get('og:locale:alternate') ?? []),
  ]) {
    if (!OG_LOCALE.test(locale)) problems.push(`og:locale: ${locale}`)
  }
  const ogUrl = og.get('og:url')?.[0]
  const canonical = head.match(
    /<link rel="?canonical"? href="?([^"\s>]*)"?/
  )?.[1]
  if (ogUrl && canonical && decodeURI(ogUrl) !== decodeURI(canonical)) {
    problems.push(`og:url ${ogUrl} isn't the canonical ${canonical}`)
  }
  const image = og.get('og:image')?.[0]
  if (image && !image.startsWith(`${siteMetaData().origin}/`)) {
    problems.push(`og:image: ${image}`)
  }
  return problems.slice(0, 3)
}

/** A page's Open Graph image and what its tags say about it, ie `https://…/og.jpg 1200 630 image/jpeg` */
function ogImageOf(html) {
  const content = property =>
    html.match(
      new RegExp(`<meta property="?${property}"? content="?([^"\\s>]*)"?`)
    )?.[1] ?? ''
  if (!content('og:image')) return null
  return ['og:image', 'og:image:width', 'og:image:height', 'og:image:type']
    .map(content)
    .join(' ')
}

function factsFor(url, html) {
  const jsonLd = parseJsonLd(html)
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const main = mainOf(html)
  const links = new Set()
  const brokenLinks = []
  for (const match of html.matchAll(ATTR_URL)) {
    const link = match[1] ?? match[2] ?? match[3]
    if (BROKEN_VALUE.test(link)) brokenLinks.push(link)
    const target = internalTarget(link, url)
    if (target) links.add(target)
  }

  return {
    url,
    kind: pageKind(url),
    title: copyOf(decodeEntities(title).trim()),
    description: copyOf(
      decodeEntities(
        html.match(/<meta name="?description"? content="([^"]*)"/)?.[1] ?? ''
      )
    ),
    canonicals: [
      ...html.matchAll(/<link rel="?canonical"? href="?([^"\s>]*)"?/g),
    ].map(match => copyOf(match[1])),
    jsonLdProblems: jsonLdProblems(jsonLd).map(copyOf),
    jsonLdShapes: [
      ...jsonLdShapes(jsonLd.filter(data => !(data instanceof Error))),
    ],
    metaProblems: metaProblems(html, url).map(copyOf),
    ogImage: copyOf(ogImageOf(html)),
    h1: /<h1[\s>]/.test(main),
    // The piṭaka a page sits in, from the first step of its breadcrumbs
    pitaka: copyOf(
      html.match(/href="\/pitaka\/(sutta|vinaya|abhidhamma)"/)?.[1]
    ),
    searchable: html.includes('data-pagefind-body'),
    // Its text in the main index, not just its breadcrumb
    textIndexed: /<main\b[^>]*\bdata-pagefind-body/.test(html),
    // The ids in: finds it by, ie bupj1 for pli-tv-bu-vb-pj1
    textIds: [...html.matchAll(/data-text-id="([^"]*)"/g)].map(match =>
      copyOf(match[1])
    ),
    segments: html.split('class="segment"').length - 1,
    notes: [
      ...html.matchAll(
        /<article id="comment-([^"]*)"[^>]*>(?!\s*<\/article>)/g
      ),
    ].map(match => copyOf(match[1])),
    mainTextLength: textOf(
      main.replace(/<article[^>]*popover[\s\S]*?<\/article>/g, '')
    ).length,
    mainLinks: (main.match(/<a\s[^>]*href=/g) ?? []).length,
    brokenLinks,
    remoteImages: [
      ...html
        .replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
        .matchAll(REMOTE_IMG),
    ].map(m => m[1]),
    stylesheets: [
      ...html.matchAll(/<link rel="?stylesheet"? href="?\/styles\/([^"\s>]*)/g),
    ].map(match => copyOf(match[1])),
    icons: [
      ...new Set(
        [...html.matchAll(/class="?icon(?: \w+)? i-([A-Za-z0-9]+)/g)].map(
          match => match[1]
        )
      ),
    ].map(copyOf),
    links,
  }
}

/**
 * Every file under a directory, relative to it
 * @param {string} dir
 */
export async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(full, base)
      return [path.relative(base, full)]
    })
  )
  return files.flat()
}

/**
 * Scans the site once, and returns the same result to every caller after.
 *
 * @returns {Promise<{
 *   files: Set<string>,
 *   pages: Map<string, ReturnType<typeof factsFor>>,
 *   linkSources: Map<string, string>,
 *   jsonLdShapes: Map<string, string>,
 *   ogImages: Map<string, string>,
 * }>} Every file's URL, every HTML page's facts by URL, and every internal link target, JSON-LD shape
 * (see `jsonLdShapes`) and Open Graph image with the first page that has it
 */
export function scanSite() {
  scan ??= (async () => {
    const all = await listFiles(SITE_DIR)
    const files = new Set(all.map(urlForFile))
    const htmlFiles = all.filter(file => file.endsWith('.html'))
    const pages = new Map()
    const linkSources = new Map()
    const jsonLdShapes = new Map()
    const ogImages = new Map()
    const firstOf = (map, key, url) => {
      if (!map.has(key)) map.set(key, url)
    }

    for (let i = 0; i < htmlFiles.length; i += READ_CONCURRENCY) {
      const batch = htmlFiles.slice(i, i + READ_CONCURRENCY)
      const htmls = await Promise.all(
        batch.map(file => fs.readFile(path.join(SITE_DIR, file), 'utf8'))
      )
      batch.forEach((file, j) => {
        const url = urlForFile(file)
        const facts = factsFor(url, htmls[j])
        for (const target of facts.links) firstOf(linkSources, target, url)
        for (const shape of facts.jsonLdShapes)
          firstOf(jsonLdShapes, shape, url)
        if (facts.ogImage) firstOf(ogImages, facts.ogImage, url)
        // These live on in the site-wide maps, no need for a copy per page
        facts.links = facts.links.size
        delete facts.jsonLdShapes
        delete facts.ogImage
        pages.set(url, facts)
      })
    }

    return { files, pages, linkSources, jsonLdShapes, ogImages }
  })()
  return scan
}

/**
 * The response the build used, from `.cache`. Never fetched, as the pages were built from
 * what's cached, and anything else would be comparing them with different data
 * @param {string} url
 */
export async function cachedApi(url) {
  const cache = Fetch.Fetch(url, fetchOptions(url, '*'))
  assert.ok(
    cache.isCacheValid('*'),
    `${url} isn't in .cache, was the site built here?`
  )
  return cache.getCachedValue()
}

/**
 * Whether a site path is served, as a file or a directory's index.html
 * @param {Set<string>} files - From `scanSite()`
 * @param {string} target
 */
export function resolves(files, target) {
  if (files.has(target)) return true
  const dir = target.endsWith('/') ? target : `${target}/`
  return files.has(dir)
}

/**
 * Reads a built page's HTML
 * @param {string} url - ie `/mn1/en/sujato/`
 */
export function readPage(url) {
  const file = url.endsWith('/') ? `${url}index.html` : url
  return fs.readFile(path.join(SITE_DIR, file), 'utf8')
}

/**
 * Lists up to `max` items for a failure message, saying how many more there were
 * @param {string[]} items
 */
export function listSome(items, max = 50) {
  const shown = items.slice(0, max).map(item => `  ${item}`)
  if (items.length > max) shown.push(`  …and ${items.length - max} more`)
  return shown.join('\n')
}

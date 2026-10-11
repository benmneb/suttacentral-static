/**
 * Site Scan
 *
 * Reads every file of a built site once, so each test file can check the
 * whole site without reading 1.8gb again. Keeps a few facts per HTML page,
 * not the HTML itself, and every internal link target only once.
 *
 * The site is `_site`, or wherever `SITE_DIR` points.
 */

import fs from 'fs/promises'
import path from 'path'

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
 * What sort of page a URL is, from its shape:
 * - `text`: a translation or root text, ie `/mn1/en/sujato/`
 * - `pitaka`: the tree of collections, ie `/pitaka/sutta/`
 * - `nav`: a collection, chapter or text's own page, ie `/mn/` or `/mn1/`
 * - `util`: the home, search and 404 pages
 * @param {string} url
 */
export function pageKind(url) {
  if (url === '/' || UNLISTED_PAGES.includes(url)) return 'util'
  if (url.startsWith('/pitaka/')) return 'pitaka'
  const parts = url.split('/').filter(Boolean)
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

function factsFor(url, html) {
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
    title: decodeEntities(title).trim(),
    // The piṭaka a page sits in, from the first step of its breadcrumbs
    pitaka: html.match(/href="\/pitaka\/(sutta|vinaya|abhidhamma)"/)?.[1],
    searchable: html.includes('data-pagefind-body'),
    segments: html.split('class="segment"').length - 1,
    mainTextLength: textOf(
      main.replace(/<article[^>]*popover[\s\S]*?<\/article>/g, '')
    ).length,
    mainLinks: (main.match(/<a\s[^>]*href=/g) ?? []).length,
    brokenLinks,
    links,
  }
}

async function listFiles(dir, base = dir) {
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
 * }>} Every file's URL, every HTML page's facts by URL, and every internal link target with the first page that links it
 */
export function scanSite() {
  scan ??= (async () => {
    const all = await listFiles(SITE_DIR)
    const files = new Set(all.map(urlForFile))
    const htmlFiles = all.filter(file => file.endsWith('.html'))
    const pages = new Map()
    const linkSources = new Map()

    for (let i = 0; i < htmlFiles.length; i += READ_CONCURRENCY) {
      const batch = htmlFiles.slice(i, i + READ_CONCURRENCY)
      const htmls = await Promise.all(
        batch.map(file => fs.readFile(path.join(SITE_DIR, file), 'utf8'))
      )
      batch.forEach((file, j) => {
        const url = urlForFile(file)
        const facts = factsFor(url, htmls[j])
        for (const target of facts.links) {
          if (!linkSources.has(target)) linkSources.set(target, url)
        }
        // The targets live on in `linkSources`, no need for a copy per page
        facts.links = facts.links.size
        pages.set(url, facts)
      })
    }

    return { files, pages, linkSources }
  })()
  return scan
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

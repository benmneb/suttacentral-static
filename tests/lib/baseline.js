/**
 * Production Baseline
 *
 * What's live on the production site, for a new build to be compared with.
 * Production is the baseline so nothing has to be stored between builds:
 * the sitemaps list every page (see `src/pages/_sitemap.liquid`), and Pagefind's
 * entry file says how many pages are searchable.
 *
 * `SKIP_BASELINE=1` skips the comparisons, ie for a local build without
 * internet. In CI an unreachable production site fails the checks instead,
 * so a release is never auto-deployed without being compared.
 */

import siteMetaData from '../../src/data/_siteMetaData.js'
import { pageRoute } from './site.js'

export const SKIP_BASELINE = Boolean(process.env.SKIP_BASELINE)

const origin = process.env.BASELINE_ORIGIN || siteMetaData().origin

let sitemap = null
let pagefindEntry = null

async function get(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Could not get the production baseline from ${url} (HTTP ${response.status})`
    )
  }
  return response
}

/**
 * Paths in a sitemap's `<loc>`s, without the origin, as routes, ie `/mn1/en/sujato`
 * @param {string} xml
 */
export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(match =>
    pageRoute(decodeURIComponent(new URL(match[1].trim()).pathname))
  )
}

/**
 * Paths in a sitemap, or in every sitemap a sitemap index lists
 * @param {string} xml
 * @param {(url: string) => Promise<string>} read - Gets a listed sitemap's XML, by its URL
 */
export async function allSitemapPaths(xml, read) {
  if (!xml.includes('<sitemapindex')) return sitemapPaths(xml)
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(match =>
    match[1].trim()
  )
  const parts = await Promise.all(locs.map(read))
  return parts.flatMap(sitemapPaths)
}

/** Every page path in production's sitemap */
export function productionPages() {
  const read = url => get(url).then(response => response.text())
  sitemap ??= read(`${origin}/sitemap.xml`).then(xml =>
    allSitemapPaths(xml, read)
  )
  return sitemap
}

/** Production's Pagefind entry file, with `languages.en.page_count` */
export function productionPagefindEntry() {
  pagefindEntry ??= get(`${origin}/pagefind/pagefind-entry.json`).then(
    response => response.json()
  )
  return pagefindEntry
}

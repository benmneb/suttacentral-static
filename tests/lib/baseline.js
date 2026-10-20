/**
 * Production Baseline
 *
 * What's live on the production site, for a new build to be compared with.
 * Production is the baseline so nothing has to be stored between builds:
 * the sitemap lists every page (see `src/pages/_sitemap.liquid`), and Pagefind's
 * entry file says how many pages are searchable.
 *
 * `SKIP_BASELINE=1` skips the comparisons, ie for a local build without
 * internet. In CI an unreachable production site fails the checks instead,
 * so a release is never auto-deployed without being compared.
 */

import siteMetaData from '../../src/data/_siteMetaData.js'

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
 * Paths in a sitemap's `<loc>`s, without the origin, ie `/mn1/en/sujato/`
 * @param {string} xml
 */
export function sitemapPaths(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(match =>
    decodeURIComponent(new URL(match[1].trim()).pathname)
  )
}

/** Every page path in production's sitemap */
export function productionPages() {
  sitemap ??= get(`${origin}/sitemap.xml`)
    .then(response => response.text())
    .then(sitemapPaths)
  return sitemap
}

/** Production's Pagefind entry file, with `languages.en.page_count` */
export function productionPagefindEntry() {
  pagefindEntry ??= get(`${origin}/pagefind/pagefind-entry.json`).then(
    response => response.json()
  )
  return pagefindEntry
}

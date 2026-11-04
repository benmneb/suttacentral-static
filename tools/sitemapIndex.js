/**
 * Sitemap Index
 *
 * Writes `_site/sitemap.xml`, listing every `sitemap-*.xml` the build stages wrote, as each stage
 * only knows its own pages. Runs last in `pnpm build`.
 */

import fs from 'fs'
import path from 'path'
import siteMetaData from '../src/data/_siteMetaData.js'

const SITE_DIR = '_site'

const { origin } = siteMetaData()
const collator = new Intl.Collator('en', { numeric: true })
const sitemaps = fs
  .readdirSync(SITE_DIR)
  .filter(file => /^sitemap-.+\.xml$/.test(file))
  .sort(collator.compare)

if (!sitemaps.length) {
  console.error(`No sitemaps in ${SITE_DIR} to list, was it built?`)
  process.exit(1)
}

const entries = sitemaps
  .map(file => `  <sitemap>\n    <loc>${origin}/${file}</loc>\n  </sitemap>`)
  .join('\n')
fs.writeFileSync(
  path.join(SITE_DIR, 'sitemap.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`
)
console.log(`🗺️  Listed ${sitemaps.length} sitemaps in sitemap.xml`)

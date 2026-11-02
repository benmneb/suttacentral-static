/**
 * The build has the pages it should.
 *
 * The site's structure comes from SuttaCentral's APIs, so pages coming and going
 * with them is expected - added pages never fail, and a few may go. Losing more
 * than that means data went missing.
 */

import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { before, describe, it } from 'node:test'
import {
  SKIP_BASELINE,
  allSitemapPaths,
  productionPages,
} from './lib/baseline.js'
import {
  SITE_DIR,
  UNLISTED_PAGES,
  collectionOf,
  listSome,
  pageRoute,
  scanSite,
} from './lib/site.js'

// Share of production's pages that can be missing from the build, overall and per collection
const MAX_MISSING_SHARE = 0.01
const MAX_MISSING_SHARE_PER_COLLECTION = 0.05
// Smaller collections are covered by the overall share only, as a page or two there is a big share
const MIN_COLLECTION_SIZE = 20

// Text pages each piṭaka must have, well under what they have now
const MIN_TEXTS_PER_PITAKA = { sutta: 25_000, vinaya: 1_000, abhidhamma: 200 }

const percent = share => `${(share * 100).toFixed(1)}%`

const { pages } = await scanSite()
// Pages are keyed as they're built, ie `/mn1/en/sujato/`, while a sitemap lists their routes
const routes = new Set([...pages.keys()].map(pageRoute))

describe('Page inventory', () => {
  it('has a sitemap listing every built page', async () => {
    const read = file => fs.readFile(path.join(SITE_DIR, file), 'utf8')
    const xml = await read('sitemap.xml')
    const listed = new Set(
      await allSitemapPaths(xml, url => read(new URL(url).pathname))
    )
    const built = [...pages.keys()].filter(url => !UNLISTED_PAGES.includes(url))

    const unlisted = built.filter(url => !listed.has(pageRoute(url)))
    const unbuilt = [...listed].filter(route => !routes.has(route))
    assert.deepEqual(
      { unlisted: unlisted.length, unbuilt: unbuilt.length },
      { unlisted: 0, unbuilt: 0 },
      [
        unlisted.length &&
          `Built but not in the sitemap (a template without addAllPagesToCollections?):\n${listSome(unlisted)}`,
        unbuilt.length && `In the sitemap but not built:\n${listSome(unbuilt)}`,
      ]
        .filter(Boolean)
        .join('\n')
    )
  })

  for (const [pitaka, min] of Object.entries(MIN_TEXTS_PER_PITAKA)) {
    it(`has the ${pitaka} piṭaka, with at least ${min.toLocaleString('en-US')} texts`, () => {
      assert.ok(
        pages.has(`/pitaka/${pitaka}/`),
        `/pitaka/${pitaka}/ wasn't built`
      )
      const texts = [...pages.values()].filter(
        page => page.kind === 'text' && page.pitaka === pitaka
      ).length
      assert.ok(
        texts >= min,
        `Only ${texts} text pages are in the ${pitaka} piṭaka`
      )
    })
  }

  describe('compared with production', { skip: SKIP_BASELINE }, () => {
    let production = []
    let missing = []

    before(async () => {
      production = await productionPages()
      missing = production.filter(route => !routes.has(route))
    })

    it(`is missing at most ${percent(MAX_MISSING_SHARE)} of its pages`, () => {
      const share = missing.length / production.length
      assert.ok(
        share <= MAX_MISSING_SHARE,
        `${missing.length} of production's ${production.length} pages (${percent(share)}) weren't built:\n${listSome(missing)}`
      )
    })

    it(`is missing at most ${percent(MAX_MISSING_SHARE_PER_COLLECTION)} of any collection's pages`, () => {
      const totals = Map.groupBy(production, collectionOf)
      const missingByCollection = Map.groupBy(missing, collectionOf)
      const shrunk = [...missingByCollection]
        .map(([collection, urls]) => ({
          collection,
          urls,
          total: totals.get(collection).length,
        }))
        .filter(
          ({ urls, total }) =>
            total >= MIN_COLLECTION_SIZE &&
            urls.length / total > MAX_MISSING_SHARE_PER_COLLECTION
        )
      assert.ok(
        shrunk.length === 0,
        shrunk
          .map(
            ({ collection, urls, total }) =>
              `${collection}: ${urls.length} of ${total} pages (${percent(urls.length / total)}) weren't built:\n${listSome(urls, 10)}`
          )
          .join('\n')
      )
    })
  })
})

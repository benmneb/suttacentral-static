/**
 * The search index covers every text, as do the extra bundles that are only loaded for some searches.
 */

import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { describe, it } from 'node:test'
import { SKIP_BASELINE, productionPagefindEntry } from './lib/baseline.js'
import { SITE_DIR, scanSite } from './lib/site.js'

// Share of production's indexed pages the new index can lose
const MAX_DROP_SHARE = 0.01

const readEntry = async bundle =>
  JSON.parse(
    await fs
      .readFile(path.join(SITE_DIR, bundle, 'pagefind-entry.json'), 'utf8')
      .catch(() => '{}')
  )

const pageCount = entry =>
  Object.values(entry.languages ?? {}).reduce(
    (sum, language) => sum + language.page_count,
    0
  )

describe('Search index', async () => {
  const { pages } = await scanSite()
  const indexed = pageCount(await readEntry('pagefind'))

  it('has every searchable page', () => {
    const searchable = [...pages.values()].filter(
      page => page.searchable
    ).length
    assert.equal(
      indexed,
      searchable,
      `Pagefind indexed ${indexed} pages, but ${searchable} have data-pagefind-body`
    )
  })

  it(
    `has lost at most ${MAX_DROP_SHARE * 100}% of production's pages`,
    { skip: SKIP_BASELINE },
    async () => {
      const production = pageCount(await productionPagefindEntry())
      assert.ok(
        indexed >= production * (1 - MAX_DROP_SHARE),
        `Pagefind indexed ${indexed} pages, production has ${production}`
      )
    }
  )

  it("has every text's titles in the titles bundle", async () => {
    const titles = pageCount(await readEntry('pagefind-titles'))
    assert.equal(
      titles,
      indexed,
      `The titles bundle has ${titles} texts, the main index ${indexed}`
    )
  })
})

/**
 * The search index covers every text, as do the extra bundles that are only loaded for some searches.
 */

import assert from 'node:assert/strict'
import fs from 'fs/promises'
import path from 'path'
import { describe, it } from 'node:test'
import { parseUidNumbers } from '../src/helpers/rangeSuttas.js'
import { SKIP_BASELINE, productionPagefindEntry } from './lib/baseline.js'
import { SITE_DIR, listSome, scanSite } from './lib/site.js'

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

  it("has each text's text once", () => {
    const indexedText = [...pages.values()].filter(page => page.textIndexed)
    const at = new Set(indexedText.map(page => page.url))
    const seen = new Map()
    const bad = []
    for (const page of indexedText) {
      const [, uid, lang, author] = page.url.split('/')
      // The title is the acronym and author, ie "AN 11.262–309—Bhikkhu Sujato"
      const text = `${lang} ${page.title}`
      if (seen.has(text)) bad.push(`${page.url} is ${seen.get(text)}`)
      else seen.set(text, page.url)
      const range = parseUidNumbers(uid)
      if (!range || range.start === range.end) continue
      for (let n = range.start; n <= range.end; n++) {
        const own = `/${range.prefix}${n}/${lang}/${author}/`
        if (at.has(own)) bad.push(`${page.url} has ${own}`)
      }
    }
    assert.equal(
      bad.length,
      0,
      `Texts in the main index twice:\n${listSome(bad)}`
    )
  })

  it("has every text's titles in the titles bundle", async () => {
    const titles = pageCount(await readEntry('pagefind-titles'))
    assert.equal(
      titles,
      indexed,
      `The titles bundle has ${titles} texts, the main index ${indexed}`
    )
  })

  it("has every English translation's notes in the notes bundle once", async () => {
    const notes = pageCount(await readEntry('pagefind-notes'))
    // A range's notes are on its page and each of its texts' too
    const written = new Set(
      [...pages.values()]
        .filter(page => page.searchable && page.url.split('/')[2] === 'en')
        .flatMap(page => {
          const translation = page.url.split('/').slice(2, 4).join('/')
          return page.notes.map(segment => `${translation}/${segment}`)
        })
    ).size
    assert.equal(
      notes,
      written,
      `The notes bundle has ${notes} notes, the English translations ${written}`
    )
  })

  it('has every site page but /define in the site bundle', async () => {
    const site = pageCount(await readEntry('pagefind-site'))
    const written = [...pages.values()].filter(
      page => page.kind === 'site' && !page.url.startsWith('/define/')
    ).length
    assert.equal(
      site,
      written,
      `The site bundle has ${site} pages, the site ${written}`
    )
  })

  it("has the notes' and site pages' filter values, for /search to show", async () => {
    const values = async bundle =>
      JSON.parse(
        await fs.readFile(
          path.join(SITE_DIR, bundle, 'filter-values.json'),
          'utf8'
        )
      )
    const notes = await values('pagefind-notes')
    assert.deepEqual(Object.keys(notes).sort(), ['author', 'in', 'lang'])
    // Every note is of an English translation, so English narrows nothing
    assert.deepEqual(notes.lang, [])
    const translators = new Set(
      [...pages.values()]
        .filter(page => page.searchable && page.notes.length)
        .map(page => page.url.split('/'))
        .filter(([, , lang]) => lang === 'en')
        .map(([, , , author]) => author)
    )
    assert.deepEqual(new Set(notes.author), translators)
    const site = await values('pagefind-site')
    assert.deepEqual(Object.keys(site), ['author'])
  })

  it('has only text pages, and their titles, in the reference shards', async () => {
    const shards = async dir => {
      const files = await fs.readdir(path.join(SITE_DIR, 'search', dir))
      return Promise.all(
        files
          .filter(file => file !== 'index.json')
          .map(async file =>
            JSON.parse(
              await fs.readFile(
                path.join(SITE_DIR, 'search', dir, file),
                'utf8'
              )
            )
          )
      )
    }
    const texts = new Set((await shards('texts')).flatMap(Object.keys))
    const missing = (await shards('refs'))
      .flatMap(shard => Object.values(shard).flat())
      .filter(at => at.includes('/'))
      .filter(
        at => !pages.get(`/${at}/`)?.searchable || !texts.has(at.split('/')[0])
      )
    assert.deepEqual(
      [...new Set(missing)].slice(0, 10),
      [],
      `${missing.length} reference pages aren't text pages with titles`
    )
  })

  it('has DN 16 alone on PTS DN ii 72, as volpage: finds it', async () => {
    const dn = JSON.parse(
      await fs.readFile(path.join(SITE_DIR, 'search/volpages/dn.json'), 'utf8')
    )
    const onPage = dn.pages
      .filter(([, vol, first, last]) => vol === 2 && first <= 72 && 72 <= last)
      .map(([uid]) => uid)
    assert.deepEqual(onPage, ['dn16'])
  })
})

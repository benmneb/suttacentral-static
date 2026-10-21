/**
 * The dictionaries for word lookup and the /define pages are all there, and so are the pages.
 *
 * They're fetched from GitHub at build time, and a file that fails or shrinks only leaves its words out,
 * so the cached copies are checked first, without a build, then the pages built from them.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import {
  DICTIONARY_FILES,
  entriesOf,
  fetchDictionary,
} from '../src/helpers/dictionaries.js'
import { mainOf, readPage, SITE_DIR } from './lib/site.js'

// About 95% of the words each had in October 2026
const MIN_WORDS = {
  dpd: 135_000,
  ncped: 22_000,
  ddb: 55_000,
  pts: 15_000,
  dppn: 1_300,
  dhammika: 750,
  dpd_i2h: 70_000,
  dpd_deconstructor: 20_000,
}

// /define pages that have to be there, and the dictionary of each of their entries, as each of an NCPED
// entry's homonyms is one (gaha)
const DEFINE_PAGES = {
  '/define/dhamma/': ['ncped', 'dppn', 'pts', 'dpd'],
  '/define/sāvatthī/': ['ncped', 'dppn', 'dpd'],
  '/define/ima/': ['dpd'],
  '/define/aggāḷave cetiye/': ['dppn'],
  '/define/gaha/': ['ncped', 'ncped', 'dhammika', 'pts', 'dpd'],
}

// .net's adjacent terms for buddha, which only has words with a full entry
const BUDDHA_ADJACENT = [
  'bujjhati',
  'bujjhana',
  'bujjhanaka',
  'bujjhitar',
  'buḍḍha',
  'buddha',
  'buddhaka',
  'buddhatā',
  'buddhati',
  'buddhatta',
  'buddhi',
]

// The map's places DPPN has no entry for, which stay linked to .net
const MAP_DEFINES_MISSING = ['piprahwa stupa', 'siṁsapāvana3']

// The fields of an sc-data entry the pages show, as some NCPED entries are only a cross-reference or homonyms
const DEFINITION_FIELDS = ['definition', 'text', 'xr', 'homonyms']

// Share of a dictionary's entries that may have no definition, as DDB has a blank one or two
const MAX_BROKEN_SHARE = 0.001

describe('Dictionaries', async () => {
  const dictionaries = Object.fromEntries(
    await Promise.all(
      Object.keys(DICTIONARY_FILES).map(async name => [
        name,
        await fetchDictionary(name)
          .then(result => result.data)
          .catch(() => null),
      ])
    )
  )

  for (const [name, min] of Object.entries(MIN_WORDS)) {
    it(`${name} has at least ${min.toLocaleString('en-US')} words`, () => {
      assert.ok(dictionaries[name], `Couldn't fetch ${DICTIONARY_FILES[name]}`)
      const words = new Set(entriesOf(dictionaries[name]).map(([word]) => word))
      assert.ok(words.size >= min, `${name} has only ${words.size} words`)
    })
  }

  it('each have a word and a definition for their entries', () => {
    const bad = []
    for (const [name, data] of Object.entries(dictionaries)) {
      if (!data) continue
      const broken = entriesOf(data).filter(([word, entry]) => {
        if (typeof word !== 'string' || !word) return true
        if (name === 'dpd_i2h') return !Array.isArray(entry) || !entry.length
        if (name === 'dpd_deconstructor') return typeof entry !== 'string'
        return !DEFINITION_FIELDS.some(field => entry[field]?.length)
      })
      if (broken.length > entriesOf(data).length * MAX_BROKEN_SHARE) {
        bad.push(`${name}: ${broken.length}, ie ${JSON.stringify(broken[0])}`)
      }
    }
    assert.equal(
      bad.length,
      0,
      `Entries with no word or definition:\n${bad.join('\n')}`
    )
  })
})

describe('The /define pages', () => {
  it('include /define, with its search', async () => {
    const html = await readPage('/define/')
    assert.match(html, /<h1>/)
    assert.match(html, /class="define-form"/)
  })

  for (const [url, dictionaries] of Object.entries(DEFINE_PAGES)) {
    it(`include ${url}, with its entries`, async () => {
      const html = await readPage(url)
      assert.match(html, /<h1>/)
      const found = [...html.matchAll(/<dt class="(\w+)"/g)].map(
        ([, name]) => name
      )
      assert.deepEqual(found, dictionaries)
    })
  }

  it('link other words here, not on .net, ie akatavedi to katavedi(n)', async () => {
    const urls = [...Object.keys(DEFINE_PAGES), '/define/akatavedi/']
    const remote = []
    for (const url of urls) {
      const main = mainOf(await readPage(url))
      if (main.includes('https://suttacentral.net/define/')) remote.push(url)
    }
    assert.equal(remote.length, 0, `Linked to .net:\n${remote.join('\n')}`)
    assert.match(
      await readPage('/define/akatavedi/'),
      /href="\/define\/katavedin"/
    )
  })

  it("list .net's adjacent terms", async () => {
    const html = await readPage('/define/buddha/')
    const terms = html.slice(html.indexOf('Adjacent Terms</h2>'))
    const list = terms.slice(0, terms.indexOf('</ol>'))
    const words = [...list.matchAll(/translate="no">([^<]+)</g)].map(
      ([, word]) => word
    )
    assert.deepEqual(words, BUDDHA_ADJACENT)
  })

  it('link a DPPN place to it on /map', async () => {
    const html = await readPage('/define/sāvatthī/')
    const id = html.match(/href="\/map#(place-\d+-\d+)"/)?.[1]
    assert.ok(id, 'No /map link on /define/sāvatthī')
    assert.match(await readPage('/map/'), new RegExp(`id="${id}"`))
  })

  it('are linked from /map, other than for places DPPN lacks', async () => {
    const html = await readPage('/map/')
    const remote = [
      ...html.matchAll(/href="https:\/\/suttacentral\.net\/define\/([^"]+)"/g),
    ].map(([, word]) => decodeURIComponent(word))
    const unexpected = [...new Set(remote)].filter(
      word => !MAP_DEFINES_MISSING.includes(word)
    )
    assert.equal(
      unexpected.length,
      0,
      `/map links these to .net:\n${unexpected.join('\n')}`
    )
    assert.match(html, /href="\/define\/sāvatthī"/)
  })

  it('have their words listed for the /define search, by first letter', async () => {
    const dir = path.join(SITE_DIR, 'dictionaries', 'define-words')
    const lists = await Promise.all(
      (await fs.readdir(dir)).map(async file =>
        JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'))
      )
    )
    const total = lists.reduce((sum, words) => sum + words.length, 0)
    assert.ok(total >= 60_000, `Only ${total} words`)
    const d = JSON.parse(await readPage('/dictionaries/define-words/d.json'))
    assert.ok(d.includes('dhamma'))
  })
})

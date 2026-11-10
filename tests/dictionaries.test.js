/**
 * The dictionaries for word lookup and the /define pages are all there, and so are the pages and lookup's shards.
 *
 * They're fetched from GitHub at build time, and a file that fails or shrinks only leaves its words out,
 * so the cached copies are checked first, without a build, then the pages built from them.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, it } from 'node:test'
import vm from 'node:vm'
import siteMetaData from '../src/data/_siteMetaData.js'
import {
  generateDefineJsonLd,
  generateDefineOGTags,
  generateDefineSearchJsonLd,
  generateDefineSearchOGTags,
} from '../src/helpers/definePageMetadata.js'
import {
  DICTIONARY_FILES,
  entriesOf,
  fetchDictionary,
} from '../src/helpers/dictionaries.js'
import { mendNcped, tidyDictionaryHtml } from '../src/helpers/defineWords.js'
import { cleanPaliWord } from '../src/helpers/lookupAnswers.js'
import { SC_ORIGIN } from '../src/helpers/scApi.js'
import { mainOf, readPage, SITE_DIR, textOf } from './lib/site.js'

const { origin, title } = siteMetaData()

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

// /define pages that have to be there, and dictionaries each has an entry in
const DEFINE_PAGES = {
  '/define/dhamma/': ['dpd', 'ncped', 'dppn', 'pts'],
  '/define/sāvatthī/': ['dpd', 'ncped', 'dppn'],
  '/define/ima/': ['dpd'],
  '/define/aggāḷave cetiye/': ['dppn'],
  '/define/gaha/': ['dpd', 'ncped', 'dhammika', 'pts'],
}

// The order a page's dictionaries are in, DPD's then .net's
const DICTIONARY_ORDER = ['dpd', 'ncped', 'dhammika', 'dppn', 'pts']

// Words either side of a page's in its Adjacent Terms
const ADJACENT = 5

// The map's places DPPN has no entry for, which stay linked to .net
const MAP_DEFINES_MISSING = ['piprahwa stupa', 'siṁsapāvana3']

// The fields of an sc-data entry the pages show, as some NCPED entries are only a cross-reference or homonyms
const DEFINITION_FIELDS = ['definition', 'text', 'xr', 'homonyms']

// Share of a dictionary's entries that may have no definition, as DDB has a blank one or two
const MAX_BROKEN_SHARE = 0.001

// Root texts whose words word lookup has to know, and the share it has to answer and to give a /define page,
// each about 2 points under what they had in October 2026
const LOOKUP_PAGES = ['/mn1/pli/ms/', '/dn16/pli/ms/', '/mn10/pli/ms/']
const MIN_ANSWERED_SHARE = 0.97
const MIN_PAGED_SHARE = 0.97

// Words lookup has to answer, each with a /define page
const LOOKUP_CANARIES = [
  'evaṁ',
  'bhagavā',
  'sāvatthiyaṁ',
  'bhikkhū',
  'hiriottappa',
  'akata',
]

// Pages with the Word lookup setting, by the dictionary it uses
const LOOKUP_ROWS = {
  '/mn1/pli/ms/': 'pli-en',
  '/mn1/en/sujato/': 'pli-en',
  '/ma1/lzh/sct/': 'lzh-en',
}

// Bytes a shard can have, its prefix's own words being more than the 100 KB it's split at in places
const MAX_SHARD_BYTES = 200 * 1024

// As lookup.js finds a Pāli word
const WORD = /[\p{L}\p{M}\u00ad\u2027]+(?:[’'”][\p{L}\p{M}\u00ad\u2027]+)*/gu

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

describe('Dictionaries', () => {
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

describe('Dictionary markup', () => {
  it('names each term once in a dl', () => {
    assert.equal(
      tidyDictionaryHtml(
        "<dl id='a' class='b'><dt>A</dt><dt>A</dt><dt>C</dt><dd>1</dd><dt>A<sup>2</sup></dt><dd>2</dd><dt>C</dt><dt>D</dt><dd>3</dd></dl>"
      ),
      "<dl id='a' class='b'><dt>A</dt><dt>C</dt><dd>1</dd><dt>A<sup>2</sup></dt><dd>2</dd></dl><dl class='b'><dt>C</dt><dt>D</dt><dd>3</dd></dl>"
    )
  })

  it("rejoins NCPED's grammar where it was split at an &amp;", () => {
    assert.deepEqual(
      mendNcped({ entry: 'paṅgu', grammar: 'adj &amp', xr: 'n' }),
      { entry: 'paṅgu', grammar: 'adj & n' }
    )
    const entry = { entry: 'akata', grammar: 'adjective & neuter', xr: 'kata' }
    assert.equal(mendNcped(entry), entry)
  })
})

describe('The /define pages', () => {
  it('generates absolute metadata for a word page', () => {
    const term = {
      word: 'dhamma',
      href: '/define/dhamma',
      entries: [
        {
          title: 'PTS Pali English Dictionary',
          definitions: ['nature; character'],
        },
        { title: 'Digital Pāḷi Dictionary' },
      ],
    }
    const og = JSON.parse(generateDefineOGTags(term))
    const jsonLd = JSON.parse(generateDefineJsonLd(term))

    assert.equal(og['og:url'], `${origin}/define/dhamma`)
    assert.equal(og['og:description'], 'Pāli dictionary results for “dhamma”.')
    // The page, as breadcrumb's domain is WebPage, with the word as its main entity
    assert.equal(jsonLd['@type'], 'WebPage')
    assert.equal(jsonLd['@id'], og['og:url'])
    assert.equal(jsonLd.name, 'Definitions for dhamma')
    assert.equal(jsonLd.description, 'Pāli dictionary results for “dhamma”.')
    assert.equal(jsonLd.sameAs, `${SC_ORIGIN}/define/dhamma`)
    assert.equal(jsonLd.isPartOf.name, title)
    // isPartOf's domain is CreativeWork, which a DefinedTerm isn't: inDefinedTermSet says it instead
    assert.equal(jsonLd.mainEntity.isPartOf, undefined)
    assert.deepEqual(
      jsonLd.breadcrumb.itemListElement.map(({ name }) => name),
      ['Home', 'Definitions', 'dhamma']
    )
    assert.equal(jsonLd.mainEntity['@type'], 'DefinedTerm')
    assert.equal(jsonLd.mainEntity['@id'], `${origin}/define/dhamma#term`)
    assert.equal(jsonLd.mainEntity.name, 'dhamma')
    // The word is described by what a dictionary says of it, not by the page's own description
    assert.equal(jsonLd.mainEntity.description, 'nature; character')
    assert.equal(jsonLd.mainEntity.inDefinedTermSet['@type'], 'DefinedTermSet')
    assert.equal(jsonLd.mainEntity.inDefinedTermSet.inLanguage, 'pi')
    assert.equal(jsonLd.mainEntity.inDefinedTermSet.url, `${origin}/define`)
    // Its dictionary entries are Things, which `about` takes and `hasPart` doesn't
    assert.equal(jsonLd.hasPart, undefined)
    assert.equal(jsonLd.about.length, 1)
    assert.equal(jsonLd.about[0]['@type'], 'DefinedTerm')
    assert.equal(jsonLd.about[0].name, 'dhamma (PTS Pali English Dictionary)')
    assert.equal(jsonLd.about[0].description, 'nature; character')

    const dppnTerm = {
      word: 'buddha',
      href: '/define/buddha',
      entries: [
        {
          name: 'dppn',
          title: 'Dictionary of Pali Proper Names',
          html: '<dl><dt><dfn>Buddha</dfn></dt><dt>Bhagavā</dt><dt>Gotama</dt><dd>Awakened One</dd></dl>',
        },
      ],
    }
    const dppnJsonLd = JSON.parse(generateDefineJsonLd(dppnTerm))
    assert.deepEqual(dppnJsonLd.about[0].alternateName, ['Bhagavā', 'Gotama'])
    // DPPN's text stands in for a definition where it has none
    assert.match(dppnJsonLd.mainEntity.description, /^Buddha Bhagavā Gotama/)

    // DPD repeats the headword and sense number before its definition, which a description drops
    const dpdTerm = {
      word: 'dhamma',
      href: '/define/dhamma',
      entries: [
        {
          name: 'dpd',
          title: 'Digital Pāḷi Dictionary',
          numbered: true,
          definitions: ['dhamma 1.01: masc. nature; character [√dhar + ma]'],
        },
      ],
    }
    assert.equal(
      JSON.parse(generateDefineJsonLd(dpdTerm)).mainEntity.description,
      'masc. nature; character [√dhar + ma]'
    )

    // A word none of the dictionaries defines falls back to the page's description
    const undefinedTerm = {
      word: 'akkhara',
      href: '/define/akkhara',
      entries: [{ title: 'Digital Pāḷi Dictionary' }],
    }
    assert.equal(
      JSON.parse(generateDefineJsonLd(undefinedTerm)).mainEntity.description,
      'Pāli dictionary results for “akkhara”.'
    )
  })

  it('generates metadata for the dictionary search page', () => {
    const og = JSON.parse(generateDefineSearchOGTags())
    const jsonLd = JSON.parse(generateDefineSearchJsonLd())

    assert.equal(og['og:url'], `${origin}/define`)
    assert.equal(jsonLd['@type'], 'CollectionPage')
    assert.equal(jsonLd.url, og['og:url'])
    assert.equal(jsonLd.sameAs, `${SC_ORIGIN}/define`)
    assert.equal(jsonLd.isPartOf.name, title)
    assert.deepEqual(
      jsonLd.breadcrumb.itemListElement.map(({ name }) => name),
      ['Home', 'Definitions']
    )
  })

  it('include /define, with its search', async () => {
    const html = await readPage('/define/')
    assert.match(html, /<h1>/)
    assert.match(html, /class="define-form"/)
  })

  for (const [url, dictionaries] of Object.entries(DEFINE_PAGES)) {
    it(`include ${url}, with its entries in order`, async () => {
      const html = await readPage(url)
      assert.match(html, /<h1>/)
      const found = [...html.matchAll(/<dt class="(\w+)"/g)].map(
        ([, name]) => name
      )
      assert.deepEqual(
        found,
        DICTIONARY_ORDER.filter(name => found.includes(name)),
        `Not one dt per dictionary, in order: ${found.join(', ')}`
      )
      for (const name of dictionaries) {
        assert.ok(found.includes(name), `No ${name} entry`)
      }
    })
  }

  it('link other words here, not on .net, ie akatavedi to katavedi(n)', async () => {
    const urls = [...Object.keys(DEFINE_PAGES), '/define/akatavedi/']
    const remote = []
    for (const url of urls) {
      const main = mainOf(await readPage(url))
      if (main.includes(`${SC_ORIGIN}/define/`)) remote.push(url)
    }
    assert.equal(remote.length, 0, `Linked to .net:\n${remote.join('\n')}`)
    assert.match(
      await readPage('/define/akatavedi/'),
      /href="\/define\/katavedin"/
    )
  })

  it("list .net's adjacent terms, each with a page", async () => {
    const html = await readPage('/define/buddha/')
    const terms = html.slice(html.indexOf('Adjacent Terms</h2>'))
    const list = terms.slice(0, terms.indexOf('</ol>'))
    const items = [...list.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(
      ([, item]) => item
    )
    assert.equal(items.length, 2 * ADJACENT + 1)
    assert.match(items[ADJACENT], /aria-current="page"[^>]*>buddha</)
    for (const item of items.toSpliced(ADJACENT, 1)) {
      const href = item.match(/href="(\/define\/[^"]+)"/)?.[1]
      assert.ok(href, `Not a link: ${item}`)
      await readPage(`${decodeURIComponent(href)}/`)
    }
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
    const total = lists.reduce(
      (sum, words) => sum + Object.keys(words).length,
      0
    )
    assert.ok(total >= 60_000, `Only ${total} words`)
    const d = JSON.parse(await readPage('/dictionaries/define-words/d.json'))
    assert.ok(Object.hasOwn(d, 'dhamma'))
  })

  it("count their words' definitions in all their dictionaries", async () => {
    const s = JSON.parse(await readPage('/dictionaries/define-words/s.json'))
    const html = await readPage('/define/samma/')
    const dictionaries = html.match(/<dt class="/g).length
    assert.ok(s.samma >= dictionaries, `samma has only ${s.samma}`)
    assert.ok(Object.values(s).every(Number.isInteger))
  })
})

const dir = path.join(SITE_DIR, 'dictionaries')
const readJson = async file =>
  JSON.parse(await fs.readFile(path.join(dir, file), 'utf8'))
const context = { window: {} }
vm.runInNewContext(
  await fs.readFile(
    new URL('../src/scripts/dictionary.js', import.meta.url),
    'utf8'
  ),
  context
)
const client = context.window.scxDictionary
const pliIndex = await readJson('pli-en/index.json')

describe('Word lookup', () => {
  const shards = new Map()
  const answerOf = async word => {
    const key = cleanPaliWord(word)
    for (let i = key.length; i > 0; i--) {
      const n = pliIndex.prefixes[key.slice(0, i)]
      if (n === undefined) continue
      if (!shards.has(n)) shards.set(n, await readJson(`pli-en/${n}.json`))
      return shards.get(n)[key] ?? []
    }
    return []
  }

  for (const name of ['pli-en', 'lzh-en']) {
    it(`has every ${name} shard its index lists, each small enough`, async () => {
      const index = await readJson(`${name}/index.json`)
      const files = index.prefixes
        ? Object.entries(index.prefixes)
        : Array.from({ length: index.shards }, (_, n) => [null, n])
      const bad = []
      for (const [prefix, n] of files) {
        const file = path.join(dir, name, `${n}.json`)
        let shard
        try {
          shard = JSON.parse(await fs.readFile(file, 'utf8'))
        } catch {
          // A Chinese shard can be empty, where no term starts with a character of its code points
          if (!prefix) continue
          bad.push(`${n}.json is missing or broken`)
          continue
        }
        const { size } = await fs.stat(file)
        if (size > MAX_SHARD_BYTES) bad.push(`${n}.json is ${size} bytes`)
        if (prefix === null) continue
        const stray = Object.keys(shard).find(key => !key.startsWith(prefix))
        if (stray) bad.push(`${n}.json has ${stray}, not starting ${prefix}`)
      }
      assert.equal(bad.length, 0, bad.slice(0, 20).join('\n'))
    })
  }

  it('cleans words in the browser as the build does', async () => {
    const html = await readPage(LOOKUP_PAGES[0])
    const words = textOf(mainOf(html)).match(WORD) ?? []
    const differ = words.filter(
      word => client.cleanWord(word) !== cleanPaliWord(word)
    )
    assert.equal(differ.length, 0, differ.slice(0, 20).join(', '))
  })

  for (const url of LOOKUP_PAGES) {
    it(`answers the words of ${url}, with a /define page`, async () => {
      const html = await readPage(url)
      let words = 0
      let answered = 0
      let paged = 0
      for (const [, text] of html.matchAll(
        /<span class="translation" lang="pi" translate="no"><span class="text">(.*?)<\/span>/g
      )) {
        for (const word of text.replace(/<[^>]*>/g, '').match(WORD) ?? []) {
          words++
          const answer = await answerOf(word)
          if (answer.length) answered++
          if (answer.some(match => match.p || match.h)) paged++
        }
      }
      assert.ok(words > 0, 'No Pāli root text')
      assert.ok(
        answered / words >= MIN_ANSWERED_SHARE,
        `Only ${answered} of ${words} words answered`
      )
      assert.ok(
        paged / words >= MIN_PAGED_SHARE,
        `Only ${paged} of ${words} words with a /define page`
      )
    })
  }

  it('answers the canaries, each with a /define page', async () => {
    for (const word of LOOKUP_CANARIES) {
      const answer = await answerOf(word)
      assert.ok(answer.length, `No answer for ${word}`)
      assert.ok(
        answer.some(match => match.p || match.h),
        `${word} has no /define page: ${JSON.stringify(answer).slice(0, 200)}`
      )
    }
  })

  it("has room on /search for a word's definition", async () => {
    assert.match(await readPage('/search/'), /id="search-dictionary"/)
  })

  it('answers a Chinese term', async () => {
    const index = await readJson('lzh-en/index.json')
    const shard = await readJson(
      `lzh-en/${'一'.codePointAt(0) % index.shards}.json`
    )
    assert.ok(shard['一']?.d, 'No entry for 一')
  })

  for (const [url, dict] of Object.entries(LOOKUP_ROWS)) {
    it(`has the setting on ${url}`, async () => {
      const html = await readPage(url)
      assert.match(html, new RegExp(`id="definer" data-dict="${dict}"`))
      assert.match(html, /id="definition" popover aria-label/)
    })
  }
})

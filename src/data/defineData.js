import { AssetCache } from '@11ty/eleventy-fetch'
import { createHash } from 'node:crypto'
import { builds } from '../helpers/buildStage.js'
import {
  generateDefineJsonLd,
  generateDefineOGTags,
  generateDefineSearchJsonLd,
  generateDefineSearchOGTags,
} from '../helpers/definePageMetadata.js'
import {
  defineHref,
  linkedWord,
  loadDefineWords,
} from '../helpers/defineWords.js'
import { defineSample, sampleUids } from '../helpers/samplePages.js'

// As .net's /define pages call them, in its order
const DICTIONARY_TITLES = {
  ncped: 'New Concise Pali English Dictionary',
  dhammika: 'Nature and the Environment in Early Buddhism by S. Dhammika',
  dppn: 'Dictionary of Pali Proper Names',
  pts: 'PTS Pali English Dictionary',
  dpd: 'Digital Pāḷi Dictionary',
}

// .net's: the words either side of a page's in Pāli order, and the most it shows as spelt like it
const ADJACENT = 5
const SIMILAR = 10

// Pāli's alphabet, each aspirate one letter, as .net's `pali_sort_key`
const PALI_ORDER = [
  '#',
  ...'0123456789',
  ...'aāiīuūeoṁṃ',
  'k',
  'kh',
  'g',
  'gh',
  'ṅ',
  'c',
  'ch',
  'j',
  'jh',
  'ñ',
  'ṭ',
  'ṭh',
  'ḍ',
  'ḍh',
  'ṇ',
  't',
  'th',
  'd',
  'dh',
  'n',
  'p',
  'ph',
  'b',
  'bh',
  'm',
  'y',
  'r',
  'l',
  'ḷ',
  'v',
  's',
  'h',
]
const LETTER_VALUE = new Map(PALI_ORDER.map((letter, i) => [letter, i + 1]))

function paliSortKey(word) {
  const key = []
  for (let i = 0; i < word.length; i++) {
    const pair = LETTER_VALUE.get(word.slice(i, i + 2).toLowerCase())
    if (pair && word[i + 1] === 'h') {
      key.push(pair)
      i++
    } else {
      key.push(LETTER_VALUE.get(word[i].toLowerCase()) ?? 0)
    }
  }
  return key
}

function comparePali(a, b) {
  for (let i = 0; i < Math.min(a.key.length, b.key.length); i++) {
    if (a.key[i] !== b.key[i]) return a.key[i] - b.key[i]
  }
  return a.key.length - b.key.length || (a.word < b.word ? -1 : 1)
}

/** A word without its diacritics, as .net's `asciify_roman` */
function asciify(word) {
  return word
    .normalize('NFD')
    .replace(/\p{Diacritic}|­/gu, '')
    .normalize('NFC')
}

const row = new Int32Array(256)

/** The edit distance from `a` to `b`, or `max + 1` once it's sure to be more than `max` */
function levenshtein(a, b, max = a.length + b.length) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  for (let j = 0; j <= b.length; j++) row[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0]
    row[0] = i
    let least = i
    for (let j = 1; j <= b.length; j++) {
      const above = row[j]
      row[j] = Math.min(
        above + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
      diagonal = above
      if (row[j] < least) least = row[j]
    }
    if (least > max) return max + 1
  }
  return row[b.length]
}

/**
 * The words .net shows as spelt like each word: those with a full entry, starting with the same letter, fewer
 * edits than half its length away, closest first (an edit to the letters counting twice one to the diacritics),
 * as .net's `DICTIONARY_SIMILAR`, for the pages being built. About 40s of work for them all, so that's kept in
 * `.cache` until the words change
 */
function similarWords(sorted, complex, built) {
  const hash = createHash('sha1')
    .update(
      JSON.stringify([
        sorted.map(({ word }) => word),
        complex.map(({ word }) => word),
      ])
    )
    .digest('hex')
  const cache = new AssetCache(`define-similar-${hash}`, '.cache')
  const all = built.length === sorted.length
  if (all && cache.isCacheValid('*')) return new Map(cache.getCachedValue())

  const byLetter = Map.groupBy(complex, ({ ascii }) => ascii[0])
  const similar = []
  for (const { word, ascii } of built) {
    const limit = Math.max(1, word.length / 2)
    const max = Math.ceil(limit) - 1
    const found = []
    for (const other of byLetter.get(ascii[0]) ?? []) {
      if (other.word === word) continue
      const distance = levenshtein(word, other.word, max)
      if (distance >= limit) continue
      found.push({
        word: other.word,
        score: levenshtein(ascii, other.ascii) * 2 + distance,
        order: other.order,
      })
    }
    similar.push([
      word,
      found
        .sort((a, b) => a.score - b.score || a.order - b.order)
        .slice(0, SIMILAR)
        .map(({ word }) => word),
    ])
  }
  if (all) cache.save(similar, 'json')
  return new Map(similar)
}

/**
 * The words with a full entry either side of a word in Pāli order, as .net's `DICTIONARY_ADJACENT`, which
 * lists only those. For a word without one, the ten around where it would be, as .net shows the first six
 * words of the dictionary on all of those
 */
function adjacentWords(item, complex, complexIndex) {
  const own = complexIndex.get(item.word)
  if (own !== undefined) {
    return complex.slice(Math.max(0, own - ADJACENT), own + ADJACENT + 1)
  }
  let low = 0
  let high = complex.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (comparePali(complex[middle], item) < 0) low = middle + 1
    else high = middle
  }
  return complex.slice(Math.max(0, low - ADJACENT), low + ADJACENT)
}

// DPD's definitions, each headword a link to its own page where it has one, ie "akā: imperf. did"
function dpdDefinitions(word, definitions, words) {
  return definitions.map(definition => {
    const [, head, rest] = definition.match(/^([^:+]+)(:.*)$/s) ?? []
    const page = head?.replace(/ [\d.]+$/, '').normalize('NFC')
    return page && page !== word && words.has(page)
      ? `<a href="${defineHref(page)}">${head}</a>${rest}`
      : definition
  })
}

// A link in a complex dictionary's text to another word, ie <a href='/define/ā'>ā</a>
const DEFINE_LINK =
  /<a [^>]*?href='(?:https:\/\/suttacentral\.net)?\/define\/([^'#?]+)'[^>]*>(.*?)<\/a>/gs

/**
 * A word's entries as SSR lists them, one for each in each dictionary in .net's order, but DPD's first, as word
 * lookup and /search show it and link here, and one for each of an NCPED entry's homonyms:
 * `{ name, title, grammar, definitions, numbered, xrs, html, mapTag, mapView }`, with each `xrs` item's `word`
 * null where it has no page
 */
function entriesOf(word, entries, words) {
  const found = []
  const add = (name, entry) =>
    found.push({ name, title: DICTIONARY_TITLES[name], ...entry })
  if (entries.dpd.length) {
    add('dpd', {
      definitions: dpdDefinitions(word, entries.dpd, words),
      numbered: true,
    })
  }
  for (const entry of entries.ncped) {
    for (const { grammar, definition, xr } of entry.homonyms ?? [entry]) {
      add('ncped', {
        grammar,
        definitions: definition ? [definition].flat() : [],
        numbered: Array.isArray(definition),
        xrs: [xr ?? []].flat().map(text => ({
          text,
          word: linkedWord(text, words),
        })),
      })
    }
  }
  // Each id once on the page, as PTS gives each of a word's homonyms the word as its id, ie ambho
  const ids = new Set()
  for (const name of ['dhammika', 'dppn', 'pts']) {
    for (const text of entries[name]) {
      // .net's map component, which the page swaps for a link to the place on /map
      const [mapTag, mapView] =
        text.match(/<sc-map view='([^']*)'><\/sc-map>/) ?? []
      const html = text
        // DPPN's coordinates, which .net hides
        .replace(/<dd class='info'>.*?<\/dd>/gs, '')
        // Not a list type HTML has, so left to the lower-greek class it comes with
        .replace(/ type='α'/g, '')
        .replace(/ id=(['"])(.*?)\1/g, (match, quote, id) =>
          ids.has(id) ? '' : (ids.add(id), match)
        )
        // To the page here, or as text where there's none, as .net would show nothing
        .replace(DEFINE_LINK, (match, linked, content) => {
          const page = linkedWord(decodeURIComponent(linked), words)
          return page ? `<a href="${defineHref(page)}">${content}</a>` : content
        })
      add(name, { html, mapTag, mapView })
    }
  }
  return found
}

/**
 * How many definitions a word's page has, as /search counts them: each of DPD's and NCPED's, and each headword
 * in the others, ie PTS's samma 1 to 3 in one entry
 */
function definitionCount(entries) {
  const ncped = entries.ncped
    .flatMap(entry => entry.homonyms ?? [entry])
    .reduce(
      (sum, { definition }) =>
        sum + (definition ? [definition].flat().length : 0),
      0
    )
  const headwords = ['dhammika', 'dppn', 'pts']
    .flatMap(name => entries[name])
    .reduce(
      (sum, html) => sum + Math.max(1, html.match(/<dt[\s>]/g)?.length ?? 0),
      0
    )
  return entries.dpd.length + ncped + headwords
}

/** Which list of words /define searches for a word or query, by its first letter without diacritics */
function listKey(ascii) {
  return /[a-z]/.test(ascii[0]) ? ascii[0] : '_'
}

const NONE = { pages: [], wordLists: [], dictionaries: [], index: [] }

/**
 * A /define page for each word with a dictionary entry, as on .net, and the /define page's lists of them.
 * Nothing in the builds that leave those pages out, and only `defineSample` and any `define/<word>` in
 * `ONLY_UIDS` in a sample build
 */
export default async function () {
  if (!builds('define')) return NONE
  const words = await loadDefineWords()
  if (!words.size) return NONE

  const sorted = [...words.keys()]
    .map(word => ({ word, key: paliSortKey(word), ascii: asciify(word) }))
    .sort(comparePali)
  sorted.forEach((item, i) => (item.order = i))
  const complex = sorted.filter(({ word }) => {
    const entries = words.get(word)
    return entries.pts.length || entries.dppn.length || entries.dhammika.length
  })
  const complexIndex = new Map(complex.map(({ word }, i) => [word, i]))
  const built = sampleUids
    ? sorted.filter(
        ({ word }) =>
          defineSample.includes(word) || sampleUids.includes(`define/${word}`)
      )
    : sorted
  const similar = similarWords(sorted, complex, built)

  return {
    pages: built.map(item => {
      const term = {
        word: item.word,
        href: defineHref(item.word),
        entries: entriesOf(item.word, words.get(item.word), words),
        adjacent: adjacentWords(item, complex, complexIndex).map(
          ({ word }) => word
        ),
        similar: similar.get(item.word),
      }
      return {
        ...term,
        scx_og_tags: generateDefineOGTags(term),
        scx_json_ld: generateDefineJsonLd(term),
      }
    }),
    wordLists: [...Map.groupBy(sorted, ({ ascii }) => listKey(ascii))].map(
      ([letter, items]) => ({
        letter,
        words: Object.fromEntries(
          items.map(({ word }) => [word, definitionCount(words.get(word))])
        ),
      })
    ),
    dictionaries: Object.entries(DICTIONARY_TITLES)
      .map(([name, title]) => ({
        name,
        title,
        count: [...words.values()].filter(entries => entries[name].length)
          .length,
      }))
      .sort((a, b) => b.count - a.count),
    // The /define page, paginated over this so it isn't built without its words
    index: [
      {
        scx_og_tags: generateDefineSearchOGTags(),
        scx_json_ld: generateDefineSearchJsonLd(),
      },
    ],
  }
}

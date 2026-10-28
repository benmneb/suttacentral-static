/**
 * Search Extras
 *
 * Builds the Pagefind bundles /search loads only when a search needs them, from the pages
 * already in `_site`:
 *
 *   _site/pagefind-titles/   each text's titles, for .net's `title: term`
 *   _site/pagefind-notes/    each translator's note, one record per note
 *   _site/pagefind-chinese/  the Chinese texts as character pairs, for /search to find a phrase anywhere
 *   _site/pagefind-site/     the site pages' text, ie the guides and the editions' introductions
 *   _site/search/refs/       the pages each reference is on, ie sya13.544, for .net's `ref:`, in shards
 *   _site/search/texts/      the acronym and titles of the texts those are on
 *   _site/search/hant.json   each simplified Chinese character's traditional form, of those the texts
 *                            have, so /search finds them by either
 *   _site/hans.json          the simplified form of each traditional character the texts have, for
 *                            the text pages' "Simplified" setting
 *
 * The notes' and site pages' bundles each get a filter-values.json, of the filter values they have.
 *
 * vercel.json caches the hashed files of `pagefind` and each `pagefind-<letters>` bundle for good,
 * by Pagefind's file names, so a bundle named otherwise, or a new Pagefind version that renames them,
 * gets the default caching instead.
 *
 * Run by `pnpm build:search`, after the main index.
 *
 * @module searchExtras
 */

import fs from 'fs/promises'
import path from 'path'
import { Converter } from 'opencc-js'
import TSPhrases from 'opencc-js/dict/TSPhrases'
import * as pagefind from 'pagefind'
import { recordStat } from '../src/helpers/buildStats.js'
import { groupByPrefix } from '../src/helpers/lookupShards.js'
import { parseUidNumbers } from '../src/helpers/rangeSuttas.js'
import {
  pageIcons,
  pitakaGuides,
  siteMap,
  sitePageRoots,
} from '../src/helpers/sitePages.js'

const SITE_DIR = '_site'
const READ_CONCURRENCY = 64

// The few entities the templates and API put in attributes
const ENTITIES = {
  amp: '&',
  quot: '"',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
}
const decode = text =>
  text.replace(/&(amp|quot|#39|apos|lt|gt);/g, (_, name) => ENTITIES[name])

const urlOf = file => `/${file.split(path.sep).slice(0, -1).join('/')}/`

/** Every `uid/lang/author/index.html` in the site, which the text pages are among */
async function candidatePages() {
  const dirs = async dir =>
    (await fs.readdir(path.join(SITE_DIR, dir), { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(dir, entry.name))
  const pages = []
  for (const uid of await dirs('')) {
    if (uid.startsWith('pagefind')) continue
    for (const lang of await dirs(uid)) {
      for (const author of await dirs(lang)) {
        pages.push(path.join(author, 'index.html'))
      }
    }
  }
  return pages
}

/**
 * A text page's details, as `data-pagefind-meta` and `data-pagefind-filter` give them to the main index,
 * or null for any other page
 */
function textPage(file, html) {
  const main = html.match(/<main\b([^>]*)>/)?.[1]
  if (!main?.includes('data-acronym=')) return null
  const attribute = name =>
    decode(main.match(new RegExp(` data-${name}="([^"]*)"`))?.[1] ?? '').trim()
  const header = html.slice(0, html.indexOf('<main'))
  const parts = file.split(path.sep)
  const collections = [
    ...header.matchAll(/data-uid="([^"]*)" data-pagefind-filter="in/g),
  ].map(match => match[1])
  const textIds = [...header.matchAll(/data-text-id="([^"]*)"/g)]
    .map(match => match[1])
    .filter(id => !collections.includes(id))
  return {
    url: urlOf(file),
    uid: parts[0],
    textIds,
    meta: {
      acronym: attribute('acronym'),
      author: attribute('author'),
      lang: attribute('lang'),
      title: attribute('title'),
      translatorsTitle: attribute('translatorstitle'),
      originalTitle: attribute('originaltitle'),
      rootLang: attribute('rootlang'),
      titleParts: attribute('titleparts'),
    },
    filters: {
      in: [...collections, ...textIds],
      author: [attribute('authoruid')],
      lang: [attribute('lang')],
    },
  }
}

// Every text page's url, from `candidatePages()`
let pageUrls

/** An English translation's notes, each linked to its segment */
function notes(page, html) {
  if (page.meta.lang !== 'en') return []
  let repeated
  return [
    ...html.matchAll(/<article id="comment-([^"]*)"[^>]*>(.*?)<\/article>/gs),
  ]
    .map(([, segment, note]) => {
      const [uid, number] = segment.split(':')
      // A range's notes are on its page and each of its texts' too, so they're kept for the segment's own
      if (uid !== page.uid && pageUrls.has(page.url.replace(page.uid, uid)))
        return null
      // A page of several texts, ie dhp290-305, repeats their numbers, so those take the segment's own id
      const anchor =
        uid !== page.uid && (repeated ??= repeatedNumbers(html)).has(number)
          ? segment
          : number
      return {
        url: `${page.url}#${anchor}`,
        content: decode(note.replace(/<[^>]*>/g, '')).trim(),
        language: 'en',
        meta: { ...page.meta, segment: anchor },
        filters: page.filters,
      }
    })
    .filter(record => record?.content)
}

/** The segment numbers a page has more than once */
function repeatedNumbers(html) {
  const seen = new Set()
  const repeated = new Set()
  for (const [, number] of html.matchAll(/class="reference" id="([^"]*)"/g)) {
    if (seen.has(number)) repeated.add(number)
    seen.add(number)
  }
  return repeated
}

/**
 * A Chinese text as overlapping character pairs, with the punctuation between kept for excerpts, then each
 * character on its own, ie 謂四念處、 as `謂四 四念 念處 處 、 謂 四 念 處 、`. Pagefind takes a run of
 * Chinese as one word, so this lets /search find a phrase anywhere, as the exact phrase of its pairs
 */
function chinese(page, html) {
  if (page.meta.lang !== 'lzh') return []
  const main = html.slice(html.indexOf('<main'))
  const text = decode(
    main
      .slice(
        main.indexOf('<article'),
        main.search(/<article[^>]*popover|<\/main>/)
      )
      .replace(
        /<a class="ref\b.*?<\/a>|<span class="(reference|inline-comment)".*?<\/span>|<button.*?<\/button>/gs,
        ''
      )
      .replace(
        /<\/?(p|h\d|li|ul|header|article|blockquote|div|br|tr|td|th)\b[^>]*>/g,
        '\0'
      )
      .replace(/<[^>]*>/g, '')
      // The HTML wraps the Taishō's lines, which end mid-phrase
      .replace(/[ \t\r\n]+/g, '')
  )
    // Only the Chinese and its punctuation, as the headers' Latin and numbers would be read as Chinese
    .replace(/[^\p{Script=Han}\p{P}]+/gu, '\n')
  const runs = text.split(/(\p{Script=Han}+)/u)
  const pairs = runs.flatMap((run, i) => {
    if (i % 2 === 0) return run.trim() ? [run.replace(/\s+/g, '')] : []
    const chars = [...run]
    return [
      ...chars.slice(0, -1).map((char, j) => char + chars[j + 1]),
      chars.at(-1),
    ]
  })
  const singles = [...text.replace(/\s+/g, '')]
  if (!singles.length) return []
  return [
    {
      url: page.url,
      content: [...pairs, ...singles].join(' '),
      language: 'en',
      meta: page.meta,
      filters: page.filters,
    },
  ]
}

// Each reference's pages, ie "sya13.544" → mn91/pli/ms and mn91/en/sujato, by its id in lower case
const references = new Map()
// The acronym and titles of each text with references
const referenceTexts = new Map()

/** Notes down the references on a text page */
function collectReferences(page, html) {
  const at = page.url.slice(1, -1)
  for (const [, id] of html.matchAll(/<a class="ref\b[^"]*" id="([^"]*)"/g)) {
    const key = id.toLowerCase()
    if (!references.has(key)) references.set(key, { id, pages: new Set() })
    references.get(key).pages.add(at)
    if (!referenceTexts.has(page.uid)) {
      const { acronym, originalTitle, title, rootLang } = page.meta
      referenceTexts.set(page.uid, [acronym, originalTitle, title, rootLang])
    }
  }
}

// How often each Chinese character is in the Chinese texts
const hanCounts = new Map()

// The phrases OpenCC simplifies other than character by character, of those in the texts
const hansPhrases = new Map()
const toSimplified = Converter({ from: 't', to: 'cn' })
const PHRASES = TSPhrases.split('|').map(entry => entry.split(' '))

const simplifiedChars = new Map()
// Not one that changes length, so the pages' text offsets stay the same, ie 絺 as 𫄨
function simplifiedChar(char) {
  if (!simplifiedChars.has(char)) {
    const simplified = toSimplified(char)
    simplifiedChars.set(
      char,
      simplified.length === char.length ? simplified : char
    )
  }
  return simplifiedChars.get(char)
}

const byChar = text => text.replace(/\p{Script=Han}/gu, simplifiedChar)

function countHan(page, html) {
  if (page.meta.lang !== 'lzh') return
  const main = html.slice(html.indexOf('<main'))
  for (const [run] of main.matchAll(/\p{Script=Han}+/gu)) {
    for (const [char] of run.matchAll(/./gu)) {
      hanCounts.set(char, (hanCounts.get(char) ?? 0) + 1)
    }
    // Few runs simplify differently from their characters, so only those are searched
    if (toSimplified(run) === byChar(run)) continue
    for (const [phrase, simplified] of PHRASES) {
      if (
        run.includes(phrase) &&
        simplified.length === phrase.length &&
        simplified !== byChar(phrase)
      ) {
        hansPhrases.set(phrase, simplified)
      }
    }
  }
}

/**
 * Writes each simplified character's traditional form, the commonest in the texts where several
 * share one, ie 发 → 發 over 髮
 */
async function writeTraditional() {
  const simplify = Converter({ from: 't', to: 'cn' })
  const traditional = {}
  for (const [char] of [...hanCounts].sort((a, b) => b[1] - a[1])) {
    const simplified = simplify(char)
    if (simplified !== char && !(simplified in traditional)) {
      traditional[simplified] = char
    }
  }
  await fs.writeFile(
    path.join(SITE_DIR, 'search', 'hant.json'),
    JSON.stringify(traditional)
  )
  console.log(
    `🔎 Wrote ${Object.keys(traditional).length} simplified characters to search/hant.json`
  )
}

/**
 * Writes each traditional character's simplified form, and the phrases that differ from those, ie 尼乾子 keeps
 * the 乾 that's 干 on its own
 */
async function writeSimplified() {
  const chars = {}
  for (const char of hanCounts.keys()) {
    const simplified = simplifiedChar(char)
    if (simplified !== char) chars[char] = simplified
  }
  const phrases = Object.fromEntries(hansPhrases)
  await fs.writeFile(
    path.join(SITE_DIR, 'hans.json'),
    JSON.stringify({ chars, phrases })
  )
  console.log(
    `🔎 Wrote ${Object.keys(chars).length} traditional characters and ${hansPhrases.size} phrases to hans.json`
  )
}

/** Whether a range's page is also there as one of its texts', ie an1.1-10/pli/ms as an1.1/pli/ms */
function inTextOfRange(at, pages) {
  const [uid, ...edition] = at.split('/')
  const range = parseUidNumbers(uid)
  if (!range || range.start === range.end) return false
  for (let n = range.start; n <= range.end; n++) {
    if (pages.has([`${range.prefix}${n}`, ...edition].join('/'))) return true
  }
  return false
}

const byUid = new Intl.Collator('en', { numeric: true }).compare

/**
 * A reference's pages, each once: not a range's where its texts have their own, and one of those that all
 * show the same text, ie an11.262 to an11.309, which are each AN 11.262–309
 */
function referencePages(pages) {
  const shown = new Map()
  for (const at of [...pages].sort(byUid)) {
    if (inTextOfRange(at, pages)) continue
    const [uid, ...edition] = at.split('/')
    const text = `${referenceTexts.get(uid)[0]} ${edition.join('/')}`
    if (!shown.has(text)) shown.set(text, at)
  }
  return [...shown.values()]
}

/** Writes entries in shards by prefix, as `lookupShards.js` does the dictionaries, with an index of them */
async function writeShards(dir, entries) {
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  const prefixes = {}
  for (const [prefix, group] of groupByPrefix(entries)) {
    const shard = Object.keys(prefixes).length
    prefixes[prefix] = shard
    await fs.writeFile(
      path.join(dir, `${shard}.json`),
      JSON.stringify(Object.fromEntries(group))
    )
  }
  await fs.writeFile(
    path.join(dir, 'index.json'),
    JSON.stringify({ by: 'prefix', prefixes })
  )
  console.log(
    `🔎 Wrote ${entries.length} entries to ${dir}, in ${Object.keys(prefixes).length} files`
  )
}

/**
 * Writes each reference's pages, with its id first where that isn't in lower case, and the acronym and
 * titles of the texts they're on, by uid
 */
async function writeReferences() {
  await writeShards(
    path.join(SITE_DIR, 'search', 'refs'),
    [...references].map(([key, { id, pages }]) => [
      key,
      [...(id === key ? [] : [id]), ...referencePages(pages)],
    ])
  )
  await writeShards(path.join(SITE_DIR, 'search', 'texts'), [...referenceTexts])
}

/** The site pages, but not /define's words, which /search answers on its own */
async function sitePageFiles() {
  const roots = [...sitePageRoots].filter(root => root !== 'define')
  const files = await Promise.all(
    roots.map(async root =>
      (await fs.readdir(path.join(SITE_DIR, root), { recursive: true }))
        .filter(file => path.basename(file) === 'index.html')
        .map(file => path.join(root, file))
    )
  )
  return files.flat()
}

/** The authors /search can filter by, as uid → name, from its Author checkboxes */
async function searchAuthors() {
  const html = await fs.readFile(
    path.join(SITE_DIR, 'search/index.html'),
    'utf8'
  )
  return new Map(
    [
      ...html.matchAll(
        /name="author" value="([^"]*)"[^>]*> *<label[^>]*>([^<]*)/g
      ),
    ].map(([, uid, name]) => [uid, decode(name).trim()])
  )
}

// Each site page's kind, from its menu heading
const KINDS = {
  Explore: 'Explore',
  Guides: 'Guide',
  Essays: 'Essay',
  Indexes: 'Index',
  Reference: 'Reference',
  About: 'About',
}
const pageKinds = new Map([
  ...Object.values(pitakaGuides)
    .flat()
    .map(({ href }) => [href, 'Guide']),
  ...siteMap.flatMap(({ heading, pages }) =>
    pages.map(({ href }) => [href, KINDS[heading]])
  ),
])

// The collection each guide or essay is about, ie "dn" for /dn-guide-sujato
const guideCollections = new Map(
  Object.entries(pitakaGuides).flatMap(([uid, guides]) =>
    guides.map(({ href }) => [href, uid])
  )
)

const attribute = value =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

/**
 * A site page as `addHTMLFile` takes it, with its kind, author and edition as meta, its tab's title
 * when its heading is another page's too, and as filters its icon, and (also in `filters`) its author when
 * they have texts and the collection it's about
 */
function sitePage(file, html, sharedTitle) {
  const url = urlOf(file).slice(0, -1)
  const [, root, editionUid, , authorUid] = url.split('/')
  const isEdition = root === 'edition'
  const collection = isEdition ? editionUid : guideCollections.get(`/${root}`)
  // ie "Preface—Middle Discourses" for /edition/mn/en/sujato/preface, or "Middle Discourses—Bhikkhu Sujato"
  // for /edition/mn/en/sujato itself
  const tabTitle =
    isEdition &&
    html.match(/<title>([^<]*)—([^<]*) @ SuttaCentral Express<\/title>/)
  const isMatter = url.split('/').length > 5
  const label = isMatter && tabTitle?.[1]
  const edition = tabTitle?.[isMatter ? 2 : 1]
  const meta = {
    kind: isEdition ? 'Edition' : (pageKinds.get(`/${root}`) ?? 'Site page'),
    // ie every edition's foreword, "The SuttaCentral Editions Series", as "Foreword—Long Discourses"
    title: sharedTitle && label && decode(`${label}—${edition}`),
    edition: edition && decode(edition),
  }
  const byline = decode(html.match(/<p class="byline">([^<]*)/)?.[1] ?? '')
  // ie "Rod Bucknell, updated by Sujato", or "Bhikkhu Sujato, 2019"
  meta.author = isEdition
    ? authors.get(authorUid)
    : byline.replace(/, \d{4}$/, '').trim()
  const uid = isEdition
    ? authorUid
    : [...authors].find(([, name]) => name === byline.split(',')[0].trim())?.[0]

  const shown = Object.entries(meta).filter(([, value]) => value)
  const filters = {
    ...(uid && { author: [uid] }),
    ...(collection && { in: [collection] }),
  }
  const icon = pageIcons[`/${root}`]
  // Not meta, as Pagefind searches every meta field, so "documentText" would find the essays
  const filtered = [...Object.entries(filters), ['icon', [icon]]]
  const attributes = [
    ...shown.map(([key, value]) => `data-${key}="${attribute(value)}"`),
    `data-pagefind-meta="${shown.map(([key]) => `${key}[data-${key}]`).join(', ')}"`,
    ...filtered.map(([key, [value]]) => `data-filter-${key}="${value}"`),
    `data-pagefind-filter="${filtered.map(([key]) => `${key}[data-filter-${key}]`).join(', ')}"`,
  ]
  return {
    url,
    filters,
    content: html
      .replace('<main', `<main ${attributes.filter(Boolean).join(' ')}`)
      // Pagefind runs these into the next cell or term, ie the similes' "Raft" into "eightfold"
      .replace(/<\/(dt|dd|td|th)>/g, ' $&'),
  }
}

/**
 * Each bundle's output, and the records it takes from a text page, or for the site bundle the
 * pages it's made from and its own index settings
 */
const bundles = {
  titles: {
    outputPath: path.join(SITE_DIR, 'pagefind-titles'),
    records: page => [
      {
        url: page.url,
        content: [
          page.meta.acronym,
          page.uid,
          page.meta.originalTitle,
          page.meta.title,
          page.meta.translatorsTitle,
          page.meta.titleParts,
        ].join(' '),
        language: 'en',
        meta: page.meta,
        filters: page.filters,
      },
    ],
  },
  notes: {
    outputPath: path.join(SITE_DIR, 'pagefind-notes'),
    records: notes,
    filterValues: true,
  },
  chinese: {
    outputPath: path.join(SITE_DIR, 'pagefind-chinese'),
    records: chinese,
  },
  site: {
    outputPath: path.join(SITE_DIR, 'pagefind-site'),
    filterValues: true,
    // Not pagefind.yml's exclusions, which would drop the site pages' sutta references (.ref). The guides'
    // contents only repeat their headings, and the map's labels are today's towns
    config: () => ({ rootSelector: 'main', excludeSelectors: ['nav', 'svg'] }),
    files: sitePageFiles,
  },
}

/**
 * Writes the values a bundle has of each of its filters, for /search to show only those, as
 * { author: ['sujato', ...], ... }. A value every record has would narrow nothing, so it's left out,
 * but not its filter, which the bundle still takes (ie the notes' `lang`, which is only ever English)
 */
async function writeFilterValues(name, outputPath) {
  const values = Object.entries(filterCounts[name]).map(([key, counted]) => [
    key,
    [...counted]
      .filter(([, count]) => count < counts[name])
      .map(([value]) => value),
  ])
  await fs.writeFile(
    path.join(outputPath, 'filter-values.json'),
    JSON.stringify(Object.fromEntries(values))
  )
}

const start = Date.now()
const authors = await searchAuthors()
const indexes = {}
for (const [name, bundle] of Object.entries(bundles)) {
  const { index, errors } = await pagefind.createIndex({
    forceLanguage: 'en',
    ...bundle.config?.(),
  })
  if (errors.length) throw new Error(`${name}: ${errors.join(', ')}`)
  indexes[name] = index
}

const files = await candidatePages()
pageUrls = new Set(files.map(urlOf))
const counts = Object.fromEntries(Object.keys(bundles).map(name => [name, 0]))
// How many of each bundle's records have each filter value, by filter
const filterCounts = Object.fromEntries(
  Object.keys(bundles).map(name => [name, {}])
)
// Not a text's own `in` ids, which have no box to show or hide
function countFilters(name, filters = {}, textIds = []) {
  for (const [key, values] of Object.entries(filters)) {
    const counted = (filterCounts[name][key] ??= new Map())
    for (const value of new Set(values.filter(Boolean))) {
      if (key === 'in' && textIds.includes(value)) continue
      counted.set(value, (counted.get(value) ?? 0) + 1)
    }
  }
}
for (let i = 0; i < files.length; i += READ_CONCURRENCY) {
  await Promise.all(
    files.slice(i, i + READ_CONCURRENCY).map(async file => {
      const html = await fs
        .readFile(path.join(SITE_DIR, file), 'utf8')
        .catch(() => null)
      const page = html && textPage(file, html)
      if (!page) return
      collectReferences(page, html)
      countHan(page, html)
      for (const [name, bundle] of Object.entries(bundles)) {
        for (const record of bundle.records?.(page, html) ?? []) {
          const { errors } = await indexes[name].addCustomRecord(record)
          if (errors.length) {
            console.warn(`${name} ${record.url}:`, errors.join(', '))
          } else {
            counts[name]++
            countFilters(name, record.filters, page.textIds)
          }
        }
      }
    })
  )
}

for (const [name, bundle] of Object.entries(bundles)) {
  const pages = await Promise.all(
    ((await bundle.files?.()) ?? []).map(async file => [
      file,
      await fs.readFile(path.join(SITE_DIR, file), 'utf8'),
    ])
  )
  const headings = pages.map(
    ([, html]) => html.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1]
  )
  for (const [i, [file, html]] of pages.entries()) {
    const shared =
      headings.filter(heading => heading === headings[i]).length > 1
    const { filters, ...page } = sitePage(file, html, shared)
    const { errors } = await indexes[name].addHTMLFile(page)
    if (errors.length) {
      console.warn(`${name} ${file}:`, errors.join(', '))
    } else {
      counts[name]++
      countFilters(name, filters)
    }
  }
}

for (const [name, { outputPath, filterValues }] of Object.entries(bundles)) {
  const { errors } = await indexes[name].writeFiles({ outputPath })
  if (errors.length) throw new Error(`${name}: ${errors.join(', ')}`)
  console.log(`🔎 Wrote ${counts[name]} records to ${outputPath}`)
  if (filterValues) await writeFilterValues(name, outputPath)
}
await pagefind.close()
await writeReferences()
await writeTraditional()
await writeSimplified()

recordStat('searchExtras', {
  ...counts,
  references: references.size,
  seconds: (Date.now() - start) / 1000,
})

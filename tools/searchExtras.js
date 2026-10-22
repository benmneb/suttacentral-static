/**
 * Search Extras
 *
 * Builds the Pagefind bundles /search loads only when a search needs them, from the pages
 * already in `_site`:
 *
 *   _site/pagefind-titles/   each text's titles, for .net's `title: term`
 *   _site/pagefind-notes/    each translator's note, one record per note
 *   _site/pagefind-site/     the site pages' text, ie the guides and the editions' introductions
 *
 * Run by `pnpm build:search`, after the main index.
 *
 * @module searchExtras
 */

import fs from 'fs/promises'
import path from 'path'
import * as pagefind from 'pagefind'
import { recordStat } from '../src/helpers/buildStats.js'
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
  if (!main?.includes('data-pagefind-body')) return null
  const attribute = name =>
    decode(main.match(new RegExp(` data-${name}="([^"]*)"`))?.[1] ?? '').trim()
  const header = html.slice(0, html.indexOf('<main'))
  const parts = file.split(path.sep)
  return {
    url: urlOf(file),
    uid: parts[0],
    meta: {
      acronym: attribute('acronym'),
      author: attribute('author'),
      lang: attribute('lang'),
      title: attribute('title'),
      translatorsTitle: attribute('translatorstitle'),
      originalTitle: attribute('originaltitle'),
      rootLang: attribute('rootlang'),
    },
    filters: {
      in: [
        ...header.matchAll(/data-uid="([^"]*)" data-pagefind-filter="in/g),
      ].map(match => match[1]),
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

const attribute = value =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')

/**
 * A site page as `addHTMLFile` takes it, with its icon, kind, author and edition as meta, its tab's title
 * when its heading is another page's too, and its author as a filter when they have texts
 */
function sitePage(file, html, sharedTitle) {
  const url = urlOf(file).slice(0, -1)
  const [, root, , , authorUid] = url.split('/')
  const isEdition = root === 'edition'
  // ie "Preface—Middle Discourses" for /edition/mn/en/sujato/preface, or "Middle Discourses—Bhikkhu Sujato"
  // for /edition/mn/en/sujato itself
  const tabTitle =
    isEdition &&
    html.match(/<title>([^<]*)—([^<]*) @ SuttaCentral Express<\/title>/)
  const isMatter = url.split('/').length > 5
  const label = isMatter && tabTitle?.[1]
  const edition = tabTitle?.[isMatter ? 2 : 1]
  const meta = {
    icon: pageIcons[`/${root}`] ?? (isEdition ? 'bookOpen' : 'documentText'),
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
  const attributes = [
    ...shown.map(([key, value]) => `data-${key}="${attribute(value)}"`),
    `data-pagefind-meta="${shown.map(([key]) => `${key}[data-${key}]`).join(', ')}"`,
    uid &&
      `data-authoruid="${uid}" data-pagefind-filter="author[data-authoruid]"`,
  ]
  return {
    url,
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
  },
  site: {
    outputPath: path.join(SITE_DIR, 'pagefind-site'),
    // Not pagefind.yml's exclusions, which would drop the site pages' sutta references (.ref). The guides'
    // contents only repeat their headings, and the map's labels are today's towns
    config: () => ({ rootSelector: 'main', excludeSelectors: ['nav', 'svg'] }),
    files: sitePageFiles,
  },
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
for (let i = 0; i < files.length; i += READ_CONCURRENCY) {
  await Promise.all(
    files.slice(i, i + READ_CONCURRENCY).map(async file => {
      const html = await fs
        .readFile(path.join(SITE_DIR, file), 'utf8')
        .catch(() => null)
      const page = html && textPage(file, html)
      if (!page) return
      for (const [name, bundle] of Object.entries(bundles)) {
        for (const record of bundle.records?.(page, html) ?? []) {
          const { errors } = await indexes[name].addCustomRecord(record)
          if (errors.length)
            console.warn(`${name} ${record.url}:`, errors.join(', '))
          else counts[name]++
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
    const { errors } = await indexes[name].addHTMLFile(
      sitePage(file, html, shared)
    )
    if (errors.length) console.warn(`${name} ${file}:`, errors.join(', '))
    else counts[name]++
  }
}

for (const [name, { outputPath }] of Object.entries(bundles)) {
  const { errors } = await indexes[name].writeFiles({ outputPath })
  if (errors.length) throw new Error(`${name}: ${errors.join(', ')}`)
  console.log(`🔎 Wrote ${counts[name]} records to ${outputPath}`)
}
await pagefind.close()

recordStat('searchExtras', {
  ...counts,
  seconds: (Date.now() - start) / 1000,
})

/**
 * Volume and Page
 *
 * The PTS pages each text is on, from its suttaplex `volpages`, for .net's `volpage:` search. Written to
 * `_site/search/volpages/<book>.json`, with an `index.json` of the books, which /search fetches only for
 * such a search.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { formatVolpages } from './strings.js'

const OUTPUT_DIR = path.join('_site', 'search', 'volpages')

// ie "PTS 2.72", "PTS SN ii 66", "PTS (2nd ed) 1.44", "PTS 1.1.1" or "PTS Iti 109"
const PTS_PAGE =
  /^PTS\s*(?:\((\w+) ed\)\s*)?(?:[A-Z][A-Za-z]*\s+)?(?:([ivxl]+)\s+|(\d+)\.)?(\d+)(?:\.\d+)?$/

const ROMAN = { i: 1, v: 5, x: 10, l: 50 }

/** ie 4 for "iv" */
function romanToInt(roman) {
  const values = [...roman.toLowerCase()].map(char => ROMAN[char])
  return values.reduce(
    (sum, value, i) => sum + (value < (values[i + 1] ?? 0) ? -value : value),
    0
  )
}

// The books whose pages are numbered together, ie the whole Vinaya as pli-tv, or sn for sn12.39
const bookOf = uid =>
  uid.startsWith('pli-tv') ? 'pli-tv' : uid.match(/^[a-z]+(?:-[a-z]+)*/)?.[0]

/** A volpages string's PTS pages, as { edition, vol, page }, with 0 for a book of one volume */
function ptsPages(volpages) {
  return (volpages ?? '')
    .split(',')
    .map(part => part.trim().match(PTS_PAGE))
    .filter(Boolean)
    .map(([, edition = '', roman, vol, page]) => ({
      edition,
      vol: roman ? romanToInt(roman) : Number(vol ?? 0),
      page: Number(page),
    }))
}

/**
 * Each book's texts, with their titles and pretty volpages, and the pages of each volume they're on, as
 * [uid, vol, first, last]. A text that gives only the page it starts on runs on to the page the next one starts
 * on, while the others give every page
 */
function volpageBooks(entries) {
  const books = new Map()
  const runs = new Map()
  for (const entry of entries) {
    const book = bookOf(entry.uid)
    if (books.get(book)?.texts[entry.uid]) continue
    const pages = [entry.volpages, entry.alt_volpages].flatMap(ptsPages)
    if (!pages.length) continue
    if (!books.has(book)) books.set(book, { texts: {}, pages: [] })
    books.get(book).texts[entry.uid] = [
      entry.acronym?.trim(),
      (entry.original_title || entry.root_name)?.trim(),
      (entry.translated_title || entry.translated_name)?.trim(),
      entry.root_lang,
      [entry.volpages, entry.alt_volpages]
        .map(formatVolpages)
        .filter((pretty, i, all) => pretty && all.indexOf(pretty) === i)
        .join(', '),
    ]
    for (const { edition, vol, page } of pages) {
      const key = `${book} ${edition} ${vol}`
      if (!runs.has(key)) runs.set(key, { book, texts: new Map() })
      const run = runs.get(key).texts.get(entry.uid)
      if (run) run[2] = Math.max(run[2], page)
      else runs.get(key).texts.set(entry.uid, [vol, page, page])
    }
  }
  for (const { book, texts } of runs.values()) {
    const sorted = [...texts].sort((a, b) => a[1][1] - b[1][1])
    for (const [uid, [vol, first, last]] of sorted) {
      const next =
        first === last && sorted.find(([, other]) => other[1] > first)?.[1][1]
      books.get(book).pages.push([uid, vol, first, next || last])
    }
  }
  return books
}

// Every text in the menu tree
const textsOf = nodes =>
  nodes.flatMap(node => [
    ...(node.node_type === 'leaf' || node.type === 'leaf' ? [node] : []),
    ...textsOf(node.children ?? []),
  ])

/** Writes each book's file and the index, from `masterData`'s tree */
export async function writeVolpages(tree) {
  const books = volpageBooks(textsOf(tree))
  await fs.rm(OUTPUT_DIR, { recursive: true, force: true })
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await Promise.all([
    ...[...books].map(([name, book]) =>
      fs.writeFile(path.join(OUTPUT_DIR, `${name}.json`), JSON.stringify(book))
    ),
    fs.writeFile(
      path.join(OUTPUT_DIR, 'index.json'),
      JSON.stringify({ books: [...books.keys()] })
    ),
  ])
  console.log(`📖 Wrote the PTS pages of ${books.size} books`)
}

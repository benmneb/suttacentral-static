/**
 * Define Words
 *
 * The words with a /define page, as on .net: every word with a full entry (NCPED, Dhammika, DPPN, PTS), and
 * every DPD headword. .net has a page for any word with a full entry or a DPD entry of its own, but most
 * of DPD's are inflected forms (ie sāvatthiyaṁ), so here those are only in their headword's page.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { loadDictionaries } from './dictionaries.js'

// The full-entry dictionaries, in the order .net shows them, and the field each keys a word by
const FULL = [
  ['ncped', 'entry'],
  ['dhammika', 'word'],
  ['dppn', 'word'],
  ['pts', 'word'],
]

let loaded = null

// NCPED's tādisaka has the 41 words after it in its homonyms, each with its own `entry`
function unnest(entry) {
  const nested = entry.homonyms?.filter(homonym => homonym.entry) ?? []
  if (!nested.length) return [entry]
  const homonyms = entry.homonyms.filter(homonym => !homonym.entry)
  return [{ ...entry, homonyms }, ...nested]
}

/**
 * The word a dictionary's key has its page as: NFC, without a homonym's number (ie "nāga<sup>1</sup>")
 * or a doubtful entry's "?" (ie "ugghaṭṭha?")
 * @param {string} key
 */
export function pageWord(key) {
  return String(key)
    .normalize('NFC')
    .replace(/<sup>\d+<\/sup>/g, '')
    .replace(/\?$/, '')
    .trim()
}

/**
 * The word whose page a dictionary's link to /define/<linked> is for, or null if there's none. The links
 * aren't always spelt as the words are: capitalised (ie Kumbhīla), with optional letters (ie katavedi(n),
 * aya(s)) or marked as a prefix (ie pari˚)
 * @param {string} linked
 * @param {Map<string, unknown>} words - From `loadDefineWords`
 */
export function linkedWord(linked, words) {
  const word = pageWord(linked)
  return (
    [
      word,
      word.replace(/[()]/g, ''),
      word.replace(/\([^)]*\)/g, ''),
      word.replace(/^[˚°-]+|[˚°-]+$/gu, ''),
    ]
      .map(candidate => candidate.trim().toLowerCase())
      .find(candidate => candidate && words.has(candidate)) ??
    (words.has(word) ? word : null)
  )
}

/** A /define page's path, with spaces as %20 so the href is valid (ie "aggāḷave cetiye") */
export function defineHref(word) {
  return `/define/${word.replaceAll(' ', '%20')}`
}

/**
 * The headword a DPD definition is of, without its homonym number, or null for a compound's split
 * (ie "dhamma 1.01: masc. …" -> "dhamma", "abaddhaṁ + ca" -> null)
 * @param {string} definition
 */
export function dpdHeadword(definition) {
  const colon = definition.indexOf(':')
  if (colon === -1) return null
  const head = definition.slice(0, colon)
  if (head.includes('+')) return null
  return pageWord(head.replace(/ [\d.]+$/, ''))
}

/**
 * Every word with a /define page, each with its entries from each dictionary: NCPED's as they are, the
 * HTML of the complex ones, and DPD's definitions, from its entry for the word itself and from every form
 * whose headword it is. Empty if the dictionaries couldn't be fetched
 * @returns {Promise<Map<string, { ncped: object[], dhammika: string[], dppn: string[], pts: string[], dpd: string[] }>>}
 */
export function loadDefineWords() {
  loaded ??= loadDictionaries().then(dictionaries => {
    const words = new Map()
    const wordOf = key => {
      const word = pageWord(key)
      if (!word) return null
      if (!words.has(word)) {
        words.set(word, { ncped: [], dhammika: [], dppn: [], pts: [], dpd: [] })
      }
      return words.get(word)
    }

    for (const [name, field] of FULL) {
      const data = dictionaries[name]?.data ?? []
      for (const entry of name === 'ncped' ? data.flatMap(unnest) : data) {
        wordOf(entry[field])?.[name].push(name === 'ncped' ? entry : entry.text)
      }
    }

    const dpd = dictionaries.dpd?.data ?? []
    const byHeadword = new Map()
    for (const { entry, definition } of dpd) {
      for (const text of [definition].flat()) {
        const head = dpdHeadword(text)
        if (!head) continue
        if (!byHeadword.has(head)) byHeadword.set(head, new Set())
        byHeadword.get(head).add(text)
      }
    }
    for (const head of byHeadword.keys()) wordOf(head)
    const own = new Map(
      dpd.map(({ entry, definition }) => [pageWord(entry), [definition].flat()])
    )
    for (const [word, entries] of words) {
      entries.dpd = [
        ...new Set([...(own.get(word) ?? []), ...(byHeadword.get(word) ?? [])]),
      ]
    }
    return words
  })
  return loaded
}

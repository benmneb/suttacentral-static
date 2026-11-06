/**
 * Lookup Answers
 *
 * What word lookup shows for a Pāli word, worked out at build time so the browser only fetches the answer: DPD's
 * headwords for the form (its i2h table) and its split (its deconstructor), with DPD's own entry first where the
 * form is a headword, or failing those SSR's stemming and compound splitting, against DPD and then NCPED. Ported from SSR's `src/utils/lookup.ts`, which runs it on a
 * server per tap.
 *
 * Each answer is a list of matches, `{ b: base, d: [definitions], g: grammar, x: [cross-references],
 * m: meaning, p: 1, h: headword }`: `p` where the base has a /define page, and `h` the first headword of its
 * definitions that has one, where that's another word.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { loadDictionaries } from './dictionaries.js'
import { dpdHeadword, loadDefineWords, pageWord } from './defineWords.js'
import { PALI_ENDINGS } from './paliEndings.js'

// A Pāli word in root text: letters, with soft hyphens, syllable breaks and a quote's clitic (ie vā’ti) inside
const WORD = /[\p{L}\p{M}\u00ad\u2027]+(?:[’'”][\p{L}\p{M}\u00ad\u2027]+)*/gu
const TAG_OR_ENTITY = /(<[^>]*>|&#?\w+;)/

// Only these of the dictionaries' markup, as the answer goes in a popover
const KEPT_TAGS = /^<\/?(b|i|br|sup)\b/i

let loaded = null
const answers = new Map()

/** A word as the dictionaries have it: lowercase, no punctuation, soft hyphens or syllable breaks */
export function cleanPaliWord(word) {
  return word
    .replace(/[~`!@#$%^&*(){}[\];:"'<,.>?/\\|\-_+=“”‘’—]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\u00ad\u2027]/g, '')
    .replace(/ṁg/g, 'ṅg')
    .replace(/ṁk/g, 'ṅk')
    .normalize('NFC')
}

/** As DPD's i2h and deconstructor tables spell it, with ṃ */
export const dpdSpelling = word => word.replace(/ṁ/g, 'ṃ')
export const scSpelling = word => word.replace(/ṃ/g, 'ṁ')

function reduceHtml(html) {
  return String(html).replace(/<[^>]*>/g, tag =>
    KEPT_TAGS.test(tag) ? tag.replace(/\s.*?(\/?)>$/, '$1>') : ''
  )
}

/**
 * The dictionaries the lookup reads, as Maps: DPD's and NCPED's entries by word, DPD's definitions by their
 * headword, and DPD's i2h and deconstructor tables. NCPED's are null where it couldn't be fetched, and the lot
 * empty without DPD
 */
function dictionariesOf(dictionaries, words) {
  const dpd = new Map()
  const byHeadword = new Map()
  for (const { entry, definition } of dictionaries.dpd?.data ?? []) {
    const d = [definition].flat().map(reduceHtml)
    dpd.set(pageWord(entry), { d })
    for (const text of d) {
      const head = dpdHeadword(text)
      if (!head) continue
      if (!byHeadword.has(head)) byHeadword.set(head, new Set())
      byHeadword.get(head).add(text)
    }
  }
  // DPD's entries are by form, so a headword that's no form of itself, ie hiriottappa, has none of its own
  const headwords = new Map(
    [...byHeadword].map(([head, texts]) => [head, { d: [...texts] }])
  )
  const ncped = new Map()
  for (const [word, entries] of words) {
    if (!entries.ncped.length) continue
    const parts = entries.ncped.flatMap(entry => entry.homonyms ?? [entry])
    ncped.set(word, {
      d: parts
        .flatMap(({ definition }) => [definition ?? []].flat())
        .map(reduceHtml),
      g:
        parts
          .map(({ grammar }) => grammar)
          .filter(Boolean)
          .join('; ') || undefined,
      x: parts.flatMap(({ xr }) => [xr ?? []].flat()),
    })
  }
  return {
    dpd,
    ncped,
    headwords,
    i2h: dictionaries.dpd_i2h?.data ?? {},
    deconstructor: dictionaries.dpd_deconstructor?.data ?? {},
  }
}

function exactMatch(word, dict) {
  const entry = dict.get(word)
  return entry ? { base: word, entry } : null
}

function fuzzyMatch(word, dict) {
  for (const [ending, keep, minLength, replacement] of PALI_ENDINGS) {
    if (word.length > minLength && word.endsWith(ending)) {
      const stem =
        word.slice(0, word.length - ending.length + keep) + replacement
      const entry = dict.get(stem)
      if (entry) return { base: stem, entry }
    }
  }
  return null
}

const swapVy = word =>
  word.includes('vy')
    ? word.replace(/vy/g, 'by')
    : word.includes('by')
      ? word.replace(/by/g, 'vy')
      : null

function matchComplete(word, dict, isTi) {
  // Pāli's spellings that vary: a final -pi, vy for by, and a vowel shortened before a quote's ti
  for (let pi = 0; pi < 2; pi++)
    for (let vy = 0; vy < 2; vy++)
      for (let ti = 0; ti < 2; ti++) {
        let w = word
        if (ti && isTi) {
          w = w
            .replace(/ī$/, 'i')
            .replace(/ā$/, 'i')
            .replace(/ū$/, 'i')
            .replace(/n$/, '')
            .replace(/n$/, 'ṁ')
        }
        if (pi) {
          if (!w.endsWith('pi')) continue
          w = w.replace(/pi$/, '')
        }
        if (vy) {
          w = swapVy(w)
          if (!w) continue
        }
        const match = exactMatch(w, dict) ?? fuzzyMatch(w, dict)
        if (match) return pi ? [match, { base: 'pi', meaning: 'too' }] : [match]
      }
  return null
}

function matchPartial(word, dict, minLength = 4) {
  for (const w of [word, swapVy(word)]) {
    if (!w) continue
    // The longest start of it that's a word
    for (let i = 0; i < w.length; i++) {
      const part = w.slice(0, w.length - i)
      if (part.length < minLength) break
      const entry = dict.get(part)
      if (entry) return { base: part, entry, leftover: w.slice(w.length - i) }
    }
  }
  return null
}

function lookupDpd(word, { dpd, i2h, deconstructor }) {
  const matches = []
  const headwords = []
  const spelt = dpdSpelling(word)
  for (const headword of i2h[spelt] ?? []) {
    const root = headword.split(' ')[0]
    if (!headwords.includes(root)) headwords.push(root)
  }
  const split = deconstructor[spelt]
  if (split !== undefined) {
    const first = split.split('+')[0].trim()
    if (!headwords.includes(first)) headwords.push(first)
    matches.push({ base: word, meaning: scSpelling(split) })
  }
  for (const headword of headwords) {
    const base = scSpelling(headword)
    const entry = dpd.get(base)
    if (entry) matches.push({ base, entry })
  }
  return matches
}

/** Stemming and compound splitting with sandhi, for a word DPD's tables don't have */
function lookupCompound(word, dict) {
  let matches = []
  const isTi = /['‘’]ti$/.test(word)
  const w = word.replace(/['‘’]ti$/, '').replace(/['"‘’“”]/g, '')

  // Without a negating a- or an-, which doubles the consonant after it
  const unword = /^an|^a(.)\1/.test(w)
    ? w.slice(2)
    : /^a/.test(w)
      ? w.slice(1)
      : null
  let result = matchComplete(w, dict, isTi)
  if (!result && unword) {
    result = matchComplete(unword, dict, isTi)
    if (result) matches.push({ base: 'an', meaning: 'non/not' })
  }
  if (result) matches = matches.concat(result)

  if (!matches.length) {
    let partial = matchPartial(w, dict)
    if (unword) {
      const unPartial = matchPartial(unword, dict)
      if (
        unPartial &&
        (!partial || unPartial.base.length > partial.base.length)
      ) {
        partial = unPartial
        matches.push({ base: 'an', meaning: 'non/not' })
      }
    }

    while (partial) {
      matches.push(partial)
      if (!partial.leftover) break
      const sandhi = partial.base.at(-1)
      const firstLetter = partial.leftover[0]
      const rest = partial.leftover.slice(1)
      // The vowel the join may have lost, and sandhi doesn't lengthen a short one
      const vowels = 'aiu'.includes(sandhi)
        ? ['a', 'i', 'u']
        : ['a', 'ā', 'i', 'ī', 'u', 'ū', 'o', 'e']
      const starts = [
        firstLetter,
        '',
        sandhi + firstLetter,
        ...vowels.map(v => v + firstLetter),
      ]
      let next = null
      let complete = null
      for (const start of starts) {
        complete = matchComplete(start + rest, dict, isTi)
        if (complete) break
        next = matchPartial(start + rest, dict)
        if (next) break
      }
      if (complete) {
        matches = matches.concat(complete)
        break
      }
      if (!next) {
        const remainder = firstLetter + rest
        if (remainder !== 'ṁ') matches.push({ base: remainder, meaning: '?' })
        break
      }
      partial = next
    }
  }

  if (isTi && matches.length) matches.push({ base: 'iti', meaning: 'endquote' })
  return matches
}

function serialise({ base, entry, meaning }, words) {
  const match = { b: base }
  if (entry) {
    match.d = entry.d
    if (entry.g) match.g = entry.g
    if (entry.x?.length) match.x = entry.x
  } else {
    match.m = meaning ?? '?'
  }
  if (words.has(base)) match.p = 1
  // The headword of its definitions, ie suta for sutā's, or samaya for DPD's own entry for samayaṁ
  const headword = match.d
    ?.map(dpdHeadword)
    .find(word => word && words.has(word))
  if (headword && headword !== base) match.h = headword
  return match
}

/**
 * Loads what the lookup needs, once per build. Empty, so nothing gets answered, if DPD couldn't be fetched
 * @returns {Promise<{ available: boolean, answerOf: (form: string) => object[], addWords: (html: string) => void, answers: () => Map<string, object[]> }>}
 */
export function loadLookup() {
  loaded ??= Promise.all([loadDictionaries(), loadDefineWords()]).then(
    ([dictionaries, words]) => {
      const dicts = dictionariesOf(dictionaries, words)

      function answerOf(form) {
        if (answers.has(form)) return answers.get(form)
        let matches = []
        if (dicts.dpd.size) {
          matches = lookupDpd(form, dicts)
          const own = dicts.headwords.get(form)
          if (own && !matches.some(match => match.entry && match.base === form))
            matches.unshift({ base: form, entry: own })
          if (!matches.length) matches = lookupCompound(form, dicts.dpd)
          if (!matches.length) matches = lookupCompound(form, dicts.ncped)
        }
        const answer = matches.map(match => serialise(match, words))
        answers.set(form, answer)
        return answer
      }

      function addWords(html) {
        if (!dicts.dpd.size || !words.size) return
        String(html)
          .split(TAG_OR_ENTITY)
          .forEach((part, i) => {
            if (i % 2) return
            for (const [word] of part.matchAll(WORD)) {
              const form = cleanPaliWord(word)
              if (form) answerOf(form)
            }
          })
      }

      return {
        // Whether root texts get answers, which needs DPD and the /define pages' words
        available: dicts.dpd.size > 0 && words.size > 0,
        answerOf,
        addWords,
        // Every form addWords was given, by its answer
        answers: () => answers,
      }
    }
  )
  return loaded
}

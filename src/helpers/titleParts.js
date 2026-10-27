/**
 * Title Parts
 *
 * The words inside a Pāli root title, for search to find a compound title by any of them, ie
 * "Mahāsatipaṭṭhānasutta" by "satipatthana" or "satipatthana sutta", as Pagefind only matches the start
 * of a word. DPD's own split of the title comes first, from the end of its entry, then each part loses
 * the prefixes and suffixes titles share.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { loadDictionaries } from './dictionaries.js'
import { cleanPaliWord, dpdSpelling, scSpelling } from './lookupAnswers.js'

// Longest first, so ie -theragāthā comes off before -gāthā
const SUFFIXES = [
  'sutta',
  'suttaṁ',
  'suttādi',
  'suttanta',
  'vagga',
  'jātaka',
  'apadāna',
  'theraapadāna',
  'therīapadāna',
  'gāthā',
  'theragāthā',
  'therīgāthā',
  'kathā',
  'pañha',
  'vatthu',
  'petavatthu',
  'petivatthu',
  'vimānavatthu',
  'buddhavaṁsa',
  'cariya',
  'niddesa',
  'vibhaṅga',
  'khandhaka',
  'pucchā',
  'saṁyutta',
  'nipāta',
  'paṇṇāsa',
].sort((a, b) => b.length - a.length)

const PREFIXES = [
  'mahā',
  'cūḷa',
  'paṭhama',
  'dutiya',
  'tatiya',
  'catuttha',
  'pañcama',
  'chaṭṭha',
  'sattama',
  'aṭṭhama',
  'navama',
  'dasama',
]

// The fewest letters an affix can leave, so a title that's only one, ie Vagga, stays whole
const MIN_LEFT = 3

/** A word without the suffix and prefixes titles share, ie mahāsatipaṭṭhānasutta as mahā, satipaṭṭhāna, sutta */
export function affixParts(word) {
  let rest = word
  const head = []
  const tail = []
  const leaves = affix => [...rest].length - [...affix].length >= MIN_LEFT
  const suffix = SUFFIXES.find(s => rest.endsWith(s) && leaves(s))
  if (suffix) {
    tail.push(suffix)
    rest = rest.slice(0, -suffix.length)
    // ie Subhūtit-theragāthā, where the t doubles the th
    if (suffix.startsWith('th') && rest.endsWith('t')) rest = rest.slice(0, -1)
  }
  let prefix
  while ((prefix = PREFIXES.find(p => rest.startsWith(p) && leaves(p)))) {
    head.push(prefix)
    rest = rest.slice(prefix.length)
  }
  return [...head, rest, ...tail]
}

const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Whether parts make up a word in order, as a compound's do, though sandhi can change each one's last
 * letter (ie alagadda + upamā in alagaddūpama), unlike a derivation's (ie dvi + tiya for dutiya)
 */
function makesUp(word, parts) {
  const whole = fold(word)
  let at = 0
  for (const part of parts.map(fold)) {
    const stem = part.length >= 3 ? part.slice(0, -1) : part
    const found = whole.indexOf(stem, at)
    if (found === -1) return false
    at = found + stem.length
  }
  return true
}

/** DPD's split of a word, ie [alagadda, upamā, sutta], from its entry or its headword's, or null */
function dpdParts(word, dpd, i2h) {
  const headwords = (i2h[dpdSpelling(word)] ?? []).map(headword =>
    scSpelling(headword.split(' ')[0])
  )
  for (const headword of [word, ...headwords]) {
    for (const definition of dpd.get(headword) ?? []) {
      const split = definition.match(/\[([^\]]*\+[^\]]*)\]\s*$/)?.[1]
      const parts = split?.split('+').map(part => scSpelling(part.trim()))
      // Not one with a root or suffix in it, ie "√pad + *a + ukā", as it's etymology, not words
      if (!parts?.every(part => /^\p{L}+$/u.test(part))) continue
      if (!makesUp(word, parts)) continue
      // Without a lone ending, ie the ā of "soma + ā"
      const words = parts.filter(part => [...part].length > 1)
      if (words.length > 1) return words
    }
  }
  return null
}

let loaded = null

/**
 * Loads the splitter, once per build, as `titleParts(title)`: the title's parts, lowercase and spaced, of
 * only the words that split, or '' for a title with none. Affixes alone if DPD couldn't be fetched
 * @returns {Promise<(title: string) => string>}
 */
export function loadTitleParts() {
  loaded ??= loadDictionaries().then(dictionaries => {
    const dpd = new Map()
    for (const { entry, definition } of dictionaries.dpd?.data ?? []) {
      dpd.set(entry, [definition].flat())
    }
    const i2h = dictionaries.dpd_i2h?.data ?? {}
    const known = new Map()

    return function titleParts(title) {
      title = String(title ?? '')
      if (known.has(title)) return known.get(title)
      const parts = new Set()
      const words = title
        .toLowerCase()
        .normalize('NFC')
        .split(/[^\p{L}\p{M}]+/u)
      for (const word of words.filter(Boolean)) {
        const dpdSplit = dpdParts(cleanPaliWord(word), dpd, i2h)
        const split = (dpdSplit ?? [word]).flatMap(affixParts)
        if (split.length > 1) for (const part of split) parts.add(part)
      }
      const joined = [...parts].join(' ')
      known.set(title, joined)
      return joined
    }
  })
  return loaded
}

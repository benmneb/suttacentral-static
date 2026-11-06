/**
 * Dictionary
 *
 * Reads word lookup's answers from the shards in /dictionaries/, which the build writes (`lookupShards.js`):
 * fetches a dictionary's index once, then each shard the first time a word in it is asked for. Relative to the
 * site's root, so it works offline in the apps and archives too.
 *
 * @example
 * await scxDictionary.lookup('pli-en', 'Bhikkhave’ti') // [{ b: 'bhikkhave', d: [...], p: 1 }, ...]
 * await scxDictionary.lookupLzh('如是我聞', 1) // [{ term: '如是', start: 0, p: 'rú shì', d: 'thus' }, ...]
 * await scxDictionary.definePage('samma') // 'sammā'
 * await scxDictionary.definitionCount('sammā') // 8
 */
;(function () {
  'use strict'

  // The longest Chinese term looked for, and how far before the tapped character one can start
  const MAX_LZH_TERM = 8
  const LZH_BEFORE = 3

  // From SuttaCentral's `sc-lookup-lzh2en.js`, by way of SSR: variants the dictionary has under another form
  const HANZI_VARIANTS = { 説: '說', 縁: '緣', 録: '錄', 衞: '衛' }

  const indexes = new Map()
  const shards = new Map()
  const wordLists = new Map()

  /** A word as the dictionaries have it, as `cleanPaliWord` in `lookupAnswers.js` */
  function cleanWord(word) {
    return word
      .replace(/[~`!@#$%^&*(){}[\];:"'<,.>?/\\|\-_+=“”‘’—]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[\u00ad\u2027]/g, '')
      .replace(/ṁg/g, 'ṅg')
      .replace(/ṁk/g, 'ṅk')
      .normalize('NFC')
  }

  /** A word without its diacritics, so "samma" finds sammā */
  const asciify = word =>
    word
      .normalize('NFD')
      .replace(/\p{Diacritic}|\u00ad/gu, '')
      .normalize('NFC')

  // Fetched once, or again after one that failed
  function fetchOnce(cache, url) {
    if (!cache.has(url)) {
      cache.set(
        url,
        fetch(url)
          .then(response => {
            if (!response.ok) throw new Error(response.statusText)
            return response.json()
          })
          .catch(() => {
            cache.delete(url)
            return null
          })
      )
    }
    return cache.get(url)
  }

  /** Which shard of a dictionary a key is in, or null if none could have it */
  function shardFor(key, index) {
    if (!key || !index) return null
    if (index.by === 'codePoint') return key.codePointAt(0) % index.shards
    // A key is in the shard of the longest prefix it starts with
    for (let i = key.length; i > 0; i--) {
      const shard = index.prefixes[key.slice(0, i)]
      if (shard !== undefined) return shard
    }
    return null
  }

  // A key's shard, an empty one where no shard could have it, or null if it couldn't be fetched
  async function shardOf(dict, key) {
    const index = await fetchOnce(indexes, `/dictionaries/${dict}/index.json`)
    if (!index) return null
    const shard = shardFor(key, index)
    return shard === null
      ? {}
      : fetchOnce(shards, `/dictionaries/${dict}/${shard}.json`)
  }

  /** A Pāli word's answer, `[]` if there's none, or null if its shard couldn't be fetched */
  async function lookup(dict, word) {
    const key = cleanWord(word)
    const shard = await shardOf(dict, key)
    return shard && (shard[key] ?? [])
  }

  /**
   * The Chinese terms in `text` that take in the character at `at` (counting characters, not UTF-16 units),
   * longest first, as `{ term, start, p, d }`, or null if a shard couldn't be fetched
   */
  async function lookupLzh(text, at) {
    const chars = [...text].map(char => HANZI_VARIANTS[char] ?? char)
    const starts = []
    for (let i = Math.max(0, at - LZH_BEFORE); i <= at; i++) starts.push(i)
    const found = await Promise.all(
      starts.map(async start => {
        const shard = await shardOf('lzh-en', chars[start])
        if (!shard) return null
        const terms = []
        const longest = Math.min(chars.length, start + MAX_LZH_TERM)
        for (let end = Math.max(at + 1, start + 1); end <= longest; end++) {
          const term = chars.slice(start, end).join('')
          if (shard[term]) terms.push({ term, start, ...shard[term] })
        }
        return terms
      })
    )
    if (found.includes(null)) return null
    return found.flat().sort((a, b) => b.term.length - a.term.length)
  }

  /** The words with /define pages that start with a word's letter, each with its count of definitions */
  function wordListOf(ascii) {
    // As `defineData.js` splits the list of words, by first letter
    const letter = /[a-z]/.test(ascii[0]) ? ascii[0] : '_'
    return fetchOnce(wordLists, `/dictionaries/define-words/${letter}.json`)
  }

  /** The word whose /define page a word has, with or without its diacritics, or null if there's none */
  async function definePage(word) {
    const key = cleanWord(word)
    const ascii = asciify(key)
    const list = await wordListOf(ascii)
    if (!list) return null
    const words = Object.keys(list)
    return (
      words.find(w => w === key) ??
      words.find(w => asciify(w) === ascii) ??
      null
    )
  }

  /** How many definitions a /define page has in all its dictionaries, or null if that's unknown */
  async function definitionCount(page) {
    const list = await wordListOf(asciify(page))
    return list && Object.hasOwn(list, page) ? list[page] : null
  }

  window.scxDictionary = {
    cleanWord,
    definePage,
    definitionCount,
    lookup,
    lookupLzh,
  }
})()

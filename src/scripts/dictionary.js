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

  window.scxDictionary = { cleanWord, lookup, lookupLzh }
})()

/**
 * Define
 *
 * Finds words with a /define page as they're typed into the form on /define and each word's page: those
 * starting with what's typed, with or without its diacritics, then those spelt like it. Enter goes to the
 * first, and up/down keys move through them. The words are in a list per first letter, fetched when one is
 * first typed. Without it, the form searches the site on DuckDuckGo.
 */
;(function () {
  'use strict'

  const form = document.querySelector('form.define-form')
  const input = document.getElementById('define-query')
  const count = document.getElementById('define-count')
  const results = document.getElementById('define-results')
  if (!form || !input) return

  const MAX_RESULTS = 50
  const lists = new Map()
  let latest = 0

  /** A word as it's matched: lowercase, NFC, with SuttaCentral's ṁ for ṃ */
  const clean = word =>
    word.trim().toLowerCase().normalize('NFC').replaceAll('ṃ', 'ṁ')

  /** A word without its diacritics, so "samma" finds sammā */
  const asciify = word =>
    word
      .normalize('NFD')
      .replace(/\p{Diacritic}|­/gu, '')
      .normalize('NFC')

  /** Which list a word is in, by its first letter, as `defineData.js` splits them */
  const listKey = ascii => (/[a-z]/.test(ascii[0]) ? ascii[0] : '_')

  /** The words starting with `key`'s letter, fetched once, or again after a failed fetch */
  function wordsFor(key) {
    if (!lists.has(key)) {
      const words = fetch(`/dictionaries/define-words/${key}.json`)
        .then(response => (response.ok ? response.json() : {}))
        .then(list =>
          Object.keys(list).map(word => ({ word, ascii: asciify(word) }))
        )
        .catch(() => {
          lists.delete(key)
          return []
        })
      lists.set(key, words)
    }
    return lists.get(key)
  }

  /** The edit distance from `a` to `b`, or `max + 1` once it's sure to be more than `max` */
  function levenshtein(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
    for (let i = 1; i <= a.length; i++) {
      const row = [i]
      for (let j = 1; j <= b.length; j++) {
        row.push(
          Math.min(
            row[j - 1] + 1,
            previous[j] + 1,
            previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
          )
        )
      }
      if (Math.min(...row) > max) return max + 1
      previous = row
    }
    return previous[b.length]
  }

  /** Every word that matches: the word itself, then those starting with it, then those spelt like it */
  function find(words, query) {
    const ascii = asciify(query)
    const found = new Set()
    for (const item of words) {
      if (item.word === query) found.add(item.word)
    }
    for (const item of words) {
      if (item.ascii === ascii) found.add(item.word)
    }
    for (const { word } of words) {
      if (word.startsWith(query)) found.add(word)
    }
    for (const item of words) {
      if (item.ascii.startsWith(ascii)) found.add(item.word)
    }
    const max = Math.max(1, Math.floor(ascii.length / 4))
    words
      .map(item => ({ ...item, distance: levenshtein(ascii, item.ascii, max) }))
      .filter(item => item.distance <= max)
      .sort((a, b) => a.distance - b.distance)
      .forEach(item => found.add(item.word))
    return [...found]
  }

  function render(found) {
    const total = document.createElement('strong')
    total.textContent = found.length.toLocaleString('en')
    const noun = found.length === 1 ? ' result' : ' results'
    if (!found.length) {
      count.replaceChildren('No results')
    } else if (found.length > MAX_RESULTS) {
      count.replaceChildren(`Showing ${MAX_RESULTS} of `, total, noun)
    } else {
      count.replaceChildren('Showing ', total, noun)
    }
    results.replaceChildren(
      ...found.slice(0, MAX_RESULTS).map(word => {
        const item = document.createElement('li')
        const link = document.createElement('a')
        link.href = `/define/${word.replaceAll(' ', '%20')}`
        link.lang = 'pi'
        link.translate = false
        link.textContent = word
        item.append(link)
        return item
      })
    )
    count.hidden = false
    results.hidden = !found.length
  }

  async function show() {
    const search = ++latest
    const query = clean(input.value)
    if (!query) {
      count.hidden = true
      results.hidden = true
      return
    }
    const words = await wordsFor(listKey(asciify(query)))
    if (search === latest) render(find(words, query))
  }

  const links = () => [...results.querySelectorAll('a')]

  /** Whether a modifier is held, so ⌥↑ and the like keep their usual meaning */
  const modified = event =>
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey

  input.addEventListener('input', show)
  input.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown' || modified(event) || results.hidden) return
    const first = links()[0]
    if (first) {
      event.preventDefault()
      first.focus()
    }
  })
  results.addEventListener('keydown', event => {
    if (modified(event)) return
    const all = links()
    const index = all.indexOf(document.activeElement)
    if (index < 0) return
    const target =
      event.key === 'ArrowDown'
        ? all[index + 1]
        : event.key === 'ArrowUp'
          ? (all[index - 1] ?? input)
          : event.key === 'Escape'
            ? input
            : null
    if (target) {
      event.preventDefault()
      target.focus()
    }
  })
  form.addEventListener('submit', async event => {
    event.preventDefault()
    await show()
    const first = results.querySelector('a')
    if (first) location.href = first.href
  })
  if (input.value) show()
})()

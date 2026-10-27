/**
 * Simplified Characters
 *
 * Shows the Chinese texts in simplified characters while "Simplified" is on, from the map of the texts'
 * traditional characters and phrases `searchExtras.js` writes. Each becomes one of the same length, so word lookup
 * can read the traditional text at the same place. `viewSettings.js` loads it once the setting is turned on.
 */
;(function () {
  'use strict'

  const toggle = document.getElementById('simplifier')
  const main = document.querySelector('main')
  if (!toggle || !main) return

  const CHINESE = /^lzh(-|$)/i
  // Each swapped text node's text, and each relabelled element's lang, to put back
  const texts = new Map()
  const langs = new Map()
  let hans = null

  function chineseTexts() {
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: node =>
        CHINESE.test(node.parentElement?.closest('[lang]')?.lang ?? '')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    })
    const nodes = []
    while (walk.nextNode()) nodes.push(walk.currentNode)
    return nodes
  }

  function prepare({ chars, phrases }) {
    const keys = Object.keys(phrases)
    return {
      chars,
      phrases,
      lengths: [...new Set(keys.map(key => key.length))].sort((a, b) => b - a),
      starts: new Set(
        keys.map(key => String.fromCodePoint(key.codePointAt(0)))
      ),
    }
  }

  // The longest phrase at each place first, then the character, as OpenCC does
  function simplified(text, { chars, phrases, lengths, starts }) {
    let out = ''
    for (let i = 0; i < text.length; ) {
      const char = String.fromCodePoint(text.codePointAt(i))
      const phrase =
        starts.has(char) &&
        lengths
          .map(length => text.slice(i, i + length))
          .find(part => Object.hasOwn(phrases, part))
      if (phrase) {
        out += phrases[phrase]
        i += phrase.length
      } else {
        out += Object.hasOwn(chars, char) ? chars[char] : char
        i += char.length
      }
    }
    return out
  }

  function simplify(map) {
    for (const node of chineseTexts()) {
      const swapped = simplified(node.data, map)
      if (swapped === node.data) continue
      texts.set(node, node.data)
      node.data = swapped
      const el = node.parentElement.closest('[lang]')
      if (!langs.has(el)) {
        langs.set(el, el.lang)
        // So fonts draw the simplified forms of the characters both share
        el.lang = `${el.lang.split('-')[0]}-Hans`
      }
    }
  }

  function restore() {
    for (const [node, text] of texts) node.data = text
    for (const [el, lang] of langs) el.lang = lang
    texts.clear()
    langs.clear()
  }

  async function apply() {
    if (!toggle.checked) return restore()
    hans ??= fetch('/hans.json')
      .then(response => (response.ok ? response.json() : null))
      .then(data => data && prepare(data))
      .catch(() => null)
    const map = await hans
    // Offline, and never fetched, so it can try again
    if (!map) hans = null
    if (map && toggle.checked && !texts.size) simplify(map)
  }

  window.scxSimplify = {
    /** A text node's text as the page has it, traditional where it's been simplified */
    original: node => texts.get(node) ?? node.data,
  }

  toggle.addEventListener('change', apply)
  apply()
})()

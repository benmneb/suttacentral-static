/**
 * Word Lookup
 *
 * Shows what a word of the root text means in a sheet along the bottom, while "Word lookup" is on: a Pāli word's
 * answer from DPD, or the Chinese terms that take in the character. ← and → or the sheet's arrows go to the words
 * either side, and Esc or a tap elsewhere closes it. Its help button gives the source and keys. The answers are
 * in shards `dictionary.js` fetches, so it works offline. `viewSettings.js` loads both once the setting is turned on.
 *
 * Each Pāli word gets a span as its segment is first pointed at or reached, for its highlight, and a Chinese
 * character is found where it was tapped. From the keyboard each segment's root text is a tab stop while it's on,
 * and Enter looks up its first word and takes focus to the sheet, with its links and buttons, until it closes.
 */
;(function () {
  'use strict'

  const toggle = document.getElementById('definer')
  const popover = document.getElementById('definition')
  const main = document.querySelector('main')
  const dictionary = window.scxDictionary
  if (!toggle || !popover || !main || !dictionary) return

  const dict = toggle.dataset.dict
  const isLzh = dict === 'lzh-en'
  const lang = isLzh ? 'lzh' : 'pi'
  // The root text: a root page's own, or a translation's beside it
  const TEXT = `.segment > :is(.translation, .root):lang(${lang}) > .text`
  const WORD = isLzh
    ? /\p{Script=Han}/gu
    : /[\p{L}\p{M}\u00ad\u2027]+(?:[’'”][\p{L}\p{M}\u00ad\u2027]+)*/gu
  // The sheet's height, so a word under it gets scrolled up
  const SHEET = 0.3
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const canHighlight =
    typeof CSS !== 'undefined' &&
    !!CSS.highlights &&
    typeof Highlight === 'function'

  // The word shown: a Pāli word's span, or a Range of Chinese
  let current = null
  let latest = 0

  const texts = main.querySelectorAll(TEXT)
  const wrapped = new WeakSet()
  popover.tabIndex = -1

  // Tab stops only while it's on
  function setTabbable() {
    for (const text of texts) {
      if (toggle.checked) {
        text.tabIndex = 0
        text.setAttribute('aria-describedby', 'definition-hint')
      } else {
        text.removeAttribute('tabindex')
        text.removeAttribute('aria-describedby')
      }
    }
  }
  setTabbable()

  toggle.addEventListener('change', () => {
    setTabbable()
    if (!toggle.checked) popover.hidePopover()
  })

  function caretAt(x, y) {
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y)
      return position && { node: position.offsetNode, offset: position.offset }
    }
    const range = document.caretRangeFromPoint?.(x, y)
    return range && { node: range.startContainer, offset: range.startOffset }
  }

  function rangeOf(node, start, end) {
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, end)
    return range
  }

  // The Chinese character tapped
  function charAt(event) {
    const caret = caretAt(event.clientX, event.clientY)
    if (caret?.node?.nodeType !== Node.TEXT_NODE) return null
    if (!caret.node.parentElement?.closest(TEXT)) return null
    // The caret can be either side of it
    const { data } = caret.node
    for (const offset of [caret.offset, caret.offset - 1]) {
      if (offset >= 0 && /\p{Script=Han}/u.test(data[offset] ?? '')) {
        return rangeOf(caret.node, offset, offset + 1)
      }
    }
    return null
  }

  // The text nodes of the root text, in order
  function walker() {
    return document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: node =>
        node.parentElement?.closest(TEXT)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    })
  }

  // A segment's Pāli words, each in a span, as Safari leaves a replaced highlight's range painted. One segment at
  // a time, as Safari is slow to take thousands of new elements at once
  function wordsOf(text) {
    if (!wrapped.has(text)) {
      wrapped.add(text)
      const nodes = []
      const walk = document.createTreeWalker(text, NodeFilter.SHOW_TEXT)
      while (walk.nextNode()) nodes.push(walk.currentNode)
      for (const node of nodes) wrap(node)
    }
    return text.querySelectorAll('.word')
  }

  function wrap(node) {
    const fragment = document.createDocumentFragment()
    let at = 0
    for (const match of node.data.matchAll(WORD)) {
      if (match.index > at) fragment.append(node.data.slice(at, match.index))
      const span = document.createElement('span')
      span.className = 'word'
      span.textContent = match[0]
      fragment.append(span)
      at = match.index + match[0].length
    }
    if (!at) return
    if (at < node.data.length) fragment.append(node.data.slice(at))
    node.replaceWith(fragment)
  }

  /** The word before or after the one shown, or null at either end */
  function step(direction) {
    if (!current) return null
    if (!isLzh) return stepWord(direction)
    const walk = walker()
    let node = current.startContainer
    walk.currentNode = node
    while (node) {
      const matches = [...node.data.matchAll(WORD)]
      const candidates =
        node === current.startContainer
          ? matches.filter(match =>
              direction > 0
                ? match.index >= current.endOffset
                : match.index + match[0].length <= current.startOffset
            )
          : matches
      const match = direction > 0 ? candidates[0] : candidates.at(-1)
      if (match) {
        return rangeOf(node, match.index, match.index + match[0].length)
      }
      node = direction > 0 ? walk.nextNode() : walk.previousNode()
    }
    return null
  }

  // The Pāli word either side, in the next segment with any at the end of this one
  function stepWord(direction) {
    const text = current.closest(TEXT)
    const own = [...wordsOf(text)]
    const near = own[own.indexOf(current) + direction]
    if (near) return near
    let i = Array.prototype.indexOf.call(texts, text) + direction
    for (; texts[i]; i += direction) {
      const words = wordsOf(texts[i])
      if (words.length) return words[direction > 0 ? 0 : words.length - 1]
    }
    return null
  }

  // Changed in place, as Safari doesn't repaint what a replaced one covered
  const rangeHighlight = canHighlight ? new Highlight() : null
  if (rangeHighlight) CSS.highlights.set('lookup', rangeHighlight)

  function highlight(word) {
    clearHighlight()
    if (word instanceof Element) word.classList.add('looked-up')
    else rangeHighlight?.add(word)
  }

  function clearHighlight() {
    if (current instanceof Element) current.classList.remove('looked-up')
    rangeHighlight?.clear()
  }

  // The element a word is in
  const elementOf = word =>
    word instanceof Element ? word : word.startContainer.parentElement

  function icon(name) {
    return `<i class="icon i-${name}"></i>`
  }

  const escape = text =>
    text.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`)

  function definePath(word) {
    return `/define/${encodeURI(word)}`
  }

  function defineLink(page) {
    return `<a href="${definePath(page)}" aria-label="Full definitions of ${escape(page)}">${icon('bookOpen')}</a>`
  }

  // The page a match's definitions are on: its own, or its headword's
  const pageOf = match => (match.p ? match.b : match.h)

  function helpHtml() {
    const unit = isLzh ? 'character' : 'word'
    const source = isLzh
      ? '<a href="http://www.buddhism-dict.net/ddb/">Digital Dictionary of Buddhism</a>'
      : '<a href="https://digitalpalidictionary.github.io/">Digital Pāḷi Dictionary</a>'
    return (
      `<p>Source: ${source}</p>` +
      (isLzh
        ? '<p>Terms are matched by machine, so results are not always accurate.</p>'
        : '<p>Pāli words are analysed by machine, so results are not always accurate.</p>' +
          `<p>The book icon ${icon('bookOpen')} goes to a word’s full dictionary entry.</p>`) +
      '<h2 id="definition-keys">Keyboard</h2>' +
      '<dl aria-labelledby="definition-keys">' +
      `<dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Previous or next ${unit}</dd>` +
      '<dt><kbd>Tab</kbd></dt><dd>Through the text, segment by segment</dd>' +
      `<dt><kbd>Enter</kbd></dt><dd>Looks up a segment’s first ${unit}</dd>` +
      '<dt><kbd>Esc</kbd></dt><dd>Closes this</dd>' +
      '<dt><kbd>D</kbd></dt><dd>Turns word lookup on or off</dd>' +
      '</dl>'
    )
  }

  // Opens the sheet on the word at once, its answer following once the shard is in. The nav stays, so a button
  // keeps its focus from word to word
  function open(word) {
    if (!popover.querySelector('nav')) {
      popover.innerHTML =
        `<section></section>` +
        `<section id="definition-help" aria-label="Word lookup help" hidden>${helpHtml()}</section>` +
        `<nav aria-label="Word lookup">` +
        `<button type="button" data-step="-1" aria-label="Previous word" aria-keyshortcuts="ArrowLeft">${icon('arrowLeft')}</button>` +
        `<button type="button" data-help aria-label="Help" aria-expanded="false" aria-controls="definition-help">${icon('questionMarkCircle')}</button>` +
        (isLzh ? '' : `<a>${icon('bookOpen')}</a>`) +
        `<button type="button" data-close aria-label="Close" aria-keyshortcuts="Escape">${icon('xMark')}</button>` +
        `<button type="button" data-step="1" aria-label="Next word" aria-keyshortcuts="ArrowRight">${icon('arrowRight')}</button>` +
        `</nav>`
    }
    setHelp(false)
    const section = popover.querySelector('section')
    section.setAttribute('aria-busy', 'true')
    section.innerHTML = `<dfn lang="${lang}" translate="no">${escape(word)}</dfn>`
    if (!popover.matches(':popover-open')) popover.showPopover()
  }

  // The help in place of the answer, or the answer back
  function setHelp(shown) {
    popover.querySelector('[data-help]').setAttribute('aria-expanded', shown)
    popover.querySelector('section').hidden = shown
    popover.querySelector('#definition-help').hidden = !shown
  }

  // The nav's link to the word's /define page, or a placeholder where it has none, so the buttons stay put
  function setDefine(page) {
    const link = popover.querySelector('nav > a')
    if (!link) return
    if (page) {
      link.href = definePath(page)
      link.setAttribute('aria-label', `Full definitions of ${page}`)
    } else {
      if (link === document.activeElement) popover.focus()
      link.removeAttribute('href')
      link.removeAttribute('aria-label')
    }
  }

  function paliHtml(word, answer) {
    const cleaned = dictionary.cleanWord(word)
    const matches = answer.length ? answer : [{ b: cleaned, m: '?' }]
    // The word already heads the sheet, so one match of it alone needs no heading of its own
    const headed = !(matches.length === 1 && matches[0].b === cleaned)
    return matches
      .map(match => {
        const page = pageOf(match)
        const dt = headed
          ? `<dt><dfn lang="pi" translate="no">${escape(match.b)}</dfn>${page ? ` ${defineLink(page)}` : ''}</dt>`
          : ''
        let dd = match.g
          ? `<span class="grammar">${escape(match.g)}</span>`
          : ''
        dd += match.d
          ? `<ol class="definition">${match.d.map(d => `<li>${d}</li>`).join('')}</ol>`
          : escape(match.m ?? '?')
        if (match.x)
          dd += `<ul class="xr">${match.x.map(x => `<li>See: <span lang="pi" translate="no">${escape(x)}</span></li>`).join('')}</ul>`
        return `<dl>${dt}<dd>${dd}</dd></dl>`
      })
      .join('')
  }

  function lzhHtml(terms) {
    if (!terms.length) return '<ol><li>?</li></ol>'
    return `<ol>${terms
      .map(
        ({ term, p, d }) =>
          `<li><b lang="lzh">${escape(term)}</b>${p ? ` (${escape(p)})` : ''} ${escape(d)}</li>`
      )
      .join('')}</ol>`
  }

  // Scrolls the word up out from under the sheet
  function keepInSight(word) {
    const rect = word.getBoundingClientRect()
    if (rect.bottom <= innerHeight * (1 - SHEET) && rect.top >= 0) return
    elementOf(word)?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
    })
  }

  async function show(target) {
    const search = ++latest
    const word = target.textContent ?? target.toString()
    highlight(target)
    current = target
    open(isLzh ? word : dictionary.cleanWord(word))
    keepInSight(target)
    // The words either side too, so stepping to one is as quick as a tap
    if (!isLzh) {
      for (const near of [stepWord(1), stepWord(-1)]) {
        if (near) dictionary.lookup(dict, near.textContent)
      }
    }

    let html
    let answer
    if (isLzh) {
      const node = target.startContainer
      // Traditional, as the dictionary is, where `simplify.js` has swapped it
      const data = window.scxSimplify?.original(node) ?? node.data
      const at = [...data.slice(0, target.startOffset)].length
      const terms = await dictionary.lookupLzh(data, at)
      // The longest term the character is in, rather than the character alone
      if (search === latest && terms?.length) {
        const before = [...data].slice(0, terms[0].start).join('').length
        const termRange = rangeOf(node, before, before + terms[0].term.length)
        highlight(termRange)
        current = termRange
      }
      html = terms && lzhHtml(terms)
    } else {
      answer = await dictionary.lookup(dict, word)
      html = answer && paliHtml(word, answer)
    }

    if (search !== latest || !toggle.checked) return
    setDefine(answer?.map(pageOf).find(Boolean))
    const section = popover.querySelector('section')
    section.insertAdjacentHTML(
      'beforeend',
      html ??
        '<p>Couldn’t load the dictionary. Try again when you’re online.</p>'
    )
    section.removeAttribute('aria-busy')
  }

  function go(direction) {
    const word = step(direction)
    if (word) show(word)
  }

  // In the capture phase, so a tap on a word isn't also taken by listen as one to read from
  main.addEventListener(
    'click',
    event => {
      const target = event.target
      if (!toggle.checked || !(target instanceof Element)) return
      if (!target.closest(TEXT) || target.closest('a[href], button')) return
      // Not a tap but the end of selecting text, which has to stay selectable
      if (!getSelection()?.isCollapsed) return
      const word = isLzh ? charAt(event) : target.closest('.word')
      if (!word) return
      event.preventDefault()
      event.stopPropagation()
      show(word)
    },
    true
  )

  // The first word of a segment's text, for one tabbed to
  function firstWord(text) {
    if (!isLzh) return wordsOf(text)[0] ?? null
    const walk = walker()
    walk.currentNode = text
    for (
      let node = walk.nextNode();
      node && text.contains(node);
      node = walk.nextNode()
    ) {
      const match = node.data.matchAll(WORD).next().value
      if (match)
        return rangeOf(node, match.index, match.index + match[0].length)
    }
    return null
  }

  main.addEventListener('pointerover', event => {
    if (isLzh || !toggle.checked) return
    const text = event.target.closest?.(TEXT)
    if (text) wordsOf(text)
  })

  // The answer's fetch starts on press, rather than on the click after release. Not on touch, where a press is
  // as likely the start of a scroll
  main.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || !toggle.checked || isLzh) return
    const word = event.target.closest?.(`${TEXT} .word`)
    if (word) dictionary.lookup(dict, word.textContent)
  })

  popover.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.hasAttribute('data-close')) popover.hidePopover()
    else if (button.hasAttribute('data-help'))
      setHelp(button.getAttribute('aria-expanded') !== 'true')
    else go(Number(button.dataset.step))
  })

  // Before it hides, as that takes focus out of it
  popover.addEventListener('beforetoggle', event => {
    if (event.newState !== 'closed') return
    if (current && popover.contains(document.activeElement)) {
      elementOf(current)?.closest(TEXT)?.focus({ preventScroll: true })
    }
    clearHighlight()
    current = null
  })

  document.addEventListener('keydown', event => {
    // A segment tabbed to
    if (event.key === 'Enter' && event.target.matches?.(TEXT)) {
      const word = toggle.checked && firstWord(event.target)
      if (word) {
        event.preventDefault()
        show(word)
        popover.focus({ preventScroll: true })
      }
      return
    }
    if (!popover.matches(':popover-open')) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target.closest?.('input, textarea, select')) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      go(event.key === 'ArrowLeft' ? -1 : 1)
    }
    if (event.key === 'Tab') tabOut(event)
  })

  // Out of either end of the sheet to the segments either side of the word, as if it came straight after it
  // rather than at the end of the text
  function tabOut(event) {
    if (!current || !popover.contains(document.activeElement)) return
    const focusable = [...popover.querySelectorAll('a[href], button')].filter(
      element => !element.closest('[hidden]')
    )
    const edge = event.shiftKey
      ? [popover, focusable[0]].includes(document.activeElement)
      : document.activeElement === focusable[focusable.length - 1]
    if (!edge) return
    const text = elementOf(current).closest(TEXT)
    const index = Array.prototype.indexOf.call(texts, text)
    const next = event.shiftKey ? text : texts[index + 1]
    if (!next) return
    event.preventDefault()
    next.focus()
  }
})()

/**
 * Word Lookup
 *
 * Shows what a word of the root text means in a sheet along the bottom, while "Word lookup" is on: a Pāli word's
 * answer from DPD, or the Chinese terms that take in the character. ← and → or the sheet's arrows go to the words
 * either side, and Esc or a tap elsewhere closes it. The answers are in shards `dictionary.js` fetches, so it
 * works offline. `viewSettings.js` loads both once the setting is turned on.
 *
 * Without JS, each Pāli word is a link to its /define page, which the CSS lets through only while the setting is
 * on. With it the links are only for finding the word, and a word without one is found where it was tapped.
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
  const lang = isLzh ? 'lzh' : 'pli'
  // The root text: a root page's own, or a translation's beside it
  const TEXT = `.segment > :is(.translation, .root)[lang="${lang}"] > .text`
  const WORD = isLzh
    ? /\p{Script=Han}/gu
    : /[\p{L}\p{M}\u00ad\u2027]+(?:[’'”][\p{L}\p{M}\u00ad\u2027]+)*/gu
  // As `viewSettings.js` leaves the links, without their hrefs
  const LINK = 'a[data-href]'
  // The sheet's height, so a word under it gets scrolled up
  const SHEET = 0.3
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const canHighlight =
    typeof CSS !== 'undefined' &&
    !!CSS.highlights &&
    typeof Highlight === 'function'

  let current = null
  let latest = 0

  const links = main.querySelectorAll(`${TEXT} ${LINK}`)

  // Tab stops only while it's on, as there's one per word
  function setTabbable() {
    for (const link of links) {
      link.tabIndex = toggle.checked ? 0 : -1
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

  // The word in a text node at an offset, taking a tap on a word's last half as on it
  function wordAround(node, offset) {
    for (const match of node.data.matchAll(WORD)) {
      const end = match.index + match[0].length
      if (match.index <= offset && offset <= end && match.index < end) {
        return rangeOf(node, match.index, end)
      }
    }
    return null
  }

  function wordAt(event) {
    const caret = caretAt(event.clientX, event.clientY)
    if (caret?.node?.nodeType !== Node.TEXT_NODE) return null
    if (!caret.node.parentElement?.closest(TEXT)) return null
    if (!isLzh) return wordAround(caret.node, caret.offset)
    // The character tapped, which the caret can be either side of
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

  /** The word before or after the one shown, or null at either end */
  function step(direction) {
    if (!current) return null
    const walk = walker()
    let node = current.range.startContainer
    walk.currentNode = node
    while (node) {
      const matches = [...node.data.matchAll(WORD)]
      const candidates =
        node === current.range.startContainer
          ? matches.filter(match =>
              direction > 0
                ? match.index >= current.range.endOffset
                : match.index + match[0].length <= current.range.startOffset
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

  let marked = null

  // A link by a class, as Safari leaves a replaced highlight's range painted
  function highlight(range, link) {
    clearHighlight()
    if (link) {
      marked = link
      link.classList.add('looked-up')
    } else if (canHighlight) {
      CSS.highlights.set('lookup', new Highlight(range))
    }
  }

  function clearHighlight() {
    marked?.classList.remove('looked-up')
    marked = null
    if (canHighlight) CSS.highlights.delete('lookup')
  }

  function icon(name) {
    return `<i class="icon i-${name}"></i>`
  }

  const escape = text =>
    text.replace(/[&<>"]/g, char => `&#${char.charCodeAt(0)};`)

  function definePath(word) {
    return `/define/${encodeURI(word)}`
  }

  // Opens the sheet on the word at once, its answer following once the shard is in
  function open(word, link) {
    const define = link
      ? `<a href="${link.dataset.href}" aria-label="Full definitions of ${escape(word)}">${icon('bookOpen')}</a>`
      : ''
    popover.innerHTML =
      `<section aria-busy="true"><dfn lang="${lang}" translate="no">${escape(word)}</dfn></section>` +
      `<nav aria-label="Word lookup">` +
      `<button type="button" data-step="-1" aria-label="Previous word" aria-keyshortcuts="ArrowLeft">${icon('arrowLeft')}</button>` +
      define +
      `<button type="button" data-close aria-label="Close" aria-keyshortcuts="Escape">${icon('xMark')}</button>` +
      `<button type="button" data-step="1" aria-label="Next word" aria-keyshortcuts="ArrowRight">${icon('arrowRight')}</button>` +
      `</nav>`
    if (!popover.matches(':popover-open')) popover.showPopover()
  }

  function paliHtml(word, answer) {
    const cleaned = dictionary.cleanWord(word)
    const matches = answer.length ? answer : [{ b: cleaned, m: '?' }]
    // The word already heads the sheet, so one match of it alone needs no heading of its own
    const headed = !(matches.length === 1 && matches[0].b === cleaned)
    return matches
      .map(match => {
        const page = match.p ? match.b : match.h
        const dt = headed
          ? `<dt><dfn lang="pli" translate="no">${escape(match.b)}</dfn>${page ? ` <a href="${definePath(page)}" aria-label="Full definitions of ${escape(page)}">${icon('bookOpen')}</a>` : ''}</dt>`
          : ''
        let dd = match.g
          ? `<span class="grammar">${escape(match.g)}</span>`
          : ''
        dd += match.d
          ? `<ol class="definition">${match.d.map(d => `<li>${d}</li>`).join('')}</ol>`
          : escape(match.m ?? '?')
        if (match.x)
          dd += `<ul class="xr">${match.x.map(x => `<li>See: <span lang="pli" translate="no">${escape(x)}</span></li>`).join('')}</ul>`
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
  function keepInSight(range) {
    const rect = range.getBoundingClientRect()
    if (rect.bottom <= innerHeight * (1 - SHEET) && rect.top >= 0) return
    range.startContainer.parentElement?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion.matches ? 'auto' : 'smooth',
    })
  }

  async function show(range) {
    const search = ++latest
    const node = range.startContainer
    const link = node.parentElement?.closest(LINK) ?? null
    const word = range.toString()
    current = { range, link }
    highlight(range, link)
    open(isLzh ? word : dictionary.cleanWord(word), link)
    keepInSight(range)
    link?.setAttribute('aria-busy', 'true')

    let html
    if (isLzh) {
      const at = [...node.data.slice(0, range.startOffset)].length
      const terms = await dictionary.lookupLzh(node.data, at)
      // The longest term the character is in, rather than the character alone
      if (search === latest && terms?.length) {
        const before = [...node.data].slice(0, terms[0].start).join('').length
        const termRange = rangeOf(node, before, before + terms[0].term.length)
        current.range = termRange
        highlight(termRange, null)
      }
      html = terms && lzhHtml(terms)
    } else {
      const answer = await dictionary.lookup(dict, word)
      html = answer && paliHtml(word, answer)
    }

    link?.removeAttribute('aria-busy')
    if (search !== latest || !toggle.checked) return
    const section = popover.querySelector('section')
    section.insertAdjacentHTML(
      'beforeend',
      html ??
        '<p>Couldn’t load the dictionary. Try again when you’re online.</p>'
    )
    section.removeAttribute('aria-busy')
  }

  function go(direction) {
    const range = step(direction)
    if (range) show(range)
  }

  // In the capture phase, so a tap on a word isn't also taken by listen as one to read from
  main.addEventListener(
    'click',
    event => {
      const target = event.target
      if (!toggle.checked || !(target instanceof Element)) return
      if (!target.closest(TEXT) || target.closest('a[href], button')) return
      const link = target.closest(LINK)
      // Not a tap but the end of selecting text, which has to stay selectable
      if (!getSelection()?.isCollapsed) return
      const range = link ? rangeOfLink(link) : wordAt(event)
      if (!range) return
      event.preventDefault()
      event.stopPropagation()
      show(range)
    },
    true
  )

  function rangeOfLink(link) {
    const node = link.firstChild
    return node?.nodeType === Node.TEXT_NODE
      ? rangeOf(node, 0, node.data.length)
      : null
  }

  // The answer's fetch starts on press, rather than on the click after release. Not on touch, where a press is
  // as likely the start of a scroll
  main.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || !toggle.checked) return
    const link = event.target.closest?.(`${TEXT} ${LINK}`)
    if (link && !isLzh) dictionary.lookup(dict, link.textContent)
  })

  popover.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (button.hasAttribute('data-close')) popover.hidePopover()
    else go(Number(button.dataset.step))
  })

  popover.addEventListener('toggle', event => {
    if (event.newState !== 'closed') return
    clearHighlight()
    current = null
  })

  document.addEventListener('keydown', event => {
    // A word tabbed to, as the links have no href for Enter to follow
    if (event.key === 'Enter' && event.target.matches?.(`${TEXT} ${LINK}`)) {
      const range = toggle.checked && rangeOfLink(event.target)
      if (range) show(range)
      return
    }
    if (!popover.matches(':popover-open')) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.target.closest?.('input, textarea, select')) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      go(event.key === 'ArrowLeft' ? -1 : 1)
    }
  })
})()

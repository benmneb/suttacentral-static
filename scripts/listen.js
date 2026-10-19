/**
 * Text-to-Speech Player
 *
 * Provides speech synthesis controls for reading article content aloud.
 * Features include play/pause/stop controls, navigation between segments,
 * voice selection, pitch/rate adjustment, auto-scrolling, and click-to-jump.
 *
 * Handles both segmented text (via span.text elements) and non-segmented
 * content by manually extracting visible text-containing elements, which are
 * then split into sentences so they can be read and skipped one at a time.
 *
 * @module TextToSpeech
 * @requires SpeechSynthesis API
 *
 * @example
 * // Access debug state
 * window._scx_listen.getState()
 *
 * @example
 * // Cancel all playback
 * window._scx_listen.cancel()
 */
;(function () {
  'use strict'

  // Configurable constants
  const TIMEOUT_MS = 60
  const CLASS_HIGHLIGHT = 'tts-highlight'
  const CLASS_CLICKABLE = 'tts-clickable'
  const HIGHLIGHT_NAME = 'tts-current'
  const HOVER_HIGHLIGHT_NAME = 'tts-hover'
  const WORD_HIGHLIGHT_NAME = 'tts-word'
  const CLASS_SENTENCES = 'tts-sentences'
  const LABEL_PLAY = 'Play'
  const LABEL_PAUSE = 'Pause'
  const LABEL_RESUME = 'Play'

  const synth = window.speechSynthesis
  const canHighlightRanges =
    typeof CSS !== 'undefined' &&
    !!CSS.highlights &&
    typeof Highlight === 'function'

  // state
  let voices = []
  let visibleTextSpans = []
  let visibleTextContent = []
  let visibleTextRanges = [] // the sentence each item covers in non segmented texts, null in segmented ones
  // Where each character of a sentence is in the DOM, for the word being read, null in segmented texts
  let visibleTextPoints = []
  // The same for the segment being read, made on its first word
  let segmentPoints = null
  let currentIndex = 0
  let isCancelled = false
  let isPlaying = false // denotes an active session (playing or paused)
  // Kept here rather than read off synth.paused, as browsers disagree on it after a cancel - Chrome stays
  // paused, Safari and Firefox don't
  let isPaused = false
  let currentUtterance = null
  let sessionId = 0

  // DOM
  const menuButton = document.getElementById('listen-menu-button')
  const rootMenuEl = document.getElementById('listen-menu')
  const voiceSelect = document.getElementById('voice-select')
  const noVoicesEl = document.getElementById('no-voices')
  const pitch = document.getElementById('pitch')
  const pitchValue = document.getElementById('pitch-value')
  const rate = document.getElementById('rate')
  const rateValue = document.getElementById('rate-value')

  const prevBtn = document.getElementById('prev')
  const playPauseBtn = document.getElementById('playpause')
  const playPauseBtnIcon = playPauseBtn.getElementsByTagName('span')[0]
  const playPauseBtnLabel = playPauseBtn.querySelector('span span')
  const ICON_PLAY = playPauseBtnIcon.innerHTML
  const ICON_PAUSE = document.getElementById('pause-icon')?.innerHTML ?? ''
  const ICON_RESUME = ICON_PLAY
  const nextBtn = document.getElementById('next')
  const stopBtn = document.getElementById('stop')
  const autoScrollToggle = document.getElementById('auto-scroll')

  const rootFirst = document.getElementById('rooter-first')

  // basic sanity
  if (!rootMenuEl) {
    console.warn('listen.js: required controls missing; aborting init.')
    return
  }

  // no speech API at all (e.g. the Android app's WebView), so nothing here can work
  if (!synth) {
    const item = menuButton?.closest('li')
    if (item) item.style.display = 'none'
    return
  }

  // enable all the controls (they are disabled by default to show fallback text if user has JS turned off)
  rootMenuEl.style.maxWidth = '100vw'
  rootMenuEl.classList.add('scripted')

  const textLang =
    rootMenuEl.dataset.textLang ||
    document.querySelector('main > article')?.lang ||
    document.documentElement.lang ||
    undefined
  let sentenceSegmenter = null
  let wordSegmenter = null
  try {
    sentenceSegmenter = new Intl.Segmenter(textLang, {
      granularity: 'sentence',
    })
    wordSegmenter = new Intl.Segmenter(textLang, { granularity: 'word' })
  } catch (e) {}

  // A block can be a whole <ol> or a <div> wrapping the lot, so the units inside it have to be told apart - two list items are not one sentence
  const BLOCK_TAGS = new Set([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'CAPTION',
    'DD',
    'DIV',
    'DL',
    'DT',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TBODY',
    'TD',
    'TFOOT',
    'TH',
    'THEAD',
    'TR',
    'UL',
  ])

  /** The nearest block level element a text node sits in, within the block */
  function blockAncestor(element, root) {
    let el = element
    while (el && el !== root) {
      if (BLOCK_TAGS.has(el.tagName)) return el
      el = el.parentElement
    }
    return root
  }

  // The sentences of a block of non segmented text, each with the Range it covers so it can be highlighted.
  // Sentences run across inline elements (ie a PTS ref mid sentence), so it's done on the text nodes, not elements
  function splitIntoSentences(block) {
    const nodes = []
    let text = ''
    let lastOwner = null
    const walker = document.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
    )
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (node.nodeType === Node.ELEMENT_NODE) {
        // A line break ends a line of verse, which rarely has punctuation of its own to break on
        if (node.tagName === 'BR' && text && !text.endsWith('\n')) {
          text += '\n'
        }
        continue
      }
      const parent = node.parentElement
      // skip reference links and anything hidden
      if (!parent || parent.closest('.ref') || parent.offsetParent === null)
        continue
      // A newline is a mandatory sentence break, so each list item, cell or nested block ends up its own unit
      // instead of running into the next - they often have no punctuation to break on. It belongs to no text
      // node, and trimming the segment takes it off again
      const owner = blockAncestor(parent, block)
      if (lastOwner && owner !== lastOwner && !text.endsWith('\n')) {
        text += '\n'
      }
      lastOwner = owner
      nodes.push({ node, start: text.length })
      text += node.data
    }

    const pointAt = (offset, isEnd) => pointIn(nodes, offset, isEnd)

    let pieces
    if (sentenceSegmenter) {
      pieces = Array.from(sentenceSegmenter.segment(text), s => [
        s.index,
        s.segment,
      ])
    } else {
      // Without a segmenter a block is read whole, as it used to be, but the blocks inside it are still worth keeping apart
      pieces = []
      let at = 0
      for (const part of text.split('\n')) {
        pieces.push([at, part])
        at += part.length + 1
      }
    }

    return pieces.flatMap(([index, segment]) => {
      const trimmed = segment.trim()
      if (!trimmed) return []
      const start = index + segment.length - segment.trimStart().length
      const end = index + segment.trimEnd().length
      const startPoint = pointAt(start, false)
      const endPoint = pointAt(end, true)
      if (!startPoint || !endPoint) return []
      const range = document.createRange()
      range.setStart(...startPoint)
      range.setEnd(...endPoint)
      const at = (offset, isEnd) => pointAt(start + offset, isEnd)
      return [{ text: trimmed.replace(/\n/g, ' '), range, at }]
    })
  }

  /** The text node and offset in it of an offset into their joined text */
  function pointIn(nodes, offset, isEnd) {
    const found = nodes.find(({ node, start }) =>
      isEnd
        ? offset <= start + node.data.length
        : offset < start + node.data.length
    )
    return found ? [found.node, offset - found.start] : null
  }

  // The same for a segment, whose text is read without its newlines, so each character the voice gets is
  // mapped to where it is
  function spanPoints(span) {
    const points = []
    const walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      for (let i = 0; i < node.data.length; i++) {
        if (node.data[i] !== '\n') points.push([node, i])
      }
    }
    return (offset, isEnd) => {
      if (!isEnd) return points[offset] ?? null
      const last = points[offset - 1]
      return last ? [last[0], last[1] + 1] : null
    }
  }

  function computeVisibleText() {
    // for segmented texts
    visibleTextSpans = Array.from(
      document.querySelectorAll(
        'main > article span.text, main > section span.text'
      )
    ).filter(s => s.offsetParent !== null && s.textContent)

    visibleTextContent = visibleTextSpans?.map(s =>
      s.textContent.replace(/\n/g, '')
    )
    visibleTextRanges = visibleTextSpans.map(() => null)
    visibleTextPoints = visibleTextSpans.map(() => null)

    // If rooter-first is checked, reorder spans within each segment to match CSS grid display order
    if (rootFirst && rootFirst.checked && visibleTextSpans.length > 0) {
      const segments = new Map()

      // Group spans by their parent segment
      visibleTextSpans.forEach((span, index) => {
        const segment = span.closest('.segment')
        if (segment) {
          if (!segments.has(segment)) {
            segments.set(segment, [])
          }
          segments.get(segment).push({ span, index })
        }
      })

      // For each segment, if it has both translation and root text, swap their order
      segments.forEach((items, segment) => {
        if (items.length >= 2) {
          const translationItem = items.find(item =>
            item.span.closest('.translation')
          )
          const rootItem = items.find(item => item.span.closest('.root'))

          // If both exist, swap them in the arrays
          if (translationItem && rootItem) {
            const tempSpan = visibleTextSpans[translationItem.index]
            const tempContent = visibleTextContent[translationItem.index]

            visibleTextSpans[translationItem.index] =
              visibleTextSpans[rootItem.index]
            visibleTextContent[translationItem.index] =
              visibleTextContent[rootItem.index]

            visibleTextSpans[rootItem.index] = tempSpan
            visibleTextContent[rootItem.index] = tempContent
          }
        }
      })
    }

    // fallback for messy DOM in non segmented texts
    if (!visibleTextSpans.length || !visibleTextContent.length) {
      const textContainingElements = [
        'div',
        'span',
        'p',
        'blockquote',
        'pre',
        'address',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'ul',
        'ol',
        'li',
        'dl',
        'dt',
        'dd',
        'a',
        'abbr',
        'b',
        'strong',
        'i',
        'em',
        'mark',
        'small',
        'del',
        'ins',
        'sub',
        'sup',
        'code',
        'kbd',
        'samp',
        'var',
        'cite',
        'dfn',
        'q',
        's',
        'u',
        'time',
        'data',
        'bdi',
        'bdo',
        'ruby',
        'rt',
        'rp',
        'table',
        'caption',
        'thead',
        'tbody',
        'tfoot',
        'tr',
        'th',
        'td',
        'colgroup',
        'col',
        'form',
        'label',
        'button',
      ]
      const selector = textContainingElements
        .map(e => `main > article ${e}`)
        .join(', ')
      const allVisibleElements = Array.from(
        document.querySelectorAll(selector)
      ).filter(s => s.offsetParent !== null && s.textContent)

      const blocks = allVisibleElements.filter(el => {
        // avoid duplicates
        return !allVisibleElements.some(
          other => other !== el && other.contains(el)
        )
      })

      // Each block is a whole paragraph or more, so it's split into sentences to be read and skipped one at a time
      visibleTextSpans = []
      visibleTextContent = []
      visibleTextRanges = []
      visibleTextPoints = []
      blocks.forEach(block => {
        splitIntoSentences(block).forEach(({ text, range, at }) => {
          visibleTextSpans.push(block)
          visibleTextContent.push(text)
          visibleTextRanges.push(range)
          visibleTextPoints.push(at)
        })
      })
    }
  }

  function updateClickableSpans() {
    if (!visibleTextSpans || !visibleTextSpans.length) return
    if (isPlaying) {
      visibleTextSpans.forEach((s, i) => {
        s.classList.add(CLASS_CLICKABLE)
        // its sentences get the hover instead of the whole element
        if (visibleTextRanges[i] && canHighlightRanges) {
          s.classList.add(CLASS_SENTENCES)
        }
      })
    } else {
      visibleTextSpans.forEach(s =>
        s.classList.remove(CLASS_CLICKABLE, CLASS_SENTENCES)
      )
      clearHover()
    }
  }

  function setNavControlsEnabled(enabled) {
    if (prevBtn) prevBtn.disabled = !enabled
    if (nextBtn) nextBtn.disabled = !enabled
    if (stopBtn) stopBtn.disabled = !enabled
  }

  // The middle of what can be read, above the bar when it's pinned to the bottom. The controls' top, not the
  // menu's, when they're showing
  function readingMiddle() {
    const bar = rootMenuEl.closest('fieldset')
    if (!bar || getComputedStyle(bar).position !== 'fixed') {
      return window.innerHeight / 2
    }
    const controls = rootMenuEl
      .querySelector('.tts-controls')
      ?.getBoundingClientRect()
    const bottom = controls?.height
      ? controls.top
      : bar.getBoundingClientRect().top
    return bottom / 2
  }

  function ensureVisible(index) {
    if (!autoScrollToggle) return
    if (!autoScrollToggle.checked) return
    const el = visibleTextSpans[index]
    if (!el) return
    // a sentence is centred itself, as its paragraph can be taller than the screen. Not scrollIntoView, which
    // can only centre on the whole screen
    const range = visibleTextRanges[index]?.getBoundingClientRect()
    const rect = range?.height ? range : el.getBoundingClientRect()
    window.scrollBy({
      top: rect.top + rect.height / 2 - readingMiddle(),
      behavior: 'smooth',
    })
  }

  // Changed in place, as Safari doesn't repaint what a replaced one covered
  const itemHighlight = canHighlightRanges ? new Highlight() : null
  if (itemHighlight) {
    // above the hover
    itemHighlight.priority = 1
    CSS.highlights.set(HIGHLIGHT_NAME, itemHighlight)
  }
  const wordHighlight = canHighlightRanges ? new Highlight() : null
  if (wordHighlight) {
    // above the sentence
    wordHighlight.priority = 2
    CSS.highlights.set(WORD_HIGHLIGHT_NAME, wordHighlight)
  }

  // Chrome's Google voices don't say which word, so they keep just the sentence
  function highlightWord(index, charIndex, charLength) {
    if (!wordHighlight) return
    const text = visibleTextContent[index]
    if (!text || !(charIndex >= 0) || charIndex >= text.length) return
    // Safari gives no length, so it's the word the index is in
    let end = charIndex + (charLength || 0)
    if (!charLength) {
      const word = wordSegmenter?.segment(text).containing(charIndex)
      if (!word) return
      end = word.index + word.segment.length
    }
    let at = visibleTextPoints[index]
    if (!at) {
      if (segmentPoints?.index !== index) {
        segmentPoints = { index, at: spanPoints(visibleTextSpans[index]) }
      }
      at = segmentPoints.at
    }
    const startPoint = at(charIndex, false)
    const endPoint = at(Math.min(end, text.length), true)
    if (!startPoint || !endPoint) return
    try {
      const range = document.createRange()
      range.setStart(...startPoint)
      range.setEnd(...endPoint)
      wordHighlight.clear()
      wordHighlight.add(range)
    } catch (e) {}
  }

  // Highlights just the sentence where the browser can, otherwise the whole element it's in
  function highlightItem(index) {
    const range = visibleTextRanges[index]
    if (range && itemHighlight) {
      itemHighlight.clear()
      itemHighlight.add(range)
    } else {
      visibleTextSpans[index]?.classList.add(CLASS_HIGHLIGHT)
    }
  }

  function clearHighlight() {
    if (canHighlightRanges) {
      itemHighlight.clear()
      wordHighlight.clear()
    }
    segmentPoints = null
    visibleTextSpans.forEach(s => s.classList.remove(CLASS_HIGHLIGHT))
  }

  function updatePlayPauseLabel() {
    if (isPaused) {
      playPauseBtnLabel.textContent = LABEL_RESUME
      playPauseBtnIcon.innerHTML = ICON_RESUME
      return
    }
    if (isPlaying) {
      playPauseBtnLabel.textContent = LABEL_PAUSE
      playPauseBtnIcon.innerHTML = ICON_PAUSE
      return
    }
    playPauseBtnLabel.textContent = LABEL_PLAY
    playPauseBtnIcon.innerHTML = ICON_PLAY
  }

  // Text languages whose voices go by another code: Literary Chinese, Japanese, Kannada, Classical Tibetan,
  // and Norwegian, as Bokmål
  const VOICE_LANGS = {
    lzh: 'zh',
    jpn: 'ja',
    kan: 'kn',
    xct: 'bo',
    no: 'nb',
  }
  // Where a language's regions are not just accents. zh-HK voices speak Cantonese, so Mandarin first, the
  // mainland's and then Taiwan's
  const VOICE_REGIONS = { zh: ['zh-cn', 'zh-tw'] }
  // Android writes en_US for en-US
  const tag = lang => (lang || '').replace('_', '-').toLowerCase()

  function populateVoiceList() {
    voices =
      typeof synth?.getVoices === 'function' ? synth.getVoices().slice() : []

    // Group voices by language
    const byLang = new Map()
    for (const v of voices) {
      const lang = v.lang || 'unknown'
      if (!byLang.has(lang)) byLang.set(lang, [])
      byLang.get(lang).push(v)
    }

    // Older browsers can't name them, so get the code
    const uiLang = document.documentElement.lang || undefined
    let langNames = null
    try {
      langNames = new Intl.DisplayNames(uiLang, {
        type: 'language',
        languageDisplay: 'standard',
      })
    } catch (e) {}
    const langLabel = lang => {
      try {
        return langNames?.of(lang.replace('_', '-')) ?? lang
      } catch (e) {
        return lang
      }
    }
    const langs = Array.from(byLang.keys()).sort((a, b) =>
      langLabel(a).localeCompare(langLabel(b), uiLang)
    )

    // Sort voices within each language by name
    for (const [, list] of byLang) {
      list.sort((a, b) => {
        const an = (a.name || '').toUpperCase()
        const bn = (b.name || '').toUpperCase()
        if (an < bn) return -1
        if (an === bn) return 0
        return 1
      })
    }

    // Determine preferred voice to select: saved, then text language, then default voice, then browser lang
    const defaultVoice = voices.find(v => v.default)
    const browserLang = (
      navigator.language ||
      navigator.userLanguage ||
      ''
    ).toString()
    const primaryBrowserLang = browserLang.split('-')[0]
    // Saved by the prefs script, while the device still has it
    const savedName = voiceSelect.dataset.saved
    let suitableVoiceName = voices.some(v => v.name === savedName)
      ? savedName
      : null

    // Then try to match text language. Voices go by the two-letter code where there is one, and a voice for
    // the modern language reads the classical one, as zh-CN does Taisho Chinese. Within the language:
    // 1. A voice in a language the browser asks for, in the reader's order of preference (navigator.languages).
    //    So a UK reader gets en-GB, a Brazilian reader pt-BR, and a Taiwanese reader zh-TW on Taisho texts
    // 2. The main region from VOICE_REGIONS, only Chinese for now. Before the default, as Safari marks a
    //    voice in every region of a language as its default
    // 3. The device's default voice, if it's in that language
    // 4. Any voice in the language
    if (!suitableVoiceName && textLang) {
      const speechLang = VOICE_LANGS[textLang] ?? textLang
      const textLangVoices = voices.filter(
        v => tag(v.lang).split('-')[0] === speechLang
      )
      const inRegions = regions =>
        regions
          .map(r => textLangVoices.find(v => tag(v.lang) === r))
          .find(Boolean)
      const voice =
        inRegions((navigator.languages ?? [browserLang]).map(tag)) ??
        inRegions(VOICE_REGIONS[speechLang] ?? []) ??
        textLangVoices.find(v => v.default) ??
        textLangVoices[0]
      suitableVoiceName = voice?.name ?? null
    }

    // Fall back to default voice
    if (!suitableVoiceName && defaultVoice) {
      suitableVoiceName = defaultVoice.name
    }

    // Fall back to browser language
    if (!suitableVoiceName && browserLang) {
      // find first voice matching full lang, then primary subtag
      let found = voices.find(v => v.lang === browserLang)
      if (!found)
        found = voices.find(
          v => v.lang && v.lang.startsWith(primaryBrowserLang)
        )
      if (found) suitableVoiceName = found.name
    }

    // Build select with optgroups per language
    voiceSelect.innerHTML = ''
    for (const lang of langs) {
      const group = document.createElement('optgroup')
      group.label = langLabel(lang)
      const list = byLang.get(lang) || []
      for (const v of list) {
        const opt = document.createElement('option')
        opt.textContent = `${v.name}${v.default ? ' -- DEFAULT' : ''}`
        opt.setAttribute('data-name', v.name)
        opt.setAttribute('data-lang', v.lang)
        group.appendChild(opt)
      }
      voiceSelect.appendChild(group)
    }

    // Select initial option if present, otherwise preserve previous selection or pick first
    let selIndex = 0
    if (suitableVoiceName) {
      for (let i = 0; i < voiceSelect.options.length; i++) {
        if (
          voiceSelect.options[i].getAttribute('data-name') === suitableVoiceName
        ) {
          selIndex = i
          break
        }
      }
    } else {
      selIndex = voiceSelect.selectedIndex >= 0 ? voiceSelect.selectedIndex : 0
    }
    voiceSelect.selectedIndex = Math.min(
      selIndex,
      Math.max(0, voiceSelect.options.length - 1)
    )

    // No voices means the device has no text-to-speech installed, not that anything here is broken.
    // Checked every time the list fills, as Chrome hands back none at first and the rest a moment later
    const hasVoices = voices.length > 0
    if (noVoicesEl) noVoicesEl.hidden = hasVoices
    voiceSelect.disabled = !hasVoices
    playPauseBtn.disabled = !hasVoices
  }
  populateVoiceList()
  if (typeof synth !== 'undefined' && synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoiceList
  }

  const EM_DASH = '—'
  const SPACE_OR_DASH = /[\s—]/

  /**
   * The text as the voice gets it, with spaces round a dash between words. Voices take "sabbath—the" for one
   * word, and say when it starts but not when "the" does. Spaced, they still pause at it. Where each
   * character came from is kept, for the word being read
   */
  function speakable(text) {
    let spoken = ''
    const from = []
    for (let i = 0; i < text.length; i++) {
      const prev = text[i - 1]
      const next = text[i + 1]
      const isDash = text[i] === EM_DASH
      // a run of dashes, as in Chinese, is spaced as one
      if (isDash && prev && /\S/.test(prev) && prev !== EM_DASH) {
        spoken += ' '
        from.push(i)
      }
      spoken += text[i]
      from.push(i)
      if (isDash && next && /\S/.test(next) && next !== EM_DASH) {
        spoken += ' '
        from.push(i + 1)
      }
    }
    return { spoken, from }
  }

  // Speak chain with session protection
  function speakNext() {
    const mySession = sessionId
    if (currentIndex >= visibleTextContent.length) {
      finishPlayback()
      return
    }
    const text = visibleTextContent[currentIndex]
    if (!text || isCancelled) {
      finishPlayback()
      return
    }

    const { spoken, from } = speakable(text)
    const utter = new SpeechSynthesisUtterance(spoken)
    utter._session = mySession
    currentUtterance = utter

    utter.onstart = () => {
      if (utter._session !== sessionId) return
      highlightItem(currentIndex)
      ensureVisible(currentIndex)
      // immediate label update when speech starts
      updatePlayPauseLabel()
    }

    utter.onboundary = ev => {
      if (utter._session !== sessionId || ev.name !== 'word') return
      let start = ev.charIndex
      // Safari gives no length, so highlightWord finds the word itself
      let end = start + (ev.charLength || 1)
      // Some voices take the dash, or the space by it, in with a word
      while (start < end && SPACE_OR_DASH.test(spoken[start])) start++
      while (end > start && SPACE_OR_DASH.test(spoken[end - 1])) end--
      // the dash's own
      if (start === end) return
      const length = ev.charLength ? from[end - 1] + 1 - from[start] : 0
      highlightWord(currentIndex, from[start], length)
    }

    utter.onend = () => {
      if (utter._session !== sessionId) return
      clearHighlight()
      currentUtterance = null
      if (isCancelled) {
        finishPlayback()
        return
      }
      currentIndex += 1
      // If paused between utterances, don't auto-advance
      if (isPaused) {
        updatePlayPauseLabel()
        return
      }
      speakNext()
    }

    utter.onerror = ev => {
      if (utter._session !== sessionId) return
      console.error('SpeechSynthesisUtterance error', ev)
      clearHighlight()
      currentUtterance = null
      currentIndex += 1
      if (!isCancelled) speakNext()
    }

    // set voice
    const selected =
      voiceSelect.selectedOptions && voiceSelect.selectedOptions[0]
        ? voiceSelect.selectedOptions[0].getAttribute('data-name')
        : null
    if (selected) {
      const v = voices.find(x => x.name === selected)
      if (v) utter.voice = v
    }
    utter.pitch = pitch ? Number(pitch.value) : 1
    utter.rate = rate ? Number(rate.value) : 1

    try {
      synth.speak(utter)
    } catch (err) {
      console.error('synth.speak threw', err)
    }
  }

  // Controls
  function startSessionFrom(index = 0) {
    if (!visibleTextContent.length || !visibleTextSpans.length) return
    sessionId += 1
    isCancelled = false
    isPlaying = true
    isPaused = false
    currentIndex = Math.max(0, Math.min(index, visibleTextContent.length - 1))
    playPauseBtnLabel.textContent = LABEL_PAUSE
    playPauseBtnIcon.innerHTML = ICON_PAUSE
    setNavControlsEnabled(true)
    updateClickableSpans()
    speakNext()
  }

  // Chrome stays paused through a cancel, which would hold back whatever is spoken next, so it's let go of here
  function cancelSpeech() {
    try {
      synth.cancel()
      if (synth.paused) synth.resume()
    } catch (e) {}
  }

  function pauseSession() {
    if (!isPlaying || isPaused) return
    isPaused = true
    try {
      synth.pause()
    } catch (err) {
      console.error('pause failed', err)
    }
    updatePlayPauseLabel()
  }

  function resumeSession() {
    if (!isPaused) return
    isPaused = false
    try {
      synth.resume()
    } catch (err) {
      console.error('resume failed', err)
    }
    // Skipped or ended while paused, so there's nothing to resume and the new item is read from its start
    if (!currentUtterance) speakNext()
    updatePlayPauseLabel()
  }

  // While paused this only moves the highlight, to be read from on resume
  function skipTo(index) {
    if (!visibleTextContent.length) return
    sessionId += 1
    const mySession = sessionId
    isCancelled = true
    cancelSpeech()
    currentUtterance = null
    clearHighlight()
    // set now, so a key held down or pressed again goes on from here
    currentIndex = index
    if (isPaused) {
      isCancelled = false
      highlightItem(currentIndex)
      ensureVisible(currentIndex)
      return
    }
    setTimeout(() => {
      if (mySession !== sessionId) return
      isCancelled = false
      speakNext()
    }, TIMEOUT_MS)
  }

  function prevSpan() {
    skipTo(Math.max(0, currentIndex - 1))
  }

  function nextSpan() {
    skipTo(Math.min(visibleTextContent.length - 1, currentIndex + 1))
  }

  function finishPlayback() {
    sessionId += 1
    clearHighlight()
    visibleTextSpans.forEach(s =>
      s.classList.remove(CLASS_CLICKABLE, CLASS_SENTENCES)
    )
    isPlaying = false
    isPaused = false
    currentUtterance = null
    currentIndex = 0
    playPauseBtnLabel.textContent = LABEL_PLAY
    playPauseBtnIcon.innerHTML = ICON_PLAY
    setNavControlsEnabled(false)
    updateClickableSpans()
  }

  function stopSession() {
    // Cancel any ongoing speech and reset UI/state.
    sessionId += 1
    isCancelled = true
    cancelSpeech()
    clearHighlight()
    currentUtterance = null
    isPlaying = false
    isPaused = false
    currentIndex = 0
    playPauseBtnLabel.textContent = LABEL_PLAY
    playPauseBtnIcon.innerHTML = ICON_PLAY
    setNavControlsEnabled(false)
    updateClickableSpans()
  }

  /**
   * Where a fresh start reads from - the item in the middle of the screen, so it goes on from wherever the
   * reader has scrolled to, or the first one while the start of the text is still on screen
   */
  function startIndex() {
    const middle = readingMiddle()
    let closest = 0
    let closestDistance = Infinity
    let seenFirst = false
    for (let i = 0; i < visibleTextSpans.length; i++) {
      const rect = (
        visibleTextRanges[i] || visibleTextSpans[i]
      ).getBoundingClientRect()
      if (!rect.height) continue
      if (!seenFirst) {
        seenFirst = true
        if (rect.bottom > 0) return 0
      }
      // the first in reading order, as side by side texts put two items at the same height
      if (rect.top <= middle && rect.bottom >= middle) return i
      const distance = Math.min(
        Math.abs(rect.top - middle),
        Math.abs(rect.bottom - middle)
      )
      if (distance < closestDistance) {
        closest = i
        closestDistance = distance
      }
      // everything after is further down
      if (rect.top > middle) break
    }
    return closest
  }

  // single button behavior
  function togglePlayPause() {
    if (isPaused) return resumeSession()
    if (isPlaying) return pauseSession()
    // What's visible now is what the session reads, whatever the view does after
    computeVisibleText()
    startSessionFrom(startIndex())
  }

  // wire listeners
  if (prevBtn) prevBtn.addEventListener('click', prevSpan)
  playPauseBtn.addEventListener('click', togglePlayPause)
  if (nextBtn) nextBtn.addEventListener('click', nextSpan)
  if (stopBtn) stopBtn.addEventListener('click', stopSession)

  const articleEl = document.querySelector('main > article, main > section')

  // The element of visibleTextSpans the target is in, if any
  function itemElementAt(target) {
    // for segmented texts this will work
    let element = target && target.closest ? target.closest('span.text') : null
    if (element) return element

    // for non-segmented texts, check if it's one of the visibleTextSpans
    // ignore reference links
    if (!target || !target.closest || target.closest('.ref')) return null

    element = target
    // Walk up the tree to find if we're inside a visibleTextSpan
    while (element && !visibleTextSpans.includes(element)) {
      element = element.parentElement
      if (element === articleEl) return null
    }
    return element
  }

  // A non segmented paragraph holds several sentences, so the one under the pointer is found from where it is
  function indexAtPoint(element, ev) {
    const first = visibleTextSpans.indexOf(element)
    if (first < 0 || !visibleTextRanges[first]) return first

    let node, offset
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY)
      node = pos?.offsetNode
      offset = pos?.offset
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(ev.clientX, ev.clientY)
      node = range?.startContainer
      offset = range?.startOffset
    }
    if (!node) return first

    let last = first
    for (let i = first; visibleTextSpans[i] === element; i++) {
      last = i
      try {
        // the first sentence not wholly before the click, so a click between two picks the next
        if (visibleTextRanges[i].comparePoint(node, offset) <= 0) return i
      } catch (e) {
        return first
      }
    }
    return last
  }

  // allow clicking any visibleTextSpans to jump/start speaking from there
  if (articleEl)
    articleEl.addEventListener('click', ev => {
      // Only allow click-to-jump once playback has already started
      if (!isPlaying) return

      const clickedElement = itemElementAt(ev.target)
      if (!clickedElement) return

      // -1 for text shown since the session started, which isn't read
      const idx = indexAtPoint(clickedElement, ev)
      if (idx < 0) return

      // cancel current session/utterances and start from clicked index
      sessionId += 1
      isCancelled = true
      cancelSpeech()
      clearHighlight()

      setTimeout(() => {
        isCancelled = false
        // reuse existing start logic to initialize state and begin speaking
        startSessionFrom(idx)
      }, TIMEOUT_MS)
    })

  // Hovering a non segmented paragraph shows which sentence a click would jump to, as segmented texts do with
  // .tts-clickable:hover. The hover is drawn on the sentence's Range, as it has no element of its own
  let hoverFrame = null
  function clearHover() {
    if (canHighlightRanges) CSS.highlights.delete(HOVER_HIGHLIGHT_NAME)
  }
  if (articleEl && canHighlightRanges) {
    articleEl.addEventListener('mousemove', ev => {
      if (hoverFrame) return
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = null
        const element = isPlaying ? itemElementAt(ev.target) : null
        const range = element && visibleTextRanges[indexAtPoint(element, ev)]
        if (range) {
          CSS.highlights.set(HOVER_HIGHLIGHT_NAME, new Highlight(range))
        } else {
          clearHover()
        }
      })
    })
    articleEl.addEventListener('mouseleave', clearHover)
  }

  if (pitch) {
    pitchValue.textContent = pitch.valueAsNumber.toFixed(1)
    pitch.addEventListener(
      'change',
      () => (pitchValue.textContent = pitch.valueAsNumber.toFixed(1))
    )
  }
  if (rate) {
    rateValue.textContent = rate.valueAsNumber.toFixed(1)
    rate.addEventListener(
      'change',
      () => (rateValue.textContent = rate.valueAsNumber.toFixed(1))
    )
  }

  // initial nav state
  setNavControlsEnabled(false)

  // debug helper
  window._scx_listen = {
    getState() {
      return {
        isPlaying,
        isCancelled,
        currentIndex,
        sessionId,
        isPaused,
        paused: synth.paused,
        speaking: synth.speaking,
      }
    },
    items() {
      return visibleTextContent.slice()
    },
    cancel() {
      sessionId += 1
      isCancelled = true
      try {
        synth.cancel()
      } catch (e) {}
    },
  }
})()

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
  const CLASS_SENTENCES = 'tts-sentences'
  const LABEL_PLAY = 'Play'
  const LABEL_PAUSE = 'Pause'
  const LABEL_RESUME = 'Play'
  const ICON_PLAY = '▶️'
  const ICON_PAUSE = '⏸️'
  const ICON_RESUME = '▶️'

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
  let currentIndex = 0
  let isCancelled = false
  let isPlaying = false // denotes an active session (playing or paused)
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
  const playPauseBtnLabel = playPauseBtn.getElementsByTagName('span')[1]
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
  rootMenuEl.querySelectorAll('li[role="menuitem"]').forEach(el => {
    el.style.display = 'flex'
  })

  const textLang =
    document.querySelector('main > article')?.lang ||
    document.documentElement.lang ||
    undefined
  let sentenceSegmenter = null
  try {
    sentenceSegmenter = new Intl.Segmenter(textLang, {
      granularity: 'sentence',
    })
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

    function pointAt(offset, isEnd) {
      const found = nodes.find(({ node, start }) =>
        isEnd
          ? offset <= start + node.data.length
          : offset < start + node.data.length
      )
      return found ? [found.node, offset - found.start] : null
    }

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
      return [{ text: trimmed.replace(/\n/g, ' '), range }]
    })
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
      blocks.forEach(block => {
        splitIntoSentences(block).forEach(({ text, range }) => {
          visibleTextSpans.push(block)
          visibleTextContent.push(text)
          visibleTextRanges.push(range)
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

  function ensureVisible(index) {
    if (!autoScrollToggle) return
    if (!autoScrollToggle.checked) return
    const el = visibleTextSpans[index]
    if (!el) return
    try {
      // a sentence is centred itself, as its paragraph can be taller than the screen
      const rect = visibleTextRanges[index]?.getBoundingClientRect()
      if (rect && rect.height) {
        window.scrollBy({
          top: rect.top + rect.height / 2 - window.innerHeight / 2,
          behavior: 'smooth',
        })
        return
      }
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    } catch (e) {}
  }

  // Highlights just the sentence where the browser can, otherwise the whole element it's in
  function highlightItem(index) {
    const range = visibleTextRanges[index]
    if (range && canHighlightRanges) {
      const highlight = new Highlight(range)
      // above the hover, which is set after it
      highlight.priority = 1
      CSS.highlights.set(HIGHLIGHT_NAME, highlight)
    } else {
      visibleTextSpans[index]?.classList.add(CLASS_HIGHLIGHT)
    }
  }

  function clearHighlight() {
    if (canHighlightRanges) CSS.highlights.delete(HIGHLIGHT_NAME)
    visibleTextSpans.forEach(s => s.classList.remove(CLASS_HIGHLIGHT))
  }

  function updatePlayPauseLabel() {
    if (synth.paused) {
      playPauseBtnLabel.textContent = LABEL_RESUME
      playPauseBtnIcon.textContent = ICON_RESUME
      return
    }
    if (synth.speaking && !synth.paused) {
      playPauseBtnLabel.textContent = LABEL_PAUSE
      playPauseBtnIcon.textContent = ICON_PAUSE
      return
    }
    playPauseBtnLabel.textContent = LABEL_PLAY
    playPauseBtnIcon.textContent = ICON_PLAY
  }

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

    // Sort languages alphabetically
    const langs = Array.from(byLang.keys()).sort((a, b) => {
      const aa = (a || '').toUpperCase()
      const bb = (b || '').toUpperCase()
      if (aa < bb) return -1
      if (aa === bb) return 0
      return 1
    })

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

    // Determine preferred voice to select: default voice first, otherwise match browser lang
    const defaultVoice = voices.find(v => v.default)
    const browserLang = (
      navigator.language ||
      navigator.userLanguage ||
      ''
    ).toString()
    const primaryBrowserLang = browserLang.split('-')[0]
    let suitableVoiceName = defaultVoice ? defaultVoice.name : null

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
      group.label = lang
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

    const utter = new SpeechSynthesisUtterance(text)
    utter._session = mySession
    currentUtterance = utter

    utter.onstart = () => {
      if (utter._session !== sessionId) return
      highlightItem(currentIndex)
      ensureVisible(currentIndex)
      // immediate label update when speech starts
      updatePlayPauseLabel()
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
      if (synth.paused) {
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
    computeVisibleText()
    if (!visibleTextContent.length || !visibleTextSpans.length) return
    sessionId += 1
    isCancelled = false
    isPlaying = true
    currentIndex = Math.max(0, Math.min(index, visibleTextContent.length - 1))
    playPauseBtnLabel.textContent = LABEL_PAUSE
    playPauseBtnIcon.textContent = ICON_PAUSE
    setNavControlsEnabled(true)
    updateClickableSpans()
    // Reset stuck paused state (Safari/Brave keep synth.paused=true after cancel)
    if (synth.paused) {
      try {
        synth.cancel()
      } catch (e) {}
      try {
        synth.resume()
      } catch (e) {}
    }
    speakNext()
  }

  function pauseSession() {
    if (synth.speaking && !synth.paused) {
      try {
        synth.pause()
        // set label immediately for UI responsiveness
        playPauseBtnLabel.textContent = LABEL_RESUME
        playPauseBtnIcon.textContent = ICON_RESUME
        return
      } catch (err) {
        console.error('pause failed', err)
      }
    }
    updateClickableSpans()
  }

  function resumeSession() {
    if (synth.paused) {
      try {
        synth.resume()
        // set label immediately for UI responsiveness
        playPauseBtnLabel.textContent = LABEL_PAUSE
        playPauseBtnIcon.textContent = ICON_PAUSE
      } catch (err) {
        console.error('resume failed', err)
      }
    } else if (
      !synth.speaking &&
      !isCancelled &&
      currentIndex < visibleTextContent.length
    ) {
      // nothing is speaking but we have work to do
      speakNext()
      playPauseBtnLabel.textContent = LABEL_PAUSE
      playPauseBtnIcon.textContent = ICON_PAUSE
    }
    updateClickableSpans()
  }

  function prevSpan() {
    computeVisibleText()
    if (!visibleTextContent.length) return
    const newIndex = Math.max(0, currentIndex - 1)
    sessionId += 1
    isCancelled = true
    try {
      synth.cancel()
    } catch (e) {}
    clearHighlight()
    setTimeout(() => {
      if (sessionId == null) return
      isCancelled = false
      currentIndex = newIndex
      if (isPlaying && !synth.paused) {
        speakNext()
      } else {
        highlightItem(currentIndex)
        ensureVisible(currentIndex)
        updatePlayPauseLabel()
      }
    }, TIMEOUT_MS)
  }

  function nextSpan() {
    computeVisibleText()
    if (!visibleTextContent.length) return
    const newIndex = Math.min(visibleTextContent.length - 1, currentIndex + 1)
    sessionId += 1
    isCancelled = true
    try {
      synth.cancel()
    } catch (e) {}
    clearHighlight()
    setTimeout(() => {
      if (sessionId == null) return
      isCancelled = false
      currentIndex = newIndex
      if (isPlaying && !synth.paused) {
        speakNext()
      } else {
        highlightItem(currentIndex)
        ensureVisible(currentIndex)
        updatePlayPauseLabel()
      }
    }, TIMEOUT_MS)
  }

  function finishPlayback() {
    sessionId += 1
    clearHighlight()
    visibleTextSpans.forEach(s =>
      s.classList.remove(CLASS_CLICKABLE, CLASS_SENTENCES)
    )
    isPlaying = false
    currentUtterance = null
    currentIndex = 0
    playPauseBtnLabel.textContent = LABEL_PLAY
    playPauseBtnIcon.textContent = ICON_PLAY
    setNavControlsEnabled(false)
    updateClickableSpans()
  }

  function stopSession() {
    // Cancel any ongoing speech and reset UI/state.
    sessionId += 1
    isCancelled = true
    try {
      synth.cancel()
    } catch (e) {}
    clearHighlight()
    currentUtterance = null
    isPlaying = false
    currentIndex = 0
    playPauseBtnLabel.textContent = LABEL_PLAY
    playPauseBtnIcon.textContent = ICON_PLAY
    setNavControlsEnabled(false)
    updateClickableSpans()
  }

  // single button behavior
  function togglePlayPause() {
    // Check state first — synth.paused can be stale after cancel() in Safari/Brave
    if (!isPlaying) {
      startSessionFrom(currentIndex || 0)
      return
    }
    if (synth.paused) {
      // if paused, resume immediately and update label
      resumeSession()
      return
    }
    if (isPlaying && synth.speaking && !synth.paused) {
      // pause immediately and update label
      pauseSession()
      return
    }
    // if idle but there's remaining content, continue
    if (
      !synth.speaking &&
      !isCancelled &&
      currentIndex < visibleTextContent.length
    ) {
      isPlaying = true
      playPauseBtnLabel.textContent = LABEL_PAUSE
      playPauseBtnIcon.textContent = ICON_PAUSE
      updateClickableSpans()
      speakNext()
    }
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

      computeVisibleText()
      const idx = indexAtPoint(clickedElement, ev)
      if (idx < 0) return

      // cancel current session/utterances and start from clicked index
      sessionId += 1
      isCancelled = true
      try {
        synth.cancel()
      } catch (e) {}
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

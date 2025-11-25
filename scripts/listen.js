;(function () {
  'use strict'

  // Configurable constants
  const TIMEOUT_MS = 60
  const CLASS_HIGHLIGHT = 'tts-highlight'
  const CLASS_CLICKABLE = 'tts-clickable'
  const LABEL_PLAY = 'Play'
  const LABEL_PAUSE = 'Pause'
  const LABEL_RESUME = 'Play'
  const ICON_PLAY = '▶️'
  const ICON_PAUSE = '⏸️'
  const ICON_RESUME = '▶️'

  const synth = window.speechSynthesis

  // state
  let voices = []
  let visibleTextSpans = []
  let visibleTextContent = []
  let currentIndex = 0
  let isCancelled = false
  let isPlaying = false // denotes an active session (playing or paused)
  let currentUtterance = null
  let sessionId = 0

  // DOM
  const menuButton = document.getElementById('listen-menu-button')
  const rootMenuEl = document.getElementById('listen-menu')
  const voiceSelect = document.getElementById('voice-select')
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

  // basic sanity
  if (!rootMenuEl) {
    console.warn('listen.js: required controls missing; aborting init.')
    return
  }

  // enable all the controls (they are disabled by default to show fallback text if user has JS turned off)
  rootMenuEl.style.maxWidth = '100vw'
  rootMenuEl.querySelectorAll('li[role="menuitem"]').forEach((el) => {
    el.style.display = 'flex'
  })

  function computeVisibleText() {
    // for segmented texts
    visibleTextSpans = Array.from(
      document.querySelectorAll('main > article span.text')
    ).filter((s) => s.offsetParent !== null && s.textContent)

    visibleTextContent = visibleTextSpans?.map((s) =>
      s.textContent.replace(/\n/g, '')
    )

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
        .map((e) => `main > article ${e}`)
        .join(', ')
      const allVisibleElements = Array.from(
        document.querySelectorAll(selector)
      ).filter((s) => s.offsetParent !== null && s.textContent)

      function getUniqueSelector(node, root) {
        const path = []
        let current = node
        while (current && current !== root) {
          let index = 0
          let sibling = current
          while ((sibling = sibling.previousElementSibling)) {
            if (sibling.tagName === current.tagName) index++
          }
          path.unshift(
            `${current.tagName.toLowerCase()}:nth-of-type(${index + 1})`
          )
          current = current.parentElement
        }
        return path.join(' > ')
      }

      visibleTextSpans = allVisibleElements.filter((el) => {
        // avoid duplicates
        return !allVisibleElements.some(
          (other) => other !== el && other.contains(el)
        )
      })

      visibleTextContent = visibleTextSpans.map((el) => {
        const clone = el.cloneNode(true)

        // remove all .ref elements from the clone
        const refElements = clone.querySelectorAll('.ref')
        refElements.forEach((ref) => ref.remove())

        // Find all descendants in the clone and check if corresponding original is hidden
        const allDescendants = clone.querySelectorAll('*')
        Array.from(allDescendants).forEach((cloneDesc) => {
          const selector = getUniqueSelector(cloneDesc, clone)
          const originalDesc = el.querySelector(selector)
          if (originalDesc && originalDesc.offsetParent === null) {
            cloneDesc.remove()
          }
        })

        return clone.textContent.replace(/\n/g, '')
      })
    }
  }

  function updateClickableSpans() {
    if (!visibleTextSpans || !visibleTextSpans.length) return
    if (isPlaying) {
      visibleTextSpans.forEach((s) => s.classList.add(CLASS_CLICKABLE))
    } else {
      visibleTextSpans.forEach((s) => s.classList.remove(CLASS_CLICKABLE))
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
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest',
      })
    } catch (e) {}
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
      typeof synth.getVoices === 'function' ? synth.getVoices().slice() : []

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
    const defaultVoice = voices.find((v) => v.default)
    const browserLang = (
      navigator.language ||
      navigator.userLanguage ||
      ''
    ).toString()
    const primaryBrowserLang = browserLang.split('-')[0]
    let suitableVoiceName = defaultVoice ? defaultVoice.name : null

    if (!suitableVoiceName && browserLang) {
      // find first voice matching full lang, then primary subtag
      let found = voices.find((v) => v.lang === browserLang)
      if (!found)
        found = voices.find(
          (v) => v.lang && v.lang.startsWith(primaryBrowserLang)
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
      visibleTextSpans[currentIndex]?.classList.add(CLASS_HIGHLIGHT)
      ensureVisible(currentIndex)
      // immediate label update when speech starts
      updatePlayPauseLabel()
    }

    utter.onend = () => {
      if (utter._session !== sessionId) return
      visibleTextSpans[currentIndex]?.classList.remove(CLASS_HIGHLIGHT)
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

    utter.onerror = (ev) => {
      if (utter._session !== sessionId) return
      console.error('SpeechSynthesisUtterance error', ev)
      visibleTextSpans[currentIndex]?.classList.remove(CLASS_HIGHLIGHT)
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
      const v = voices.find((x) => x.name === selected)
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
    visibleTextSpans.forEach((s) => s.classList.remove(CLASS_HIGHLIGHT))
    setTimeout(() => {
      if (sessionId == null) return
      isCancelled = false
      currentIndex = newIndex
      if (isPlaying && !synth.paused) {
        speakNext()
      } else {
        visibleTextSpans[currentIndex]?.classList.add(CLASS_HIGHLIGHT)
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
    visibleTextSpans.forEach((s) => s.classList.remove(CLASS_HIGHLIGHT))
    setTimeout(() => {
      if (sessionId == null) return
      isCancelled = false
      currentIndex = newIndex
      if (isPlaying && !synth.paused) {
        speakNext()
      } else {
        visibleTextSpans[currentIndex]?.classList.add(CLASS_HIGHLIGHT)
        ensureVisible(currentIndex)
        updatePlayPauseLabel()
      }
    }, TIMEOUT_MS)
  }

  function finishPlayback() {
    sessionId += 1
    visibleTextSpans.forEach((s) => {
      s.classList.remove(CLASS_HIGHLIGHT)
      s.classList.remove(CLASS_CLICKABLE)
    })
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
    visibleTextSpans.forEach((s) => {
      s.classList.remove(CLASS_HIGHLIGHT)
    })
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
    // not started -> start session from currentIndex (or 0)
    if (!isPlaying) {
      startSessionFrom(currentIndex || 0)
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

  // allow clicking any visibleTextSpans to jump/start speaking from there
  const articleEl = document.querySelector('main > article, main > section')
  if (articleEl)
    articleEl.addEventListener('click', (ev) => {
      // Only allow click-to-jump once playback has already started
      if (!isPlaying) return

      // find the nearest element that was clicked
      // for segmented texts this will work
      let clickedElement =
        ev.target && ev.target.closest ? ev.target.closest('span.text') : null

      // for non-segmented texts, check if it's one of the visibleTextSpans
      if (!clickedElement) {
        // ignore reference link clicks
        if (ev.target.closest('.ref')) return

        clickedElement = ev.target
        // Walk up the tree to find if we're inside a visibleTextSpan
        while (clickedElement && !visibleTextSpans.includes(clickedElement)) {
          clickedElement = clickedElement.parentElement
          if (clickedElement === articleEl) {
            clickedElement = null
            break
          }
        }
      }

      if (!clickedElement) return

      computeVisibleText()
      const idx = visibleTextSpans.indexOf(clickedElement)
      if (idx < 0) return

      // cancel current session/utterances and start from clicked index
      sessionId += 1
      isCancelled = true
      try {
        synth.cancel()
      } catch (e) {}
      visibleTextSpans.forEach((s) => s.classList.remove(CLASS_HIGHLIGHT))

      setTimeout(() => {
        isCancelled = false
        // reuse existing start logic to initialize state and begin speaking
        startSessionFrom(idx)
      }, TIMEOUT_MS)
    })

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
    cancel() {
      sessionId += 1
      isCancelled = true
      try {
        synth.cancel()
      } catch (e) {}
    },
  }
})()

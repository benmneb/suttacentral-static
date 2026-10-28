/**
 * User Preferences Handler
 *
 * Persists UI control states (checkboxes, sliders, selects) for Speech Synthesis
 * and text view settings (comments, segments, root text) to localStorage.
 * Automatically saves on user interaction.
 *
 * The voice is kept per text language. View settings a .net link carries in its query apply to that page only,
 * until the reader changes one.
 *
 * @requires localStorage
 */
;(function () {
  'use strict'

  const IDS = [
    'commenter',
    'commenter-inline',
    'commenter-side',
    'rooter',
    'rooter-first',
    'rooter-side',
    'definer',
    'simplifier',
    'segmenter',
    'segmenter-main',
    'segmenter-pts',
    'segmenter-others',
    'illustrator',
    'highlighter',
    'paralleler',
    'positioner',
    'rate',
    'pitch',
    'auto-scroll',
  ]

  const STORAGE_KEY = 'user-prefs'

  const voiceKey = lang => `voice-${(lang || '').split('-')[0].toLowerCase()}`
  const VOICE_KEY = voiceKey(
    document.getElementById('listen-menu')?.dataset.textLang
  )

  /**
   * Get stored preferences from localStorage
   * @returns {Object} Parsed preferences object or empty object if none exist
   */
  function getStoredPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    } catch (e) {
      console.error('Failed to parse stored prefs:', e)
      return {}
    }
  }

  /**
   * Load stored preferences into existing elements.
   */
  function load() {
    const saved = getStoredPrefs()

    // Off unless chosen without popovers, where notes show inline
    const commenter = document.getElementById('commenter')
    if (
      commenter instanceof HTMLInputElement &&
      !('popover' in HTMLElement.prototype)
    )
      commenter.checked = false

    IDS.forEach(id => {
      const el = document.getElementById(id)
      if (!el || !(id in saved)) return

      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        el.checked = !!saved[id]
        return
      }

      // inputs with value
      if ('value' in el) {
        el.value = saved[id]
      }
    })
  }

  function setStoredPrefs(prefs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch (e) {
      console.error('Failed to save preferences:', e)
    }
  }

  /**
   * A voice saved before they were kept per language becomes its own language's voice
   */
  function migrateVoice() {
    const prefs = getStoredPrefs()
    const name = prefs['voice-select']
    if (!name) return
    const voices = window.speechSynthesis?.getVoices() ?? []
    if (!voices.length) return
    const voice = voices.find(v => v.name === name)
    // Gone from the device, so it has no language to go to
    if (voice) {
      const key = voiceKey(voice.lang)
      if (!(key in prefs)) prefs[key] = name
    }
    delete prefs['voice-select']
    setStoredPrefs(prefs)
    applyVoice(prefs)
  }

  /**
   * Hands the listen script this language's voice
   */
  function applyVoice(prefs) {
    const el = document.getElementById('voice-select')
    if (!el || !(VOICE_KEY in prefs)) return
    el.dataset.saved = prefs[VOICE_KEY]
    const opt = [...el.options].find(o => o.dataset.name === prefs[VOICE_KEY])
    if (opt) el.value = opt.value
  }

  /** Saves the voice for this language, when the reader picks it */
  function saveVoice() {
    const el = document.getElementById('voice-select')
    const name = el?.options[el.selectedIndex]?.dataset.name
    if (!name) return
    const prefs = getStoredPrefs()
    prefs[VOICE_KEY] = name
    setStoredPrefs(prefs)
    el.dataset.saved = name
  }

  // The editions .net's reference param can name, as in helpers/referenceEditions.js
  const REFERENCE_EDITIONS = [
    'bj',
    'cck',
    'csp',
    'dr',
    'km',
    'lv',
    'maku',
    'mc',
    'mr',
    'ms',
    'ndp',
    'pts',
    'si',
    'sya',
    'vri',
  ]

  /**
   * The view settings a .net link carries in its query, eg ?layout=sidebyside&reference=main/pts, and which
   * param set each, so changing one undoes the whole param. Values are .net's own, from `_setTextViewState` in
   * sc-text-bilara.js, and anything else is ignored
   */
  function getUrlPrefs(params) {
    const prefs = {}
    const sources = {}
    const get = name => params.get(name)?.toLowerCase()
    const set = (param, values) => {
      Object.assign(prefs, values)
      for (const key in values) sources[key] = param
    }

    switch (get('layout')) {
      case 'plain':
        set('layout', { rooter: false })
        break
      case 'sidebyside':
        set('layout', { rooter: true, 'rooter-side': true })
        break
      case 'linebyline':
        set('layout', { rooter: true, 'rooter-side': false })
        break
    }

    switch (get('notes')) {
      case 'none':
        set('notes', { commenter: false })
        break
      case 'asterisk':
        set('notes', {
          commenter: true,
          'commenter-inline': false,
          'commenter-side': false,
        })
        break
      // Margin notes are a kind of inline note here
      case 'sidenotes':
        set('notes', {
          commenter: true,
          'commenter-inline': true,
          'commenter-side': true,
        })
        break
    }

    const highlight = get('highlight')
    if (highlight === 'true' || highlight === 'false') {
      set('highlight', { highlighter: highlight === 'true' })
    }

    const refs = (get('reference') ?? '')
      .split('/')
      .filter(
        ref =>
          ref === 'main' || ref === 'none' || REFERENCE_EDITIONS.includes(ref)
      )
    const shown = refs.filter(ref => ref !== 'none')
    if (shown.length) {
      set('reference', {
        segmenter: true,
        'segmenter-main': shown.includes('main'),
        'segmenter-pts': shown.includes('pts'),
        'segmenter-others': shown.some(ref => ref !== 'main' && ref !== 'pts'),
      })
    } else if (refs.length) {
      set('reference', { segmenter: false })
    }

    return { prefs, sources }
  }

  /** Over the stored prefs, for this page only */
  function applyUrlPrefs() {
    const { prefs, sources } = getUrlPrefs(new URLSearchParams(location.search))
    for (const id in prefs) {
      const el = document.getElementById(id)
      if (!(el instanceof HTMLInputElement)) continue
      el.checked = prefs[id]
      el.dataset.fromUrl = sources[id]
    }
  }

  /** A setting the link chose that the reader changes is theirs now, so the param leaves the address */
  function claimFromUrl(param) {
    if (!param) return
    document
      .querySelectorAll(`[data-from-url="${param}"]`)
      .forEach(el => delete el.dataset.fromUrl)
    const url = new URL(location.href)
    url.searchParams.delete(param)
    history.replaceState(history.state, '', url)
  }

  /**
   * Save current state of elements found on this page, but not those a link's query chose.
   */
  function save() {
    const prefs = getStoredPrefs()

    IDS.forEach(id => {
      const el = document.getElementById(id)
      if (!el || 'fromUrl' in el.dataset) return

      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        prefs[id] = el.checked
        return
      }

      // inputs with value
      if ('value' in el) {
        prefs[id] = el.value
      }
    })

    setStoredPrefs(prefs)
  }

  /**
   * Set up listeners for all elements present on the current page.
   */
  function init() {
    IDS.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      el.addEventListener(el.type === 'range' ? 'input' : 'change', () => {
        claimFromUrl(el.dataset.fromUrl)
        save()
      })
    })
    document
      .getElementById('voice-select')
      ?.addEventListener('change', saveVoice)
  }

  load()
  applyUrlPrefs()
  init()
  applyVoice(getStoredPrefs())
  migrateVoice()
  window.speechSynthesis?.addEventListener?.('voiceschanged', migrateVoice)
})()

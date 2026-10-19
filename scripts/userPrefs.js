/**
 * User Preferences Handler
 *
 * Persists UI control states (checkboxes, sliders, selects) for Speech Synthesis
 * and text view settings (comments, segments, root text) to localStorage.
 * Automatically saves on user interaction.
 *
 * The voice is kept per text language.
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
    'segmenter',
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

  /**
   * Save current state of elements found on this page.
   */
  function save() {
    const prefs = getStoredPrefs()

    IDS.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return

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
      el.addEventListener(el.type === 'range' ? 'input' : 'change', save)
    })
    document
      .getElementById('voice-select')
      ?.addEventListener('change', saveVoice)
  }

  load()
  init()
  applyVoice(getStoredPrefs())
  migrateVoice()
  window.speechSynthesis?.addEventListener?.('voiceschanged', migrateVoice)
})()

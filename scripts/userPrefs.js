/**
 * User Preferences Handler
 *
 * Persists UI control states (checkboxes, sliders, selects) for Speech Synthesis
 * and text view settings (comments, segments, root text) to localStorage.
 * Automatically saves on user interaction.
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
    'voice-select',
    'rate',
    'pitch',
    'auto-scroll',
  ]

  const STORAGE_KEY = 'user-prefs'

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
   * Wait for the voice-select element to be populated with options.
   * These can load asynchronously from SpeechSynthesis API,
   * so may not be immediately available.
   * Polls every 50ms until options are available or 5 seconds elapse.
   *
   * @returns {Promise<void>} Resolves when options are populated or element doesn't exist
   */
  function waitForVoiceSelect() {
    return new Promise(resolve => {
      const voiceSelect = document.getElementById('voice-select')
      if (!voiceSelect) {
        resolve()
        return
      }

      if (voiceSelect.options.length > 1) {
        resolve()
        return
      }

      let elapsed = 0
      const interval = setInterval(() => {
        elapsed += 50
        if (voiceSelect.options.length > 1) {
          clearInterval(interval)
          resolve()
        } else if (elapsed >= 5000) {
          clearInterval(interval)
          console.warn('Timeout waiting for voice-select options')
          resolve()
        }
      }, 50)
    })
  }

  /**
   * Load stored preferences (except voice-select) into existing elements.
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

  /**
   * Load voice-select preference once options are available
   */
  function loadVoiceSelect() {
    const el = document.getElementById('voice-select')
    if (!el) return

    const saved = getStoredPrefs()
    if (!('voice-select' in saved)) return

    const wanted = saved['voice-select']
    const opt = [...el.options].find(o => o.dataset.name === wanted)
    if (opt) el.value = opt.value
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

      if (el instanceof HTMLSelectElement) {
        const opt = el.options[el.selectedIndex]
        prefs[id] = opt.dataset.name
        return
      }

      // inputs with value
      if ('value' in el) {
        prefs[id] = el.value
      }
    })

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch (e) {
      console.error('Failed to save preferences:', e)
    }
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
  }

  load()
  init()
  waitForVoiceSelect().then(loadVoiceSelect)
})()

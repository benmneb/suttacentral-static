/**
 * User Preferences Handler
 *
 * Persists UI control states (checkboxes, sliders, selects) to localStorage
 * and restores them on page load. Automatically saves on user interaction.
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
    'rate-value',
    'pitch',
    'pitch-value',
    'auto-scroll',
  ]

  const STORAGE_KEY = 'user-prefs'

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) return

      const prefs = JSON.parse(saved)
      IDS.forEach(id => {
        const el = document.getElementById(id)
        if (!el || !(id in prefs)) return

        if (el.type === 'checkbox') {
          el.checked = prefs[id]
        } else {
          el.value = prefs[id]
        }
      })
    } catch (e) {
      console.error('Failed to load preferences:', e)
    }
  }

  function save() {
    try {
      const prefs = {}
      IDS.forEach(id => {
        const el = document.getElementById(id)
        if (!el) return
        prefs[id] = el.type === 'checkbox' ? el.checked : el.value
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch (e) {
      console.error('Failed to save preferences:', e)
    }
  }

  function init() {
    IDS.forEach(id => {
      const el = document.getElementById(id)
      if (!el) return
      el.addEventListener(el.type === 'range' ? 'input' : 'change', save)
    })
  }

  load()
  init()
})()

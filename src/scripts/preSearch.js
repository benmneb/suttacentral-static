/**
 * Pre-Search Setup
 *
 * Configures search form behavior when JavaScript is enabled. Converts the
 * fallback external search form into a client-side search form by updating
 * form attributes and preventing default submission. This runs on all pages
 * to prepare the search dialog for potential use.
 *
 * Without JS: Form submits to external search (limited to this domain) with hidden input field
 * With JS: Form submits to /search page with query parameter for client-side search
 *
 * Also adds `Cmd (Mac) or Ctrl (Windows/Linux) + K` shortcut for opening the search dialog, and S, / and ] as on
 * .net, unless a text's Hot keys setting is off
 *
 * @module preSearch
 */
;(function () {
  'use strict'

  const input = document.getElementById('search-input')
  const form = document.getElementById('search-form')
  const dialog = document.getElementById('search-modal')

  if (form) {
    form.action = '/search'
    form.querySelector('input[type="hidden"]')?.remove()
  }
  if (input) input.name = 'query'

  // Not the link's own jump, after which Firefox drops focus for a caret, which on a text lands in a hidden
  // segment number, so Tab starts again from the top. Focused before the scroll, so the link's bar is gone by then
  const skip = document.querySelector('body > .skip')
  skip?.addEventListener('click', event => {
    const target = document.getElementById(skip.hash.slice(1))
    if (!target) return
    event.preventDefault()
    target.tabIndex = -1
    target.focus({ preventScroll: true })
    target.scrollIntoView()
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), {
      once: true,
    })
  })

  // As on .net, unless a text's Hot keys setting is off
  function hotkey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false
    if (!['/', 's', 'S', ']'].includes(event.key)) return false
    const shortcutter = document.getElementById('shortcutter')
    if (shortcutter instanceof HTMLInputElement && !shortcutter.checked)
      return false
    const target = event.target
    return !(
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.matches(
          'input:not([type="checkbox"], [type="range"]), textarea, select'
        ))
    )
  }

  document.addEventListener('keydown', event => {
    const toggle = (event.metaKey || event.ctrlKey) && event.key === 'k'
    if ((!toggle && !hotkey(event)) || !(dialog ?? input)) return
    event.preventDefault()
    if (!dialog) return input.focus()
    if (!dialog.open) dialog.showModal()
    else if (toggle) dialog.close()
  })

  if (!dialog) return

  // Invoker commands and closedby are too new for some targets
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    document
      .querySelectorAll('button[commandfor="search-modal"]')
      .forEach(button =>
        button.addEventListener('click', () => dialog.showModal())
      )
  }
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close()
    })
  }

  // Safari's search field keeps Escape from the dialog, even once empty
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !input?.value) dialog.close()
  })
})()

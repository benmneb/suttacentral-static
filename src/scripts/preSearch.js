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
 * Also adds `Cmd (Mac) or Ctrl (Windows/Linux) + K` shortcut for opening the search dialog
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

  // Moves focus to the skip link's target before the jump, so the link's bar is gone by then.
  // Otherwise Firefox and Safari land the jump short by the bar's height
  const skip = document.querySelector('body > .skip')
  skip?.addEventListener('click', () => {
    const target = document.getElementById(skip.hash.slice(1))
    if (!target) return
    target.tabIndex = -1
    target.focus({ preventScroll: true })
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), {
      once: true,
    })
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

  document.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      if (dialog.open) dialog.close()
      else dialog.showModal()
    }
  })
})()

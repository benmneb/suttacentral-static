/**
 * Pre-Search Setup
 *
 * Configures search form behavior when JavaScript is enabled. Converts the
 * fallback external search form into a client-side search form by updating
 * form attributes and preventing default submission. This runs on all pages
 * to prepare the search modal for potential use.
 *
 * Without JS: Form submits to external search (limited to this domain) with hidden input field
 * With JS: Form submits to /search page with query parameter for client-side search
 *
 * Also adds `Cmd (Mac) or Ctrl (Windows/Linux) + K` shortcut for opening the search popover
 *
 * @module preSearch
 */
;(function () {
  'use strict'

  const button = document.querySelector('button[popovertarget="search-modal"]')
  button?.setAttribute('type', 'button')
  button?.setAttribute('title', 'Cmd/Ctrl+K')

  document
    .querySelector('form:has(button[popovertarget="search-modal"])')
    ?.addEventListener('submit', e => e.preventDefault())

  const input = document.getElementById('search-input')
  const form = document.getElementById('search-form')
  const popover = document.getElementById('search-modal')

  if (form) {
    form.action = '/search'
    form.querySelector('input[type="hidden"]')?.remove()
  }
  if (input) input.name = 'query'

  document.addEventListener('keydown', function (event) {
    if (popover && (event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault()
      popover.togglePopover()
    }
  })
})()

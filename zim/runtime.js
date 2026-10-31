/**
 * Only in the ZIM, as `scripts/zim.js`, run before the site's own scripts.
 *
 * Gives them the URL the reader serves the ZIM from, and marks `<html>` with what
 * the reader can do, for `zim.css` to hide what it can't:
 * - `zim`: scripts run
 * - `zim-speech`: the Web Speech API is there, for Listen
 * - `zim-no-fetch`: files can't be fetched, as in Kiwix Desktop 2.5, for search,
 *   word lookup and simplified Chinese
 *
 * It also keeps Kiwix's own scripts in its Android and Apple apps to the page's
 * content. Kiwix Desktop's run apart from the page, out of reach.
 */
;(function () {
  'use strict'

  const root = new URL('..', document.currentScript.src).href
  window.scxZimRoot = root

  const html = document.documentElement
  html.classList.add('zim')
  if ('speechSynthesis' in window) html.classList.add('zim-speech')

  // The apps' contents lists find headings with just this, so it gets only the page's own, not menus' and popovers'
  const HEADINGS = 'h1, h2, h3, h4, h5, h6'
  const querySelectorAll = Document.prototype.querySelectorAll
  Document.prototype.querySelectorAll = function (selectors) {
    const found = querySelectorAll.call(this, selectors)
    if (selectors !== HEADINGS) return found
    return [...found]
      .filter(
        heading =>
          heading.closest('main') && !heading.closest('[popover], dialog')
      )
      .map(heading => {
        // The apps title each with its textContent, which has the hidden segment number and root text too
        Object.defineProperty(heading, 'textContent', {
          configurable: true,
          get: () => heading.innerText.replace(/\s+/g, ' ').trim(),
        })
        return heading
      })
  }

  // Kiwix for iOS and macOS opens every <details> once a page loads, ie search's filters
  addEventListener('load', () => {
    if (typeof expandAllDetailTags === 'function') {
      window.expandAllDetailTags = () => {}
    }
  })

  if (/^https?:$/.test(location.protocol)) return
  fetch(root + 'pagefind/pagefind-entry.json').catch(() =>
    html.classList.add('zim-no-fetch')
  )
})()

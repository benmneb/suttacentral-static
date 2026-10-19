/**
 * View Settings
 *
 * Keeps the reading position when a view setting changes. Sidenotes rebuild each segment's layout, which loses
 * the browser's scroll anchor, and Safari has no scroll anchoring at all, so the first text below the menu is
 * put back where it was. Also keeps the References checkbox showing at least one group.
 */
;(function () {
  'use strict'

  const viewsMenu = document.getElementById('views-menu')
  if (!viewsMenu) return

  let anchor = null

  // Not its box, which for a block starts half a line's leading above
  function textTop(el) {
    const range = document.createRange()
    range.selectNodeContents(el)
    return (range.getClientRects()[0] ?? el.getBoundingClientRect()).top
  }

  // Has to run before the checkbox flips, as the old layout is gone after
  function rememberAnchor() {
    const texts = document.querySelectorAll('main .translation > .text')
    if (!texts.length) return
    // The screen starts below the pinned menu, as text under it can't be seen
    const menuBottom = viewsMenu
      .closest('aside')
      ?.getBoundingClientRect().bottom
    const edge = Math.max(0, menuBottom ?? 0)
    let lo = 0
    let hi = texts.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (texts[mid].getBoundingClientRect().bottom <= edge) lo = mid + 1
      else hi = mid
    }
    // Hidden ones have an empty rect, so never count
    let el = texts[lo]
    let top = Infinity
    for (const text of el.closest('.segment').querySelectorAll('.text')) {
      const rect = text.getBoundingClientRect()
      if (rect.bottom > edge && rect.top < top) {
        el = text
        top = rect.top
      }
    }
    anchor = { el, top: textTop(el) }
  }

  function restoreAnchor() {
    if (!anchor) return
    const { el, top } = anchor
    // Not window.scrollBy, which after a change this big leaves Safari blank
    const correct = () => {
      document.scrollingElement.scrollTop += textTop(el) - top
    }
    correct()
    // Again next frame, after the browser's own correction
    requestAnimationFrame(() => {
      correct()
      anchor = null
    })
  }

  viewsMenu.addEventListener('pointerdown', rememberAnchor)
  viewsMenu.addEventListener('keydown', rememberAnchor)
  viewsMenu.addEventListener('change', restoreAnchor)

  // References on always shows something
  const segmenter = document.getElementById('segmenter')
  const referenceGroups = [
    'segmenter-main',
    'segmenter-pts',
    'segmenter-others',
  ]
    .map(id => document.getElementById(id))
    .filter(el => el instanceof HTMLInputElement)

  function setChecked(el, checked) {
    el.checked = checked
    // Setting checked doesn't fire change, which saving prefs relies on
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  viewsMenu.addEventListener('change', e => {
    if (!(segmenter instanceof HTMLInputElement) || !referenceGroups.length)
      return
    if (!segmenter.checked || referenceGroups.some(el => el.checked)) return
    if (e.target === segmenter) setChecked(referenceGroups[0], true)
    else if (referenceGroups.includes(e.target)) setChecked(segmenter, false)
  })
})()

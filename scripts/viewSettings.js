/**
 * View Settings
 *
 * Keeps the reading position when a view setting changes. Sidenotes rebuild each segment's layout, which loses
 * the browser's scroll anchor, and Safari has no scroll anchoring at all, so the first text below the menu is
 * put back where it was. Also keeps the References checkbox showing at least one group, and toggles the
 * settings from the keyboard, with the same keys as .net and a few more.
 */
;(function () {
  'use strict'

  const VIEW_SETTINGS = {
    n: ['commenter', 'commenter-inline', 'commenter-side'],
    v: ['rooter', 'rooter-side'],
    f: ['rooter-first'],
    r: ['segmenter'],
    s: ['positioner'],
  }

  // One turned on turns on what it's under too, or the key would do nothing
  const SUB_SETTINGS = {
    m: 'segmenter-main',
    t: 'segmenter-pts',
  }

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

  function parentOf(id) {
    return document.querySelector(`#views-menu input[aria-controls~="${id}"]`)
  }

  function hasRoom(el) {
    const li = el.closest('li')
    return !!li && getComputedStyle(li).display !== 'none'
  }

  function isShown(el) {
    const parent = parentOf(el.id)
    return (
      hasRoom(el) && !(parent instanceof HTMLInputElement && !parent.checked)
    )
  }

  // Each press turns on the next in order, then all off
  function cycle(ids) {
    const els = ids
      .map(id => document.getElementById(id))
      .filter(el => el instanceof HTMLInputElement && hasRoom(el))
    if (!els.length || !isShown(els[0])) return

    rememberAnchor()
    const level = els.findIndex(el => !el.checked)
    const next = ((level === -1 ? els.length : level) + 1) % (els.length + 1)
    els.forEach((el, i) => {
      if (el.checked !== i < next) setChecked(el, i < next)
    })
  }

  function toggleSub(id) {
    const el = document.getElementById(id)
    if (!(el instanceof HTMLInputElement) || !hasRoom(el)) return
    const parent = parentOf(id)

    rememberAnchor()
    setChecked(el, !el.checked)
    if (el.checked && parent instanceof HTMLInputElement && !parent.checked)
      setChecked(parent, true)
  }

  // Set here rather than in the markup so they're only announced when they work
  const shortcuts = [
    ...Object.entries(VIEW_SETTINGS).map(([key, ids]) => [key, ids[0]]),
    ...Object.entries(SUB_SETTINGS),
  ]
  for (const [key, id] of shortcuts) {
    document
      .getElementById(id)
      ?.setAttribute('aria-keyshortcuts', key.toUpperCase())
  }

  // A fine pointer is the best guess as to whether there's a keyboard too
  if (matchMedia('(any-pointer: fine)').matches) {
    viewsMenu.classList.add('hotkeys')
  }

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const target = e.target
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.matches(
          'input:not([type="checkbox"], [type="range"]), textarea, select'
        ))
    )
      return
    const key = e.key.toLowerCase()
    if (VIEW_SETTINGS[key]) cycle(VIEW_SETTINGS[key])
    else if (SUB_SETTINGS[key]) toggleSub(SUB_SETTINGS[key])
  })
})()

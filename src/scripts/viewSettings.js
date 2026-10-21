/**
 * View Settings
 *
 * Keeps the reading position when a view setting changes. Sidenotes rebuild each segment's layout, which loses
 * the browser's scroll anchor, and Safari has no scroll anchoring at all, so the first text below the menu is
 * put back where it was. Also keeps the References checkbox showing at least one group, and toggles the
 * settings and listen controls from the keyboard, with the same keys as .net and a few more. And keeps a note's
 * asterisk lit while the note is open, and loads word lookup once it's turned on.
 */
;(function () {
  'use strict'

  const VIEW_SETTINGS = {
    n: ['commenter', 'commenter-inline', 'commenter-side'],
    v: ['rooter', 'rooter-side'],
    f: ['rooter-first'],
    i: ['illustrator'],
    o: ['highlighter'],
    p: ['paralleler'],
    r: ['segmenter'],
    s: ['positioner'],
  }

  // One turned on turns on what it's under too, or the key would do nothing
  const SUB_SETTINGS = {
    m: 'segmenter-main',
    t: 'segmenter-pts',
    d: 'definer',
  }

  const LISTEN_CONTROLS = {
    h: 'prev',
    j: 'playpause',
    k: 'stop',
    l: 'next',
    a: 'auto-scroll',
  }

  // Safari doesn't focus a button on click, so :focus alone never lit it
  document.addEventListener(
    'toggle',
    e => {
      const id = e.target.id
      if (!/^(comment|variant)-/.test(id ?? '')) return
      document
        .querySelector(`button[popovertarget="${CSS.escape(id)}"]`)
        ?.setAttribute('aria-expanded', String(e.newState === 'open'))
    },
    true
  )

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

  const viewsButton = document.getElementById('views-button')
  const listenMenu = document.getElementById('listen-menu')
  const ttsControls = listenMenu?.querySelector(':scope > .tts-controls')
  let rowsTimer

  function checkedStates() {
    const inputs = viewsMenu.querySelectorAll('input')
    return new Map([...inputs].map(el => [el, el.checked]))
  }

  function clearShownRows() {
    removeEventListener('scroll', placeRows)
    viewsMenu.style.removeProperty('--past-tts')
    for (const menu of [viewsMenu, listenMenu]) {
      menu?.classList.remove('toast')
      for (const li of menu?.querySelectorAll(':scope > li.toasted') ?? [])
        li.classList.remove('toasted', 'pressed')
    }
  }

  function toast(menu) {
    menu.classList.add('toast')
    clearTimeout(rowsTimer)
    rowsTimer = setTimeout(clearShownRows, 1500)
  }

  function placeRows() {
    if (!viewsButton) return
    const { top, bottom } = viewsButton.getBoundingClientRect()
    viewsMenu.classList.toggle(
      'detached',
      bottom < 0 || top > document.documentElement.clientHeight
    )
  }

  // Like .net's toast: the menu comes up for a moment with just the rows a key changed, and those under them
  function showChanges(ids, before) {
    const changed = new Set(
      [...before].filter(([el, was]) => el.checked !== was).map(([el]) => el)
    )
    if (!changed.size) return
    for (const el of changed) {
      if (!el.checked) continue
      for (const id of el.getAttribute('aria-controls')?.split(' ') ?? []) {
        const sub = document.getElementById(id)
        if (sub instanceof HTMLInputElement && sub.checked) changed.add(sub)
      }
    }

    const shown = new Set()
    for (const el of [
      ...ids.map(id => document.getElementById(id)),
      ...changed,
    ])
      if (el) shown.add(el).add(parentOf(el.id))

    clearShownRows()
    for (const el of shown) {
      const li = el?.closest('li')
      if (li?.parentElement !== viewsMenu) continue
      li.classList.add('toasted')
      if (changed.has(el)) flashPressed(li)
    }
    // Measured, as with a mouse the controls have no set height
    if (ttsControls instanceof HTMLElement && ttsControls.offsetHeight)
      viewsMenu.style.setProperty('--past-tts', `${ttsControls.offsetHeight}px`)
    placeRows()
    addEventListener('scroll', placeRows, { passive: true })
    toast(viewsMenu)
  }

  function showListenRow(el) {
    const li = el.closest('li')
    if (!listenMenu || li?.parentElement !== listenMenu) return
    clearShownRows()
    li.classList.add('toasted')
    flashPressed(li)
    toast(listenMenu)
  }

  // Not on cancel, which comes after a quick second press put it back on
  for (const menu of [viewsMenu, listenMenu]) {
    menu?.addEventListener('animationend', e => {
      if (e.animationName !== 'key-press') return
      if (e.target instanceof HTMLElement && e.target.parentElement === menu)
        e.target.classList.remove('pressed')
    })
  }

  // Set here rather than in the markup so they're only announced when they work
  const shortcuts = [
    ...Object.entries(VIEW_SETTINGS).map(([key, ids]) => [key, ids[0]]),
    ...Object.entries(SUB_SETTINGS),
    ...Object.entries(LISTEN_CONTROLS),
  ]
  for (const [key, id] of shortcuts) {
    document
      .getElementById(id)
      ?.setAttribute('aria-keyshortcuts', key.toUpperCase())
  }

  // A fine pointer is the best guess as to whether there's a keyboard too
  if (matchMedia('(any-pointer: fine)').matches) {
    for (const id of ['views-menu', 'listen-menu']) {
      document.getElementById(id)?.classList.add('hotkeys')
    }
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
    if (VIEW_SETTINGS[key] || SUB_SETTINGS[key]) {
      const before = checkedStates()
      if (VIEW_SETTINGS[key]) cycle(VIEW_SETTINGS[key])
      else toggleSub(SUB_SETTINGS[key])
      showChanges(VIEW_SETTINGS[key] ?? [SUB_SETTINGS[key]], before)
    } else if (LISTEN_CONTROLS[key]) {
      const el = document.getElementById(LISTEN_CONTROLS[key])
      if (el instanceof HTMLInputElement) {
        if (!hasRoom(el)) return
        el.click()
        showListenRow(el)
        return
      }
      // Checked before the click, as stop disables itself
      const flash = el instanceof HTMLButtonElement && !el.disabled
      el?.click()
      if (flash) flashPressed(el)
    }
  })

  // The reflow between restarts the animation
  function flashPressed(el) {
    el.classList.remove('pressed')
    void el.offsetWidth
    el.classList.add('pressed')
  }

  // A cancel comes after a quick second press has already started it over
  for (const id of Object.values(LISTEN_CONTROLS)) {
    for (const type of ['animationend', 'animationcancel']) {
      document.getElementById(id)?.addEventListener(type, e => {
        const el = e.currentTarget
        if (e.animationName !== 'key-press') return
        const running = el
          .getAnimations?.()
          .some(
            a => a instanceof CSSAnimation && a.animationName === 'key-press'
          )
        if (!running) el.classList.remove('pressed')
      })
    }
  }

  // Word lookup's scripts and dictionaries, fetched only once it's turned on
  const definer = document.getElementById('definer')
  if (definer instanceof HTMLInputElement) {
    let loading = null
    // Shown now, as the Chinese one does nothing without JS
    definer.closest('li').hidden = false
    // The root words' links without their hrefs, as with JS they're only for finding the word, and Safari can't
    // start selecting text on a link. So they hit-test again too, as the OS dictionary (a hard press on macOS)
    // needs them to
    const links = document.querySelectorAll(
      '.segment .text a[href^="/define/"]'
    )
    for (const link of links) {
      link.dataset.href = link.getAttribute('href')
      link.removeAttribute('href')
    }
    document.documentElement.dataset.lookupJs = ''

    const loadScript = src =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = src
        script.onload = resolve
        script.onerror = reject
        document.head.append(script)
      })

    function loadLookup() {
      loading ??= (async () => {
        definer.disabled = true
        try {
          await loadScript('/scripts/dictionary.js')
          await loadScript('/scripts/lookup.js')
        } catch {
          // Offline, and never fetched, so the links go to /define as without JS
          for (const link of links) link.setAttribute('href', link.dataset.href)
          delete document.documentElement.dataset.lookupJs
        } finally {
          definer.disabled = false
        }
      })()
    }

    if (definer.checked) loadLookup()
    definer.addEventListener('change', () => definer.checked && loadLookup())
  }
})()

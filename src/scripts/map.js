/**
 * Map
 *
 * Pans and zooms the map on /map: ctrl/⌘ + scroll (so the page still scrolls), pinching, double clicking or
 * tapping, dragging, the view buttons and their hotkeys (I, O, R, F), the arrows or H J K L to move, and full
 * screen, and brings a place tabbed to into view. The keys only work once the map was last clicked or focused,
 * so they don't catch keys meant for anything else. It changes the SVG's viewBox, and the --x0 --y0 --width
 * --height the places over it are positioned by, gliding there for buttons and keys, and opens the place a
 * link's #place-… names. Without it the map shows its first view, and its places and layers still work.
 */
;(function () {
  'use strict'

  const figure = document.querySelector('.interactive-map')
  const frame = figure?.querySelector('.map-frame')
  const svg = frame?.querySelector('svg')
  if (!svg) return

  const viewControls = figure.querySelector('.map-view')
  const home = svg.getAttribute('viewBox').split(' ').map(Number)
  const extent = svg.dataset.extent.split(' ').map(Number)
  const MAX_ZOOM = 16
  // Past this, the smaller present-day towns show too
  const DETAIL_ZOOM = 2
  const HOTKEYS = { i: 'in', o: 'out', r: 'reset', f: 'fullscreen' }
  // As vim's, each a fraction of the view to move by
  const MOVES = { h: [-0.2, 0], j: [0, 0.2], k: [0, -0.2], l: [0.2, 0] }
  const GLIDE_MS = 200
  // Pixels in a wheel event's delta of each deltaMode: pixels, lines, pages
  const WHEEL_UNITS = [1, 16, 800]
  // The most one wheel event zooms by, as ln(1.25), a mouse wheel's notch
  const MAX_WHEEL = Math.log(1.25)
  // Without them, :popover-open would throw
  const popovers = 'showPopover' in HTMLElement.prototype
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  let view = [...home]
  // The width of the first view, which zooming is measured from
  let base = home[2]

  /** `[x, y, width, height]` moved to within the map's extent */
  function clamp([x, y, width, height]) {
    return [
      Math.min(Math.max(x, extent[0]), extent[0] + extent[2] - width),
      Math.min(Math.max(y, extent[1]), extent[1] + extent[3] - height),
      width,
      height,
    ]
  }

  let glide = null

  /** Shows `[x, y, width, height]` of the map at once, as a drag or pinch follows the pointer */
  function show(next) {
    cancelAnimationFrame(glide)
    render(clamp(next))
  }

  /** Glides to `[x, y, width, height]`, as for buttons and keys, unless motion is reduced */
  function glideTo(next) {
    const to = clamp(next)
    if (reducedMotion.matches) return show(to)
    cancelAnimationFrame(glide)
    const from = [...view]
    // The first frame's time, as Chromium's can be before now, which eased it backwards first
    let start
    const step = now => {
      start ??= now
      const t = Math.min((now - start) / GLIDE_MS, 1)
      const ease = 1 - (1 - t) ** 3
      render(from.map((n, i) => n + (to[i] - n) * ease))
      if (t < 1) glide = requestAnimationFrame(step)
    }
    glide = requestAnimationFrame(step)
  }

  function render(next) {
    view = next
    const [, , width] = view
    svg.setAttribute('viewBox', view.map(n => n.toFixed(2)).join(' '))
    ;['--x0', '--y0', '--width', '--height'].forEach((name, i) =>
      frame.style.setProperty(name, view[i])
    )
    frame.toggleAttribute('data-zoomed', base / width >= DETAIL_ZOOM)
  }

  /** The smallest view of the frame's shape that holds `[x, y, width, height]`, around its middle */
  function fitting([x, y, width, height]) {
    const shape = frame.clientHeight / frame.clientWidth
    let newWidth = Math.max(width, height / shape)
    newWidth = Math.min(newWidth, extent[2], extent[3] / shape)
    const newHeight = newWidth * shape
    return [
      x + (width - newWidth) / 2,
      y + (height - newHeight) / 2,
      newWidth,
      newHeight,
    ]
  }

  // Shorter than the first view's shape, so it's widened to fill it
  frame.classList.add('fitted')
  show(fitting(home))
  base = view[2]

  // Full screen changes the frame's size, so the view keeps its scale, around the same middle
  let frameWidth = frame.clientWidth
  new ResizeObserver(() => {
    if (!frame.clientWidth || frame.clientWidth === frameWidth) return
    const unitsPerPixel = view[2] / frameWidth
    frameWidth = frame.clientWidth
    const [cx, cy] = centre()
    const width = frameWidth * unitsPerPixel
    const height = frame.clientHeight * unitsPerPixel
    show([cx - width / 2, cy - height / 2, width, height])
  }).observe(frame)

  /** A point on screen as map units */
  function toMap(clientX, clientY) {
    const box = frame.getBoundingClientRect()
    return [
      view[0] + ((clientX - box.left) / box.width) * view[2],
      view[1] + ((clientY - box.top) / box.height) * view[3],
    ]
  }

  /** The view zoomed by `factor` (above 1 is in) around a point in map units, no further than its limits */
  function zoomed(factor, [cx, cy]) {
    const [x, y, width, height] = view
    const widest = Math.min(extent[2], (extent[3] * width) / height)
    const newWidth = Math.min(Math.max(width / factor, base / MAX_ZOOM), widest)
    factor = width / newWidth
    return [
      cx - (cx - x) / factor,
      cy - (cy - y) / factor,
      width / factor,
      height / factor,
    ]
  }

  function centre() {
    return [view[0] + view[2] / 2, view[1] + view[3] / 2]
  }

  frame.addEventListener(
    'wheel',
    event => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.target.closest('.map-place')) return
      event.preventDefault()
      const pixels = event.deltaY * WHEEL_UNITS[event.deltaMode]
      // A pinch comes as ctrl + wheel, its delta 100 × ln(scale) in Chromium
      const rate = event.ctrlKey ? 0.01 : 0.003
      const step = Math.min(Math.max(-pixels * rate, -MAX_WHEEL), MAX_WHEEL)
      show(zoomed(Math.exp(step), toMap(event.clientX, event.clientY)))
    },
    { passive: false }
  )

  // One pointer drags, two pinch
  const pointers = new Map()
  let gesture = null

  function startGesture() {
    const [a, b] = [...pointers.values()]
    gesture = b
      ? {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          middle: toMap((a.x + b.x) / 2, (a.y + b.y) / 2),
        }
      : { start: toMap(a.x, a.y), from: a }
  }

  frame.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.target.closest('.map-place')) return
    frame.classList.remove('dragging')
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    startGesture()
  })

  frame.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const [a, b] = [...pointers.values()]
    if (b && gesture.distance) {
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      show(zoomed(distance / gesture.distance, gesture.middle))
      startGesture()
    } else if (gesture.start) {
      // Past a few pixels it's a drag, so a place let go of here doesn't open
      if (!frame.hasPointerCapture(event.pointerId)) {
        if (Math.hypot(a.x - gesture.from.x, a.y - gesture.from.y) < 4) return
        frame.setPointerCapture(event.pointerId)
        frame.classList.add('dragging')
      }
      const [x, y] = toMap(a.x, a.y)
      show([
        view[0] + gesture.start[0] - x,
        view[1] + gesture.start[1] - y,
        view[2],
        view[3],
      ])
    }
  })

  function endPointer(event) {
    pointers.delete(event.pointerId)
    if (pointers.size) startGesture()
    else gesture = null
  }
  frame.addEventListener('pointerup', event => {
    endPointer(event)
    doubleTap(event)
  })
  frame.addEventListener('pointercancel', endPointer)

  frame.addEventListener(
    'click',
    event => {
      if (!frame.classList.contains('dragging')) return
      frame.classList.remove('dragging')
      event.preventDefault()
      event.stopPropagation()
    },
    true
  )

  // By pointer for mouse and touch alike, as a double tap gives no dblclick where touch-action is none
  let lastTap = null
  function doubleTap(event) {
    if (
      frame.classList.contains('dragging') ||
      event.target.closest('button, .map-place')
    ) {
      lastTap = null
      return
    }
    const tap = { time: event.timeStamp, x: event.clientX, y: event.clientY }
    const isDouble =
      lastTap &&
      tap.time - lastTap.time < 300 &&
      Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 20
    lastTap = isDouble ? null : tap
    if (isDouble) glideTo(zoomed(event.shiftKey ? 0.5 : 2, toMap(tap.x, tap.y)))
  }

  /** Moves the view by one of `MOVES` */
  function move(key) {
    const [x, y, width, height] = view
    const [dx, dy] = MOVES[key]
    glideTo([x + dx * width, y + dy * height, width, height])
  }

  viewControls.addEventListener('click', event => {
    const button = event.target.closest('button')
    if (!button) return
    if (MOVES[button.dataset.move]) move(button.dataset.move)
    if (button.dataset.zoom === 'in') glideTo(zoomed(1.5, centre()))
    if (button.dataset.zoom === 'out') glideTo(zoomed(1 / 1.5, centre()))
    if (button.dataset.zoom === 'reset') glideTo(fitting(home))
    if (button.hasAttribute('data-fullscreen')) toggleFullscreen()
  })

  // Kept from before a focus scrolls the page, as the scroll event only comes after.
  // Also on Tab, before Safari's scroll, whose event can come first
  let pageScroll = [scrollX, scrollY]
  const keepScroll = () => (pageScroll = [scrollX, scrollY])
  addEventListener('scroll', keepScroll, { passive: true })
  addEventListener('keydown', event => event.key === 'Tab' && keepScroll(), {
    capture: true,
  })

  // A place tabbed to outside the view is brought into the middle of it, with the page put back first, as
  // the browser scrolls it to where the place sits off the map
  frame.querySelector('.map-places')?.addEventListener('focusin', event => {
    const button = event.target.closest('.map-places > button')
    if (!button) return
    const x = Number(button.style.getPropertyValue('--x'))
    const y = Number(button.style.getPropertyValue('--y'))
    const [vx, vy, width, height] = view
    if (x > vx && x < vx + width && y > vy && y < vy + height) return
    const before = pageScroll
    const putBack = () => {
      scrollTo(...before)
      frame.scrollIntoView({ block: 'nearest' })
    }
    putBack()
    // Again next frame, as Safari scrolls to the place after focusin
    requestAnimationFrame(putBack)
    glideTo([x - width / 2, y - height / 2, width, height])
  })

  // A region or journey's shape opens its popover, as its name does, where it's clicked rather than dragged
  frame.addEventListener('click', event => {
    const shape = event.target.closest('[data-place]')
    const popover =
      shape && document.getElementById(`place-${shape.dataset.place}`)
    if (!popovers || !popover || popover.matches(':popover-open')) return
    popover.showPopover()
  })

  const fullscreenButton = viewControls.querySelector('[data-fullscreen]')
  const fullscreenLabel = fullscreenButton.querySelector('span')

  // In the page's own box where the Fullscreen API is missing or refused, as on iPhones and in app webviews
  function toggleFullscreen() {
    if (document.fullscreenElement) return document.exitFullscreen()
    if (figure.classList.contains('pseudo-fullscreen')) {
      return setPseudoFullscreen(false)
    }
    if (!figure.requestFullscreen) return setPseudoFullscreen(true)
    figure.requestFullscreen().catch(() => setPseudoFullscreen(true))
  }

  function setPseudoFullscreen(on) {
    figure.classList.toggle('pseudo-fullscreen', on)
    labelFullscreen()
  }

  function labelFullscreen() {
    const on =
      !!document.fullscreenElement ||
      figure.classList.contains('pseudo-fullscreen')
    fullscreenLabel.textContent = on ? 'Exit full screen' : 'Full screen'
  }

  document.addEventListener('fullscreenchange', labelFullscreen)

  // Only while the map was the last thing clicked or focused
  let active = false
  for (const type of ['pointerdown', 'focusin']) {
    document.addEventListener(type, event => {
      active = figure.contains(event.target)
    })
  }

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      figure.classList.contains('pseudo-fullscreen')
    ) {
      // Not when it closes an open popover first
      if (!popovers || !document.querySelector('.map-place:popover-open')) {
        setPseudoFullscreen(false)
      }
      return
    }
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return
    if (
      event.target.closest?.('input:not([type="checkbox"]), textarea, select')
    ) {
      return
    }
    const key = event.key.toLowerCase()
    if (MOVES[key]) {
      event.preventDefault()
      move(key)
      return
    }
    const action = HOTKEYS[key]
    const button =
      action === 'fullscreen'
        ? viewControls.querySelector('[data-fullscreen]')
        : viewControls.querySelector(`[data-zoom="${action}"]`)
    if (!button || button.hidden) return
    event.preventDefault()
    button.click()
  })

  // A place a /define page links to, ie /map#place-3-12, zoomed to and opened
  function openLinkedPlace() {
    const popover = document.getElementById(
      decodeURIComponent(location.hash.slice(1))
    )
    if (!popovers || !popover?.matches('.map-place')) return
    const button = frame.querySelector(`[popovertarget="${popover.id}"]`)
    const x = Number(button.style.getPropertyValue('--x'))
    const y = Number(button.style.getPropertyValue('--y'))
    const [, , width, height] = fitting(home)
    show([x - width / 4, y - height / 4, width / 2, height / 2])
    popover.showPopover()
    const centreMap = () => figure.scrollIntoView({ block: 'center' })
    centreMap()
    // Again once loaded, as till then Chrome scrolls the open place to the top
    if (document.readyState !== 'complete') {
      addEventListener('load', centreMap, { once: true })
    }
  }
  openLinkedPlace()
  window.addEventListener('hashchange', openLinkedPlace)

  viewControls.hidden = false
})()

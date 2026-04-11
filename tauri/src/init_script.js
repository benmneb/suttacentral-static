;(function () {
  if (!window.__TAURI_INTERNALS__) return

  function getAnchor(el) {
    while (el && el.tagName !== 'A') el = el.parentElement
    return el
  }

  function openInNewTab(url) {
    window.__TAURI_INTERNALS__.invoke('open_in_new_tab', { url })
  }

  // Cmd/Ctrl+click
  document.addEventListener(
    'click',
    function (e) {
      if (!e.metaKey && !e.ctrlKey) return
      const a = getAnchor(e.target)
      if (!a || !a.href) return
      e.preventDefault()
      e.stopPropagation()
      openInNewTab(a.href)
    },
    true
  )

  // Middle-click
  document.addEventListener(
    'mousedown',
    function (e) {
      if (e.button !== 1) return
      const a = getAnchor(e.target)
      if (!a || !a.href) return
      e.preventDefault()
      e.stopPropagation()
      openInNewTab(a.href)
    },
    true
  )

  // Save session on every page load so session.json stays current even if
  // the app is killed without a clean shutdown (SIGTERM, SIGKILL, etc.).
  window.addEventListener('load', function () {
    window.__TAURI_INTERNALS__
      .invoke('save_session_on_nav')
      .catch(function () {})
  })

  // Update the macOS tab label as soon as the <title> tag is parsed — well
  // before window.load (which waits for images/styles). The window title bar
  // always shows the app name via NSWindow.title; NSWindow.tab.title is
  // independent and only visible in the tab strip.
  document.addEventListener('DOMContentLoaded', function () {
    var title = document.title
    if (title) {
      window.__TAURI_INTERNALS__
        .invoke('set_tab_title', { title })
        .catch(function () {})
    }
  })

  // Right-click: tell Rust which link was under the cursor so the native
  // "Copy Link" menu item can copy the public web URL instead of localhost.
  document.addEventListener(
    'contextmenu',
    function (e) {
      const a = getAnchor(e.target)
      window.__TAURI_INTERNALS__.invoke('store_context_link', {
        url: a && a.href ? a.href : '',
      })
    },
    true
  )
})()

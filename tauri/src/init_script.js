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

  // Right-click: native context menu on links
  document.addEventListener(
    'contextmenu',
    function (e) {
      const a = getAnchor(e.target)
      if (!a || !a.href) return
      e.preventDefault()
      window.__TAURI_INTERNALS__.invoke('show_link_context_menu', {
        url: a.href,
      })
    },
    true
  )
})()

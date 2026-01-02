/**
 * The static 404 page can't know the URL that 404'd without JS.
 * This allows users to check if the 404 also exists on .net
 */
;(function () {
  const scRedirectLink = document.getElementById('sc-redirect')
  if (!scRedirectLink?.href) return
  scRedirectLink.href = scRedirectLink.href.replace('/404', location.pathname)
})()

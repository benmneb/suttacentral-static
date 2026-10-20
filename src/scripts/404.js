/**
 * The static 404 page can't know the URL that 404'd without JS.
 * This allows users to check if the 404 also exists on .net
 * and put the real URL in the email link.
 */
;(function () {
  const scRedirectLink = document.getElementById('sc-redirect')
  const mailToLink = document.getElementById('let-me-know')
  if (scRedirectLink?.href)
    scRedirectLink.href = scRedirectLink.href.replace('/404', location.pathname)
  if (mailToLink?.href)
    mailToLink.href = mailToLink.href.replace('404', location.pathname)
})()

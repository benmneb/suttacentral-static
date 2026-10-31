/**
 * The ZIM's changes to `_site`.
 *
 * Kiwix readers serve a ZIM under a prefix of their own, so a URL that misses
 * here only shows up in a reader, after a full build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  entryPath,
  patchPagefind,
  relativeUrl,
  rewriteHtml,
  rewriteScript,
} from '../zim/rewrite.js'

describe('ZIM paths', () => {
  it('stores pages at their web URL', () => {
    assert.equal(entryPath('mn1/en/sujato/index.html'), 'mn1/en/sujato')
    assert.equal(entryPath('d/index.html'), 'd')
  })

  it('keeps the home page and other files as they are', () => {
    assert.equal(entryPath('index.html'), 'index.html')
    assert.equal(
      entryPath('styles/styles.1fb90037.css'),
      'styles/styles.1fb90037.css'
    )
  })

  it('leaves out what only a web server uses', () => {
    for (const file of [
      '404.html',
      'scripts/404.85885d32.js',
      'robots.txt',
      'sitemap-1.xml',
    ]) {
      assert.equal(entryPath(file), null)
    }
  })
})

describe('ZIM links', () => {
  it('go from the page to a sibling, cousin or asset', () => {
    assert.equal(relativeUrl('mn1/en/sujato', '/mn1/en/bodhi'), 'bodhi')
    assert.equal(relativeUrl('mn1/en/sujato', '/mn1/pli/ms'), '../pli/ms')
    assert.equal(
      relativeUrl('mn1/en/sujato', '/styles/a.css'),
      '../../styles/a.css'
    )
    assert.equal(relativeUrl('mn1/en/sujato', '/mn1'), '../../mn1')
  })

  it('go from a top-level page', () => {
    assert.equal(relativeUrl('mn', '/mn1/en/sujato'), 'mn1/en/sujato')
    assert.equal(relativeUrl('index.html', '/sutta'), 'sutta')
  })

  it('go home to index.html', () => {
    assert.equal(relativeUrl('mn1/en/sujato', '/'), '../../index.html')
    assert.equal(relativeUrl('sutta', '/'), 'index.html')
  })

  it('keep a query and fragment', () => {
    assert.equal(
      relativeUrl('mn1/en/sujato', '/sn56.11/en/sujato#4.4'),
      '../../sn56.11/en/sujato#4.4'
    )
    assert.equal(
      relativeUrl('search', '/search?query=by:sujato'),
      'search?query=by:sujato'
    )
  })

  it('drop a trailing slash, as pages have none', () => {
    assert.equal(
      relativeUrl('sutta', '/an2.265/en/sujato/'),
      'an2.265/en/sujato'
    )
  })

  it("don't start with what reads as a scheme", () => {
    assert.equal(relativeUrl('index.html', '/a:b'), './a:b')
  })

  it('resolve in a browser to where the web URL goes', () => {
    for (const [from, url] of [
      ['mn1/en/sujato', '/mn1/pli/ms#1.1'],
      ['define/aggāḷave cetiye', '/define/aggāḷave%20cetiye'],
      ['mn', '/map/base.svg#base'],
    ]) {
      const base = new URL(encodeURI(from), 'http://zim/content/book/')
      assert.equal(
        new URL(relativeUrl(from, url), base).href,
        new URL(url.slice(1), 'http://zim/content/book/').href
      )
    }
  })
})

describe('ZIM pages', () => {
  const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/styles/s.css"><script defer src="https://analytics.example/script.js" data-id="1"></script></head><body><a href="/mn1/pli/ms">MN</a><a href="https://suttacentral.net/mn1">.net</a><a href="#top">Top</a><a href="//example.com">x</a></body></html>`
  const { html, links } = rewriteHtml(page, 'mn1/en/sujato')

  it('make root-absolute links relative', () => {
    assert.match(html, /href="\.\.\/\.\.\/styles\/s\.css"/)
    assert.match(html, /href="\.\.\/pli\/ms"/)
    assert.equal(links.length, 2)
  })

  it('leave other links alone', () => {
    assert.match(html, /href="https:\/\/suttacentral\.net\/mn1"/)
    assert.match(html, /href="#top"/)
    assert.match(html, /href="\/\/example\.com"/)
  })

  it('drop the analytics', () => {
    assert.doesNotMatch(html, /<script[^>]*src="https?:/)
  })

  it('load the ZIM script first', () => {
    assert.match(
      html,
      /<meta charset="utf-8"><script src="\.\.\/\.\.\/scripts\/zim\.js"><\/script>/
    )
  })

  it('load the ZIM stylesheet last', () => {
    assert.match(
      html,
      /<link rel="stylesheet" href="\.\.\/\.\.\/styles\/zim\.css"><\/head>/
    )
  })
})

describe('ZIM scripts', () => {
  it('find files from the ZIM root', () => {
    assert.equal(
      rewriteScript(
        'fetch("/hans.json");import(`/pagefind-${a}/pagefind.js`)',
        'a.js'
      ),
      'fetch(scxZimRoot+"hans.json");import(`${scxZimRoot}pagefind-${a}/pagefind.js`)'
    )
  })

  it('build links from the ZIM root', () => {
    assert.equal(
      rewriteScript('`<a href="/map#${t}">`;e.src="/scripts/x.js"', 'a.js'),
      '`<a href="${scxZimRoot}map#${t}">`;e.src=scxZimRoot+"scripts/x.js"'
    )
  })

  it('keep the search page’s own URL checks working', () => {
    assert.equal(
      rewriteScript(
        'e.pathname.includes("/search")&&1;e.pathname="/search";t.closest(\'a[href^="/search?"]\')',
        'a.js'
      ),
      'e.pathname.includes("/search")&&1;e.pathname=new URL(scxZimRoot+"search").pathname;t.closest(\'a[href*="search?"]\')'
    )
  })

  it('leave plain slashes alone', () => {
    const code = 'e.split("/");`/`;a/b;"</a>"'
    assert.equal(rewriteScript(code, 'a.js'), code)
  })

  it('stop the build on a URL no rule covers', () => {
    assert.throws(() => rewriteScript('location.replace("/404")', 'a.js'))
  })

  // Pagefind's own fullUrl, as 1.5 has it
  const FULL_URL =
    'fullUrl(raw){return(this.baseUrl+"/"+raw).replace(/\\/+/g,"/")}'
  const pagefind = baseUrl =>
    Object.assign(
      new Function(`return {${patchPagefind(FULL_URL, 'p.js')}}`)(),
      { baseUrl }
    )

  it('make Pagefind results the ZIM paths of pages', () => {
    assert.equal(
      pagefind('/content/book/').fullUrl('/mn1/en/sujato/'),
      '/content/book/mn1/en/sujato'
    )
    assert.equal(pagefind('/').fullUrl('/sutta/'), '/sutta')
  })

  it('keep them root-absolute on zim://, which Pagefind would mangle', () => {
    assert.equal(
      pagefind('/zim://ABC-123/').fullUrl('/mn1/en/sujato/'),
      '/mn1/en/sujato'
    )
  })

  it('stop the build when Pagefind changes', () => {
    assert.throws(() => patchPagefind('fullUrl(url){return url}', 'p.js'))
  })
})

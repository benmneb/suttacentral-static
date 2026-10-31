/**
 * What changes between `_site` and the ZIM, as pure functions so tests can run them
 * without libzim.
 *
 * Kiwix readers serve a ZIM under a prefix of their own (`/content/<book>/` in
 * kiwix-serve, `…/file.zim/C/` in Kiwix JS) and never map `dir/` to
 * `dir/index.html`, so pages are stored at their web URL without the
 * `/index.html`, and every root-absolute URL becomes relative to the page.
 */
import { posix } from 'path'

// Paths

/** Files left out of the ZIM, as nothing in a Kiwix reader can use them */
const EXCLUDED = [
  /^404\.html$/,
  /^scripts\/404\.[0-9a-f]+\.js$/,
  /^robots\.txt$/,
  /^sitemap.*\.xml$/,
  /^images\/og-image.*\.jpg$/,
]

/** Files only the ZIM has, from this folder */
export const ZIM_FILES = {
  'scripts/zim.js': 'runtime.js',
  'styles/zim.css': 'zim.css',
}

/**
 * The ZIM path of a file in `_site`, or null to leave it out
 * @param {string} file - its path in `_site`, ie "mn1/en/sujato/index.html"
 */
export function entryPath(file) {
  if (EXCLUDED.some(re => re.test(file))) return null
  if (file === 'index.html') return file
  return file.replace(/\/index\.html$/, '')
}

/** Whether a file in `_site` is a page, ie "mn1/en/sujato/index.html" */
export function isPage(file) {
  return file.endsWith('.html')
}

/**
 * A root-absolute URL as one relative to a page, as a browser would resolve it from there
 * @param {string} from - the page's ZIM path, ie "mn1/en/sujato"
 * @param {string} url - ie "/mn1/pli/ms#1.1" or "/"
 */
export function relativeUrl(from, url) {
  const [, path, rest] = url.match(/^\/([^?#]*)(.*)$/)
  const target = path.replace(/\/$/, '') || 'index.html'
  const dir = posix.dirname(from)
  const up = posix.relative(dir === '.' ? '' : dir, posix.dirname(target))
  const relative = posix.join(up, posix.basename(target))
  // A first segment with a colon would read as a scheme
  const safe = relative.split('/')[0].includes(':') ? `./${relative}` : relative
  return safe + rest
}

// Pages

const ROOT_ABSOLUTE_ATTR = /\b(href|src)="(\/(?!\/)[^"]*)"/g
// Analytics and the like, which every reader blocks
const EXTERNAL_SCRIPT = /<script[^>]*\ssrc="https?:\/\/[^"]*"[^>]*><\/script>/g

const SEARCH_NOTICE =
  '<p class="zim-notice">Site search can’t run in this reader, but Kiwix’s own search can find any text here.</p>'

/**
 * A page's HTML for the ZIM, with the ZIM's script before the site's and its
 * stylesheet after the site's
 * @param {string} html
 * @param {string} entry - its ZIM path
 * @returns {{ html: string, links: { original: string, rewritten: string }[] }}
 */
export function rewriteHtml(html, entry) {
  const links = []
  const relative = url => {
    const rewritten = relativeUrl(entry, url)
    links.push({ original: url, rewritten })
    return rewritten
  }
  const [script, stylesheet] = Object.keys(ZIM_FILES).map(path =>
    relativeUrl(entry, `/${path}`)
  )

  let out = html
    .replace(ROOT_ABSOLUTE_ATTR, (_, attr, url) => `${attr}="${relative(url)}"`)
    .replace(EXTERNAL_SCRIPT, '')
    .replace('<meta charset="utf-8">', `$&<script src="${script}"></script>`)
    .replace('</head>', `<link rel="stylesheet" href="${stylesheet}">$&`)
  if (entry === 'search') {
    out = out.replace('<h1>Search</h1>', `$&${SEARCH_NOTICE}`)
  }
  return { html: out, links }
}

// Scripts

// Left as they are, as they hold under any prefix
const KEPT = ['.includes("/search")']

/**
 * Rules for the site's scripts, in order, each making a root-absolute URL one from
 * `scxZimRoot`, which `runtime.js` sets to wherever the reader serves the ZIM from
 */
const SCRIPT_RULES = [
  // A path, as history.pushState takes
  [/\.pathname="\/search"/g, '.pathname=new URL(scxZimRoot+"search").pathname'],
  // The search info's examples, which are relative in the ZIM
  [/a\[href\^="\/search\?"\]/g, 'a[href*="search?"]'],
  // HTML a template literal builds, not properties like script.src
  [/(?<![.\w])(href|src)="\/(?!\/)/g, '$1="${scxZimRoot}'],
  // Template literals, ie `/define/${word}`
  [/`\/(?![/`])/g, '`${scxZimRoot}'],
  // Strings, ie "/scripts/lookup.js"
  [/(?<!\.includes\()(["'])\/(?=[a-z])/g, 'scxZimRoot+$1'],
]

/**
 * One of the site's scripts for the ZIM
 * @param {string} code
 * @param {string} name - for errors
 * @throws when a root-absolute URL is left, so a new pattern stops the build
 */
export function rewriteScript(code, name) {
  const out = SCRIPT_RULES.reduce(
    (code, [find, replace]) => code.replace(find, replace),
    code
  )
  const left = KEPT.reduce(
    (code, kept) => code.replaceAll(kept, ''),
    out
  ).match(/["'`]\/\w[^"'`]{0,30}/g)
  if (left) {
    throw new Error(
      `${name} still has root-absolute URLs for the ZIM: ${left.join(', ')}`
    )
  }
  return out
}

// Pagefind

const PAGEFIND_FULL_URL = 'fullUrl(raw){'
// Pages have no trailing slash in the ZIM, and Pagefind makes a zim:// base /zim:/…, where a root-absolute URL works
const PAGEFIND_PATCH = String.raw`raw=raw.replace(/\/(?=[?#]|$)/,"");if(/^\/[a-z][a-z0-9+.-]*:\//i.test(this.baseUrl))return raw;`

/**
 * A Pagefind bundle's `pagefind.js` or `pagefind-worker.js` for the ZIM, as both make
 * result URLs
 * @throws when Pagefind's code no longer has the line it patches
 */
export function patchPagefind(code, name) {
  const count = code.split(PAGEFIND_FULL_URL).length - 1
  if (count !== 1) {
    throw new Error(
      `${name} has ${count} "${PAGEFIND_FULL_URL}", not 1, so its result URLs can't be patched for the ZIM`
    )
  }
  return code.replace(PAGEFIND_FULL_URL, PAGEFIND_FULL_URL + PAGEFIND_PATCH)
}

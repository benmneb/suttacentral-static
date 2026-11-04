/**
 * Asset Minification Utilities
 *
 * Minifies the CSS and JavaScript files into the build's output, `_site`,
 * each under a name with a hash of its content (ie `styles.3f9a1c2b.css`), so
 * it can be cached for good. `tools/serve.js` minifies them per request instead.
 *
 * CSS minification uses LightningCSS, targeting Safari 15.4, Chrome 105 and up.
 * JS minification uses Terser with dead code elimination and mangling.
 *
 * @module AssetMinifier
 * @requires lightningcss - CSS parser and minifier
 * @requires terser - JavaScript minifier
 * @requires browserslist - Browser compatibility targeting
 *
 * @example
 * // Use programmatically
 * import { assetUrl, minifyCss, minifyCssCode, minifyJs } from './src/helpers/minifyAssets.js'
 * await minifyCss({ srcDir: './src/styles', destDir: './dist/styles' })
 * await minifyJs({ srcDir: './src/scripts', destDir: './dist/scripts' })
 * assetUrl('styles.css') // '/styles/styles.3f9a1c2b.css'
 * minifyCssCode('styles.css', css) // One file's CSS, minified
 */

import browserslist from 'browserslist'
import crypto from 'crypto'
import fs from 'fs'
import htmlmin from 'html-minifier-terser'
import { browserslistToTargets, transform } from 'lightningcss'
import path from 'path'
import { minify as terserMinify } from 'terser'
import { buildStage } from './buildStage.js'
import { outputDir } from './outputDir.js'
import { recordStat } from './buildStats.js'

// The :has() floor, plus Firefox 115 ESR as the last on Windows 7 and old macOS
const BROWSERS = [
  'chrome >= 105',
  'edge >= 105',
  'firefox >= 115',
  'safari >= 15.4',
  'ios_saf >= 15.4',
  'samsung >= 20',
]

// A script's URL as a string in another script, ie viewSettings.js's '/scripts/lookup.js'
const SCRIPT_URL = /(['"])\/scripts\/([\w-]+\.js)\1/g

const CSS_TARGETS = browserslistToTargets(browserslist(BROWSERS))

const hashedUrls = new Map()

/**
 * An empty `dir` for this build's files, as nothing links an earlier build's.
 * A build stage instead fails if a file changed since an earlier stage, whose pages link the old copy
 * @param {string} dir
 * @param {string} ext - ie `.css`
 * @returns {() => void} Call once this build's files are written
 */
function clearDir(dir, ext) {
  fs.mkdirSync(dir, { recursive: true })
  const earlier = fs.readdirSync(dir).filter(file => file.endsWith(ext))
  for (const file of earlier) fs.rmSync(path.join(dir, file))
  return () => {
    if (!buildStage) return
    const written = new Set(fs.readdirSync(dir))
    const changed = earlier.filter(file => !written.has(file))
    if (changed.length) {
      throw new Error(
        `${changed.join(', ')} changed since an earlier build stage, whose pages link the old copy, so rebuild every stage`
      )
    }
  }
}

/**
 * Writes a minified file under its hashed name
 * @param {string} destDir
 * @param {string} urlDir - Where `destDir` is served, ie `/styles`
 * @param {string} file - ie `styles.css`
 * @param {string} content
 */
function writeAsset(destDir, urlDir, file, content) {
  const hash = crypto
    .createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 8)
  const ext = path.extname(file)
  const hashedName = `${path.basename(file, ext)}.${hash}${ext}`
  fs.writeFileSync(path.join(destDir, hashedName), content)
  hashedUrls.set(file, `${urlDir}/${hashedName}`)
}

/**
 * The URL of a minified asset's hashed copy, ie `styles.css` -> `/styles/styles.3f9a1c2b.css`.
 * Templates link CSS and JS only through this, as the `asset` filter.
 * A hard-coded `/styles/x.css` works under `pnpm dev` but 404s once deployed.
 * @param {string} file
 */
export function assetUrl(file) {
  const url = hashedUrls.get(file)
  if (!url) throw new Error(`No minified asset called "${file}"`)
  return url
}

/**
 * Minifies a stylesheet for the browsers in `BROWSERS`
 * @param {string} file - Its name, for errors
 * @param {string} code
 */
export function minifyCssCode(file, code) {
  return transform({
    filename: file,
    code: Buffer.from(code),
    minify: true,
    targets: CSS_TARGETS,
  }).code.toString()
}

/**
 * Minifies a script
 * @param {string} code
 */
export async function minifyJsCode(code) {
  const minified = await terserMinify(code, {
    compress: {
      dead_code: true,
      drop_console: false,
      drop_debugger: true,
    },
    mangle: true,
    format: {
      comments: 'some',
    },
  })
  return minified.code
}

/**
 * Minifies a page, as the build's `htmlmin` transform does
 * @param {string} html
 */
export function minifyHtmlCode(html) {
  // https://github.com/terser/html-minifier-terser?tab=readme-ov-file#options-quick-reference
  return htmlmin.minify(html, {
    useShortDoctype: true,
    removeComments: true,
    collapseWhitespace: true,
    collapseBooleanAttributes: true,
    // Not removeOptionalTags: browsers build the same DOM without them, but Pagefind takes a closing tag
    // as a word break, so text running into one (ie "possessions?’</p><p>SC") gets indexed as one word
  })
}

/**
 * Writes each `.css` file at the top of `srcDir` into `destDir` minified, under its hashed name,
 * after removing earlier builds' ones. Subfolders and other files aren't copied.
 */
export async function minifyCss({
  srcDir = path.join(process.cwd(), 'src', 'styles'),
  destDir = path.join(outputDir, 'styles'),
} = {}) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`CSS source dir not found: ${srcDir}`)
    return
  }

  const checkEarlier = clearDir(destDir, '.css')

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.css'))
  const stats = []

  for (const file of files) {
    const src = path.join(srcDir, file)
    const content = fs.readFileSync(src, 'utf8')

    const minified = minifyCssCode(file, content)
    writeAsset(destDir, '/styles', file, minified)

    const originalSize = Buffer.byteLength(content, 'utf8')
    const minifiedSize = Buffer.byteLength(minified, 'utf8')
    const savings = originalSize - minifiedSize
    const savingsPercent = ((savings / originalSize) * 100).toFixed(1)
    console.log(
      `📦 Minified ${file}: ${originalSize} → ${minifiedSize} bytes (saved ${savings} bytes, ${savingsPercent}%)`
    )
    stats.push({ file, originalSize, minifiedSize })
  }

  checkEarlier()
  recordStat('assetsCss', stats)
}

/**
 * Writes each `.js` file at the top of `srcDir` into `destDir` minified, under its hashed name,
 * after removing earlier builds' ones. Subfolders and other files aren't copied.
 *
 * A script that loads another names it in a quoted string, ie `'/scripts/lookup.js'`, which gets
 * swapped for its hashed URL. A template literal or a built path isn't, so it 404s once deployed.
 * Scripts loaded that way can't load others in turn.
 */
export async function minifyJs({
  srcDir = path.join(process.cwd(), 'src', 'scripts'),
  destDir = path.join(outputDir, 'scripts'),
} = {}) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`JS source dir not found: ${srcDir}`)
    return
  }

  const checkEarlier = clearDir(destDir, '.js')

  const sources = fs
    .readdirSync(srcDir)
    .filter(f => f.endsWith('.js'))
    .map(file => ({
      file,
      code: fs.readFileSync(path.join(srcDir, file), 'utf8'),
    }))
  // Scripts that load others last, so those have hashed URLs by then
  const loadsScripts = code => code.search(SCRIPT_URL) !== -1
  sources.sort((a, b) => loadsScripts(a.code) - loadsScripts(b.code))
  const stats = []

  for (const { file, code } of sources) {
    const linked = code.replace(
      SCRIPT_URL,
      (_, quote, name) => `${quote}${assetUrl(name)}${quote}`
    )
    const minified = await minifyJsCode(linked)

    if (minified) {
      const originalSize = Buffer.byteLength(code, 'utf8')
      const minifiedSize = Buffer.byteLength(minified, 'utf8')
      const savings = originalSize - minifiedSize
      const savingsPercent = ((savings / originalSize) * 100).toFixed(1)

      writeAsset(destDir, '/scripts', file, minified)
      console.log(
        `📦 Minified ${file}: ${originalSize} → ${minifiedSize} bytes (saved ${savings} bytes, ${savingsPercent}%)`
      )
      stats.push({ file, originalSize, minifiedSize })
    }
  }

  checkEarlier()
  recordStat('assetsJs', stats)
}

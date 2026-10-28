/**
 * Asset Minification Utilities
 *
 * Minifies the CSS and JavaScript files into `_site` for the Eleventy build,
 * and for `tools/minifyAssets.js`, which does it without a full build. Each
 * file is written twice: under its own name, and under a name with a hash of
 * its content (ie `styles.3f9a1c2b.css`) for the pages to link, so it can be
 * cached for good.
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
 * import { assetUrl, minifyCss, minifyJs } from './src/helpers/minifyAssets.js'
 * await minifyCss({ srcDir: './src/styles', destDir: './dist/styles' })
 * await minifyJs({ srcDir: './src/scripts', destDir: './dist/scripts' })
 * assetUrl('styles.css') // '/styles/styles.3f9a1c2b.css'
 */

import browserslist from 'browserslist'
import crypto from 'crypto'
import fs from 'fs'
import { browserslistToTargets, transform } from 'lightningcss'
import path from 'path'
import { minify as terserMinify } from 'terser'
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

const hashedUrls = new Map()

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

/**
 * Writes a minified file under its own name and its hashed one
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
  fs.writeFileSync(path.join(destDir, file), content)
  fs.writeFileSync(path.join(destDir, hashedName), content)
  hashedUrls.set(file, `${urlDir}/${hashedName}`)
}

/**
 * The URL of a minified asset's hashed copy, ie `styles.css` -> `/styles/styles.3f9a1c2b.css`
 * @param {string} file
 */
export function assetUrl(file) {
  const url = hashedUrls.get(file)
  if (!url) throw new Error(`No minified asset called "${file}"`)
  return url
}

export async function minifyCss({
  srcDir = path.join(process.cwd(), 'src', 'styles'),
  destDir = path.join(process.cwd(), '_site', 'styles'),
} = {}) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`CSS source dir not found: ${srcDir}`)
    return
  }

  ensureDir(destDir)

  const targets = browserslistToTargets(browserslist(BROWSERS))

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.css'))
  const stats = []

  for (const file of files) {
    const src = path.join(srcDir, file)
    const content = fs.readFileSync(src, 'utf8')

    const result = transform({
      filename: file,
      code: Buffer.from(content),
      minify: true,
      targets,
    })

    const minified = result.code.toString()
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

  recordStat('assetsCss', stats)
}

export async function minifyJs({
  srcDir = path.join(process.cwd(), 'src', 'scripts'),
  destDir = path.join(process.cwd(), '_site', 'scripts'),
} = {}) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`JS source dir not found: ${srcDir}`)
    return
  }

  ensureDir(destDir)

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
    const minified = await terserMinify(linked, {
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

    if (minified.code) {
      const originalSize = Buffer.byteLength(code, 'utf8')
      const minifiedSize = Buffer.byteLength(minified.code, 'utf8')
      const savings = originalSize - minifiedSize
      const savingsPercent = ((savings / originalSize) * 100).toFixed(1)

      writeAsset(destDir, '/scripts', file, minified.code)
      console.log(
        `📦 Minified ${file}: ${originalSize} → ${minifiedSize} bytes (saved ${savings} bytes, ${savingsPercent}%)`
      )
      stats.push({ file, originalSize, minifiedSize })
    }
  }

  recordStat('assetsJs', stats)
}

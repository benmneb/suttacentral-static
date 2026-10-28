/**
 * Asset Minification Utilities
 *
 * Minifies the CSS and JavaScript files into `_site` for the Eleventy build,
 * and for `tools/minifyAssets.js`, which does it without a full build.
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
 * import { minifyCss, minifyJs } from './src/helpers/minifyAssets.js'
 * await minifyCss({ srcDir: './src/styles', destDir: './dist/styles' })
 * await minifyJs({ srcDir: './src/scripts', destDir: './dist/scripts' })
 */

import browserslist from 'browserslist'
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
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
    const dest = path.join(destDir, file)
    const content = fs.readFileSync(src, 'utf8')

    const result = transform({
      filename: file,
      code: Buffer.from(content),
      minify: true,
      targets,
    })

    const minified = result.code.toString()
    fs.writeFileSync(dest, minified)

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

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'))
  const stats = []

  for (const file of files) {
    const filePath = path.join(srcDir, file)
    const code = fs.readFileSync(filePath, 'utf8')

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

    if (minified.code) {
      const originalSize = Buffer.byteLength(code, 'utf8')
      const minifiedSize = Buffer.byteLength(minified.code, 'utf8')
      const savings = originalSize - minifiedSize
      const savingsPercent = ((savings / originalSize) * 100).toFixed(1)

      fs.writeFileSync(path.join(destDir, file), minified.code)
      console.log(
        `📦 Minified ${file}: ${originalSize} → ${minifiedSize} bytes (saved ${savings} bytes, ${savingsPercent}%)`
      )
      stats.push({ file, originalSize, minifiedSize })
    }
  }

  recordStat('assetsJs', stats)
}

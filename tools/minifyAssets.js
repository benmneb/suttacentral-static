/**
 * Asset Minification Utilities
 *
 * Standalone build tool for minifying CSS and JavaScript files without
 * requiring a full Eleventy build. Useful during development to quickly
 * process and optimize static assets.
 *
 * CSS minification uses LightningCSS with browserslist targeting (last 2 years).
 * JS minification uses Terser with dead code elimination and mangling.
 *
 * @module AssetMinifier
 * @requires lightningcss - CSS parser and minifier
 * @requires terser - JavaScript minifier
 * @requires browserslist - Browser compatibility targeting
 *
 * @example
 * // Via pnpm scripts
 * pnpm run minify:css      // Minify CSS only
 * pnpm run minify:js       // Minify JS only
 * pnpm run minify:assets   // Minify both CSS and JS
 *
 * @example
 * // Use programmatically
 * import { minifyCss, minifyJs } from './minify.js'
 * await minifyCss({ srcDir: './src/styles', destDir: './dist/styles' })
 * await minifyJs({ srcDir: './src/scripts', destDir: './dist/scripts' })
 */

import browserslist from 'browserslist'
import fs from 'fs'
import { browserslistToTargets, transform } from 'lightningcss'
import path from 'path'
import { minify as terserMinify } from 'terser'
import { fileURLToPath } from 'url'

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export async function minifyCss({
  srcDir = path.join(process.cwd(), 'styles'),
  destDir = path.join(process.cwd(), '_site', 'styles'),
} = {}) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`CSS source dir not found: ${srcDir}`)
    return
  }

  ensureDir(destDir)

  const targets = browserslistToTargets(browserslist('last 2 years'))

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.css'))

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
  }
}

export async function minifyJs({
  srcDir = path.join(process.cwd(), 'scripts'),
  destDir = path.join(process.cwd(), '_site', 'scripts'),
} = {}) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`JS source dir not found: ${srcDir}`)
    return
  }

  ensureDir(destDir)

  const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'))

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
    }
  }
}

// Handle CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2]
  ;(async () => {
    try {
      if (!arg || arg === 'all') {
        await minifyCss()
        await minifyJs()
      } else if (arg === 'css') {
        await minifyCss()
      } else if (arg === 'js') {
        await minifyJs()
      } else {
        console.error('Unknown arg. Use `css`, `js`, or `all`')
        process.exit(2)
      }
    } catch (e) {
      console.error('Error while minifying assets:', e)
      process.exit(1)
    }
  })()
}

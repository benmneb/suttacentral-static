import browserslist from 'browserslist'
import fs from 'fs'
import htmlmin from 'html-minifier-terser'
import { browserslistToTargets, transform } from 'lightningcss'
import path from 'path'
import { minify } from 'terser'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const targets = browserslistToTargets(browserslist('last 2 years'))

export default function (eleventyConfig) {
  const textTemplate = 'text.liquid'

  if (process.env.SKIP_TEXTS) {
    eleventyConfig.ignores.add(textTemplate)
    console.log('⏭️  Skipping text pages (SKIP_TEXTS enabled)')
  }

  if (process.env.ONLY_TEXTS) {
    eleventyConfig.ignores.add('index.liquid')
    eleventyConfig.ignores.add('pitaka.liquid')
    eleventyConfig.ignores.add('chapter.liquid')
    eleventyConfig.ignores.add('textMeta.liquid')
    eleventyConfig.ignores.add('_404.liquid')
    eleventyConfig.ignores.add('_robots.liquid')
    eleventyConfig.ignores.add('_sitemap.liquid')
    console.log('📄 Building only text pages (ONLY_TEXTS enabled)')
  }

  eleventyConfig.addFilter('endswith', function (str, suffix) {
    if (!str || !suffix) return false
    return str.endsWith(suffix)
  })

  eleventyConfig.addFilter('normalise', function (value) {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  })

  eleventyConfig.addTransform('htmlmin', function (content) {
    if (!(this.page.outputPath || '').endsWith('.html')) return content

    // https://github.com/terser/html-minifier-terser?tab=readme-ov-file#options-quick-reference
    let minified = htmlmin.minify(content, {
      useShortDoctype: true,
      removeComments: true,
      collapseWhitespace: true,
    })

    return minified
  })

  eleventyConfig.addPassthroughCopy('styles')
  eleventyConfig.on('eleventy.after', async () => {
    try {
      const filename = 'styles.css'
      const cssPath = path.join(__dirname, `_site/styles/${filename}`)
      const content = fs.readFileSync(cssPath, 'utf8')

      const result = transform({
        filename,
        code: Buffer.from(content),
        minify: true,
        targets,
      })

      const minified = result.code.toString()
      fs.writeFileSync(cssPath, minified)

      const originalSize = Buffer.byteLength(content, 'utf8')
      const minifiedSize = Buffer.byteLength(minified, 'utf8')
      const savings = originalSize - minifiedSize
      const savingsPercent = ((savings / originalSize) * 100).toFixed(1)
      console.log(
        `📦 Minified ${filename}: ${originalSize} → ${minifiedSize} bytes (saved ${savings} bytes, ${savingsPercent}%)`
      )
    } catch (e) {
      console.error('Error while minifying CSS:', e)
    }
  })

  eleventyConfig.addPassthroughCopy('scripts')
  eleventyConfig.on('eleventy.after', async () => {
    try {
      const scriptsDir = path.join(__dirname, '_site/scripts')
      if (!fs.existsSync(scriptsDir)) return
      const files = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.js'))

      for (const file of files) {
        const filePath = path.join(scriptsDir, file)
        const code = fs.readFileSync(filePath, 'utf8')

        const minified = await minify(code, {
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

          fs.writeFileSync(filePath, minified.code)
          console.log(
            `📦 Minified ${file}: ${originalSize} → ${minifiedSize} bytes (saved ${savings} bytes, ${savingsPercent}%)`
          )
        }
      }
    } catch (e) {
      console.error('Error while minifying JS:', e)
    }
  })

  return {
    dir: {
      input: 'pages',
      includes: '../includes',
      layouts: '../layouts',
      data: '../data',
    },
  }
}

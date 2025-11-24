import fs from 'fs'
import htmlmin from 'html-minifier-terser'
import path from 'path'
import { minify } from 'terser'
import { fileURLToPath } from 'url'

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy('styles') // TODO: minify

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

  eleventyConfig.addPassthroughCopy('scripts')
  // Then minify after build
  eleventyConfig.on('eleventy.after', async () => {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)

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
        fs.writeFileSync(filePath, minified.code)
        console.log(`🚀 Minified: ${file}`)
      }
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

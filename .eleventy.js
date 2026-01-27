import htmlmin from 'html-minifier-terser'
import { minifyCss, minifyJs } from './tools/minifyAssets.js'

const inputDir = 'pages'
const textTemplate = `${inputDir}/text.liquid`
const navTemplates = [
  `${inputDir}/index.liquid`,
  `${inputDir}/pitaka.liquid`,
  `${inputDir}/chapter.liquid`,
  `${inputDir}/textMeta.liquid`,
]
const utilTemplates = [
  `${inputDir}/_search.liquid`,
  `${inputDir}/_404.liquid`,
  `${inputDir}/_robots.liquid`,
  `${inputDir}/_sitemap.liquid`,
]

export default function (eleventyConfig) {
  if (process.env.ONLY_NAV) {
    eleventyConfig.ignores.add(textTemplate)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('⏭️  Building only nav pages (ONLY_NAV enabled)')
  } else if (process.env.ONLY_TEXTS) {
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('📄 Building only text pages (ONLY_TEXTS enabled)')
  } else if (process.env.ONLY_UTILS) {
    eleventyConfig.ignores.add(textTemplate)
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('🧰 Building only utility pages (ONLY_UTILS enabled)')
  }

  eleventyConfig.addFilter('endswith', function (str, suffix) {
    if (!str || !suffix) return false
    return str.endsWith(suffix)
  })

  eleventyConfig.addFilter('normalise', function (value) {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  })

  eleventyConfig.addFilter('parseJSON', function (value) {
    try {
      return JSON.parse(value)
    } catch (e) {
      console.error('parseJSON error:', e)
      return {}
    }
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

  eleventyConfig.addPassthroughCopy('images')

  eleventyConfig.addPassthroughCopy('styles')
  eleventyConfig.on('eleventy.after', async () => {
    try {
      await minifyCss()
    } catch (e) {
      console.error('Error while minifying CSS:', e)
    }
  })

  eleventyConfig.addPassthroughCopy('scripts')
  eleventyConfig.on('eleventy.after', async () => {
    try {
      await minifyJs()
    } catch (e) {
      console.error('Error while minifying JS:', e)
    }
  })

  return {
    dir: {
      input: inputDir,
      includes: '../includes',
      layouts: '../layouts',
      data: '../data',
    },
  }
}

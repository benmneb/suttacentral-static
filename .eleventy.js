import htmlmin from 'html-minifier-terser'
import { recordStat } from './tools/buildStats.js'
import { minifyCss, minifyJs } from './tools/minifyAssets.js'
import { parseUidNumbers } from './tools/rangeSuttas.js'

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

  // A parallel's key says which span of this text it covers. That span can run across two suttas -
  // sn36.31 is keyed sn36.30-31, because the parallel covers the pair - and such a span is no uid at all,
  // so it gets swapped for the text on screen, as on .net. A key naming one sutta is kept, so the rows of
  // a range page like /an1.170-187 still point at an1.173, an1.174 and so on, one each
  eleventyConfig.addFilter('parallelPath', function (key, uid) {
    const base = String(key).split('#')[0]
    const span = parseUidNumbers(base)
    return span && span.start !== span.end ? uid : base
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
      collapseBooleanAttributes: true,
      // Not removeOptionalTags: browsers build the same DOM without them, but Pagefind takes a closing tag
      // as a word break, so text running into one (ie "possessions?’</p><p>SC") gets indexed as one word
    })

    return minified
  })

  let buildStart
  eleventyConfig.on('eleventy.before', () => {
    buildStart = Date.now()
  })
  eleventyConfig.on('eleventy.after', ({ results }) => {
    recordStat('eleventy', {
      files: results?.length,
      seconds: (Date.now() - buildStart) / 1000,
    })
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

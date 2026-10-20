import htmlmin from 'html-minifier-terser'
import { recordStat } from './tools/buildStats.js'
import { heroicons } from './tools/heroicons.js'
import { minifyCss, minifyJs } from './tools/minifyAssets.js'
import { isMultiTextSpan } from './tools/rangeSuttas.js'
import {
  referenceEditionName,
  referenceGroup,
} from './tools/referenceEditions.js'
import { sampleUids } from './tools/samplePages.js'
import {
  formatVolpages,
  isHeadingHTML,
  rootTitle,
  softHyphenateTitle,
} from './tools/strings.js'

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

  // Not the sitemap, which would be written over with only the sample in it
  if (sampleUids) {
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log(`🧪 Building only ${sampleUids.join(', ')} (ONLY_UIDS enabled)`)
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
    return isMultiTextSpan(base) ? uid : base
  })

  // The printed edition a reference id is from, for its tooltip, ie bj10.20 -> "Buddhajayantītripiṭaka, 1957–1989"
  eleventyConfig.addFilter('referenceEdition', function (id) {
    return referenceEditionName(id) ?? id
  })

  eleventyConfig.addFilter('referenceGroup', referenceGroup)

  // A legacy text's own references get their group as a class too, as segmented ones do
  eleventyConfig.addFilter('addReferenceGroups', function (html) {
    return String(html ?? '').replace(
      /class='ref ([^' ]+)/g,
      (match, id) => `${match} ${referenceGroup(id)}`
    )
  })

  eleventyConfig.addFilter('softHyphenateTitle', softHyphenateTitle)
  eleventyConfig.addFilter('isHeading', isHeadingHTML)
  eleventyConfig.addFilter('formatVolpages', formatVolpages)
  eleventyConfig.addFilter('formatNumber', function (number) {
    return new Intl.NumberFormat('en').format(number)
  })

  eleventyConfig.addShortcode('rootTitle', rootTitle)

  eleventyConfig.addShortcode('icon', function (name) {
    if (!heroicons[name]) throw new Error(`No heroicon called "${name}"`)
    return heroicons[name]
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

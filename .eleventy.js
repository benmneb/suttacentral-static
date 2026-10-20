import htmlmin from 'html-minifier-terser'
import masterData from './data/_masterData.js'
import { recordStat } from './helpers/buildStats.js'
import { heroicons } from './helpers/heroicons.js'
import { localImage } from './helpers/images.js'
import { minifyCss, minifyJs } from './helpers/minifyAssets.js'
import { isMultiTextSpan } from './helpers/rangeSuttas.js'
import {
  referenceEditionName,
  referenceGroup,
} from './helpers/referenceEditions.js'
import { sampleUids } from './helpers/samplePages.js'
import { createSiteLinkFixer } from './helpers/siteLinks.js'
import { missingKeys, t } from './helpers/siteStrings.js'
import {
  formatVolpages,
  isHeadingHTML,
  rootTitle,
  softHyphenateTitle,
} from './helpers/strings.js'

const inputDir = 'pages'
const textTemplate = `${inputDir}/text.liquid`
const navTemplates = [
  `${inputDir}/index.liquid`,
  `${inputDir}/pitaka.liquid`,
  `${inputDir}/chapter.liquid`,
  `${inputDir}/textMeta.liquid`,
]
const siteTemplates = `${inputDir}/site/**`
const utilTemplates = [
  `${inputDir}/_search.liquid`,
  `${inputDir}/_404.liquid`,
  `${inputDir}/_robots.liquid`,
  `${inputDir}/_sitemap.liquid`,
]

export default function (eleventyConfig) {
  if (process.env.ONLY_NAV) {
    eleventyConfig.ignores.add(textTemplate)
    eleventyConfig.ignores.add(siteTemplates)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('⏭️  Building only nav pages (ONLY_NAV enabled)')
  } else if (process.env.ONLY_TEXTS) {
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(siteTemplates)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('📄 Building only text pages (ONLY_TEXTS enabled)')
  } else if (process.env.ONLY_UTILS) {
    eleventyConfig.ignores.add(textTemplate)
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('🧰 Building only utility pages (ONLY_UTILS enabled)')
  } else if (process.env.ONLY_SITE) {
    eleventyConfig.ignores.add(textTemplate)
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('ℹ️  Building only site pages (ONLY_SITE enabled)')
  }

  // Not the sitemap, which would be written over with only the sample in it
  if (sampleUids) {
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(siteTemplates)
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

  eleventyConfig.addFilter('t', t)

  // A remote image as a local one, as everything has to work offline
  eleventyConfig.addShortcode(
    'siteImage',
    async function (url, alt = '', height = 1600) {
      const image = await localImage(url, { dir: 'site-pages', height })
      const altText = String(alt)
        .replace(/<[^>]*>/g, '')
        .replace(/&(?!#?\w+;)/g, '&amp;')
        .replace(/"/g, '&quot;')
      const size = image.width
        ? ` width="${image.width}" height="${image.height}"`
        : ''
      return `<img src="${image.src}" alt="${altText}"${size} loading="lazy">`
    }
  )

  eleventyConfig.addFilter('parseJSON', function (value) {
    try {
      return JSON.parse(value)
    } catch (e) {
      console.error('parseJSON error:', e)
      return {}
    }
  })

  let siteLinkFixer
  eleventyConfig.addTransform('siteLinks', async function (content) {
    if (!this.page.inputPath?.startsWith(`./${inputDir}/site/`)) return content
    siteLinkFixer ??= masterData().then(createSiteLinkFixer)
    return (await siteLinkFixer)(content, this.page.url)
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
    const missing = missingKeys()
    recordStat('siteStrings', { missing: missing.length })
    if (missing.length) {
      console.warn(
        `⚠️  Site page strings .net doesn't have, left empty: ${missing.join(', ')}`
      )
    }
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

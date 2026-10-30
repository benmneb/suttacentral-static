import fs from 'fs'
import htmlmin from 'html-minifier-terser'
import masterData from './src/data/_masterData.js'
import siteMetaData from './src/data/_siteMetaData.js'
import { recordStat } from './src/helpers/buildStats.js'
import { defineHref, loadDefineWords } from './src/helpers/defineWords.js'
import { loadDictionaries } from './src/helpers/dictionaries.js'
import { localImage } from './src/helpers/images.js'
import { loadLookup } from './src/helpers/lookupAnswers.js'
import { writeLookupShards } from './src/helpers/lookupShards.js'
import { mapData } from './src/helpers/mapPlaces.js'
import { writeMiniMap } from './src/helpers/miniMap.js'
import { assetUrl, minifyCss, minifyJs } from './src/helpers/minifyAssets.js'
import { ogTags } from './src/helpers/pageMetadata.js'
import { parallelAnchor, parallelKeyLabel } from './src/helpers/parallelRuns.js'
import { isMultiTextSpan } from './src/helpers/rangeSuttas.js'
import {
  referenceEditionName,
  referenceGroup,
} from './src/helpers/referenceEditions.js'
import { sampleUids } from './src/helpers/samplePages.js'
import { SC_ORIGIN } from './src/helpers/scApi.js'
import { createSiteLinkFixer } from './src/helpers/siteLinks.js'
import { missingKeys, t } from './src/helpers/siteStrings.js'
import {
  closeHeadingGaps,
  dropEmptyHeadings,
  formatVolpages,
  isHeadingHTML,
  langTag,
  languageName,
  rootTitle,
  softHyphenateTitle,
  textRefs,
} from './src/helpers/strings.js'
import { loadTitleParts } from './src/helpers/titleParts.js'
import { writeVolpages } from './src/helpers/volpages.js'

const inputDir = 'src/pages'
const textTemplate = `${inputDir}/text.liquid`
const navTemplates = [
  `${inputDir}/index.liquid`,
  `${inputDir}/pitaka.liquid`,
  `${inputDir}/chapter.liquid`,
  `${inputDir}/textMeta.liquid`,
]
const siteTemplates = `${inputDir}/site/**`
const defineTemplates = `${inputDir}/define/**`
const utilTemplates = [
  `${inputDir}/_robots.liquid`,
  `${inputDir}/_sitemap.liquid`,
  `${inputDir}/_sitemapIndex.liquid`,
]
const iconNames = new Set(
  fs
    .readdirSync('src/styles')
    .filter(file => file.endsWith('.css'))
    .flatMap(file =>
      [
        ...fs
          .readFileSync(`src/styles/${file}`, 'utf8')
          .matchAll(/\.i-([A-Za-z0-9]+) \{/g),
      ].map(match => match[1])
    )
)

export default function (eleventyConfig) {
  // So every `include` is not read and parsed again for each of ~140k pages
  // Keyed by include name, so no two `includes` can share a name, even in different folders
  eleventyConfig.setLiquidOptions({ cache: true })

  if (process.env.ONLY_NAV) {
    eleventyConfig.ignores.add(textTemplate)
    eleventyConfig.ignores.add(siteTemplates)
    eleventyConfig.ignores.add(defineTemplates)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('⏭️  Building only nav pages (ONLY_NAV enabled)')
  } else if (process.env.ONLY_TEXTS) {
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(siteTemplates)
    eleventyConfig.ignores.add(defineTemplates)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('📄 Building only text pages (ONLY_TEXTS enabled)')
  } else if (process.env.ONLY_UTILS) {
    // The sitemaps come out empty, as they list `collections.all` and this leaves no pages in it
    eleventyConfig.ignores.add(textTemplate)
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(siteTemplates)
    eleventyConfig.ignores.add(defineTemplates)
    console.log('🧰 Building only utility pages (ONLY_UTILS enabled)')
  } else if (process.env.ONLY_SITE) {
    eleventyConfig.ignores.add(textTemplate)
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(defineTemplates)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('ℹ️  Building only site pages (ONLY_SITE enabled)')
  } else if (process.env.ONLY_DEFINE) {
    eleventyConfig.ignores.add(textTemplate)
    navTemplates.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(siteTemplates)
    utilTemplates.forEach(page => eleventyConfig.ignores.add(page))
    console.log('📖 Building only /define pages (ONLY_DEFINE enabled)')
  }

  // Not the sitemap, which would be written over with only the sample in it.
  // The /define pages are narrowed to a sample of their own, in `defineData.js`
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

  eleventyConfig.addFilter('parallelLabel', parallelKeyLabel)
  eleventyConfig.addFilter('parallelAnchor', parallelAnchor)

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
  eleventyConfig.addFilter('languageName', languageName)
  eleventyConfig.addFilter('isHeading', isHeadingHTML)
  eleventyConfig.addFilter('formatVolpages', formatVolpages)
  eleventyConfig.addFilter('formatNumber', function (number) {
    return new Intl.NumberFormat('en').format(number)
  })

  eleventyConfig.addShortcode('rootTitle', rootTitle)
  eleventyConfig.addShortcode('textRefs', textRefs)

  eleventyConfig.addShortcode('icon', function (name, size) {
    if (!iconNames.has(name)) throw new Error(`No icon called "${name}"`)
    return `<i class="icon${size ? ` ${size}` : ''} i-${name}"></i>`
  })

  eleventyConfig.addFilter('asset', assetUrl)
  eleventyConfig.addFilter('t', t)
  eleventyConfig.addFilter('langTag', langTag)
  eleventyConfig.addFilter('defineHref', defineHref)

  // A built page's route as the browser has it, with no trailing slash: page.url's /about/ is /about
  eleventyConfig.addFilter('route', function (url) {
    const path = String(url ?? '')
    return path === '/' ? path : path.replace(/\/+$/, '')
  })

  eleventyConfig.addFilter('hostname', function (url) {
    return new URL(url).hostname
  })

  // Each word of a Pāli root text into word lookup's answers, leaving the text as it is
  eleventyConfig.addFilter('lookupWords', async function (html, lang) {
    if (lang === 'pli') (await loadLookup()).addWords(html)
    return html
  })

  // A root title's words, for search to find a compound title by any of them
  eleventyConfig.addFilter('titleParts', async function (title) {
    return (await loadTitleParts())(title)
  })

  // SuttaCentral.net itself, for the links and images the pages point at
  eleventyConfig.addGlobalData('scOrigin', SC_ORIGIN)

  // Which root languages have word lookup, as its dictionaries were fetched
  eleventyConfig.addGlobalData('lookup', async () => {
    const [lookup, dictionaries] = await Promise.all([
      loadLookup(),
      loadDictionaries(),
    ])
    return { pli: lookup.available, lzh: !!dictionaries.ddb?.data.length }
  })

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

  // The site's own Open Graph tags, for a page with none of its own
  eleventyConfig.addFilter('ogTags', function (title, url) {
    return ogTags({ title, description: siteMetaData().description, url })
  })

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
    const { inputPath = '' } = this.page
    if (
      !inputPath.startsWith(`./${inputDir}/site/`) &&
      !inputPath.startsWith(`./${inputDir}/define/`)
    ) {
      return content
    }
    siteLinkFixer ??= Promise.all([masterData(), loadDefineWords()]).then(
      ([tree, defineWords]) => createSiteLinkFixer(tree, defineWords)
    )
    return (await siteLinkFixer)(content, this.page.url)
  })

  eleventyConfig.addTransform('htmlmin', async function (content) {
    if (!(this.page.outputPath || '').endsWith('.html')) return content

    // https://github.com/terser/html-minifier-terser?tab=readme-ov-file#options-quick-reference
    const minified = await htmlmin.minify(content, {
      useShortDoctype: true,
      removeComments: true,
      collapseWhitespace: true,
      collapseBooleanAttributes: true,
      // Not removeOptionalTags: browsers build the same DOM without them, but Pagefind takes a closing tag
      // as a word break, so text running into one (ie "possessions?’</p><p>SC") gets indexed as one word
    })

    // The API's own HTML, ie a legacy text's <li class="division" lang='pli'>, has .net's codes too
    return closeHeadingGaps(
      dropEmptyHeadings(
        minified.replace(/(?<=\s(?:href)?lang=")[a-z]{3}(?=")/g, langTag)
      )
    )
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

  // A sample build adds its texts' words to the answers already written
  const buildsTexts = ![
    'ONLY_NAV',
    'ONLY_SITE',
    'ONLY_UTILS',
    'ONLY_DEFINE',
  ].some(flag => process.env[flag])
  eleventyConfig.on('eleventy.after', async () => {
    if (!buildsTexts) return
    try {
      await writeLookupShards({ merge: !!sampleUids })
    } catch (e) {
      console.error('Error while writing the lookup dictionaries:', e)
    }
  })

  // With /search, but not in a sample build, which has only some texts
  const buildsSearch =
    !sampleUids &&
    !['ONLY_NAV', 'ONLY_TEXTS', 'ONLY_UTILS', 'ONLY_DEFINE'].some(
      flag => process.env[flag]
    )
  eleventyConfig.on('eleventy.after', async () => {
    if (!buildsSearch) return
    try {
      await writeVolpages(await masterData())
    } catch (e) {
      console.error('Error while writing the PTS pages:', e)
    }
  })

  // With /map, /define and /search, whose mini maps share it
  const buildsMiniMaps = !['ONLY_NAV', 'ONLY_TEXTS', 'ONLY_UTILS'].some(
    flag => process.env[flag]
  )
  eleventyConfig.on('eleventy.after', async () => {
    if (!buildsMiniMaps) return
    try {
      await writeMiniMap(await mapData())
    } catch (e) {
      console.error('Error while writing the mini maps:', e)
    }
  })

  eleventyConfig.addPassthroughCopy({ 'src/images': 'images' })

  // Before the pages, which link the hashed names
  eleventyConfig.on('eleventy.before', async () => {
    await minifyCss()
    await minifyJs()
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

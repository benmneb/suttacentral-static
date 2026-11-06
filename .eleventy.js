import fs from 'fs'
import masterData, { fetchedAt } from './src/data/_masterData.js'
import siteMetaData from './src/data/_siteMetaData.js'
import { builds, buildStage } from './src/helpers/buildStage.js'
import { recordStat } from './src/helpers/buildStats.js'
import { defineHref, loadDefineWords } from './src/helpers/defineWords.js'
import { loadDictionaries } from './src/helpers/dictionaries.js'
import { localImage } from './src/helpers/images.js'
import { loadLookup } from './src/helpers/lookupAnswers.js'
import { writeLookupShards } from './src/helpers/lookupShards.js'
import { mapData } from './src/helpers/mapPlaces.js'
import { writeMiniMap } from './src/helpers/miniMap.js'
import {
  assetUrl,
  minifyCss,
  minifyHtmlCode,
  minifyJs,
} from './src/helpers/minifyAssets.js'
import { setOutputDir } from './src/helpers/outputDir.js'
import { ogTags } from './src/helpers/pageMetadata.js'
import {
  parallelAnchor,
  parallelKeyLabel,
  parallelPath,
} from './src/helpers/parallelRuns.js'
import {
  referenceEditionName,
  referenceGroup,
} from './src/helpers/referenceEditions.js'
import { sampleUids } from './src/helpers/samplePages.js'
import { SC_ORIGIN } from './src/helpers/scApi.js'
import { segmentsHtml } from './src/helpers/segmentsHtml.js'
import { createSiteLinkFixer } from './src/helpers/siteLinks.js'
import { missingKeys, t } from './src/helpers/siteStrings.js'
import {
  closeHeadingGaps,
  dropEmptyHeadings,
  formatVolpages,
  isHeadingHTML,
  langTag,
  languageName,
  isTitled,
  normalise,
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
const sitemapTemplate = `${inputDir}/_sitemap.liquid`
const stageTemplates = {
  texts: [textTemplate],
  define: [`${inputDir}/define/**`],
  nav: navTemplates,
  site: [`${inputDir}/site/**`, `${inputDir}/_robots.liquid`],
}
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
  setOutputDir(eleventyConfig.directories.output)

  // So every `include` is not read and parsed again for each of ~140k pages
  // Keyed by include name, so no two `includes` can share a name, even in different folders
  eleventyConfig.setLiquidOptions({ cache: true })
  // Not the legacy parsing, which parses a shortcode's arguments again on every call
  eleventyConfig.setLiquidParameterParsing('builtin')

  for (const [stage, templates] of Object.entries(stageTemplates)) {
    if (!builds(stage))
      templates.forEach(page => eleventyConfig.ignores.add(page))
  }
  if (buildStage) console.log(`🧱 Building only the ${buildStage} pages`)
  if (process.env.REFETCH) {
    console.log(
      `🔄 Refetching data cached before REFETCH=${process.env.REFETCH}`
    )
  }

  // Not the sitemap, which would be written over with only the sample in it.
  // The /define pages are narrowed to a sample of their own, in `defineData.js`
  if (sampleUids) {
    stageTemplates.site.forEach(page => eleventyConfig.ignores.add(page))
    eleventyConfig.ignores.add(sitemapTemplate)
    console.log(`🧪 Building only ${sampleUids.join(', ')} (ONLY_UIDS enabled)`)
  }

  eleventyConfig.addFilter('endswith', function (str, suffix) {
    if (!str || !suffix) return false
    return str.endsWith(suffix)
  })

  eleventyConfig.addFilter('normalise', normalise)

  eleventyConfig.addFilter('parallelPath', parallelPath)
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
  eleventyConfig.addFilter('isTitled', isTitled)
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

  eleventyConfig.addFilter('segmentsHtml', segmentsHtml)

  // A root title's words, for search to find a compound title by any of them
  eleventyConfig.addFilter('titleParts', async function (title) {
    return (await loadTitleParts())(title)
  })

  eleventyConfig.addGlobalData('buildStage', buildStage ?? '')

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
    async function (url, alt = '', height = 1600, loading = 'eager') {
      const image = await localImage(url, { dir: 'site-pages', height })
      const altText = String(alt)
        .replace(/<[^>]*>/g, '')
        .replace(/&(?!#?\w+;)/g, '&amp;')
        .replace(/"/g, '&quot;')
      const size = image.width
        ? ` width="${image.width}" height="${image.height}"`
        : ''
      const lazy = loading === 'lazy' ? ' loading="lazy"' : ''
      return `<img src="${image.src}" alt="${altText}"${size}${lazy}>`
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

    const minified = await minifyHtmlCode(content)

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
    recordStat(
      'eleventy',
      {
        files: results?.length,
        seconds: (Date.now() - buildStart) / 1000,
      },
      (earlier, value) => ({ ...earlier, [buildStage ?? 'all']: value })
    )
    const missing = missingKeys()
    recordStat('siteStrings', { missing: missing.length })
    if (missing.length) {
      console.warn(
        `⚠️  Site page strings .net doesn't have, left empty: ${missing.join(', ')}`
      )
    }
  })

  const minsSince = start => ((Date.now() - start) / 60_000).toFixed(2)
  let pageCount, contentStart
  eleventyConfig.on('eleventy.contentMap', ({ urlToInputPath }) => {
    pageCount = new Intl.NumberFormat('en').format(
      Object.keys(urlToInputPath).length
    )
    console.log(
      `📄 Laid out ${pageCount} pages in ~${minsSince(fetchedAt ?? buildStart)} mins, rendering them`
    )
    contentStart = Date.now()
  })
  eleventyConfig.on('eleventy.layouts', () => {
    console.log(
      `✍️  Rendered ${pageCount} pages in ~${minsSince(contentStart)} mins, writing them`
    )
  })

  // A sample build adds its texts' words to the answers already written
  eleventyConfig.on('eleventy.after', async () => {
    if (!builds('texts')) return
    try {
      await writeLookupShards({ merge: !!sampleUids })
    } catch (e) {
      console.error('Error while writing the lookup dictionaries:', e)
    }
  })

  // With /search, but not in a sample build, which has only some texts
  eleventyConfig.on('eleventy.after', async () => {
    if (sampleUids || !builds('site')) return
    try {
      await writeVolpages(await masterData())
    } catch (e) {
      console.error('Error while writing the PTS pages:', e)
    }
  })

  // With /map, /define and /search, whose mini maps share it, before the pages, which link its hashed name
  eleventyConfig.on('eleventy.before', async () => {
    if (!builds('site') && !builds('define')) return
    await writeMiniMap(await mapData())
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

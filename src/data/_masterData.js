import Fetch, { AssetCache } from '@11ty/eleventy-fetch'
import ora from 'ora'
import { recordStat } from '../helpers/buildStats.js'
import { fixCommentLinks } from '../helpers/commentLinks.js'
import { fixPaginationLinks } from '../helpers/paginationLinks.js'
import { addParallelDetails } from '../helpers/parallelLinks.js'
import { parseUidNumbers } from '../helpers/rangeSuttas.js'
import {
  fetchOptions,
  leafUrl,
  menuUrl,
  parallelsUrl,
  publicationInfoUrl,
  segmentedTranslationUrl,
  suttasUrl,
} from '../helpers/scApi.js'
import { fixMovedLegacyLinks } from '../helpers/siteLinks.js'
import { bilaraMarkup, normalizeStrings } from '../helpers/strings.js'
import { createLinkResolver } from '../helpers/textLinks.js'
import shortcutsData from './_shortcuts.json' with { type: 'json' }

const DEV_MODE = process.env.NODE_ENV !== 'prod'
const MAX_CONCURRENT_REQUESTS = 50
const SCT_NAME = 'SuttaCentral Taishō'

let cachedMasterData = null
let shortcutsList = []
let isBuilding = false

const spinner = ora('Fetching...')
spinner.spinner = { frames: ['⏳'] }

const startTime = Date.now()
let endpointsHit = 0
let fetchErrors = 0
let pubInfoErrors = 0
let cacheTimeErrors = 0

// The API returns parallels in no particular order (ie sn1.20#20.1 before sn1.20#2.1), so they're sorted
// as numbers: the whole sutta, then #2.1, #20.1, #21.1...
const parallelsCollator = new Intl.Collator('en', { numeric: true })
function sortParallels(parallels) {
  if (!parallels || typeof parallels !== 'object') return parallels
  return Object.fromEntries(
    Object.entries(parallels).sort(([a], [b]) =>
      parallelsCollator.compare(a, b)
    )
  )
}

/**
 * A text's printed-edition references as .net makes them: without whitespace, which a few have (ie dn33:1.11.85),
 * and leaving out any named like an id the text has, ie pdhp2 on the verse pdhp2
 */
function tidyReferences(bilaraData) {
  const refs = bilaraData.reference_text
  if (!refs) return
  const ids = new Set()
  for (const html of Object.values(bilaraData.html_text ?? {})) {
    for (const [, id] of html.matchAll(/\bid=['"]([^'"]+)/g)) ids.add(id)
  }
  for (const key in refs) {
    refs[key] = refs[key]
      .replace(/\s+/g, '')
      .split(',')
      .filter(ref => ref && !ids.has(ref))
      .join(',')
  }
}

// Slips in bilara html, as a text's segments joined by \0 so one can span two
const HTML_SLIPS = [
  // vb16's, where every other text has data-counter
  [/<p counter=/g, '<p data-counter='],
  // sa1's header list, which its title would be in
  [/(<header><ul>(?:(?!<\/ul>)[^])*?)(?=<h1)/g, '$1</ul>'],
  // pli-tv-bu-vb-np10's rule between two items, which a list can't have
  [/<\/dd>(\0)<hr>/g, '<hr></dd>$1'],
  // t765's byline, a list item after the header, as the header's last line
  [
    /<\/header>(\0)<li class='subheading'>\{\}<\/li>/g,
    "$1<p class='subheading'>{}</p></header>",
  ],
]

/** A text's html with `HTML_SLIPS` mended */
function tidyHtml(bilaraData) {
  const html = bilaraData.html_text
  const keys = bilaraData.keys_order
  if (!html || !keys) return
  const joined = keys.map(key => html[key] ?? '').join('\0')
  let tidied = joined
  for (const [slip, mend] of HTML_SLIPS) tidied = tidied.replace(slip, mend)
  if (tidied === joined) return
  tidied.split('\0').forEach((text, i) => {
    if (text !== (html[keys[i]] ?? '')) html[keys[i]] = text
  })
}

const SECTIONING_TAGS = /<(\/?)(article|section|h[1-6])\b/g

/**
 * A text's articles and sections with no heading of their own as divs, ie dhp4 in dhp1-20, under dhp3's title,
 * every text of an1.378-393 and the Vinaya's marked passages, ie <section class='kamma'>. Closes the article
 * Taishō texts leave open
 */
function tidySections(bilaraData) {
  const html = bilaraData.html_text
  const keys = bilaraData.keys_order
  if (!html || !keys) return
  const open = []
  const untitled = new Set()
  let tag = 0
  for (const key of keys) {
    for (const [, close, name] of (html[key] ?? '').matchAll(SECTIONING_TAGS)) {
      const n = tag++
      // As the validator counts them, a heading in a nested section isn't the outer one's
      if (name.startsWith('h')) {
        if (!close && open.length) open.at(-1).titled = true
      } else if (!close) {
        open.push({ name, tag: n, titled: false })
      } else if (open.at(-1)?.name === name) {
        const element = open.pop()
        if (!element.titled) untitled.add(element.tag).add(n)
      }
    }
  }
  const last = keys.at(-1)
  for (const element of open.reverse()) {
    if (!element.titled) untitled.add(element.tag).add(tag)
    tag++
    html[last] = `${html[last] ?? ''}</${element.name}>`
  }
  if (!untitled.size) return
  tag = 0
  for (const key of keys) {
    if (!html[key]) continue
    html[key] = html[key].replace(SECTIONING_TAGS, (match, close) =>
      untitled.has(tag++) ? `<${close}div` : match
    )
  }
}

/**
 * Fetches JSON data, its strings in NFC, with caching and cache timestamp tracking.
 *
 * Uses Eleventy Fetch to cache responses and adds a `scx_fetched_at` property
 * indicating when the data was originally fetched from Sutta Central (not when
 * it was served from cache) to print on the page for all to see.
 *
 * @param {string} url - The SuttaCentral API URL to fetch data from
 * @returns {Promise<Object>} The returned JSON data with an additional `scx_fetched_at` property
 */
async function fetchJson(url) {
  endpointsHit++

  const options = fetchOptions(url)

  const data = normalizeStrings(await Fetch(url, options))

  let scx_fetched_at = new Date().toUTCString() // Current time for new fetches

  try {
    const cache = new AssetCache(url, '.cache', options)
    const cachedTimestamp = cache.getCachedTimestamp()
    if (cachedTimestamp) {
      scx_fetched_at = new Date(cachedTimestamp).toUTCString()
    }
  } catch (error) {
    cacheTimeErrors++
    // Use current time as fallback as well
    console.warn(`Could not read cache timestamp for ${url}:`, error.message)
  }

  if (Array.isArray(data)) {
    return data.map(item => ({ ...item, scx_fetched_at }))
  } else {
    return { ...data, scx_fetched_at }
  }
}

/**
 * Used to limit simultaneous processing of data, to avoid NodeJS memory heap errors.
 * Eleventy Fetch already includes HTTP concurrency: https://www.11ty.dev/docs/plugins/fetch/#change-global-concurrency
 */
async function limitConcurrency(promises, limit) {
  const results = []
  for (let i = 0; i < promises.length; i += limit) {
    const batch = promises.slice(i, i + limit)
    const batchResults = await Promise.all(batch)
    results.push(...batchResults)
  }
  return results
}

async function fetchShortcutsList() {
  try {
    if (!shortcutsData[0]?.shortcuts) {
      throw new Error('Invalid shortcuts data structure')
    }
    shortcutsList = shortcutsData[0].shortcuts
  } catch (e) {
    spinner
      .fail('Could not load shortcuts.json, this will break "shortcut" links')
      .start()
    console.error(e)
  }
}

async function fetchDataTree(uid, depth = 0) {
  let menuData
  try {
    menuData = await fetchJson(menuUrl(uid))
  } catch (e) {
    fetchErrors++
    spinner
      .fail(`Fetch error for /menu with uid: ${uid} at depth ${depth}`)
      .start()
    return null
  }

  if (!menuData || !Array.isArray(menuData) || !menuData[0]) {
    spinner
      .warn(
        `Malformed or empty data from /menu for uid: ${uid} at depth ${depth}`
      )
      .start()
    return null
  }

  // /menu gives some nodes an empty child with a null uid, ie g2dhp
  let node = {
    ...menuData[0],
    ...(menuData[0].children && {
      children: menuData[0].children.filter(child => child?.uid),
    }),
  }

  async function getTextData() {
    let suttaplexData = null
    try {
      suttaplexData = await fetchJson(leafUrl(node.uid))
    } catch (e) {
      fetchErrors++
      spinner.fail(`Fetch error for /suttaplex with uid: ${node.uid}`).start()
    }

    if (!suttaplexData || !Array.isArray(suttaplexData) || !suttaplexData[0]) {
      return node
    }

    let parallelsData = null
    try {
      parallelsData = sortParallels(await fetchJson(parallelsUrl(node.uid)))
    } catch (e) {
      fetchErrors++
      spinner.fail(`Fetch error for /parallels/${node.uid}`).start()
    }

    const translations = suttaplexData[0]?.translations
    if (!Array.isArray(translations) || !translations.length) {
      return { ...node, ...suttaplexData[0], _parallels_data: parallelsData }
    }

    function filterTranslations(translations) {
      if (!translations.length) return []
      return (
        translations
          .filter(t => t.lang === 'en' || t.is_root)
          // The API names the Taishō edition "Taisho Tipitaka" on one text and nothing on the rest
          .map(t => (t.author_uid === 'sct' ? { ...t, author: SCT_NAME } : t))
        // return translations // oh no my memory 🤯
      )
    }

    const translationsToProcess = filterTranslations(translations)

    const translationPromises = translationsToProcess.map(async trans => {
      let bilaraData
      if (trans.segmented) {
        try {
          bilaraData = await fetchJson(
            segmentedTranslationUrl(node.uid, trans.author_uid, trans.lang)
          )
          for (const texts of [
            bilaraData.root_text,
            bilaraData.translation_text,
          ]) {
            for (const key in texts) texts[key] = bilaraMarkup(texts[key])
          }
          tidyReferences(bilaraData)
          tidyHtml(bilaraData)
          tidySections(bilaraData)
        } catch (e) {
          fetchErrors++
          spinner
            .fail(
              `Fetch error for '/bilarasuttas' with translation: ${node.uid}/${trans.author_uid} at depth ${depth}`
            )
            .start()
          return null
        }
      }

      let suttasData
      try {
        suttasData = await fetchJson(
          suttasUrl(node.uid, trans.author_uid, trans.lang)
        )
        suttasData.suttaplex.translations = filterTranslations(
          suttasData.suttaplex.translations
        )
      } catch (e) {
        fetchErrors++
        spinner
          .fail(
            `Fetch error for /suttas with translation: ${node.uid}/${trans.author_uid} at depth ${depth}`
          )
          .start()
        return null
      }

      let publicationData
      try {
        publicationData = await fetchJson(
          publicationInfoUrl(node.uid, trans.lang, trans.author_uid)
        )
      } catch {
        fetchErrors++
        pubInfoErrors++
        publicationData = { error: true }
        // It's possibly only root texts and Sujato's translations actually have data here.
        // This error object is what SC returns for errors also, ie: https://suttacentral.net/api/publication_info/dn1/en/bodhi
      }

      // Add translated texts and publication info into `/suttaplex`.translations
      // to keep the texts data with its meta-data.
      return {
        ...trans,
        _suttas_data: suttasData,
        ...(trans.segmented && { _bilarasuttas_data: bilaraData }),
        ...(!publicationData.error && {
          _publication_info: publicationData[0],
        }),
      }
    })

    const mergedTranslations = await limitConcurrency(
      translationPromises,
      MAX_CONCURRENT_REQUESTS
    )

    return {
      ...node,
      ...suttaplexData[0],
      translations: mergedTranslations.filter(Boolean),
      _parallels_data: parallelsData,
    }
  }

  if (node.node_type === 'leaf') {
    // Assign marker and add useful metadata for "range suttas",
    // for use later to extract individual range suttas in `text(Meta)Data.js` files
    const range = /^(an|sn|dhp)\d/.test(node.uid) && parseUidNumbers(node.uid)
    if (range && range.start !== range.end) {
      const flatRange = []
      for (let i = range.start; i <= range.end; i++) {
        flatRange.push(`${range.prefix}${i}`) // ie. "an1.1" ... "an1.10"
      }

      node = {
        ...node,
        ...(!!flatRange.length && {
          scx_range_sutta: true,
          scx_range_sutta_uid: node.uid, // ie. "an1.1-10", the same as `_suttas_data.range_uid`, but _suttas_data is only available in translations
          scx_range_sutta_range_uids: flatRange,
        }),
      }
    }

    return await getTextData()
  }

  // Assign marker for "Shortcut to all suttas" links. Only needed for `branch` nodes.
  if (shortcutsList.includes(node.uid)) {
    node = { ...node, scx_shortcut: true }
  }

  // Recursion for children nodes.
  // These nodes are all type "root" or "branch".
  // The Pātimokkha's get /suttaplex data while still a branch node.
  if (node.children?.length) {
    if (node.uid?.endsWith('-pm') || node.uid?.includes('-pm-')) {
      node = await getTextData()
    }

    node.children = (
      await limitConcurrency(
        node.children.map(child => fetchDataTree(child.uid, depth + 1)),
        MAX_CONCURRENT_REQUESTS
      )
    ).filter(Boolean)
  }

  return node
}

/*
 * Generated structured, nested data for the the whole site
 * by recursively calling SuttaCentral's `/menu/${uid}` API
 * and nesting the result in the `children` value.
 *
 * When it gets to a `"node_type": "leaf"`, it switches to `/suttaplex/${uid}` API
 * to get the more detailed meta-data for the text (including translations array).
 *
 * Then, if `segmented` is `true` on the translation object,
 * it then uses the `/bilarasuttas` API, in addition to the `/suttas` API
 * to get the actual translated text and associated data.
 *
 * This master output is then used by the various `flat...Data.js` files
 * to add `scx_path` key, json-ld data, and flatten this deeply nested tree
 * to sync URL structure with SuttaCentral.net.
 */
export default async function () {
  if (cachedMasterData) return cachedMasterData

  if (isBuilding) {
    return new Promise(resolve => {
      const checkCache = setInterval(() => {
        if (cachedMasterData) {
          clearInterval(checkCache)
          resolve(cachedMasterData)
        }
      }, 100)
    })
  }

  isBuilding = true

  try {
    spinner.start()
    await fetchShortcutsList()
    const roots = ['sutta', 'vinaya', 'abhidhamma']
    const tree = await Promise.all(roots.map(uid => fetchDataTree(uid)))
    const resolveLink = createLinkResolver(tree)
    const fixedLinks = fixCommentLinks(tree, resolveLink)
    spinner.info(`Pointed ${fixedLinks} links in comments at pages that exist`)
    const fixedPagination = fixPaginationLinks(tree, resolveLink)
    spinner.info(
      `Pointed ${fixedPagination} prev/next links at pages that exist`
    )
    const movedLinks = fixMovedLegacyLinks(tree)
    spinner.info(`Pointed links in ${movedLinks} texts at paths .net moved`)
    const linkedParallels = addParallelDetails(tree, resolveLink)
    spinner.info(
      `Gave ${linkedParallels} parallels a link to their translation`
    )
    cachedMasterData = tree
    return tree
  } catch (e) {
    spinner.fail(e.message)
    return []
  } finally {
    const elapsedMins = ((Date.now() - startTime) / 60_000).toFixed(2)
    const successCount = endpointsHit - fetchErrors
    const successRate =
      endpointsHit > 0 ? ((successCount / endpointsHit) * 100).toFixed(1) : 0
    let errorDetails = ''
    if (fetchErrors > 0) {
      errorDetails += `, ${fetchErrors} total failed`
      if (pubInfoErrors > 0) {
        const pubInfoRate = ((pubInfoErrors / fetchErrors) * 100).toFixed(1)
        errorDetails += `, ${pubInfoErrors} (${pubInfoRate}%) failed from \`/publication_info\``
      }
      if (cacheTimeErrors > 0) {
        errorDetails += `, and ${cacheTimeErrors} errors reading cache data timestamp`
      }
    }

    spinner
      .succeed(`Fetched from ${endpointsHit} endpoints in ~${elapsedMins} mins`)
      .info(
        `Results: ${successCount}/${endpointsHit} successful (${successRate}%)${errorDetails}`
      )

    recordStat('fetch', {
      endpointsHit,
      successCount,
      fetchErrors,
      pubInfoErrors,
      cacheTimeErrors,
      elapsedMins: Number(elapsedMins),
    })

    isBuilding = false
    endpointsHit = 0
    fetchErrors = 0
    pubInfoErrors = 0
  }
}

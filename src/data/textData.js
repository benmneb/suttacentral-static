import {
  findShownUid,
  getKeyPrefixes,
  getShownSpan,
  parseUidNumbers,
  rangeUidToAcronym,
  uidIsInRange,
  uidToAcronym,
} from '../helpers/rangeSuttas.js'
import masterData from './_masterData.js'
import { breadcrumbTrail } from '../helpers/breadcrumbs.js'
import { onlySample } from '../helpers/samplePages.js'
import { referenceGroupsOf } from '../helpers/referenceEditions.js'
import { highlightsOf } from '../helpers/highlights.js'
import { parallelRunsOf } from '../helpers/parallelRuns.js'
import { localImage } from '../helpers/images.js'
import {
  absoluteUrl,
  breadcrumbList,
  jsonLd,
  edition,
  ogTags,
  person,
  SUTTACENTRAL,
  textFromHtml,
  textId,
  website,
  withTranslatedTitle,
  workId,
} from '../helpers/pageMetadata.js'
import { SC_ORIGIN } from '../helpers/scApi.js'
import {
  headingRenumberer,
  langTag,
  searchId,
  tidyLegacyHtml,
} from '../helpers/strings.js'

let usedPaths = []

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `helpers/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

/** The original title, and the translated one too for a translation. A root with no title of its own has the translated one, as its heading does */
function titlesOf(entry) {
  const translated = entry.translated_title || entry.translated_name
  return entry.is_root
    ? textFromHtml(entry.original_title || translated)
    : withTranslatedTitle(entry.original_title, translated)
}

/** The page's title, ie "MN 1: Mūlapariyāyasutta (The Root of All Things)—Bhikkhu Sujato", or "AN 1.1—Bhikkhu Sujato" for a sutta of a range */
function titleOf(entry) {
  const titles = !entry.scx_range_sutta_individual && titlesOf(entry)
  const author = textFromHtml(entry.author)
  return `${textFromHtml(entry.acronym)}${titles ? `: ${titles}` : ''}${author ? `—${author}` : ''}`
}

/** The text's blurb, or else a sentence saying which text it is and whose edition or translation */
function descriptionOf(entry) {
  const blurb = textFromHtml(entry.blurb)
  if (blurb) return blurb
  const titles = titlesOf(entry)
  const acronym = textFromHtml(entry.acronym)
  const name = entry.scx_range_sutta_individual
    ? `${acronym} from ${titles}`
    : `${acronym} ${titles}`.trim()
  const author = textFromHtml(entry.author)
  const language = entry.lang_name || entry.lang
  if (entry.is_root) {
    return `${name}, the ${language} text${author ? ` from ${author}` : ''}.`
  }
  return `${name}, translated into ${language}${author ? ` by ${author}` : ''}.`
}

/**
 * The licence the text's info popover gives: a publication's own, or else the one its legacy footer links to
 * @returns {string | undefined} The licence's URL
 */
function licenseOf(entry) {
  const own = entry._publication_info?.license?.license_url
  if (own) return own.trim()
  const html = entry._suttas_data?.translation?.text
  const footer = html?.match(/<footer[\s\S]*<\/footer>/i)?.[0]
  if (!footer) return
  const links = [...footer.matchAll(/<a\b[^>]*>/gi)].map(([tag]) => ({
    href: tag.match(/\bhref=["']([^"']+)["']/i)?.[1],
    rel: tag.match(/\brel=["']([^"']+)["']/i)?.[1],
  }))
  const license =
    links.find(link => link.href && /\blicense\b/i.test(link.rel ?? '')) ??
    links.find(link =>
      /creativecommons\.org\/(?:licenses|publicdomain)\//i.test(link.href ?? '')
    )
  return license?.href
}

function generateTextOGTags(entry) {
  return ogTags({
    title: titleOf(entry),
    description: descriptionOf(entry),
    url: entry.scx_path,
    type: 'article',
    extra: {
      ...(!entry.is_root && { 'article:author': textFromHtml(entry.author) }),
      ...(entry.publication_date && {
        'article:published_time': entry.publication_date,
      }),
      'article:section': 'Buddhist Texts',
      'article:tag':
        'Buddhism, Buddhist Texts, Pāli Canon, Tipitaka, Early Buddhism, Theravada, Suttas',
    },
  })
}

function generateTextJsonLd(entry) {
  const url = absoluteUrl(entry.scx_path)
  const author = textFromHtml(entry.author)
  const translatedTitle = textFromHtml(
    entry.translated_title || entry.translated_name
  )
  const license = licenseOf(entry)
  // The work its suttaplex page is about, which a root text is an edition of
  const work = {
    '@type': 'CreativeWork',
    '@id': workId(entry.uid),
    // A sutta of a range has no name of its own, only the range's
    name: textFromHtml(
      entry.scx_range_sutta_individual
        ? entry.acronym
        : entry.root_name || entry.original_title
    ),
    url: absoluteUrl(entry.uid),
    inLanguage: langTag(entry.root_lang),
  }
  // The page, whose breadcrumb only `WebPage` can take, and the text itself, as its main entity
  return jsonLd({
    '@type': 'WebPage',
    '@id': url,
    name: titleOf(entry),
    description: descriptionOf(entry),
    url,
    sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
    inLanguage: langTag(entry.lang),
    isPartOf: website(),
    breadcrumb: breadcrumbList([
      { name: 'Home', url: '/' },
      // The last crumb is this page itself
      ...trailOf(entry).map((crumb, index, trail) => ({
        name: crumb.name,
        url: index === trail.length - 1 ? entry.scx_path : crumb.href,
      })),
    ]),
    mainEntity: {
      '@type': 'CreativeWork',
      '@id': textId(entry.scx_path),
      name: entry.scx_range_sutta_individual
        ? textFromHtml(entry.acronym)
        : textFromHtml(entry.original_title),
      ...(!entry.scx_range_sutta_individual && {
        alternateName: [textFromHtml(entry.acronym), translatedTitle].filter(
          Boolean
        ),
      }),
      url,
      sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
      identifier: entry.uid,
      inLanguage: langTag(entry.lang),
      ...(author &&
        (entry.is_root
          ? { isBasedOn: edition(author, entry.author_uid) }
          : { translator: person(author, entry.author_uid) })),
      ...(entry.publication_date && {
        datePublished: entry.publication_date,
      }),
      publisher: SUTTACENTRAL,
      ...(license && { license }),
      about: { '@type': 'Thing', name: 'Buddhism' },
      ...(entry.is_root
        ? { exampleOfWork: work }
        : { translationOfWork: work }),
    },
  })
}

function tocLabel(text) {
  const stripped = text.trim().replace(/^\d+(?:\.\d+)*\.\s*/, '')
  // A heading that is only a number would leave a link with no name
  return stripped || text.trim()
}

/** A legacy heading as the contents has it: without its references, links or ids, which the heading itself keeps */
function legacyTocLabel(html) {
  return tocLabel(
    html
      .replace(/<a\b[^>]*\bclass=['"]ref\b[^>]*>[\s\S]*?<\/a>/g, '')
      .replace(/<\/?a\b[^>]*>/g, '')
      .replace(/\sid=(['"]).*?\1/g, '')
      .replace(/\s+/g, ' ')
  )
}

const ID_TAG = /<[a-z][^>]*?\sid=(['"])(.*?)\1[^>]*>/gi

/**
 * A legacy text with each id once. A reference repeating an id takes the one its own link points to instead,
 * as .net gives every SC number `id='sc1'`, and any other repeat is dropped
 */
function uniqueIds(html) {
  const counts = new Map()
  for (const [, , id] of html.matchAll(ID_TAG)) {
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const seen = new Set()
  return html.replace(ID_TAG, (tag, quote, id) => {
    const href =
      /\bclass=['"]ref\b/.test(tag) && tag.match(/\shref=['"]#([^'"]+)/)?.[1]
    const own = counts.get(id) > 1 && href && !seen.has(href) ? href : id
    if (seen.has(own)) return tag.replace(/\sid=(['"]).*?\1/, '')
    seen.add(own)
    return own === id
      ? tag
      : tag.replace(/\sid=(['"]).*?\1/, ` id=${quote}${own}${quote}`)
  })
}

/*
 * Mirrors the `should_process` logic in `pages/text.liquid` for individual range suttas,
 * so only headings that actually get rendered on the page end up in the ToC.
 * Keep the two in sync.
 */
function getRangeKeyInfo(entry, key) {
  const html = entry._bilarasuttas_data.html_text[key]

  let isHeader = false
  if (key.split(':').at(-1).includes('0.')) {
    if (html?.includes('<article id=')) {
      const articleId = html.split("id='")[1]?.split("'")[0]
      isHeader =
        articleId === entry.scx_range_sutta_uid ||
        articleId === entry.uid ||
        articleId === entry.scx_range_sutta_shown_uid
    } else {
      isHeader = true
    }
  }

  const matchesUid =
    key.split(':')[0].toLowerCase() === entry.scx_range_sutta_shown_uid

  // The last key is also processed by the template, but only for its closing tags
  return { isRendered: isHeader || matchesUid, isHeader }
}

/** The segment keys a page shows, or null for a legacy text */
function shownKeysOf(entry) {
  const data = entry._bilarasuttas_data
  if (!data?.keys_order?.length) return null
  const isRange =
    entry.scx_range_sutta_individual && entry.scx_range_sutta_shown_uid
  return data.keys_order.filter(
    key =>
      data.html_text[key] &&
      (!isRange || getRangeKeyInfo(entry, key).isRendered)
  )
}

/** A shown segment's illustrations, by its key, or null if it has none. That's only MN 123 for now */
function illustrationsOf(entry, keys) {
  const byKey = {}
  for (const illustration of entry._bilarasuttas_data?.illustrations ?? []) {
    const { segment, filename, alt, creator, creation_date } = illustration
    if (!keys?.includes(segment)) continue
    byKey[segment] ??= []
    byKey[segment].push({
      src: `${SC_ORIGIN}/img/optimized-illustrations/${filename}.avif`,
      alt: alt ?? '',
      credit: [creator, creation_date].filter(Boolean).join(', '),
    })
  }
  return Object.keys(byKey).length ? byKey : null
}

/** Swaps each illustration's .net URL for a local copy, so it shows offline */
async function localiseIllustrations(entries) {
  const illustrations = entries.flatMap(entry =>
    Object.values(entry.scx_illustrations ?? {}).flat()
  )
  await Promise.all(
    illustrations.map(async illustration =>
      Object.assign(
        illustration,
        // Twice the 480px it's shown at, for high density screens
        await localImage(illustration.src, {
          dir: 'illustrations',
          height: 960,
        })
      )
    )
  )
}

/**
 * Segment number ids for a page of several texts, where the short one (ie 1.1) would repeat: .net's
 * whole key for a range like an1.1-10 (ie an1.2_1.1), else the short one only where first used, as a .net link lands there
 */
function segmentIdsOf(entry) {
  const keys = shownKeysOf(entry)
  const none = { scx_segment_ids: null, scx_full_segment_refs: false }
  if (!keys || new Set(keys.map(key => key.split(':')[0])).size < 2) {
    return none
  }
  const isRange = /^\d+-\d+$/.test(entry.uid.split('.')[1] ?? '')
  const ids = {}
  const seen = new Set()
  for (const key of keys) {
    const ref = key.split(':').at(-1)
    if (isRange || seen.has(ref)) ids[key] = key.replace(':', '_')
    seen.add(ref)
  }
  return { scx_segment_ids: ids, scx_full_segment_refs: isRange }
}

/**
 * The printed-edition references a shown segment repeats from an earlier one, by its key, so only the first
 * has the id: lines are referenced where segments start, and two can start on one (ie sa16's t99.2.3b15)
 */
function repeatedRefsOf(entry) {
  const refs = entry._bilarasuttas_data?.reference_text
  const repeats = {}
  const seen = new Set()
  for (const key of (refs && shownKeysOf(entry)) ?? []) {
    for (const ref of refs[key]?.split(',') ?? []) {
      const id = ref.trim()
      if (seen.has(id)) (repeats[key] ??= []).push(id)
      if (id) seen.add(id)
    }
  }
  return {
    scx_repeated_refs: Object.keys(repeats).length ? repeats : null,
  }
}

const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'wbr'])

/**
 * The tags one text of a range document (ie sn33.16 of sn33.16-20) leaves open, which close it in place of the
 * document's last segment when that's another text's
 */
function rangeClosingTagsOf(entry) {
  const data = entry._bilarasuttas_data
  const keys = data?.keys_order ?? []
  const isRange =
    entry.scx_range_sutta_individual && entry.scx_range_sutta_shown_uid
  if (
    !isRange ||
    !keys.length ||
    getRangeKeyInfo(entry, keys.at(-1)).isRendered
  ) {
    return { scx_range_closing_tags: null }
  }
  const open = []
  for (const key of keys.slice(0, -1)) {
    const html = data.html_text[key]
    if (!html || !getRangeKeyInfo(entry, key).isRendered) continue
    for (const [, slash, name] of html.matchAll(/<(\/?)([a-z][a-z0-9]*)/gi)) {
      if (VOID_ELEMENTS.has(name)) continue
      if (!slash) open.push(name)
      else if (open.includes(name)) open.length = open.lastIndexOf(name)
    }
  }
  return {
    scx_range_closing_tags: open
      .reverse()
      .map(name => `</${name}>`)
      .join(''),
  }
}

/** Whether each of the views menu's text-specific settings applies, and what it shows */
function viewOptionsOf(entry) {
  const keys = shownKeysOf(entry)
  return {
    ...highlightsOf(entry, keys),
    scx_illustrations: illustrationsOf(entry, keys),
    ...parallelRunsOf(entry, keys),
  }
}

/*
 * Collects the h2-h4 headings of a segmented text, anchored to the segment span that already carries an id,
 * at the level each has on the page, where `closeHeadingGaps` renumbers them.
 */
function collectSegmentedToc(entry, useRootText) {
  const data = entry._bilarasuttas_data
  const isRange =
    entry.scx_range_sutta_individual && entry.scx_range_sutta_shown_uid
  const renumber = headingRenumberer()
  const toc = []

  for (const key of data.keys_order ?? []) {
    const html = data.html_text[key]
    if (!html) continue
    const rangeKey = isRange && getRangeKeyInfo(entry, key)
    if (rangeKey && !rangeKey.isRendered) continue
    const heading = html.match(/<h([2-4])([^>]*)>(?=\{\})/)
    // A heading with no text, which `dropEmptyHeadings` takes off the page
    const isDropped =
      !data.root_text?.[key]?.trim() &&
      (useRootText || !data.translation_text?.[key]?.trim())
    let level
    for (const match of html.matchAll(/<h([1-6])[^>]*>(\{\})?/g)) {
      if (match[2] && isDropped) continue
      const to = renumber(Number(match[1]))
      if (match.index === heading?.index) level = to
    }
    if (!heading) continue

    let text = useRootText
      ? data.root_text?.[key]
      : data.translation_text?.[key]

    if (rangeKey) {
      const { isHeader } = rangeKey
      // Same title substitutions as the template. A whole range document
      // (ie sn45.50-54) is shown as is, so its own headings are already right
      const isRetitled =
        isHeader && entry.scx_range_sutta_shown_uid === entry.uid
      if (isRetitled && useRootText) {
        if (
          text?.includes('~') &&
          (html.includes("class='range-title'") ||
            html.includes("class='sutta-title'"))
        ) {
          text = entry.scx_range_sutta_title
        }
      } else if (
        isRetitled &&
        entry.scx_range_sutta_untitled &&
        (text === entry.translated_title || text === entry.translated_name)
      ) {
        text = entry.scx_range_sutta_title
      }
    }

    if (!text?.trim()) continue

    toc.push({
      level,
      href: `#${key}`,
      html: tocLabel(text),
      // On a range page (eg an1.1-10) each sutta's own title is the only
      // structure there is, so these stay - but on a single sutta of that range
      // the one title is just the page title, and gets dropped below
      isTitle: heading[2].includes('sutta-title'),
    })
  }

  // A lone sutta title is the page title, not a table of contents
  if (toc.length === 1 && toc[0].isTitle) return []
  return toc
}

/*
 * Collects the h2-h4 headings of a legacy text at the level each has on the page, injecting an id to anchor
 * to as they don't have any (eg pli-tv-kd1/horner has 66 bare headings), and keeps only the body of a text that comes as a
 * whole HTML document (eg mn10/horner), as it's put in the page's <main>. Each id is kept once (`uniqueIds`), and
 * slips in its markup are mended (`tidyLegacyHtml`).
 *
 * Note: this mutates `entry._suttas_data.translation.text` in place, to avoid holding a second copy
 * of every legacy text in memory. It's idempotent as existing ids are kept.
 */
function collectLegacyToc(entry) {
  const translation = entry._suttas_data?.translation
  if (!translation?.text) return []

  const bodyStart = translation.text.indexOf('<body')
  if (bodyStart !== -1) {
    const bodyEnd = translation.text.lastIndexOf('</body>')
    translation.text = translation.text.slice(
      translation.text.indexOf('>', bodyStart) + 1,
      bodyEnd === -1 ? undefined : bodyEnd
    )
  }
  translation.text = uniqueIds(tidyLegacyHtml(translation.text))

  // Leave the footer alone, it becomes the info popover
  const footerIndex = translation.text.lastIndexOf('<footer')
  const body =
    footerIndex === -1
      ? translation.text
      : translation.text.slice(0, footerIndex)
  const footer = footerIndex === -1 ? '' : translation.text.slice(footerIndex)

  // The level each heading has on the page, where `closeHeadingGaps` renumbers them
  const renumber = headingRenumberer()
  const levels = new Map()
  for (const match of body.matchAll(/<h([1-6])/g)) {
    levels.set(match.index, renumber(Number(match[1])))
  }

  const toc = []
  let n = 0
  const bodyWithHeadingIds = body.replace(
    /<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/g,
    (match, level, attrs, inner, offset) => {
      const existingId = attrs.match(/\bid=["']([^"']+)["']/)
      const id = existingId?.[1] ?? `toc-${++n}`
      const label = legacyTocLabel(inner)
      if (label) {
        toc.push({ level: levels.get(offset), href: `#${id}`, html: label })
      }
      return existingId
        ? match
        : `<h${level}${attrs} id="${id}">${inner}</h${level}>`
    }
  )

  translation.text = bodyWithHeadingIds + footer
  return toc
}

/*
 * Returns the table of contents for a text, following the same branches as `pages/text.liquid`.
 */
function collectToc(entry) {
  const bilaraData = entry._bilarasuttas_data
  if (entry.is_root && bilaraData && Object.keys(bilaraData).length > 0) {
    return collectSegmentedToc(entry, true)
  }
  if (entry.segmented) return collectSegmentedToc(entry, false)
  return collectLegacyToc(entry)
}

/** The contents, and the width of its widest number, so all the titles line up: a digit is 1ch, a dot a little over half */
function tocOf(entry) {
  const toc = collectToc(entry)
  const counts = [0, 0, 0]
  let width = 0
  for (const { level, isTitle } of toc) {
    const i = level - 2
    if (!isTitle) counts[i]++
    counts.fill(0, i + 1)
    if (isTitle) continue
    const digits = counts.slice(0, i + 1).join('').length
    width = Math.max(width, digits + (i + 1) * 0.6)
  }
  return {
    scx_toc: toc,
    scx_toc_number_width: width ? `${width.toFixed(1)}ch` : '',
  }
}

/** The ids `in:` finds the page of these texts by, ie pli-tv-bu-vb-pj1 and bupj1 */
const textIdsOf = (...texts) => [
  ...new Set(
    texts.flatMap(({ uid, acronym }) =>
      [uid, acronym?.trim()].filter(Boolean).map(searchId)
    )
  ),
]

function flatten(nodes, parent, parentPath) {
  return nodes.flatMap(node => {
    let currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`
    const results = []

    if (parent) {
      currentPath = parentPath
      const scx_path = `${parent.uid}/${node.lang}/${node.author_uid}`
      // Dirty hack to get around duplicate paths in /suttaplex data
      // ie: https://suttacentral.net/api/suttaplex/mn1?language=en has /mn1/ru/sv/ twice
      if (usedPaths.includes(scx_path)) return null
      usedPaths.push(scx_path)
      const { translations, ...parentWithoutTranslations } = parent
      let rangeUnindexed = false

      // Manually create individual range suttas, from eg: /an1.1-10 and /dhp1-20
      // Only segmented texts can have individual range suttas
      if (parent.scx_range_sutta && node.segmented) {
        const keyPrefixes = getKeyPrefixes(node._bilarasuttas_data)
        const rangeEntries = parent.scx_range_sutta_range_uids.map(uid => {
          function uidToTitle(uidInput) {
            if (uidInput.includes('.')) return uidInput.split('.')[1] // "AN 1.1" -> "1" as per .net
            return uidToAcronym(uidInput).split('Dhp ')[1] // just the number too (.net just leaves the chapter title...)
          }

          // The bilara document that actually gets rendered, which is the whole of it
          // (and so named for all it holds) when the uid has no prefix of its own.
          // Should a uid be in no document at all, the whole response is shown rather than an empty page
          const shownUid = findShownUid(keyPrefixes, uid)
          const spanOf = prefix => getShownSpan(keyPrefixes, prefix, parent.uid) // ie "an1.329-332"
          const acronym =
            !shownUid || shownUid === parent.uid
              ? parent.acronym // eg "SN 45.50–54", straight from the API
              : spanOf(shownUid) !== uid
                ? rangeUidToAcronym(spanOf(shownUid)) // nested, eg "AN 1.175–186"
                : uidToAcronym(uid)

          // Whether the sutta has a translated heading of its own. Dhp verses don't (theirs is
          // Pāli only), so the vagga heading gets swapped for the number to title the page instead
          const bilara = node._bilarasuttas_data
          const suttaTitleKey = bilara?.keys_order?.find(
            key =>
              key.split(':')[0].toLowerCase() === shownUid &&
              bilara.html_text[key]?.includes("class='sutta-title'")
          )
          const isUntitled = !bilara?.translation_text?.[suttaTitleKey]?.trim()

          // Inside the response the neighbours are known exactly, its key prefixes being
          // the documents in order - so a nested range gets linked as the one page it is,
          // and not as whichever of its numbers happens to come next
          const shownIndex = keyPrefixes.indexOf(shownUid ?? uid)
          function linkTo(prefix) {
            const { prefix: ref, start } = parseUidNumbers(prefix)
            return {
              uid: `${ref}${start}`,
              name: rangeUidToAcronym(spanOf(prefix)),
            }
          }

          function getPrev() {
            if (shownIndex > 0) return linkTo(keyPrefixes[shownIndex - 1])
            // At start of response - get last item from previous range, ie "an1.250-257" -> "an1.257"
            const prevUid = node._suttas_data?.translation?.previous?.uid
            const prev = parseUidNumbers(prevUid)
            if (!prev)
              return { uid: prevUid || null, name: uidToAcronym(prevUid) }
            const uid = `${prev.prefix}${prev.end}`
            return { uid, name: uidToAcronym(uid) }
          }

          function getNext() {
            if (shownIndex > -1 && shownIndex < keyPrefixes.length - 1) {
              return linkTo(keyPrefixes[shownIndex + 1])
            }
            // At end of response - get first item from next range, ie "an1.11-20" -> "an1.11"
            const nextUid = node._suttas_data?.translation?.next?.uid
            const next = parseUidNumbers(nextUid)
            if (!next)
              return { uid: nextUid || null, name: uidToAcronym(nextUid) }
            const uid = `${next.prefix}${next.start}`
            return { uid, name: uidToAcronym(uid) }
          }

          // Filtered to include only relevant parallels for this individual range entry
          const filteredParallels =
            parent._parallels_data &&
            Object.entries(parent._parallels_data).filter(([k, v]) => {
              // Direct matches, and start of range
              if (
                k === uid ||
                k.startsWith(`${uid}-`) ||
                k.startsWith(`${uid}#`)
              ) {
                return true
              }

              // Check if uid is at the END of a range
              // So if uid is dhp20, will match dhp*-20, and if uid is an1.197, will match an1.*-197, and both with # links
              const uidPrefix = uid.split(/(\d+)/)[0]
              const uidEndNum = uid.match(/\d+$/)?.[0]
              if (
                uidEndNum &&
                new RegExp(
                  `^${uidPrefix}(\\d+)(\\.\\d+)?-${uidEndNum}(#.*)?$`
                ).test(k)
              ) {
                return true
              }

              // Check if uid is WITHIN a range (an1.189 should match an1.188-197 and dhp2 should match dhp1-3)
              return uidIsInRange(uid, k.split('#')[0])
            })

          return {
            ...parentWithoutTranslations,
            ...node,
            uid,
            acronym,
            scx_path: `${uid}/${node.lang}/${node.author_uid}`,
            scx_breadcrumb: currentPath
              .split('/')
              .toSpliced(-1, 1, uid)
              .join('/'),
            scx_range_sutta_individual: true,
            scx_range_sutta_shown_uid: shownUid,
            scx_range_sutta_untitled: isUntitled,
            scx_range_sutta_title: uidToTitle(uid),
            scx_range_sutta_pagination: { prev: getPrev(), next: getNext() },
            scx_range_sutta_parallels_data:
              filteredParallels && Object.fromEntries(filteredParallels),
            scx_range_sutta_parallels_count: filteredParallels?.reduce(
              (sum, [k, v]) => sum + v.length,
              0
            ),
          }
        })

        // Each document in the main index once: on the first page that shows just it, or else the range's
        const firsts = new Map()
        for (const { uid, scx_range_sutta_shown_uid: shown } of rangeEntries) {
          if (shown && shown !== parent.uid && !firsts.has(shown))
            firsts.set(shown, uid)
        }
        rangeUnindexed =
          keyPrefixes.length > 0 &&
          keyPrefixes.every(prefix => firsts.has(prefix))

        results.push(
          ...rangeEntries.map(entry => {
            const shown = entry.scx_range_sutta_shown_uid
            const unindexed = !rangeUnindexed || firsts.get(shown) !== entry.uid
            return {
              ...entry,
              scx_unindexed: unindexed,
              scx_text_ids: unindexed
                ? []
                : textIdsOf(
                    parent,
                    { uid: shown },
                    ...rangeEntries.filter(
                      other => other.scx_range_sutta_shown_uid === shown
                    )
                  ),
              scx_breadcrumb_trail: trailOf(entry),
              scx_title: titleOf(entry),
              scx_json_ld: generateTextJsonLd(entry),
              scx_og_tags: generateTextOGTags(entry),
              ...tocOf(entry),
              ...referenceGroupsOf(entry),
              ...segmentIdsOf(entry),
              ...repeatedRefsOf(entry),
              ...rangeClosingTagsOf(entry),
              ...viewOptionsOf(entry),
            }
          })
        )
      }

      // Proceed as normal with the non-range texts
      const entry = {
        ...parentWithoutTranslations,
        ...node,
        scx_path,
        scx_breadcrumb: currentPath,
        scx_unindexed: rangeUnindexed,
      }
      results.push({
        ...entry,
        // A range's page takes in its texts, ie dhp5 on dhp1-20's
        scx_text_ids: rangeUnindexed
          ? []
          : textIdsOf(
              entry,
              ...(entry.scx_range_sutta_range_uids ?? []).map(uid => ({ uid }))
            ),
        scx_breadcrumb_trail: trailOf(entry),
        scx_title: titleOf(entry),
        scx_json_ld: generateTextJsonLd(entry),
        scx_og_tags: generateTextOGTags(entry),
        ...tocOf(entry),
        ...referenceGroupsOf(entry),
        ...segmentIdsOf(entry),
        ...repeatedRefsOf(entry),
        ...rangeClosingTagsOf(entry),
        ...viewOptionsOf(entry),
      })
      return results
    }

    if (node.translations?.length) {
      return flatten(node.translations, node, currentPath)
    }

    return flatten(node.children || [], null, currentPath)
  })
}

/*
 * Returns just the "texts".
 *
 * Flattens the .translation info from `masterData`, with the root /suttaplex sutta data and
 * adds a `scx_path` key with the appropriate URL slug to sync URL structure with SuttaCentral.net.
 *
 * Note: `id` is the unique identifier here because `uid` comes from the parent
 * and is no longer unique because this meta-data bas been merged with the .translations data.
 *
 * @returns
 * [
 *  { id: 'dn1_translation-en-sujato', scx_path: '/dn1/en/sujato', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await masterData()
  tree = menu
  const entries = onlySample(flatten(menu).filter(Boolean))
  await localiseIllustrations(entries)
  return entries
}

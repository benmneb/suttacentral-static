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
import { SC_ORIGIN } from '../helpers/scApi.js'
import siteMetaData from './_siteMetaData.js'

let usedPaths = []

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `helpers/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

function generateTextOGTags(entry) {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': `${entry.acronym}: ${entry.original_title}—${entry.author}`,
    'og:description':
      entry.blurb || 'Buddhist text from the Pāli Canon with translation',
    'og:url': `${metadata.origin}/${entry.scx_path}`,
    'og:type': 'article',
    'og:locale': entry.lang || 'en',
    'og:site_name': metadata.title,
    'og:image': '/images/og-image2.jpg',
    'article:author': entry.author?.trim(),
    ...(entry.publication_date && {
      'article:published_time': entry.publication_date,
    }),
    'article:section': 'Buddhist Texts',
    'article:tag':
      'Buddhism, Buddhist Texts, Pāli Canon, Tipitaka, Early Buddhism, Theravada, Suttas',
  })
}

/**
 * The prev/next link at the foot of the page, as `text.liquid` renders it
 * @param {Object} entry - A text page entry
 * @param {'previous' | 'next'} direction - Which link
 * @returns {{ name: string, path: string } | null} The link, or null if there isn't one
 */
function pagerLink(entry, direction) {
  const link = entry._suttas_data?.translation?.[direction]
  const range =
    entry.scx_range_sutta_pagination?.[
      direction === 'previous' ? 'prev' : 'next'
    ]
  const uid = range?.uid || link?.uid
  if (!uid) return null
  return {
    name: range?.name || link?.name,
    path: link?.lang ? `/${uid}/${link.lang}/${link.author_uid}` : `/${uid}`,
  }
}

function generateTextJsonLd(entry) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      '@id': `/${entry.scx_path}`,
      name: entry.original_title,
      alternateName: [entry.acronym, entry.translated_title].filter(Boolean),
      description:
        entry.blurb || 'Buddhist text from the Pāli Canon with translation',
      url: `${siteMetaData().origin}/${entry.scx_path}`,
      sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
      identifier: entry.uid,
      inLanguage: {
        '@type': 'Language',
        name: entry.lang_name || entry.lang,
        alternateName: entry.lang,
      },
      genre: entry.is_root ? 'Root Text' : 'Translation',
      ...(entry.author && {
        [entry.is_root ? 'editor' : 'translator']: {
          '@type': 'Person',
          name: entry.author.replace(/&nbsp;|&#160;|\u00A0/g, ' ').trim(),
          identifier: entry.author_uid,
        },
      }),
      ...(entry.publication_date && {
        datePublished: entry.publication_date,
      }),
      ...(!entry.is_root && {
        translationOfWork: {
          '@type': 'CreativeWork',
          name: entry.root_name || entry.original_title,
          inLanguage: entry.root_lang,
          about: {
            '@type': 'Thing',
            name: 'Buddhist Teaching',
            description: 'Ancient Buddhist discourse or text',
          },
        },
      }),
      about: [
        {
          '@type': 'Thing',
          name: 'Buddhism',
          description: 'Buddhist philosophy and teachings',
        },
        {
          '@type': 'Thing',
          name: 'Buddhist Literature',
          description: 'Ancient Buddhist texts and modern translations',
        },
        ...(entry.segmented
          ? [
              {
                '@type': 'Thing',
                name: 'Segmented Text',
                description:
                  'Text divided into numbered segments for reference',
              },
            ]
          : []),
      ],
      isPartOf: {
        '@type': 'WebSite',
        '@id': '/#website',
        name: 'SuttaCentral',
      },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: '/',
          },
          // The last crumb is this page itself
          ...trailOf(entry).map((crumb, index, trail) => ({
            '@type': 'ListItem',
            position: index + 2,
            name: crumb.name,
            ...(index === trail.length - 1
              ? { item: `/${entry.scx_path}` }
              : crumb.href && { item: crumb.href }),
          })),
        ],
      },
      publisher: {
        '@type': 'Organization',
        '@id': '/#organization',
        name: 'SuttaCentral',
        url: '/',
        sameAs: SC_ORIGIN,
        description: 'Early Buddhist texts, translations, and parallels',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `/${entry.scx_path}`,
      },
      ...(pagerLink(entry, 'previous') && {
        hasPreviousItem: {
          '@type': 'CreativeWork',
          name: pagerLink(entry, 'previous').name,
          url: pagerLink(entry, 'previous').path,
          sameAs: `${SC_ORIGIN}${pagerLink(entry, 'previous').path}`,
        },
      }),
      ...(pagerLink(entry, 'next') && {
        hasNextItem: {
          '@type': 'CreativeWork',
          name: pagerLink(entry, 'next').name,
          url: pagerLink(entry, 'next').path,
          sameAs: `${SC_ORIGIN}${pagerLink(entry, 'next').path}`,
        },
      }),
      license: {
        '@type': 'CreativeWork',
        name: 'Public Domain',
        description: 'This work is in the public domain',
      },
    },
    null,
    2
  )
}

function tocLabel(text) {
  const stripped = text.trim().replace(/^\d+(?:\.\d+)*\.\s*/, '')
  // A heading that is only a number would leave a link with no name
  return stripped || text.trim()
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
 * Collects the h2-h4 headings of a segmented text, anchored to the segment span that already carries an id.
 */
function collectSegmentedToc(entry, useRootText) {
  const data = entry._bilarasuttas_data
  const toc = []

  for (const key of data.keys_order ?? []) {
    const html = data.html_text[key]
    const heading = html?.match(/<h([2-4])([^>]*)>(?=\{\})/)
    if (!heading) continue

    let text = useRootText
      ? data.root_text?.[key]
      : data.translation_text?.[key]

    if (entry.scx_range_sutta_individual && entry.scx_range_sutta_shown_uid) {
      const { isRendered, isHeader } = getRangeKeyInfo(entry, key)
      if (!isRendered) continue
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
      level: Number(heading[1]),
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
 * Collects the h2-h4 headings of a legacy text, injecting an id to anchor to as they don't have any
 * (eg pli-tv-kd1/horner has 66 bare headings).
 *
 * Note: this mutates `entry._suttas_data.translation.text` in place, to avoid holding a second copy
 * of every legacy text in memory. It's idempotent as existing ids are kept.
 */
function collectLegacyToc(entry) {
  const translation = entry._suttas_data?.translation
  if (!translation?.text) return []

  // Leave the footer alone, it becomes the info popover
  const footerIndex = translation.text.lastIndexOf('<footer')
  const body =
    footerIndex === -1
      ? translation.text
      : translation.text.slice(0, footerIndex)
  const footer = footerIndex === -1 ? '' : translation.text.slice(footerIndex)

  const toc = []
  let n = 0
  const bodyWithHeadingIds = body.replace(
    /<h([2-4])([^>]*)>([\s\S]*?)<\/h\1>/g,
    (match, level, attrs, inner) => {
      const existingId = attrs.match(/\bid=["']([^"']+)["']/)
      const id = existingId?.[1] ?? `toc-${++n}`
      if (inner.trim()) {
        toc.push({
          level: Number(level),
          href: `#${id}`,
          html: tocLabel(inner),
        })
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
          ...rangeEntries.map(entry => ({
            ...entry,
            scx_unindexed:
              !rangeUnindexed ||
              firsts.get(entry.scx_range_sutta_shown_uid) !== entry.uid,
            scx_breadcrumb_trail: trailOf(entry),
            scx_json_ld: generateTextJsonLd(entry),
            scx_og_tags: generateTextOGTags(entry),
            ...tocOf(entry),
            ...referenceGroupsOf(entry),
            ...viewOptionsOf(entry),
          }))
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
        scx_breadcrumb_trail: trailOf(entry),
        scx_json_ld: generateTextJsonLd(entry),
        scx_og_tags: generateTextOGTags(entry),
        ...tocOf(entry),
        ...referenceGroupsOf(entry),
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

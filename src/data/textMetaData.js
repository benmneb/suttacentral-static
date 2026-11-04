import masterData from './_masterData.js'
import { builds } from '../helpers/buildStage.js'
import { breadcrumbTrail } from '../helpers/breadcrumbs.js'
import { onlySample } from '../helpers/samplePages.js'
import {
  absoluteUrl,
  breadcrumbList,
  edition,
  jsonLd,
  menuTitle,
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
import { langTag } from '../helpers/strings.js'
import {
  parseUidNumbers,
  uidIsInRange,
  uidToAcronym,
} from '../helpers/rangeSuttas.js'

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `helpers/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

function workName(entry) {
  return textFromHtml(entry.original_title || entry.root_name)
}

function translatedName(entry) {
  return textFromHtml(entry.translated_title || entry.translated_name)
}

/** The page's title, as `textMeta.liquid` has it */
function titleOf(entry) {
  if (entry.scx_range_sutta_individual) return entry.scx_range_sutta_title
  return menuTitle(entry)
}

function descriptionOf(entry) {
  const blurb = textFromHtml(entry.blurb)
  if (blurb) return blurb
  const acronym = textFromHtml(entry.acronym)
  const name = entry.scx_range_sutta_individual
    ? acronym
    : `${acronym} ${withTranslatedTitle(workName(entry), translatedName(entry))}`
  return `Translations and parallels of ${name.trim()}.`
}

function generateTextMetaOGTags(entry) {
  return ogTags({
    title: titleOf(entry),
    description: descriptionOf(entry),
    url: entry.scx_path,
  })
}

/** One of the work's editions or translations, by the same id its own page gives it */
function editionOf(entry, translation) {
  const path = `${entry.uid}/${translation.lang}/${translation.author_uid}`
  const author = textFromHtml(translation.author || translation.author_uid)
  const work = entry.scx_range_sutta_individual
    ? textFromHtml(entry.acronym)
    : workName(entry) || textFromHtml(entry.acronym)
  return {
    '@type': 'CreativeWork',
    '@id': textId(path),
    name: author ? `${work}—${author}` : work,
    url: absoluteUrl(path),
    sameAs: `${SC_ORIGIN}/${path}`,
    inLanguage: langTag(translation.lang),
    ...(author &&
      (translation.is_root
        ? { isBasedOn: edition(author, translation.author_uid) }
        : { translator: person(author, translation.author_uid) })),
    ...(translation.publication_date && {
      datePublished: translation.publication_date,
    }),
  }
}

function generateTextMetaJsonLd(entry) {
  const url = absoluteUrl(entry.scx_path)
  const translations = entry.translations ?? []
  const roots = translations.filter(translation => translation.is_root)
  const others = translations.filter(translation => !translation.is_root)
  const blurb = textFromHtml(entry.blurb)
  // The page, and the work it's about as its main entity: each root edition is an example of it, the rest translations
  return jsonLd({
    '@type': 'ItemPage',
    '@id': url,
    name: titleOf(entry),
    description: descriptionOf(entry),
    url,
    sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
    inLanguage: 'en',
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
      '@id': workId(entry.uid),
      name: entry.scx_range_sutta_individual
        ? textFromHtml(entry.acronym)
        : workName(entry),
      ...(!entry.scx_range_sutta_individual && {
        alternateName: [
          translatedName(entry),
          textFromHtml(entry.acronym),
        ].filter(Boolean),
      }),
      ...(blurb && { description: blurb }),
      identifier: entry.uid,
      url,
      sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
      ...(entry.root_lang && { inLanguage: langTag(entry.root_lang) }),
      publisher: SUTTACENTRAL,
      about: { '@type': 'Thing', name: 'Buddhism' },
      ...(roots.length && {
        workExample: roots.map(root => editionOf(entry, root)),
      }),
      ...(others.length && {
        workTranslation: others.map(other => editionOf(entry, other)),
      }),
    },
  })
}

/*
 * Don't need translations yet, and logging them breaks dev server.
 */
function removeTranslationTexts(node) {
  const { _bilarasuttas_data, _suttas_data, children, translations, ...rest } =
    node

  const redacted = {
    ...rest,
    ...(_bilarasuttas_data && {
      _bilarasuttas_data: { scx_redacted: true },
    }),
    ...(_suttas_data && {
      _suttas_data: { scx_redacted: true },
    }),
  }

  if (translations) {
    redacted.translations = translations.map(removeTranslationTexts)
  }

  if (children) {
    redacted.children = children.map(removeTranslationTexts)
  }

  return redacted
}

let usedPaths = []

function flatten(nodes, parentPath = '') {
  return nodes.flatMap(node => {
    const currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`
    const results = []

    if (node.node_type === 'leaf' || node.type === 'leaf') {
      const scx_path = node.uid
      if (usedPaths.includes(scx_path)) return null
      usedPaths.push(scx_path)

      // Manually create individual range suttas, eg: /an1.1-10 and /dhp1-20
      if (node.scx_range_sutta) {
        const rangeEntries = node.scx_range_sutta_range_uids.map(
          (uid, index, arr) => {
            function uidToTitle(uidInput) {
              return uidToAcronym(uidInput).replace('Dhp', 'Dhammapada') // eg "AN 1.1", "Dhammapada 1"... as per .net
            }

            function getPrevUid() {
              if (index > 0) return arr[index - 1] // Previous item exists in current range
              // At start of range - get last item from previous range, ie "an1.250-257" -> "an1.257"
              const prev = parseUidNumbers(node.previous?.uid)
              if (!prev) return node.previous?.uid || null
              return `${prev.prefix}${prev.end}`
            }

            function getNextUid() {
              if (index < arr.length - 1) return arr[index + 1] // Next item exists in current range
              // At end of range - get first item from next range, ie "an1.11-20" -> "an1.11"
              const next = parseUidNumbers(node.next?.uid)
              if (!next) return node.next?.uid || null
              return `${next.prefix}${next.start}`
            }

            // Filtered to include only relevant parallels for this individual range entry
            const filteredParallels =
              node._parallels_data &&
              Object.entries(node._parallels_data).filter(([k, v]) => {
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

            return removeTranslationTexts({
              ...node,
              uid,
              acronym: uidToAcronym(uid),
              scx_path: uid,
              scx_breadcrumb: currentPath
                .split('/')
                .toSpliced(-1, 1, uid)
                .join('/'),
              scx_range_sutta_individual: true,
              scx_range_sutta_title: uidToTitle(uid),
              scx_range_sutta_pagination: {
                prev: { uid: getPrevUid(), name: uidToAcronym(getPrevUid()) },
                next: { uid: getNextUid(), name: uidToAcronym(getNextUid()) },
              },
              scx_range_sutta_parallels_data:
                filteredParallels && Object.fromEntries(filteredParallels),
              scx_range_sutta_parallels_count: filteredParallels?.reduce(
                (sum, [k, v]) => sum + v.length,
                0
              ),
            })
          }
        )

        results.push(
          ...rangeEntries.map(entry => ({
            ...entry,
            scx_breadcrumb_trail: trailOf(entry),
            scx_title: titleOf(entry),
            scx_json_ld: generateTextMetaJsonLd(entry),
            scx_og_tags: generateTextMetaOGTags(entry),
          }))
        )
      }

      // Proceed as normal with the rest of the texts
      const entry = removeTranslationTexts({
        ...node,
        scx_path,
        scx_breadcrumb: currentPath,
      })
      results.push({
        ...entry,
        scx_breadcrumb_trail: trailOf(entry),
        scx_title: titleOf(entry),
        scx_json_ld: generateTextMetaJsonLd(entry),
        scx_og_tags: generateTextMetaOGTags(entry),
      })
      return results
    }

    return flatten(node.children || [], currentPath)
  })
}

/*
 * Returns the metadata of the text (not the actual text content), including parallels.
 *
 * Flattens `masterData` and adds a `scx_path` key with the appropriate URL slug
 * to sync URL structure with SuttaCentral.net.
 *
 * The root path here (ie `/dn1`) is the next nested path after chapterData, ie `sutta/long/dn/`,
 * or the leaf node itself (just without the translator) however you want to look at it.
 *
 * @returns
 * [
 *  { uid: 'dn1', scx_path: '/dn1', ... },
 *  { uid: 'mn44', scx_path: '/mn44', ... },
 *  { uid: 'sn22.23', scx_path: '/sn22.23', ... },
 *  ...
 * ]
 */
export default async function () {
  if (!builds('nav')) return []
  const menu = await masterData()
  tree = menu
  return onlySample(flatten(menu).filter(Boolean))
}

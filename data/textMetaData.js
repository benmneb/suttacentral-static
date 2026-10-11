import masterData from './_masterData.js'
import { breadcrumbTrail } from '../tools/breadcrumbs.js'
import siteMetaData from './_siteMetaData.js'
import {
  parseUidNumbers,
  uidIsInRange,
  uidToAcronym,
} from '../tools/rangeSuttas.js'

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `tools/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

function generateTextMetaOGTags(entry) {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': `${entry.original_title || entry.root_name}—${entry.translated_title || entry.translated_name}`,
    'og:description':
      entry.blurb ||
      'Information about available translations and editions of this Buddhist text',
    'og:url': `${metadata.origin}/${entry.scx_path}`,
    'og:type': 'website',
    'og:site_name': metadata.title,
    'og:image': '/images/og-image2.jpg',
  })
}

function generateTextMetaJsonLd(entry) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      '@id': `/${entry.scx_path}`,
      name: `${entry.original_title || entry.root_name}—${entry.translated_title || entry.translated_name}`,
      description:
        entry.blurb ||
        'Information about available translations and editions of this Buddhist text',
      url: `${siteMetaData().origin}/${entry.scx_path}`,
      sameAs: `https://suttacentral.net/${entry.scx_path}`,
      identifier: entry.uid,
      inLanguage: 'en',
      about: {
        '@type': 'CreativeWork',
        '@id': `/${entry.uid}/#work`,
        name: entry.original_title || entry.root_name,
        alternateName: [
          entry.translated_title || entry.translated_name,
          entry.acronym,
        ].filter(Boolean),
        description: entry.blurb,
        identifier: entry.uid,
        ...(entry.translations?.length && {
          workTranslation: entry.translations.map(translation => ({
            '@type': 'CreativeWork',
            '@id': `/${entry.uid}/${translation.lang}/${translation.author_uid}`,
            name: `${entry.original_title || entry.root_name} - ${translation.author || translation.author_uid}`,
            inLanguage: {
              '@type': 'Language',
              name: translation.lang_name || translation.lang,
              alternateName: translation.lang,
            },
            url: `${siteMetaData().origin}/${entry.uid}/${translation.lang}/${translation.author_uid}`,
            sameAs: `https://suttacentral.net/${entry.uid}/${translation.lang}/${translation.author_uid}`,
            genre: translation.is_root ? 'Root Text' : 'Translation',
            ...(translation.author && {
              [translation.is_root ? 'editor' : 'translator']: {
                '@type': 'Person',
                name: translation.author
                  .replace(/&nbsp;|&#160;|\u00A0/g, ' ')
                  .trim(),
                identifier: translation.author_uid,
              },
            }),
            ...(translation.publication_date && {
              datePublished: translation.publication_date,
            }),
            translationOfWork: {
              '@id': `/${entry.uid}/#work`,
            },
          })),
        }),
        about: {
          '@type': 'Thing',
          name: 'Buddhist Teaching',
          description: 'Ancient Buddhist discourse or text from the Pali Canon',
        },
      },
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
        sameAs: 'https://suttacentral.net',
        description: 'Early Buddhist texts, translations, and parallels',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': `/${entry.scx_path}`,
      },
    },
    null,
    2
  )
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
  const menu = await masterData()
  tree = menu
  return flatten(menu).filter(Boolean)
}

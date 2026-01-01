import masterData from './_masterData.js'
import siteMetaData from './_siteMetaData.js'

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
          ...entry.scx_breadcrumb.split('/').map((part, index) => {
            const path = entry.scx_breadcrumb
              .split('/')
              .slice(0, index + 1)
              .join('/')
            const isSecondLast =
              index === entry.scx_breadcrumb.split('/').length - 2
            const isLast = index === entry.scx_breadcrumb.split('/').length - 1
            return {
              '@type': 'ListItem',
              position: index + 2,
              name: part,
              item: isLast
                ? `/${entry.scx_path}`
                : isSecondLast
                  ? `/${part}`
                  : `/pitaka/${path}`,
            }
          }),
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
            function uidToAcronym(uidInput) {
              if (!uidInput) return ''
              // I think it's only AN and Dhp that have range suttas, but anyway...
              return String(uidInput).replace(
                /^([a-zA-Z]+)(.*)$/,
                (_, l, n) => l.toUpperCase().replace('DHP', 'Dhp') + ' ' + n
              ) // eg "AN 1.1", "Dhp 1"...
            }

            function uidToTitle(uidInput) {
              return uidToAcronym(uidInput).replace('Dhp', 'Dhammapada') // eg "AN 1.1", "Dhammapada 1"... as per .net
            }

            function getPrevUid() {
              if (index > 0) {
                // Previous item exists in current range
                return arr[index - 1]
              } else if (node.previous?.uid) {
                // At start of range - get last item from previous range
                const prevRangeUid = node.previous.uid
                if (prevRangeUid.includes('-')) {
                  // It's a range like "an1.250-257" or "dhp1-20"
                  const [start, end] = prevRangeUid.split('-')

                  if (start.includes('.')) {
                    // Format: "an1.250-257" -> "an1.257"
                    const prefix = start.split('.')[0] + '.'
                    return prefix + end
                  } else {
                    // Format: "dhp1-20" -> "dhp20"
                    const prefix = start.replace(/[0-9]/g, '')
                    return prefix + end
                  }
                } else {
                  // Single uid? Not sure if this is used...
                  return prevRangeUid
                }
              }
              return null
            }

            function getNextUid() {
              if (index < arr.length - 1) {
                // Next item exists in current range
                return arr[index + 1]
              } else if (node.next?.uid) {
                // At end of range - get first item from next range
                const nextRangeUid = node.next.uid
                if (nextRangeUid.includes('-')) {
                  // It's a range like "an1.11-20", so use "an1.11"
                  return nextRangeUid.split('-')[0]
                } else {
                  // Single uid? Should never get here...
                  return nextRangeUid
                }
              }
              return null
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
                const kBase = k.split('#')[0]
                const rangeMatch = kBase.match(/^(.+?)(\d+)(?:\.(\d+))?-(\d+)$/)
                if (rangeMatch) {
                  const [
                    ,
                    rangePrefix,
                    rangeNumIfDecimalOrStart,
                    rangeStartIfDecimal,
                    rangeEnd,
                  ] = rangeMatch
                  const uidMatch = uid.match(/^(.+?)(\d+)(?:\.(\d+))?$/)

                  if (uidMatch) {
                    const [, currentPrefix, currentNum, currentDecimal] =
                      uidMatch

                    // Same prefix (eg. an, dhp)
                    if (rangePrefix === currentPrefix) {
                      // For ranges with decimals (an1.188-197)
                      if (rangeStartIfDecimal) {
                        // Only match if the main numbers match (an1.* only matches an1.*)
                        if (rangeNumIfDecimalOrStart === currentNum) {
                          const start = parseInt(rangeStartIfDecimal)
                          const end = parseInt(rangeEnd)
                          const current = parseInt(currentDecimal)

                          if (current >= start && current <= end) {
                            return true
                          }
                        }
                      } else {
                        // For simple ranges without decimals (dhp1-2)
                        const start = parseInt(rangeNumIfDecimalOrStart)
                        const end = parseInt(rangeEnd)
                        const current = parseInt(currentNum)

                        if (current >= start && current <= end) {
                          return true
                        }
                      }
                    }
                  }
                }

                return false
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
  return flatten(menu).filter(Boolean)
}

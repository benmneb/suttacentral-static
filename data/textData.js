import masterData from './_masterData.js'
import siteMetaData from './_siteMetaData.js'

let usedPaths = []

function generateTextOGTags(entry) {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': `${entry.acronym}: ${entry.original_title}—${entry.author}`,
    'og:description':
      entry.blurb || 'Buddhist text from the Pali Canon with translation',
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
      'Buddhism, Buddhist Texts, Pali Canon, Tipitaka, Early Buddhism, Theravada, Suttas',
  })
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
        entry.blurb || 'Buddhist text from the Pali Canon with translation',
      url: `${siteMetaData().origin}/${entry.scx_path}`,
      sameAs: `https://suttacentral.net/${entry.scx_path}`,
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
      ...(entry.previous?.uid && {
        hasPreviousItem: {
          '@type': 'CreativeWork',
          name: entry.previous.name,
          url: entry.is_root
            ? `/${entry.previous.uid}/${entry.root_lang}/${entry.author_uid}`
            : `/${entry.previous.uid}/en/${entry.priority_author_uid}`,
          sameAs: `https://suttacentral.net${
            entry.is_root
              ? `/${entry.previous.uid}/${entry.root_lang}/${entry.author_uid}`
              : `/${entry.previous.uid}/en/${entry.priority_author_uid}`
          }`,
        },
      }),
      ...(entry.next?.uid && {
        hasNextItem: {
          '@type': 'CreativeWork',
          name: entry.next.name,
          url: entry.is_root
            ? `/${entry.next.uid}/${entry.root_lang}/${entry.author_uid}`
            : `/${entry.next.uid}/en/${entry.priority_author_uid}`,
          sameAs: `https://suttacentral.net${
            entry.is_root
              ? `/${entry.next.uid}/${entry.root_lang}/${entry.author_uid}`
              : `/${entry.next.uid}/en/${entry.priority_author_uid}`
          }`,
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

      // Manually create individual range suttas, from eg: /an1.1-10 and /dhp1-20
      // Only segmented texts can have individual range suttas
      if (parent.scx_range_sutta && node.segmented) {
        const rangeEntries = parent.scx_range_sutta_range_uids.map(
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
              if (uidInput.includes('.')) return uidInput.split('.')[1] // "AN 1.1" -> "1" as per .net
              return uidToAcronym(uidInput).split('Dhp ')[1] // just the number too (.net just leaves the chapter title...)
            }

            function getPrevUid() {
              if (index > 0) {
                // Previous item exists in current range
                return arr[index - 1]
              } else if (node._suttas_data?.translation?.previous?.uid) {
                // At start of range - get last item from previous range
                const prevRangeUid = node._suttas_data.translation.previous.uid
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
              } else if (node._suttas_data?.translation?.next?.uid) {
                // At end of range - get first item from next range
                const nextRangeUid = node._suttas_data.translation.next.uid
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

            return {
              ...parentWithoutTranslations,
              ...node,
              uid,
              acronym: uidToAcronym(uid),
              scx_path: `${uid}/${node.lang}/${node.author_uid}`,
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
            }
          }
        )
        results.push(
          ...rangeEntries.map(entry => ({
            ...entry,
            scx_json_ld: generateTextJsonLd(entry),
            scx_og_tags: generateTextOGTags(entry),
          }))
        )
      }

      // Proceed as normal with the non-range texts
      const entry = {
        ...parentWithoutTranslations,
        ...node,
        scx_path,
        scx_breadcrumb: currentPath,
      }
      results.push({
        ...entry,
        scx_json_ld: generateTextJsonLd(entry),
        scx_og_tags: generateTextOGTags(entry),
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
  return flatten(menu).filter(Boolean)
}

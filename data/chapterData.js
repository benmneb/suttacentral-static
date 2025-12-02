import masterData from './_masterData.js'
import siteMetaData from './_siteMetaData.js'

function generateChapterOGTags(entry) {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': `${entry.original_title || entry.root_name}${entry.translated_title || entry.translated_name ? `—${entry.translated_title || entry.translated_name}` : ''}`,
    'og:description':
      entry.blurb || 'Collection of Buddhist texts and translations',
    'og:url': `${metadata.origin}/${entry.scx_path}`,
    'og:type': 'website',
    'og:site_name': metadata.title,
  })
}

function generateChapterJsonLd(entry) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `/${entry.scx_path}`,
      name: `${entry.original_title || entry.root_name}${entry.translated_title || entry.translated_name ? `—${entry.translated_title || entry.translated_name}` : ''}`,
      description:
        entry.blurb || 'Collection of Buddhist texts and translations',
      url: `${siteMetaData().origin}/${entry.scx_path}`,
      sameAs: `https://suttacentral.net/${entry.scx_path}`,
      identifier: entry.uid,
      inLanguage: [
        {
          '@type': 'Language',
          name: 'English',
          alternateName: 'en',
        },
        ...(entry.root_lang
          ? [
              {
                '@type': 'Language',
                name: entry.root_lang,
                alternateName: entry.root_lang,
              },
            ]
          : []),
      ],
      about: {
        '@type': 'Thing',
        name: 'Buddhist Literature',
        description: 'Ancient Buddhist texts, suttas, and modern translations',
      },
      isPartOf: {
        '@type': 'WebSite',
        '@id': '/#website',
        name: 'SuttaCentral',
      },
      ...(entry.children?.length && {
        hasPart: entry.children.map(child => ({
          '@type': 'CreativeWork',
          '@id': `/${child.uid}`,
          name: `${child.original_title || child.root_name}${child.translated_title || child.translated_name ? `—${child.translated_title || child.translated_name}` : ''}`,
          description: child.blurb,
          identifier: child.uid,
          sameAs: `https://suttacentral.net/${child.uid}`,
          ...(child.acronym && {
            alternateName: child.acronym,
          }),
          about: {
            '@type': 'Thing',
            name: 'Buddhist Teaching',
            description: 'Ancient Buddhist discourse or text',
          },
          ...(child.translations?.length && {
            workTranslation: child.translations.map(translation => ({
              '@type': 'CreativeWork',
              name: `${child.original_title || child.root_name} - ${translation.author || translation.author_uid}`,
              inLanguage: translation.lang,
              translator: {
                '@type': 'Person',
                name: translation.author || translation.author_uid,
              },
              ...(translation.publication_date && {
                datePublished: translation.publication_date,
              }),
              url: `${siteMetaData().origin}/${child.uid}/${translation.lang}/${translation.author_uid}`,
              sameAs: `https://suttacentral.net/${child.uid}/${translation.lang}/${translation.author_uid}`,
            })),
          }),
          isPartOf: {
            '@id': `/${entry.scx_path}`,
          },
        })),
      }),
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
            const isLast = index === entry.scx_breadcrumb.split('/').length - 1
            return {
              '@type': 'ListItem',
              position: index + 2,
              name: part,
              item: isLast ? `/${entry.scx_path}` : `/pitaka/${path}`,
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

function flatten(nodes, parentPath = '') {
  return nodes.flatMap(node => {
    const currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`

    // Stop recursion before it reaches leaf nodes (the actual texts)
    // to sync URL structure with SuttaCentral.net, while still accounting for:
    // 1) uneven tree structure, ie https://suttacentral.net/api/menu/dharmapadas?language=en,
    //    which returns a child `uid: g2dhp` with node_type `leaf`, when the rest are `branch`,
    // 2) the unusual chapter breaks for pātimokkha texts (...-pm) in SuttaCentral.net
    if (
      (node.node_type !== 'leaf' &&
        !node.children?.some(c => c.node_type === 'branch')) ||
      node.uid?.endsWith('-pm')
    ) {
      const entry = removeTranslationTexts({
        ...node,
        scx_path: `${node.uid}`,
        scx_breadcrumb: currentPath,
      })
      return {
        ...entry,
        scx_json_ld: generateChapterJsonLd(entry),
        scx_og_tags: generateChapterOGTags(entry),
      }
    }

    return flatten(node.children || [], currentPath)
  })
}

/*
 * Returns just the "chapters".
 *
 * Flattens `masterData` and adds a `scx_path` key with the appropriate URL slug
 * to sync URL structure with SuttaCentral.net.
 *
 * The root path here (ie `/dn-silakkhandhavagga`) is the next nested path
 * after the end of pitakaData, ie `sutta/long/dn/`,
 * or the first parent of the leaf nodes, however you want to look at it.
 *
 * @returns
 * [
 *  { uid: 'dn-silakkhandhavagga', scx_path: '/dn-silakkhandhavagga', ... },
 *  { uid: 'dn-mahavagga', scx_path: '/dn-mahavagga', ... },
 *  { uid: 'dn-pathikavagga', scx_path: '/dn-pathikavagga', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await masterData()
  const chapters = flatten(menu).filter(Boolean)

  // Deduplicate by uid to prevent permalink conflicts when the same
  // collection (ie /dhp) appears at multiple levels in the tree structure
  const seen = new Set()
  return chapters.filter(chapter => {
    if (seen.has(chapter.uid)) {
      return false
    }
    seen.add(chapter.uid)
    return true
  })
}

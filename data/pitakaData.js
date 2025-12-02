import masterData from './_masterData.js'
import siteMetaData from './_siteMetaData.js'

function generatePitakaOGTags(entry) {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': `${entry.original_title || entry.root_name}—${entry.translated_title || entry.translated_name}`,
    'og:description':
      entry.blurb || 'Collection of Buddhist texts from the Pali Canon',
    'og:url': `${metadata.origin}/pitaka/${entry.scx_path}`,
    'og:type': 'website',
    'og:site_name': metadata.title,
  })
}

function generatePitakaJsonLd(entry) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `/pitaka/${entry.scx_path}`,
      name: `${entry.original_title || entry.root_name}—${entry.translated_title || entry.translated_name}`,
      description: entry.blurb,
      url: `${siteMetaData().origin}/pitaka/${entry.scx_path}`,
      sameAs: `https://suttacentral.net/pitaka/${entry.scx_path}`,
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
        description: 'Ancient Buddhist texts and modern translations',
      },
      isPartOf: {
        '@type': 'WebSite',
        '@id': '/#website',
        name: 'SuttaCentral',
      },
      ...(entry.children?.length && {
        hasPart: entry.children.map(child => {
          const hasLeafGrandchild = child.children?.some(
            grandchild =>
              grandchild.node_type === 'leaf' || grandchild.uid?.endsWith('-pm')
          )
          return {
            '@type': 'Collection',
            '@id': hasLeafGrandchild
              ? `/${child.uid}/`
              : `/pitaka/${entry.scx_path}/${child.uid}/`,
            name: `${child.original_title || child.root_name}${child.translated_title || child.translated_name ? `—${child.translated_title || child.translated_name}` : ''}`,
            description: child.blurb,
            url: hasLeafGrandchild
              ? `/${child.uid}/`
              : `/pitaka/${entry.scx_path}/${child.uid}/`,
            sameAs: hasLeafGrandchild
              ? `https://suttacentral.net/${child.uid}/`
              : `https://suttacentral.net/pitaka/${entry.scx_path}/${child.uid}/`,
            identifier: child.uid,
            isPartOf: {
              '@id': `/pitaka/${entry.scx_path}`,
            },
          }
        }),
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
          ...entry.scx_breadcrumb.split('/').map((part, index) => ({
            '@type': 'ListItem',
            position: index + 2,
            name: part,
            item: `/pitaka/${entry.scx_breadcrumb
              .split('/')
              .slice(0, index + 1)
              .join('/')}`,
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
        '@id': `/pitaka/${entry.scx_path}`,
      },
    },
    null,
    2
  )
}

/*
 * Don't need translations yet, and logging them breaks dev server.
 */
function removeTranslations(node) {
  const { translations, children, ...rest } = node

  const redacted = {
    ...rest,
    ...(translations && { translations: [{ scx_redacted: true }] }),
  }

  if (children) {
    redacted.children = children.map(removeTranslations)
  }

  return redacted
}

function flatten(nodes, parentPath = '') {
  return nodes.flatMap(node => {
    if (!node.children?.some(c => c.node_type === 'branch')) {
      // Stop where chapters start, to sync URL structure with SuttaCentral.net
      return null
    }

    const currentPath = parentPath ? `${parentPath}/${node.uid}` : `${node.uid}`

    const flatNode = removeTranslations({
      ...node,
      scx_path: currentPath,
      scx_breadcrumb: currentPath,
    })

    const nodeWithJsonLd = {
      ...flatNode,
      scx_json_ld: generatePitakaJsonLd(flatNode),
      scx_og_tags: generatePitakaOGTags(flatNode),
    }

    return node.children?.length
      ? [nodeWithJsonLd, ...flatten(node.children, currentPath)]
      : [nodeWithJsonLd]
  })
}

/*
 * Flattens `masterData` and adds a `scx_path` key with the URL slug
 * for the nested URL "menu" only (ie `/sutta/long/dn`),
 * to sync URL structure with SuttaCentral.net.
 *
 * These are then prefixed with /pitaka in `pitaka.md`
 * to sync URL structure with SuttaCentral.net properly.
 *
 * @returns
 * [
 *  { uid: 'sutta', scx_path: '/sutta', ... },
 *  { uid: 'long', scx_path: '/sutta/long', ... },
 *  { uid: 'dn', scx_path: '/sutta/long/dn', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await masterData()
  return flatten(menu).filter(Boolean)
}

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

    if (node.node_type === 'leaf' || node.type === 'leaf') {
      const scx_path = node.uid
      if (usedPaths.includes(scx_path)) {
        return null
      }
      usedPaths.push(scx_path)
      const entry = removeTranslationTexts({
        ...node,
        scx_path,
        scx_breadcrumb: currentPath,
      })
      return {
        ...entry,
        scx_json_ld: generateTextMetaJsonLd(entry),
        scx_og_tags: generateTextMetaOGTags(entry),
      }
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

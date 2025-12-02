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

    if (parent) {
      currentPath = parentPath
      const scx_path = `${parent.uid}/${node.lang}/${node.author_uid}`
      // Dirty hack to get around duplicate paths in /suttaplex data
      // ie: https://suttacentral.net/api/suttaplex/mn1?language=en has /mn1/ru/sv/ twice
      // TODO: pick the one with the latest publication date
      // TODO: log these duplicates and see what's up
      if (usedPaths.includes(scx_path)) return null
      usedPaths.push(scx_path)
      const { translations, ...parentWithoutTranslations } = parent
      const entry = {
        ...parentWithoutTranslations,
        ...node,
        scx_path,
        scx_breadcrumb: currentPath,
      }
      return {
        ...entry,
        scx_json_ld: generateTextJsonLd(entry),
        scx_og_tags: generateTextOGTags(entry),
      }
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

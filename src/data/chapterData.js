import masterData from './_masterData.js'
import { breadcrumbTrail } from '../helpers/breadcrumbs.js'
import { onlySample } from '../helpers/samplePages.js'
import { SC_ORIGIN } from '../helpers/scApi.js'
import siteMetaData from './_siteMetaData.js'
import { isChapterNode } from '../helpers/pageUids.js'

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `helpers/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

function generateChapterOGTags(entry) {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': `${entry.original_title || entry.root_name}${entry.translated_title || entry.translated_name ? `—${entry.translated_title || entry.translated_name}` : ''}`,
    'og:description':
      entry.blurb || 'Collection of Buddhist texts and translations',
    'og:url': `${metadata.origin}/${entry.scx_path}`,
    'og:type': 'website',
    'og:site_name': metadata.title,
    'og:image': '/images/og-image2.jpg',
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
      sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
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
          sameAs: `${SC_ORIGIN}/${child.uid}`,
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
              sameAs: `${SC_ORIGIN}/${child.uid}/${translation.lang}/${translation.author_uid}`,
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

    const results = []

    // Handle shortcut nodes - add them to results but continue recursion
    if (node.scx_shortcut) {
      const shortcutEntry = removeTranslationTexts({
        ...node,
        scx_path: node.uid,
        scx_breadcrumb: currentPath,
      })
      results.push({
        ...shortcutEntry,
        scx_breadcrumb_trail: trailOf(shortcutEntry),
        scx_json_ld: generateChapterJsonLd(shortcutEntry),
        scx_og_tags: generateChapterOGTags(shortcutEntry),
      })
    }

    // Stop recursion before it reaches leaf nodes (the actual texts)
    if (isChapterNode(node)) {
      const entry = removeTranslationTexts({
        ...node,
        scx_path: `${node.uid}`,
        scx_breadcrumb: currentPath,
      })
      results.push({
        ...entry,
        scx_breadcrumb_trail: trailOf(entry),
        scx_json_ld: generateChapterJsonLd(entry),
        scx_og_tags: generateChapterOGTags(entry),
      })
      return results
    }

    return [...results, ...flatten(node.children || [], currentPath)]
  })
}

/*
 * Returns just the "chapters".
 *
 * Flattens `masterData` and adds a `scx_path` key with the appropriate URL slug
 * to sync URL structure with SuttaCentral.net.
 *
 * Accounts for "shortcut to all sutta" links (scx_shortcut) that return
 * all the suttas in a given chapter or book, as per the SC /shortcuts API.
 *
 * The root path here (ie `/dn-silakkhandhavagga`) is the next nested path
 * after the end of pitakaData, ie `sutta/long/dn/`,
 * or the first parent of the leaf nodes, however you want to look at it.
 *
 * @returns
 * [
 *  { uid: 'dn', scx_path: '/dn', ... },
 *  { uid: 'dn-silakkhandhavagga', scx_path: '/dn-silakkhandhavagga', ... },
 *  { uid: 'dn-mahavagga', scx_path: '/dn-mahavagga', ... },
 *  { uid: 'dn-pathikavagga', scx_path: '/dn-pathikavagga', ... },
 *  ...
 * ]
 */
export default async function () {
  const menu = await masterData()
  tree = menu
  const chapters = flatten(menu).filter(Boolean)

  // Deduplicate by uid to prevent permalink conflicts when the same
  // collection (ie /dhp) appears at multiple levels in the tree structure
  const seen = new Set()
  const deduped = chapters.filter(chapter => {
    if (seen.has(chapter.uid)) {
      return false
    }
    seen.add(chapter.uid)
    return true
  })

  return onlySample(addPagination(deduped))
}

/*
 * Adds `scx_chapter_pagination` prev/next links between neighbouring chapters.
 *
 * Like .net's text pagination, it stops at the edge of a collection
 * (ie `dn`, `sn`, `pli-tv-bu-vb`), the 3rd segment of the breadcrumb.
 *
 * Shortcut pages only link to other shortcut pages at the same depth,
 * ie `/sn1` <-> `/sn2`, so the vagga pages link directly to each other,
 * ie `/sn1-chetvavagga` <-> `/sn2-pathamavagga`.
 */
function addPagination(chapters) {
  const groups = new Map()
  for (const chapter of chapters) {
    // SC's /menu API returns some empty nodes with a null uid
    if (!chapter.uid) continue
    const parts = chapter.scx_breadcrumb.split('/')
    const key = chapter.scx_shortcut
      ? `${parts[2]}/shortcut/${parts.length}`
      : parts[2]
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(chapter)
  }

  const link = chapter =>
    chapter && {
      uid: chapter.uid,
      name: (
        chapter.translated_name ||
        chapter.root_name ||
        chapter.uid
      ).trim(),
    }

  for (const group of groups.values()) {
    group.forEach((chapter, i) => {
      chapter.scx_chapter_pagination = {
        prev: link(group[i - 1]),
        next: link(group[i + 1]),
      }
    })
  }

  return chapters
}

import masterData from './_masterData.js'
import { breadcrumbTrail } from '../helpers/breadcrumbs.js'
import { onlySample } from '../helpers/samplePages.js'
import {
  absoluteUrl,
  breadcrumbList,
  jsonLd,
  menuTitle,
  ogTags,
  SUTTACENTRAL,
  textFromHtml,
  website,
  withTranslatedTitle,
  workId,
} from '../helpers/pageMetadata.js'
import { SC_ORIGIN } from '../helpers/scApi.js'
import { isChapterNode } from '../helpers/pageUids.js'

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `helpers/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

function descriptionOf(entry) {
  const blurb = textFromHtml(entry.blurb)
  if (blurb) return blurb
  const name = withTranslatedTitle(
    entry.original_title || entry.root_name,
    entry.translated_title || entry.translated_name
  )
  return `Buddhist texts and translations in ${name}.`
}

function generateChapterOGTags(entry) {
  return ogTags({
    title: menuTitle(entry),
    description: descriptionOf(entry),
    url: entry.scx_path,
  })
}

function generateChapterJsonLd(entry) {
  const url = absoluteUrl(entry.scx_path)
  return jsonLd({
    '@type': 'CollectionPage',
    '@id': url,
    name: menuTitle(entry),
    description: descriptionOf(entry),
    url,
    sameAs: `${SC_ORIGIN}/${entry.scx_path}`,
    identifier: entry.uid,
    inLanguage: 'en',
    isPartOf: website(),
    publisher: SUTTACENTRAL,
    about: { '@type': 'Thing', name: 'Buddhism' },
    breadcrumb: breadcrumbList([
      { name: 'Home', url: '/' },
      // The last crumb is this page itself
      ...trailOf(entry).map((crumb, index, trail) => ({
        name: crumb.name,
        url: index === trail.length - 1 ? entry.scx_path : crumb.href,
      })),
    ]),
    // Each text by the work its own page describes in full
    ...(entry.children?.length && {
      hasPart: entry.children.map(child => ({
        '@type': 'CreativeWork',
        '@id':
          child.node_type === 'leaf' || child.type === 'leaf'
            ? workId(child.uid)
            : absoluteUrl(child.uid),
        name: menuTitle(child),
        ...(child.acronym && { alternateName: textFromHtml(child.acronym) }),
        url: absoluteUrl(child.uid),
      })),
    }),
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

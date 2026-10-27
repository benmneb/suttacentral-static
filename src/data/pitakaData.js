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
} from '../helpers/pageMetadata.js'
import { SC_ORIGIN } from '../helpers/scApi.js'
import { hasPitakaPage } from '../helpers/pageUids.js'

// The `masterData` tree, set before flattening, for each page's breadcrumbs (see `helpers/breadcrumbs.js`)
let tree = []

const trailOf = entry => breadcrumbTrail(tree, entry.scx_breadcrumb)

function descriptionOf(entry) {
  return (
    textFromHtml(entry.blurb) ||
    `Buddhist texts and translations in the ${menuTitle(entry)}.`
  )
}

function generatePitakaOGTags(entry) {
  return ogTags({
    title: menuTitle(entry),
    description: descriptionOf(entry),
    url: `pitaka/${entry.scx_path}`,
  })
}

function generatePitakaJsonLd(entry) {
  const path = `pitaka/${entry.scx_path}`
  const url = absoluteUrl(path)
  return jsonLd({
    '@type': 'CollectionPage',
    '@id': url,
    name: menuTitle(entry),
    description: descriptionOf(entry),
    url,
    sameAs: `${SC_ORIGIN}/${path}`,
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
        url: index === trail.length - 1 ? path : crumb.href,
      })),
    ]),
    ...(entry.children?.length && {
      hasPart: entry.children.map(child => {
        const hasLeafGrandchild = child.children?.some(
          grandchild =>
            grandchild.node_type === 'leaf' || grandchild.uid?.endsWith('-pm')
        )
        const childUrl = absoluteUrl(
          hasLeafGrandchild ? child.uid : `${path}/${child.uid}`
        )
        return {
          '@type': 'Collection',
          '@id': childUrl,
          name: menuTitle(child),
          url: childUrl,
        }
      }),
    }),
  })
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
    if (!hasPitakaPage(node)) {
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
      scx_breadcrumb_trail: trailOf(flatNode),
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
  tree = menu
  return onlySample(flatten(menu).filter(Boolean))
}

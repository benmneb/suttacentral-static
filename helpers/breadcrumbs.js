/**
 * Breadcrumbs
 *
 * The crumbs for a page, from its `scx_breadcrumb` path of uids (ie "sutta/middle/mn/.../mn1"),
 * shared by `textData.js`, `textMetaData.js`, `chapterData.js` and `pitakaData.js` for both the
 * page and its JSON-LD.
 *
 * Each crumb is named as on .net: its acronym ("MN", "MN 1"), else its root name ("Mūlapaṇṇāsa"),
 * all already in the `/menu` and `/suttaplex` data. And it links to a page that exists:
 * 1. Its own page, if it's a chapter or a text (ie /mn-mulapariyayavagga, /mn1)
 * 2. Else its /pitaka/<path> page (ie /pitaka/sutta/middle/mn, /pitaka/sutta/minor/kn/cnd)
 * 3. Else its place on the nearest page above it, as pātimokkha sections only appear on their
 *    chapter (ie /lzh-dg-bi-pm#lzh-dg-bi-pm-pc)
 * 4. Else nowhere
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { collectPageUids, collectPitakaPaths } from './pageUids.js'
import { uidToAcronym } from './rangeSuttas.js'

const cache = new WeakMap()

/** What each uid is called and which pages exist, worked out once per tree */
function indexTree(tree) {
  if (cache.has(tree)) return cache.get(tree)
  const names = new Map()

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node?.uid) continue
      if (!names.has(node.uid)) {
        names.set(
          node.uid,
          (
            node.acronym ||
            node.root_name ||
            node.translated_name ||
            node.original_title ||
            node.uid
          ).trim()
        )
      }
      // Individual range suttas have no node of their own, ie an1.173 in an1.170-187
      for (const uid of node.scx_range_sutta_range_uids ?? []) {
        if (!names.has(uid)) names.set(uid, uidToAcronym(uid))
      }
      walk(node.children)
    }
  }

  walk(tree)
  const index = {
    names,
    // Shortcut pages (ie /sn1) are left out, as their pitaka page is the one to go to
    ownPages: collectPageUids(tree, { shortcuts: false }),
    pitakaPaths: collectPitakaPaths(tree),
  }
  cache.set(tree, index)
  return index
}

/**
 * @param {Array} tree - The `masterData` tree
 * @param {string} breadcrumb - A page's `scx_breadcrumb`, ie "sutta/middle/mn/mn-mulapannasa"
 * @returns {{ uid: string, name: string, href: string | null }[]} One crumb per uid
 */
export function breadcrumbTrail(tree, breadcrumb) {
  const { names, ownPages, pitakaPaths } = indexTree(tree)
  const uids = breadcrumb.split('/')

  return uids.map((uid, i) => {
    const path = uids.slice(0, i + 1).join('/')
    const above = uids.slice(0, i).findLast(ancestor => ownPages.has(ancestor))
    const href = ownPages.has(uid)
      ? `/${uid}`
      : pitakaPaths.has(path)
        ? `/pitaka/${path}`
        : above
          ? `/${above}#${uid}`
          : null
    return { uid, name: names.get(uid) ?? uid, href }
  })
}

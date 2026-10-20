/**
 * Page Uids
 *
 * Which pages the build makes, so links can be pointed at one that exists. Shared with
 * `chapterData.js` and `pitakaData.js`, which use the same rules to decide what gets a page.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

/*
 * Stop before the leaf nodes (the actual texts) to sync URL structure with SuttaCentral.net,
 * while still accounting for:
 * 1) uneven tree structure, ie https://suttacentral.net/api/menu/dharmapadas?language=en,
 *    which returns a child `uid: g2dhp` with node_type `leaf`, when the rest are `branch`,
 * 2) the unusual chapter breaks for pātimokkha texts (...-pm) in SuttaCentral.net
 */
export function isChapterNode(node) {
  return (
    (node.node_type !== 'leaf' &&
      !node.children?.some(c => c.node_type === 'branch')) ||
    !!node.uid?.endsWith('-pm')
  )
}

/** Does `node` get a `/pitaka/<path>` page? (`pitakaData.js`) Any node with a branch under it does */
export function hasPitakaPage(node) {
  return !!node.children?.some(c => c.node_type === 'branch')
}

/**
 * Every uid with a page of its own: chapters and shortcuts (`chapterData.js`), and the
 * suttaplex page of every text, individual range suttas included (`textMetaData.js`).
 * Without `shortcuts`, the shortcut pages (ie /sn1) are left out
 */
export function collectPageUids(tree, { shortcuts = true } = {}) {
  const uids = new Set()

  function walk(nodes, inChapter) {
    for (const node of nodes ?? []) {
      if (!node) continue
      if (node.node_type === 'leaf' || node.type === 'leaf') {
        uids.add(node.uid)
        for (const uid of node.scx_range_sutta_range_uids ?? []) uids.add(uid)
        continue
      }
      if (shortcuts && node.scx_shortcut) uids.add(node.uid)
      // Nothing under a chapter is a chapter itself, but its texts still get pages
      const isChapter = !inChapter && isChapterNode(node)
      if (isChapter) uids.add(node.uid)
      walk(node.children, inChapter || isChapter)
    }
  }

  walk(tree, false)
  return uids
}

/** Every `/pitaka/<path>` page, as its path (ie "sutta/middle/mn"), as `pitakaData.js` makes them */
export function collectPitakaPaths(nodes, paths = new Set(), parentPath = '') {
  for (const node of nodes ?? []) {
    if (!node || !hasPitakaPage(node)) continue
    const path = parentPath ? `${parentPath}/${node.uid}` : node.uid
    paths.add(path)
    collectPitakaPaths(node.children, paths, path)
  }
  return paths
}

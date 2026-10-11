/**
 * Page Uids
 *
 * Which bare `/<uid>` pages the build makes, so links can be pointed at one when there's no text
 * to go to. Shared with `chapterData.js`, which uses the same rule to decide what's a chapter.
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

/**
 * Every uid with a page of its own: chapters and shortcuts (`chapterData.js`), and the
 * suttaplex page of every text, individual range suttas included (`textMetaData.js`)
 */
export function collectPageUids(nodes, uids = new Set(), inChapter = false) {
  for (const node of nodes ?? []) {
    if (!node) continue
    if (node.node_type === 'leaf' || node.type === 'leaf') {
      uids.add(node.uid)
      for (const uid of node.scx_range_sutta_range_uids ?? []) uids.add(uid)
      continue
    }
    if (node.scx_shortcut) uids.add(node.uid)
    // Nothing under a chapter is a chapter itself, but its texts still get pages
    const isChapter = !inChapter && isChapterNode(node)
    if (isChapter) uids.add(node.uid)
    collectPageUids(node.children, uids, inChapter || isChapter)
  }
  return uids
}

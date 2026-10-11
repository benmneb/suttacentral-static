/**
 * Breadcrumb Names
 *
 * What each uid in a breadcrumb is called, as on .net: its acronym ("MN", "MN 1"), else its root
 * name ("Mūlapaṇṇāsa"), so ie /mn1/en/sujato reads Sutta / Middle / MN / Mūlapaṇṇāsa /
 * Mūlapariyāyavagga / MN 1. All of it is already in the `/menu` and `/suttaplex` data.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { uidToAcronym } from './rangeSuttas.js'

const cache = new WeakMap()

/** @returns {Record<string, string>} every uid in `tree`, as `uid -> name` */
export function breadcrumbNames(tree) {
  if (cache.has(tree)) return cache.get(tree)
  const names = {}

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node?.uid) continue
      names[node.uid] ??= (
        node.acronym ||
        node.root_name ||
        node.translated_name ||
        node.original_title ||
        node.uid
      ).trim()
      // Individual range suttas have no node of their own, ie an1.173 in an1.170-187
      for (const uid of node.scx_range_sutta_range_uids ?? []) {
        names[uid] ??= uidToAcronym(uid)
      }
      walk(node.children)
    }
  }

  walk(tree)
  cache.set(tree, names)
  return names
}

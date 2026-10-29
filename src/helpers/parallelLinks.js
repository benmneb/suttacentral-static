/**
 * Parallel Links
 *
 * /api/parallels lists a parallel's translations without the segmented ones, bar its root text,
 * so DN 22 from MN 10 only has its Pāli and legacy translations, not Sujato's. The texts
 * built here have them, so each parallel gets its English ones as `scx_translations`, for a link
 * to each translator beside the link to its root text. A parallel to a passage only gets the
 * segmented ones, as a legacy text has no segment for its #anchor to land on.
 *
 * Each also gets what `parallelItems.liquid` shows of it, worked out once here rather than
 * on every page it's on: its label with the passage, its language, and its volume and pages.
 *
 * /api/parallels only has an English title for a parallel with a legacy English translation,
 * so SN 51.10 from DN 16 is just "Cetiyasutta". The rest get the one their own text has.
 */
import { parallelAnchor, passageLabel } from './parallelRuns.js'
import { formatVolpages } from './strings.js'

const LANGUAGES = {
  pli: 'Pāli',
  lzh: 'Chinese',
  san: 'Sanskrit',
  xct: 'Tibetan',
  pra: 'Prākrit',
  pgd: 'Gāndhārī',
  uig: 'Uighur',
  xto: 'Tocharian A',
  kho: 'Khotanese',
}

// More than this many references, ie SHT's lists of fragments, and the rest go in its notes
const MAX_VOLPAGES = 3

function volpagesOf(to) {
  const volpages = formatVolpages(to.volpages)
  const parts = volpages.split(',')
  if (volpages.startsWith('PTS') || parts.length <= MAX_VOLPAGES)
    return { volpages }
  return {
    volpages: `${parts.slice(0, MAX_VOLPAGES).join(',')} …`,
    full: volpages,
  }
}

/** Every text's English title, as `uid -> title` */
function indexTitles(nodes, titles = new Map()) {
  for (const node of nodes ?? []) {
    if (!node) continue
    if (node.translated_title?.trim())
      titles.set(node.uid, node.translated_title)
    indexTitles(node.children, titles)
  }
  return titles
}

/**
 * Gives every parallel the English translations built for it, and what's shown of it.
 * Mutates `_parallels_data` in place, as it's shared by every page made from it.
 * @param {Object} resolve from `createLinkResolver`
 * @returns {number} how many parallels were given a translation
 */
export function addParallelDetails(tree, resolve) {
  // Shared by every parallel to the same text, as there are hundreds of thousands
  const byUid = new Map()
  const titles = indexTitles(tree)
  let linked = 0

  function translationsOf(uid, passage) {
    if (!byUid.has(uid)) {
      const all = resolve.translationsIn(uid, 'en').map(t => ({
        lang: t.lang,
        author: t.author || t.author_uid,
        author_uid: t.author_uid,
        segmented: !!t.segmented,
      }))
      byUid.set(uid, { all, segmented: all.filter(t => t.segmented) })
    }
    const { all, segmented } = byUid.get(uid)
    return passage ? segmented : all
  }

  function describe(parallel, rootLang) {
    const { to } = parallel
    to.scx_type = parallel.resembling ? 'resembling' : to.type
    to.scx_anchor = parallelAnchor(to.to ?? '')
    to.scx_label = `${to.acronym?.trim() ?? ''}${passageLabel(to.to ?? '')}`
    if (!to.translated_title && titles.has(to.uid))
      to.translated_title = titles.get(to.uid)
    if (to.root_lang && to.root_lang !== rootLang)
      to.scx_lang_name = LANGUAGES[to.root_lang] ?? to.root_lang
    const { volpages, full } = volpagesOf(to)
    to.scx_volpages = volpages
    if (full) to.scx_volpages_full = full
    const altVolpages = formatVolpages(to.alt_volpages)
    if (altVolpages && altVolpages !== volpages)
      to.scx_alt_volpages = altVolpages
    if (parallel.remark)
      to.scx_remarks = parallel.remark.split(' | ').map(r => r.trim())
    to.scx_has_notes = !!(to.scx_remarks || to.biblio || full)
  }

  function walk(nodes) {
    for (const node of nodes ?? []) {
      if (!node) continue
      const rootLang = node.root_lang ?? node.root_lang_iso
      for (const parallels of Object.values(node._parallels_data ?? {})) {
        if (!Array.isArray(parallels)) continue
        for (const parallel of parallels) {
          const { to } = parallel
          if (!to) continue
          describe(parallel, rootLang)
          if (!to.uid) continue
          let translations = translationsOf(to.uid, to.to?.includes('#'))
          // The one `parallelItems.liquid` links the title to
          const titleLink = to.translations?.find(
            t => t.lang === 'en' || t.lang === to.root_lang
          )
          const same = t =>
            t.lang === titleLink?.lang && t.author_uid === titleLink?.author_uid
          if (translations.some(same)) {
            translations = translations.filter(t => !same(t))
          }
          if (!translations.length) continue
          to.scx_translations = translations
          linked++
        }
      }
      walk(node.children)
    }
  }

  walk(tree)
  return linked
}

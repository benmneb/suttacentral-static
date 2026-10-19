/**
 * Reference Editions
 *
 * The printed editions a reference can point at, from the SuttaCentral API:
 * https://suttacentral.net/api/pali_reference_edition
 *
 * Only used for the tooltip on a reference link, so a reader hovering bj10.20
 * can see which edition it is. Vendored rather than fetched - it is 15 entries
 * that change about never.
 */
export const referenceEditions = {
  bj: 'Buddhajayantītripiṭaka, 1957–1989',
  cck: 'Chulachomklao Pāḷi Tipiṭaka, 1893',
  csp: 'Chaṭṭhasaṅgīti Piṭakaṃ, 1st ed 1952–1955, 2nd ed 1956–1962, 3rd ed 1997',
  dr: 'Dayyaraṭṭhassa Saṅgītitepiṭakaṁ, 1987',
  km: 'Phratraipiṭakapāḷi (Cambodia), 1958–1969',
  lv: 'Lāvaraṭṭhassa Tipiṭaka, 1957',
  maku: 'Mahāmakut (Milindapañha), 1923',
  mc: 'Mahācūḷātepiṭakaṁ, 1960–1990',
  mr: 'Maramma Tipiṭaka, 1997',
  ms: 'Mahasaṅgīti Tipiṭaka, 2010',
  ndp: 'Nālandā Devanāgarī Pāḷi Series Tipiṭaka, 1957–1962',
  pts: 'Pali Text Society',
  si: 'Sinhala Tipiṭaka, before 1957',
  sya: 'Other Thai editions',
  vri: 'Vipassanā Research Institute Tipiṭaka, 2537–2542',
}

// Longest first, so pts-vp-pli1.7 finds pts and not something shorter
const editionSets = Object.keys(referenceEditions).sort(
  (a, b) => b.length - a.length
)

/**
 * The edition a reference id belongs to, by its prefix, the way .net's
 * _getReferenceInfo walks the id from longest to shortest. Some systems have no
 * entry at all (nya, vns, vnp), and those just go without
 */
export function referenceEditionName(ref) {
  const set = editionSets.find(s => ref.startsWith(s))
  return set ? referenceEditions[set] : undefined
}

/** A reference's group in the views menu, as .net's M and T keys have them */
export function referenceGroup(ref) {
  if (/^(sc|vns)/.test(ref)) return 'main'
  if (/^(pts|vnp)/.test(ref)) return 'pts'
  return 'others'
}

/**
 * The reference groups a text has, in the menu's order, and the editions under "others", a line each as their
 * names have commas of their own. Segmented texts always have their own number
 */
export function referenceGroupsOf(entry) {
  const bilara = entry._bilarasuttas_data
  const isSegmented = !!bilara?.keys_order
  const ids = isSegmented
    ? Object.values(bilara.reference_text ?? {}).flatMap(v =>
        String(v)
          .split(',')
          .map(id => id.trim())
          .filter(Boolean)
      )
    : [
        ...(entry._suttas_data?.translation?.text ?? '').matchAll(
          /class='ref ([^' ]+)/g
        ),
      ].map(m => m[1])
  const groups = new Set(ids.map(referenceGroup))
  if (isSegmented) groups.add('main')
  const otherEditions = new Set(
    ids
      .filter(id => referenceGroup(id) === 'others')
      .map(id => referenceEditionName(id) ?? id.replace(/\d.*$/, ''))
  )
  return {
    scx_reference_groups: ['main', 'pts', 'others'].filter(g => groups.has(g)),
    scx_other_editions: [...otherEditions].join('\n'),
  }
}

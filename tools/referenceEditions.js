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

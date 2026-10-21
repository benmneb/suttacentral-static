/**
 * Sample Pages
 *
 * `ONLY_UIDS=mn10,sutta/long` builds just the pages with those uids or paths, written over
 * the ones already in `_site`, so a change can be checked without a full build.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

export const sampleUids = process.env.ONLY_UIDS?.split(',')
  .map(uid => uid.trim().replace(/^\/+|\/+$/g, ''))
  .filter(Boolean)

/** The /define pages a sample build has, which between them have every kind of entry and page */
export const defineSample = [
  // Long PTS entry, with NCPED, DPPN and DPD
  'dhamma',
  // DPPN place with an "On the map" link
  'sāvatthī',
  'rājagaha',
  // DPPN person, with no map link or similar spellings
  'ajitakesakambala',
  // DPD only, with adjacent terms around where it would be
  'ima',
  // NCPED homonyms as entries of their own, and Dhammika
  'gaha',
  // NCPED's entry that had the next 41 words in its homonyms
  'tādisaka',
  // Three PTS homonyms
  'ambho',
  // NCPED cross-reference, and DPD's headword linking to akā
  'akaṁ',
  // NCPED cross-reference only
  'akatavedi',
  // Hyphens in the word, NCPED only
  'agga-m-agga',
  // The first word, so adjacent terms start at it, PTS only
  'a',
  // A space in the URL, DPPN only
  'aggāḷave cetiye',
  // Dhammika's nāga<sup>1</sup> merged into the page
  'nāga',
  // .net's adjacent terms to check against
  'buddha',
]

/** `entries` narrowed to the sample, or all of them without `ONLY_UIDS` */
export function onlySample(entries) {
  if (!sampleUids) return entries
  return entries.filter(
    entry =>
      sampleUids.includes(entry.uid) ||
      sampleUids.includes(entry.scx_path?.replace(/^\/+/, ''))
  )
}

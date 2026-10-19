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

/** `entries` narrowed to the sample, or all of them without `ONLY_UIDS` */
export function onlySample(entries) {
  if (!sampleUids) return entries
  return entries.filter(
    entry =>
      sampleUids.includes(entry.uid) ||
      sampleUids.includes(entry.scx_path?.replace(/^\/+/, ''))
  )
}

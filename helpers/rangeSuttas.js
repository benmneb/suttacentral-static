/**
 * Range Suttas
 *
 * Helpers for splitting "range suttas" (eg /an1.1-10, /sn45.50-54, /dhp1-20)
 * into individual pages, shared by `_masterData.js`, `textData.js` and `textMetaData.js`.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

export function uidToAcronym(uidInput) {
  if (!uidInput) return ''
  return String(uidInput).replace(
    /^([a-zA-Z]+)(.*)$/,
    (_, l, n) => l.toUpperCase().replace('DHP', 'Dhp') + ' ' + n
  ) // eg "AN 1.1", "Dhp 1"...
}

/** Like `uidToAcronym`, but with the en dash .net uses for ranges */
export function rangeUidToAcronym(uid) {
  return uidToAcronym(uid).replace(/(\d)-(\d)/, '$1–$2') // eg "AN 1.175–186"
}

/**
 * Split the trailing number(s) off a uid. Handles both a plain uid and a range:
 * "sn45.1" -> { prefix: "sn45.", start: 1, end: 1 }
 * "an1.1-10" -> { prefix: "an1.", start: 1, end: 10 }
 * "dhp383-423" -> { prefix: "dhp", start: 383, end: 423 }
 */
export function parseUidNumbers(uid) {
  const match = String(uid ?? '').match(/^(.+?)(\d+)(?:-(\d+))?$/)
  if (!match) return null
  const start = parseInt(match[2], 10)
  return {
    prefix: match[1],
    start,
    end: match[3] ? parseInt(match[3], 10) : start,
  }
}

/**
 * Does `uid` span more than one text? Either as a range of numbers ("sn36.30-31", "an1.1-10"),
 * or as two uids joined ("dk1-dk14", "mil3.1.7-mil3.1.8") - though not a uid that just has
 * hyphens in it ("pli-tv-bu-vb-pj1")
 */
export function isMultiTextSpan(uid) {
  const span = parseUidNumbers(uid)
  if (span && span.start !== span.end) return true
  const str = String(uid ?? '')
  for (let i = str.indexOf('-'); i !== -1; i = str.indexOf('-', i + 1)) {
    const start = str.slice(0, i)
    const end = str.slice(i + 1)
    const stem = start.replace(/[\d.]+$/, '') // ie "mil3.1.7" -> "mil"
    if (stem && stem !== start && end !== start && end.startsWith(stem)) {
      if (/^[\d.]+$/.test(end.slice(stem.length))) return true
    }
  }
  return false
}

/** Is `uid` covered by `rangeUid`? eg "sn45.52" is in "sn45.50-54" */
export function uidIsInRange(uid, rangeUid) {
  const range = parseUidNumbers(rangeUid)
  if (!range || !uid.startsWith(range.prefix)) return false
  const rest = uid.slice(range.prefix.length)
  if (!/^\d+$/.test(rest)) return false
  const no = parseInt(rest, 10)
  return no >= range.start && no <= range.end
}

/** The bilara documents in a `/bilarasuttas` response, ie its key prefixes, in order */
export function getKeyPrefixes(bilaraData) {
  return [
    ...new Set(
      (bilaraData?.keys_order ?? []).map(key => key.split(':')[0].toLowerCase())
    ),
  ]
}

/*
 * Which bilara document holds `uid`. Usually that's one prefix per sutta (an1.1:…, an1.2:…),
 * but some ranges are a single document keyed by the range itself (sn45.50-54:…) and some
 * nest a sub-range inside a wider one (an1.175-186:… inside an1.170-187). Either way the
 * containing document is the smallest thing there is to show - as on .net.
 * Failing those, it's in the document before it (see `getShownSpan`)
 */
export function findShownUid(keyPrefixes, uid) {
  return (
    keyPrefixes.find(prefix => prefix === uid) ??
    keyPrefixes.find(prefix => uidIsInRange(uid, prefix)) ??
    keyPrefixes.findLast(prefix => isBefore(prefix, uid)) ??
    null
  )
}

/*
 * Every number a document actually holds, up to where the next one starts (or the range ends).
 * Usually that's just its key, but not always: an1.316-332's last key is an1.329, headed "329–332",
 * which is how an1.330 to 332 end up in it above - and so it should be named "AN 1.329–332"
 */
export function getShownSpan(keyPrefixes, shownUid, rangeUid) {
  const shown = parseUidNumbers(shownUid)
  const next = keyPrefixes[keyPrefixes.indexOf(shownUid) + 1]
  const end = next
    ? parseUidNumbers(next).start - 1
    : parseUidNumbers(rangeUid)?.end
  if (!shown || !(end > shown.end)) return shownUid
  return `${shown.prefix}${shown.start}-${end}`
}

/** Does `prefix` (a uid or range) end before `uid` starts? eg "an1.329" is before "an1.330" */
function isBefore(prefix, uid) {
  const a = parseUidNumbers(prefix)
  const b = parseUidNumbers(uid)
  return !!a && !!b && a.prefix === b.prefix && a.end < b.start
}

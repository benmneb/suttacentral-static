/**
 * Parallel Runs
 *
 * The passages the "Show parallels" setting brackets in the margin, each opening a popover of its parallels.
 * The API keys a parallel to where it starts, so a passage runs to the end of that section. Overlapping passages
 * sit in lanes, nested ones inside, like a git graph.
 */
import { rangeUidToAcronym, uidIsInRange } from './rangeSuttas.js'

/**
 * A key of /api/parallels, split into the text it names and the part of it
 *
 * "dn1" -> { base: "dn1" }
 * "dn1#1.9.1" -> { base: "dn1", start: "1.9.1", end: "1.9.1" }
 * "dn16#3.1.1-#4.23.1" -> { base: "dn16", start: "3.1.1", end: "4.23.1" }
 * "snp1.1#vns6" -> { base: "snp1.1", start: "vns6", end: "vns6" }, a reference
 */
export function parseParallelKey(key) {
  const [base, ...rest] = key.split('#')
  if (!rest.length) return { base }
  // References can have hyphens of their own (pts-vp-pli1)
  const part = rest.join('#')
  const [start, end = start] = part.includes('-#')
    ? part.split('-#')
    : /^[\d.]+-[\d.]+$/.test(part)
      ? part.split('-')
      : [part]
  return { base, start, end }
}

// Not `rangeUidToAcronym` for the text itself, which would make its "Snp" "SNP"
function acronymOf(base, entry) {
  return base === entry.uid ? entry.acronym : rangeUidToAcronym(base)
}

/** A passage id without its edition's letters, ie "wal1.1" -> "1.1", "t0831a07" -> "0831a07" */
function passageRef(part) {
  const ref = part.replace(/^[a-z]+/, '')
  return /^\d/.test(ref) ? ref : part
}

/**
 * A key of /api/parallels as .net shows it, ie "mn10#10.1" -> "MN 10:10.1"
 * @param {string} key
 * @param {Object} entry - The text the key is from
 */
export function parallelKeyLabel(key, entry) {
  const { base } = parseParallelKey(key)
  return `${acronymOf(base, entry) || base}${passageLabel(key)}`
}

/** Where a key or parallel's passage starts on its page, ie "dn16#3.1.1-#4.23.1" -> "#3.1.1" */
export function parallelAnchor(key) {
  const { start } = parseParallelKey(key.replace(/^~/, ''))
  return start ? `#${start}` : ''
}

/** The part of the text a key or parallel names, ie "sf245#wal1.1" -> ":1.1", or "" for all of it */
export function passageLabel(key) {
  // A "~" marks a resembling parallel in sc-data
  const { start, end } = parseParallelKey(key.replace(/^~/, ''))
  if (!start) return ''
  const [from, to] = [passageRef(start), passageRef(end)]
  return `:${from === to ? from : `${from}–${to}`}`
}

/** Strongest first, which is the one a passage with several is shown as */
const PARALLEL_TYPES = ['full', 'resembling', 'retelling', 'mention']

const TYPE_TITLES = {
  full: 'Full parallel: different versions of the same text',
  retelling: 'Retelling: the events of one text are retold in another',
  mention: 'Mention: one text is quoted or mentioned in another',
  resembling: 'Resembling parallel: texts are comparable',
}

const BLOCK_END = /\{\}.*<\/(?:p|blockquote|li|h\d|header|section|article)>/

/**
 * @param {Object} entry - A text page entry
 * @param {string[] | null} keys - The segment keys the page shows, or null for a legacy text
 * @returns {{ scx_parallel_runs: Object[], scx_parallel_lanes: number, scx_parallel_anchors: Object | null }}
 *   The runs, how many lanes they take, and the anchor name of each segment one starts or ends on
 */
export function parallelRunsOf(entry, keys) {
  const parallelsData =
    entry.scx_range_sutta_parallels_data ?? entry._parallels_data
  if (!keys || !parallelsData)
    return {
      scx_parallel_runs: [],
      scx_parallel_lanes: 0,
      scx_parallel_anchors: null,
    }

  const bilara = entry._bilarasuttas_data
  const html = bilara.html_text
  const shownIndex = new Map(keys.map((key, i) => [key, i]))
  const referenceIndex = new Map()
  keys.forEach((key, i) => {
    const uid = key.split(':')[0]
    for (const id of (bilara.reference_text?.[key] ?? '').split(',')) {
      if (id.trim()) referenceIndex.set(`${uid}:${id.trim()}`, i)
    }
  })

  const findShown = (uid, ref) =>
    shownIndex.get(`${uid}:${ref}`) ?? referenceIndex.get(`${uid}:${ref}`)

  // The keys sharing all but its last number
  function sectionOf(key) {
    const [uid, ref] = key.split(':')
    return ref.includes('.') ? `${uid}:${ref.replace(/\.[^.]+$/, '')}` : key
  }

  // The end of the section `i` starts, or of the paragraph or verse it's in
  function passageEnd(i) {
    const section = sectionOf(keys[i])
    const inSection = j => !!keys[j] && sectionOf(keys[j]) === section
    let end = i
    while (inSection(end + 1)) end++
    // Sections can open with a heading at .0, so .1 starts one too
    if (!inSection(i - 1) || /\.[01]$/.test(keys[i])) return end
    while (i < end && !BLOCK_END.test(html[keys[i]])) i++
    return i
  }

  // Every key of it on screen, or of the suttas a range key like sn12.1-2 covers
  function wholeTextSpan(base) {
    const covered = keys
      .map((key, i) => [key.split(':')[0], i])
      .filter(([uid]) => uid === base || uidIsInRange(uid, base))
      .map(([, i]) => i)
    return covered.length ? [covered[0], covered.at(-1)] : null
  }

  function parallelSpan(key) {
    const { base, start, end } = parseParallelKey(key)
    if (!start) return wholeTextSpan(base)
    const first = findShown(base, start)
    const last = findShown(base, end)
    if (first === undefined || last === undefined || last < first) return null
    return [first, passageEnd(last)]
  }

  function spanLabel(key, start, end) {
    const { base, start: from } = parseParallelKey(key)
    const acronym = acronymOf(base, entry)
    if (!from) return acronym
    const ref = i => keys[i].split(':')[1]
    const refs = start === end ? ref(start) : `${ref(start)}–${ref(end)}`
    return `${acronym}:${refs}`
  }

  const runsBySpan = new Map()
  for (const [key, parallels] of Object.entries(parallelsData)) {
    if (!Array.isArray(parallels)) continue
    const span = parallelSpan(key)
    if (!span) continue
    const [start, end] = span
    const id = `${start}-${end}`
    const run = runsBySpan.get(id) ?? {
      start,
      end,
      type: '',
      label: spanLabel(key, start, end),
      count: 0,
      groups: [],
      lane: 0,
      outer: false,
    }
    for (const parallel of parallels) {
      const type = parallel.to?.scx_type ?? parallel.to?.type ?? ''
      const group = run.groups.find(g => g.type === type)
      if (group) group.parallels.push(parallel)
      else
        run.groups.push({
          type,
          title: TYPE_TITLES[type] ?? '',
          parallels: [parallel],
        })
      run.count++
    }
    runsBySpan.set(id, run)
  }

  const rank = type => PARALLEL_TYPES.indexOf(type) >>> 0 // unknown last
  const runs = [...runsBySpan.values()].sort(
    (a, b) => a.start - b.start || b.end - a.end
  )
  for (const run of runs) {
    run.groups.sort((a, b) => rank(a.type) - rank(b.type))
    run.type = PARALLEL_TYPES.includes(run.groups[0].type)
      ? run.groups[0].type
      : 'mention'
  }

  // Overlapping, or one ending on the line the next starts on
  function clash(a, b) {
    const meets = (x, y) =>
      x.end + 1 === y.start && !BLOCK_END.test(html[keys[x.end]])
    return (a.start <= b.end && b.start <= a.end) || meets(a, b) || meets(b, a)
  }

  // Shortest first, each in the nearest lane without a clash
  const lanes = []
  for (const run of runs.toSorted(
    (a, b) => a.end - a.start - (b.end - b.start) || a.start - b.start
  )) {
    let lane = lanes.findIndex(others => !others.some(o => clash(o, run)))
    if (lane === -1) lane = lanes.push([]) - 1
    lanes[lane].push(run)
    run.lane = lane
  }
  for (const run of runs) run.outer = run.lane === lanes.length - 1

  const anchors = {}
  for (const { start, end } of runs) {
    anchors[keys[start]] = `--ps${start}`
    anchors[keys[end]] = `--ps${end}`
  }

  return {
    scx_parallel_runs: runs,
    scx_parallel_lanes: lanes.length,
    scx_parallel_anchors: runs.length ? anchors : null,
  }
}

/**
 * Lookup Shards
 *
 * Writes word lookup's answers into small JSON files in `_site/dictionaries/`, so a tap fetches only the one its
 * word is in, and works offline:
 *
 * - `pli-en/`: the answer for every Pāli word form the root texts have (`lookupAnswers.js`), grouped by prefix
 * - `lzh-en/`: the Digital Dictionary of Buddhism's entries, grouped by their first character
 *
 * Each has an `index.json` saying which file a key is in. The files are numbered, not named by prefix, as
 * macOS paths don't tell apart letters that differ only by case or diacritics. Splitting by prefix is SSR's
 * `scripts/shard-dictionaries.ts`.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { loadDictionaries } from './dictionaries.js'
import { loadLookup } from './lookupAnswers.js'

const OUTPUT_DIR = path.join('_site', 'dictionaries')

// A group bigger than this gets split by its next character
const MAX_SHARD_BYTES = 100 * 1024

// Chinese keys share no useful prefixes, so they're spread over this many by code point
const LZH_SHARDS = 64

function sizeOf(entries) {
  return entries.reduce(
    (sum, [key, value]) => sum + key.length + JSON.stringify(value).length,
    0
  )
}

/**
 * The entries grouped by prefix, from one character on, splitting any group over the limit by the character
 * after. A key is in the group of the longest prefix it starts with, so `sa` stays in `sa` while `saddha` goes
 * on down to `sad`
 */
function groupByPrefix(entries, prefix = '') {
  const groups = new Map()
  if (prefix && sizeOf(entries) <= MAX_SHARD_BYTES) {
    groups.set(prefix, entries)
    return groups
  }
  const own = []
  const children = new Map()
  for (const entry of entries) {
    if (entry[0].length === prefix.length) {
      own.push(entry)
      continue
    }
    const child = entry[0].slice(0, prefix.length + 1)
    if (!children.has(child)) children.set(child, [])
    children.get(child).push(entry)
  }
  if (own.length) groups.set(prefix, own)
  for (const [child, childEntries] of children) {
    for (const [p, e] of groupByPrefix(childEntries, child)) groups.set(p, e)
  }
  return groups
}

async function writeShards(name, groups, index) {
  const dir = path.join(OUTPUT_DIR, name)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true })
  await Promise.all(
    [...groups].map(([file, entries]) =>
      fs.writeFile(
        path.join(dir, `${file}.json`),
        JSON.stringify(Object.fromEntries(entries))
      )
    )
  )
  await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify(index))
  return groups.size
}

// The answers already written, so a sample build adds its words to them rather than leaving only its own
async function writtenAnswers() {
  const dir = path.join(OUTPUT_DIR, 'pli-en')
  try {
    const files = (await fs.readdir(dir)).filter(f => f !== 'index.json')
    const shards = await Promise.all(
      files.map(async f =>
        JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))
      )
    )
    return shards.flatMap(shard => Object.entries(shard))
  } catch {
    return []
  }
}

/**
 * Writes the shards after a build that rendered texts. One of the two is left alone if its dictionary couldn't be
 * fetched, so a broken one doesn't replace the last good one
 * @param {{ merge?: boolean }} [options] - Keep the answers already written, as a sample build renders only a few texts
 */
export async function writeLookupShards({ merge = false } = {}) {
  const [lookup, dictionaries] = await Promise.all([
    loadLookup(),
    loadDictionaries(),
  ])

  const answers = new Map(merge ? await writtenAnswers() : [])
  for (const [form, answer] of lookup.answers()) {
    if (answer.length) answers.set(form, answer)
  }
  if (answers.size) {
    const groups = new Map()
    const prefixes = {}
    for (const [prefix, entries] of groupByPrefix([...answers])) {
      prefixes[prefix] = groups.size
      groups.set(String(groups.size), entries)
    }
    const files = await writeShards('pli-en', groups, {
      by: 'prefix',
      prefixes,
    })
    console.log(
      `📖 Wrote ${answers.size} Pāli lookup answers in ${files} files`
    )
  }

  const ddb = dictionaries.ddb?.data
  if (ddb?.length) {
    const groups = new Map()
    for (const { entry, pronunciation, definition } of ddb) {
      const shard = String(entry.codePointAt(0) % LZH_SHARDS)
      if (!groups.has(shard)) groups.set(shard, [])
      groups.get(shard).push([entry, { p: pronunciation, d: definition }])
    }
    await writeShards('lzh-en', groups, { by: 'codePoint', shards: LZH_SHARDS })
    console.log(
      `📖 Wrote ${ddb.length} Chinese lookup entries in ${groups.size} files`
    )
  }
}

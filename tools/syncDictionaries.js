/**
 * Sync Dictionaries
 *
 * Fetches the lookup and /define dictionaries again, into `.cache`, without refetching all the rest as
 * `REFETCH=1` would, and says what changed in each file:
 *
 *   pnpm sync:dictionaries
 *
 * CI doesn't need it, as its builds start with no `.cache`.
 */

import {
  cachedDictionary,
  DICTIONARY_FILES,
  entriesOf,
  fetchDictionary,
} from '../src/helpers/dictionaries.js'

function list(label, keys) {
  if (!keys.length) return
  const shown = keys.slice(0, 20).join(', ')
  const more = keys.length > 20 ? ` …and ${keys.length - 20} more` : ''
  console.log(`  ${label}: ${shown}${more}`)
}

// Each word's entries as one string, as some words have more than one
function byWord(data) {
  const words = new Map()
  for (const [word, entry] of entriesOf(data)) {
    words.set(word, (words.get(word) ?? '') + JSON.stringify(entry))
  }
  return words
}

let failed = 0

for (const name of Object.keys(DICTIONARY_FILES)) {
  const cached = cachedDictionary(name)
  const old = cached ? byWord(cached) : new Map()
  let data
  try {
    data = byWord((await fetchDictionary(name, '0s')).data)
  } catch (error) {
    failed++
    console.error(`✗ ${name}: couldn't fetch (${error.message})`)
    continue
  }

  const added = [...data.keys()].filter(word => !old.has(word))
  const removed = [...old.keys()].filter(word => !data.has(word))
  const changed = [...data.keys()].filter(
    word => old.has(word) && old.get(word) !== data.get(word)
  )
  const count = `${data.size.toLocaleString('en-US')} words`

  if (!cached) {
    console.log(`✓ ${name}: fetched, ${count}`)
  } else if (!added.length && !removed.length && !changed.length) {
    console.log(`  ${name}: unchanged, ${count}`)
  } else {
    console.log(
      `✓ ${name}: ${added.length} added, ${removed.length} removed, ${changed.length} changed, ${count}`
    )
    list('added', added)
    list('removed', removed)
    list('changed', changed)
  }
}

if (failed) process.exitCode = 1

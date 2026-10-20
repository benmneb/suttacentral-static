/**
 * Sync Site Pages
 *
 * Fetches the site pages' words from .net again, into `.cache`, without refetching all the rest as
 * `REFETCH=1` would, and says what changed in each file:
 *
 *   pnpm sync:site-pages
 *
 * It also lists the keys that need the markup in `pages/site/` changing: ones the pages use that .net
 * dropped (which the site pages test fails on), and new ones no page shows yet. CI doesn't need it, as
 * its builds start with no `.cache`.
 */

import { fetchStrings, STRING_FILES, templateKeys } from './siteStrings.js'

function list(label, keys) {
  if (!keys.length) return
  const shown = keys.slice(0, 20).join(', ')
  const more = keys.length > 20 ? ` …and ${keys.length - 20} more` : ''
  console.log(`  ${label}: ${shown}${more}`)
}

const used = templateKeys()
const fetched = new Set()
const unused = []
let failed = 0

for (const name of STRING_FILES) {
  const old = await fetchStrings(name)
    .then(result => result.strings)
    .catch(() => ({}))
  let data
  try {
    data = (await fetchStrings(name, '0s')).strings
  } catch (error) {
    failed++
    console.error(`✗ ${name}: couldn't fetch (${error.message})`)
    continue
  }

  const added = Object.keys(data).filter(key => !(key in old))
  const removed = Object.keys(old).filter(key => !(key in data))
  const changed = Object.keys(data).filter(
    key => key in old && old[key] !== data[key]
  )

  if (!added.length && !removed.length && !changed.length) {
    console.log(`  ${name}: unchanged`)
  } else {
    console.log(
      `✓ ${name}: ${added.length} added, ${removed.length} removed, ${changed.length} changed`
    )
    list('added', added)
    list('removed', removed)
    list('changed', changed)
  }

  Object.keys(data).forEach(key => fetched.add(key))
  // interface_en.json is mostly .net's own UI
  if (name !== 'interface') unused.push(...added.filter(key => !used.has(key)))
}

const dropped = [...used].filter(key => !fetched.has(key))
if (dropped.length) {
  console.log(`\n⚠️  Keys the pages use that .net doesn't have:`)
  list('missing', dropped)
}
if (unused.length) {
  console.log(
    `\nℹ️  New keys no page shows yet, which may need adding to pages/site/:`
  )
  list('new', unused)
}
if (failed) process.exitCode = 1

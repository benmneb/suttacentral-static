/**
 * The dictionaries for word lookup and the /define pages are all there.
 *
 * They're fetched from GitHub at build time, and a file that fails or shrinks only leaves its words out,
 * so the cached copies are checked here, without a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DICTIONARY_FILES,
  entriesOf,
  fetchDictionary,
} from '../src/helpers/dictionaries.js'

// About 95% of the words each had in October 2026
const MIN_WORDS = {
  dpd: 135_000,
  ncped: 22_000,
  ddb: 55_000,
  pts: 15_000,
  dppn: 1_300,
  dhammika: 750,
  glossary: 5_500,
  dpd_i2h: 70_000,
  dpd_deconstructor: 20_000,
}

// The fields of an sc-data entry the pages show, as some NCPED entries are only a cross-reference or homonyms
const DEFINITION_FIELDS = ['definition', 'text', 'gloss', 'xr', 'homonyms']

// Share of a dictionary's entries that may have no definition, as DDB has a blank one or two
const MAX_BROKEN_SHARE = 0.001

describe('Dictionaries', async () => {
  const dictionaries = Object.fromEntries(
    await Promise.all(
      Object.keys(DICTIONARY_FILES).map(async name => [
        name,
        await fetchDictionary(name)
          .then(result => result.data)
          .catch(() => null),
      ])
    )
  )

  for (const [name, min] of Object.entries(MIN_WORDS)) {
    it(`${name} has at least ${min.toLocaleString('en-US')} words`, () => {
      assert.ok(dictionaries[name], `Couldn't fetch ${DICTIONARY_FILES[name]}`)
      const words = new Set(entriesOf(dictionaries[name]).map(([word]) => word))
      assert.ok(words.size >= min, `${name} has only ${words.size} words`)
    })
  }

  it('each have a word and a definition for their entries', () => {
    const bad = []
    for (const [name, data] of Object.entries(dictionaries)) {
      if (!data) continue
      const broken = entriesOf(data).filter(([word, entry]) => {
        if (typeof word !== 'string' || !word) return true
        if (name === 'dpd_i2h') return !Array.isArray(entry) || !entry.length
        if (name === 'dpd_deconstructor') return typeof entry !== 'string'
        return !DEFINITION_FIELDS.some(field => entry[field]?.length)
      })
      if (broken.length > entriesOf(data).length * MAX_BROKEN_SHARE) {
        bad.push(`${name}: ${broken.length}, ie ${JSON.stringify(broken[0])}`)
      }
    }
    assert.equal(
      bad.length,
      0,
      `Entries with no word or definition:\n${bad.join('\n')}`
    )
  })
})

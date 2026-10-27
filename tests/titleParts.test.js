/**
 * A Pāli root title's parts, which search indexes so a compound title is found by any of its words.
 *
 * The affixes are checked on their own, then with DPD's splits, from the cached dictionary, so those are
 * skipped without a `.cache`.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cachedDictionary } from '../src/helpers/dictionaries.js'
import { affixParts, loadTitleParts } from '../src/helpers/titleParts.js'

describe('Title affixes', () => {
  it('takes off a suffix and prefix', () => {
    assert.deepEqual(affixParts('mahāsatipaṭṭhānasutta'), [
      'mahā',
      'satipaṭṭhāna',
      'sutta',
    ])
    assert.deepEqual(affixParts('nāgapetavatthu'), ['nāga', 'petavatthu'])
  })

  it('undoes the t a th- suffix doubles', () => {
    assert.deepEqual(affixParts('subhūtittheragāthā'), [
      'subhūti',
      'theragāthā',
    ])
  })

  it('leaves at least 3 letters', () => {
    assert.deepEqual(affixParts('mahāvagga'), ['mahā', 'vagga'])
    assert.deepEqual(affixParts('vagga'), ['vagga'])
  })
})

describe(
  'Title parts',
  { skip: !cachedDictionary('dpd') && 'no DPD in .cache' },
  async () => {
    const titleParts = await loadTitleParts()

    it("uses DPD's split first", () => {
      assert.equal(titleParts('Alagaddūpamasutta'), 'alagadda upamā sutta')
    })

    it("takes the affixes off DPD's parts too", () => {
      assert.equal(
        titleParts('Mahāsatipaṭṭhānasutta'),
        'mahā satipaṭṭhāna sutta'
      )
    })

    it('has only the words that split', () => {
      assert.equal(
        titleParts('(Dutiya) Devasabhattheragāthā'),
        'devasabha theragāthā'
      )
      assert.equal(titleParts('Vagga'), '')
      assert.equal(titleParts(''), '')
    })
  }
)

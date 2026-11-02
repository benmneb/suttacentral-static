/**
 * The parallels lists link and label each passage of a text the way .net does.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parallelAnchor,
  parallelKeyLabel,
  parallelPath,
} from '../src/helpers/parallelRuns.js'

describe('Parallel keys', () => {
  const rangeEntry = {
    uid: 'an1.170-187',
    acronym: 'AN 1.170–187',
    scx_range_sutta_range_uids: ['an1.173'],
  }
  const vinayaRange = { uid: 'pli-tv-bi-vb-pc91-93', acronym: 'Bi Pc 91–93' }

  it('drop the "~" sc-data marks a resembling parallel with', () => {
    const entry = { uid: 'cnd2', acronym: 'Cnd 2' }
    assert.equal(parallelKeyLabel('~cnd2#74.1', entry), 'Cnd 2:74.1')
    assert.equal(parallelPath('~cnd2#74.1', entry), 'cnd2')
    assert.equal(parallelAnchor('~cnd2#74.1'), '#74.1')
  })

  it("link a range's suttas to their own pages, if they have one", () => {
    assert.equal(parallelPath('an1.173#1.1', rangeEntry), 'an1.173')
    assert.equal(parallelKeyLabel('an1.173#1.1', rangeEntry), 'AN 1.173:1.1')
    assert.equal(
      parallelPath('pli-tv-bi-vb-pc92', vinayaRange),
      vinayaRange.uid
    )
    assert.equal(parallelKeyLabel('pli-tv-bi-vb-pc92', vinayaRange), 'Bi Pc 92')
  })

  it('link a span of two texts to the one on screen', () => {
    const entry = { uid: 'sn36.31', acronym: 'SN 36.31' }
    assert.equal(parallelPath('sn36.30-31', entry), 'sn36.31')
    assert.equal(parallelKeyLabel('sn36.30-31', entry), 'SN 36.30–31')
  })
})

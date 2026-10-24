/**
 * The site's shared display strings.
 *
 * Only the ones that tidy what .net's API sends: a value that comes out
 * differently on a page than in the data is easy to miss in a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { languageName } from '../src/helpers/strings.js'

describe('Language names', () => {
  it('spells Pali as the site does', () => {
    assert.equal(languageName('Pali'), 'Pāli')
  })

  it('leaves other names as they are', () => {
    for (const name of ['Pāli', 'English', 'Sanskrit', '漢語']) {
      assert.equal(languageName(name), name)
    }
  })

  it('leaves a missing name missing', () => {
    assert.equal(languageName(undefined), undefined)
    assert.equal(languageName(null), null)
  })
})

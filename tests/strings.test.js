/**
 * The site's shared display strings.
 *
 * Only the ones that tidy what .net's API sends: a value that comes out
 * differently on a page than in the data is easy to miss in a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { langTag, languageName } from '../src/helpers/strings.js'

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

describe('Language tags', () => {
  it('takes the two-letter code where BCP 47 has one', () => {
    assert.equal(langTag('pli'), 'pi')
    assert.equal(langTag('san'), 'sa')
    assert.equal(langTag('jpn'), 'ja')
  })

  it('leaves codes BCP 47 already has as they are', () => {
    for (const code of ['en', 'lzh', 'pra', 'pgd', 'xct', 'zh-Hans']) {
      assert.equal(langTag(code), code)
    }
  })

  it('agrees with Intl, as search.js tags its results with that', () => {
    for (const code of ['pli', 'san', 'jpn', 'kan', 'uig', 'lzh', 'pra']) {
      assert.equal(langTag(code), Intl.getCanonicalLocales(code)[0])
    }
  })

  it('leaves a missing code missing', () => {
    assert.equal(langTag(undefined), undefined)
  })
})

/**
 * The site's shared display strings.
 *
 * Only the ones that tidy what .net's API sends: a value that comes out
 * differently on a page than in the data is easy to miss in a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bilaraMarkup,
  closeHeadingGaps,
  langTag,
  languageName,
} from '../src/helpers/strings.js'

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

describe('Bilara markup', () => {
  it('closes each half-line at the end of its segment', () => {
    assert.equal(
      bilaraMarkup('Before the mendicants, <j>the Buddha, '),
      'Before the mendicants, <span class="j">the Buddha, </span>'
    )
    assert.equal(
      bilaraMarkup('a <j>b <j>c'),
      'a <span class="j">b <span class="j">c</span></span>'
    )
  })

  it('makes supplied and unclear readings spans, as legacy texts have', () => {
    assert.equal(
      bilaraMarkup('itarī<supplied>tarena</supplied> <unclear>x</unclear>'),
      'itarī<span class="supplied">tarena</span> <span class="unclear">x</span>'
    )
  })

  it('leaves the rest, and what it made, as it is', () => {
    const html = 'a <i>b</i> <span class="j">c</span>'
    assert.equal(bilaraMarkup(html), html)
    assert.equal(bilaraMarkup(undefined), undefined)
  })
})

describe('Heading levels', () => {
  it('moves a heading up to a level below the one it is under', () => {
    assert.equal(
      closeHeadingGaps('<h1>A</h1><h4 id="b">B</h4><h6>C</h6><h4>D</h4>'),
      '<h1>A</h1><h2 id="b">B</h2><h3>C</h3><h2>D</h2>'
    )
    assert.equal(
      closeHeadingGaps('<h3>A</h3><h1>B</h1>'),
      '<h2>A</h2><h1>B</h1>'
    )
  })

  it('leaves headings that go up, or one level down, as they are', () => {
    const html = '<h1>A</h1><h2>B</h2><h3>C</h3><h2>D</h2><hr><header></header>'
    assert.equal(closeHeadingGaps(html), html)
  })
})

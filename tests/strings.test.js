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
  dropEmptyHeadings,
  langTag,
  languageName,
  normalizeStrings,
  rootTitle,
  tidyLegacyHtml,
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

  it('drops the reference and root left in a segment', () => {
    assert.equal(
      bilaraMarkup('<reference>MAV 76</reference><root></root> '),
      ' '
    )
  })

  it('leaves the rest, and what it made, as it is', () => {
    const html = 'a <i>b</i> <span class="j">c</span>'
    assert.equal(bilaraMarkup(html), html)
    assert.equal(bilaraMarkup(undefined), undefined)
  })
})

describe('Legacy markup', () => {
  it('puts what follows an item back into it', () => {
    assert.equal(
      tidyLegacyHtml(
        '<ol><li>A<br>\n</li>\nB</li><li>C</li>\n<ol><li>D</li></ol></ol>'
      ),
      '<ol><li>A<br>\n\nB</li><li>C\n<ol><li>D</li></ol></ol>'
    )
  })

  it('ends a list left open at a heading or paragraph', () => {
    assert.equal(
      tidyLegacyHtml('<ol><li>A</p></li>\n<p>B</p><h4>C</h4><ol><li>D</ol>'),
      '<ol><li>A</p></li>\n</ol><p>B</p><h4>C</h4><ol><li>D</ol>'
    )
  })

  it('mends stray commas and pipes in URLs', () => {
    assert.equal(
      tidyLegacyHtml(
        '<ol type="1", start="5"><li><a href=\'http:%7C%7Cgretil.de%7Ca.htm\'>A</a></li></ol>'
      ),
      '<ol type="1" start="5"><li><a href=\'http://gretil.de/a.htm\'>A</a></li></ol>'
    )
  })

  it('leaves valid lists and their items as they are', () => {
    const html =
      '<!DOCTYPE html><ul><li>A<ul><li>B</ul><li>C, <i>d</i></li>\n</ul><p>E, F</p><div><div>G</div></div>'
    assert.equal(tidyLegacyHtml(html), html)
  })
})

describe('Unicode normalisation', () => {
  it('composes letters spelled with a combining mark, however deep', () => {
    const data = {
      blurb: 'Kokanada\u0304',
      keys: ['sn1.39'],
      html: { 'sn1.39:0.1': '<p>S\u0301ra\u0304vasti\u0304 {}' },
      count: 1,
      none: null,
    }
    assert.deepEqual(normalizeStrings(data), {
      blurb: 'Kokanadā',
      keys: ['sn1.39'],
      html: { 'sn1.39:0.1': '<p>Śrāvastī {}' },
      count: 1,
      none: null,
    })
  })

  it('keeps a mark that has no composed form with its letter', () => {
    assert.equal(normalizeStrings('sag\u0304\u0331akada'), 'saḡ\u0331akada')
    assert.equal(normalizeStrings('漢語'), '漢語')
  })

  it('swaps Private Use Area characters for real ones', () => {
    assert.equal(
      normalizeStrings('that the \uF0E1mind\uF0F1 does'),
      'that the ⟨mind⟩ does'
    )
    assert.equal(normalizeStrings('Am\uF82Atapadāni'), 'Amṛtapadāni')
    assert.equal(normalizeStrings('飯、\u{F0253}、糒'), '飯、麨、糒')
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

describe('Empty headings', () => {
  const segment = (key, text = '') =>
    `<span id="${key}" class="segment"><span class="reference" id="${key}" hidden><a href="#${key}">${key}</a></span>${text}</span>`

  it('unwraps a heading with only its segment number', () => {
    assert.equal(
      dropEmptyHeadings(`<h2>${segment('3.0')}</h2><p>A</p>`),
      `${segment('3.0')}<p>A</p>`
    )
  })

  it('makes a section it headed a div', () => {
    assert.equal(
      dropEmptyHeadings(
        `<section class="a"><h2 class="b">${segment('1.0')}</h2><section><h3>B</h3></section></section><section><h2>C</h2></section>`
      ),
      `<div class="a">${segment('1.0')}<section><h3>B</h3></section></div><section><h2>C</h2></section>`
    )
  })

  it('makes a section a div wherever its only heading was, but not one with another', () => {
    assert.equal(
      dropEmptyHeadings(
        `<article><h1>A</h1><section class="cakka"><p>B</p><h2>${segment('2.0')}</h2><p>C</p></section><section><h2>${segment('3.0')}</h2><h3>D</h3></section></article>`
      ),
      `<article><h1>A</h1><div class="cakka"><p>B</p>${segment('2.0')}<p>C</p></div><section>${segment('3.0')}<h3>D</h3></section></article>`
    )
  })

  it('keeps a heading with text, even hidden, or an image', () => {
    const html = [
      `<h2>${segment('1.0', '<span class="text">A</span>')}</h2>`,
      `<h2>${segment('2.0', '<span class="root" hidden><span class="text">B</span></span>')}</h2>`,
      '<h2><svg></svg></h2>',
      '<h2 aria-label="C"></h2>',
    ].join('')
    assert.equal(dropEmptyHeadings(html), html)
  })
})

describe('Root titles', () => {
  it('falls back to the acronym, then the range, with no names', () => {
    assert.equal(
      rootTitle({
        original_title: '',
        translated_title: '',
        acronym: 'EA 27.1',
      }),
      'EA 27.1'
    )
    assert.equal(
      rootTitle(
        { root_name: '', translated_name: '', child_range: 'T 765.63–74' },
        '/t765-dvikavarga-1/'
      ),
      '<a href="/t765-dvikavarga-1/">T 765.63–74</a>'
    )
  })
})

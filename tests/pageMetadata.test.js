/**
 * The metadata every page shares: absolute URLs, Open Graph tags and breadcrumbs.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  breadcrumbList,
  jsonLd,
  menuTitle,
  ogTags,
  person,
  withTranslatedTitle,
} from '../src/helpers/pageMetadata.js'

describe('Page metadata', () => {
  it('gives Open Graph tags absolute URLs, an image and plain text', () => {
    const og = JSON.parse(
      ogTags({
        title: 'The Root of All Things ',
        description: 'A <i>sutta</i> &amp; its parallels',
        url: 'mn1/en/sujato/',
      })
    )

    assert.equal(og['og:title'], 'The Root of All Things')
    assert.equal(og['og:description'], 'A sutta & its parallels')
    assert.equal(og['og:url'], 'https://suttacentral.express/mn1/en/sujato')
    assert.equal(
      og['og:image'],
      'https://suttacentral.express/images/og-image2.jpg'
    )
    assert.equal(og['og:image:width'], 1200)
    assert.equal(og['og:site_name'], 'SuttaCentral Express')
  })

  it('leaves out breadcrumbs with no page and numbers the rest', () => {
    const list = breadcrumbList([
      { name: 'Home', url: '/' },
      { name: 'Sutta', url: '/pitaka/sutta' },
      { name: 'Mūlapaṇṇāsa' },
      { name: 'MN 1', url: 'mn1/en/sujato' },
    ])

    assert.deepEqual(
      list.itemListElement.map(({ position, name, item }) => [
        position,
        name,
        item,
      ]),
      [
        [1, 'Home', 'https://suttacentral.express/'],
        [2, 'Sutta', 'https://suttacentral.express/pitaka/sutta'],
        [3, 'MN 1', 'https://suttacentral.express/mn1/en/sujato'],
      ]
    )
  })

  it('puts a translated title after the original only when it differs', () => {
    assert.equal(
      withTranslatedTitle('Mūlapariyāyasutta', 'The Root of All Things '),
      'Mūlapariyāyasutta (The Root of All Things)'
    )
    assert.equal(withTranslatedTitle('Dhammapada', 'Dhammapada'), 'Dhammapada')
    assert.equal(withTranslatedTitle('Dhammapada', undefined), 'Dhammapada')
    assert.equal(
      withTranslatedTitle('', 'Untitled Discourse on Ten Qualities '),
      'Untitled Discourse on Ten Qualities'
    )
  })

  it('titles a text or collection by its acronym or range when it has no names', () => {
    assert.equal(
      menuTitle({
        root_name: 'Paṭhamapaṇṇāsaka',
        translated_name: 'The First Fifty ',
      }),
      'Paṭhamapaṇṇāsaka—The First Fifty'
    )
    assert.equal(
      menuTitle({ original_title: '', translated_title: 'Untitled Discourse' }),
      'Untitled Discourse'
    )
    assert.equal(
      menuTitle({
        original_title: '',
        translated_title: '',
        acronym: 'EA 34.1',
      }),
      'EA 34.1'
    )
    assert.equal(
      menuTitle({ root_name: '', acronym: null, child_range: 'T 765.63–74' }),
      'T 765.63–74'
    )
  })

  it('links a translator to their Wikipedia article only if they have one', () => {
    assert.equal(
      person('Bhikkhu Bodhi', 'bodhi').sameAs,
      'https://en.wikipedia.org/wiki/Bhikkhu_Bodhi'
    )
    assert.deepEqual(person('Suddhāso Bhikkhu', 'suddhaso'), {
      '@type': 'Person',
      name: 'Suddhāso Bhikkhu',
      identifier: 'suddhaso',
    })
  })

  it('keeps JSON-LD from ending its script early', () => {
    const json = jsonLd({ description: 'a </script> b' })
    assert.ok(!json.includes('</script>'))
    assert.equal(JSON.parse(json).description, 'a </script> b')
  })
})

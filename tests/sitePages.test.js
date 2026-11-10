/**
 * The site pages have their words and are all built.
 *
 * Their words are fetched from .net at build time, and the markup in
 * `src/pages/site/` names each one by its key, so a key .net drops or renames
 * leaves a hole. The keys are checked against `.cache`, so without a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import siteMetaData from '../src/data/_siteMetaData.js'
import { SC_ORIGIN } from '../src/helpers/scApi.js'
import {
  buildSitePageMetadata,
  generateSitePageJsonLd,
  generateSitePageOGTags,
} from '../src/helpers/sitePageMetadata.js'
import { siteMap, tidyMatter } from '../src/helpers/sitePages.js'
import {
  fetchStrings,
  STRING_FILES,
  templateKeys,
} from '../src/helpers/siteStrings.js'
import { listSome, readPage, scanSite } from './lib/site.js'

const { origin, title } = siteMetaData()

// Characters of text a site page's <main> has at least
const MIN_TEXT_LENGTH = 20

const metadata = await buildSitePageMetadata({
  titleFor: key =>
    ({
      'an-guide-sujato:2': 'Bhikkhu Sujato, 2019',
      'interface:anGuideSujato': 'Aṅguttara Nikāya',
      'interface:languages': 'Languages on SuttaCentral',
      'methodology:16': 'Rod Bucknell, updated by Sujato',
      'methodology:33': 'Bhikkhu Sujato',
      'publication:editionsToolbarTitle': 'SuttaCentral Editions',
    })[key] ?? key,
  imageFor: async () => ({ src: '/images/site-pages/test.avif' }),
  languagePages: [{ scx_path: 'languages/pli', name: 'Pali' }],
  map: {
    layers: [
      {
        name: 'Capital cities',
        places: [
          { id: 'place-1-1', name: 'Rājagaha', define: 'rājagaha' },
          { id: 'place-1-2', name: 'A nameless village' },
        ],
      },
      {
        name: 'Mahāparinibbāna journey',
        // Its stops are numbered, so `mapPlaces.js` counts it a sequence
        ordered: true,
        places: [
          { id: 'place-2-1', name: '1) Rājagaha', define: 'rājagaha' },
          { id: 'place-2-2', name: 'Mahāparinibbāna journey', route: true },
        ],
      },
    ],
  },
  editions: [
    {
      uid: 'mn',
      scx_path: 'edition/mn/en/sujato',
      title: 'Middle Discourses',
      readHref: '/pitaka/sutta/middle/mn',
      publication: {
        creator_name: 'Bhikkhu Sujato',
        translation_lang_iso: 'en',
      },
      matter: [
        {
          label: 'Introduction',
          scx_path: 'edition/mn/en/sujato/introduction',
          html: `<article class='introduction'>
<h1>Middle Discourses: a translation</h1>
<p class='byline'>Bhikkhu Sujato, 2024</p>
<nav class='contents'><ol><li><a href='#intro-item1'>About this translation</a></li></ol></nav>
<p>How this translation was prepared.</p>
<p>And what it leaves out.</p>
</article>`,
        },
      ],
    },
  ],
})
const jsonLdOf = url => JSON.parse(metadata[url].scx_json_ld)

describe('Site page metadata', () => {
  it('generates absolute metadata for an informational page', () => {
    const page = {
      title: 'About SuttaCentral',
      description: 'Learn about SuttaCentral and its early Buddhist texts.',
      url: '/about',
      schemaType: 'AboutPage',
      breadcrumbs: [
        { name: 'Home', url: '/' },
        { name: 'About SuttaCentral', url: '/about' },
      ],
    }
    const og = JSON.parse(generateSitePageOGTags(page))
    const jsonLd = JSON.parse(generateSitePageJsonLd(page))

    assert.equal(og['og:url'], `${origin}/about`)
    assert.equal(og['og:description'], page.description)
    assert.equal(jsonLd['@type'], 'AboutPage')
    assert.equal(jsonLd['@id'], og['og:url'])
    assert.equal(jsonLd.sameAs, `${SC_ORIGIN}/about`)
    assert.equal(jsonLd.isPartOf.name, title)
    assert.deepEqual(
      jsonLd.breadcrumb.itemListElement.map(({ name }) => name),
      ['Home', 'About SuttaCentral']
    )
  })

  it('gives language, edition and front-matter pages the trail to them', () => {
    const trail = url =>
      jsonLdOf(url).breadcrumb.itemListElement.map(({ name }) => name)
    assert.deepEqual(trail('/languages/pli/'), [
      'Home',
      'Languages on SuttaCentral',
      'Pali',
    ])
    assert.deepEqual(trail('/edition/mn/en/sujato/'), [
      'Home',
      'SuttaCentral Editions',
      'Middle Discourses',
    ])
    assert.deepEqual(trail('/edition/mn/en/sujato/introduction/'), [
      'Home',
      'SuttaCentral Editions',
      'Middle Discourses',
      'Introduction',
    ])
  })

  it('describes front matter by its first paragraph, as a chapter of its book', () => {
    const matter = jsonLdOf('/edition/mn/en/sujato/introduction/')
    assert.equal(matter.description, 'How this translation was prepared.')
    assert.equal(matter.isPartOf['@id'], `${origin}/edition/mn/en/sujato`)
    assert.equal(matter.hasPart['@type'], 'Chapter')
    assert.deepEqual(matter.hasPart.isPartOf, matter.isPartOf)
  })

  it("takes an article's authors and year from its bylines", () => {
    const guide = jsonLdOf('/an-guide-sujato/')
    const methodology = jsonLdOf('/methodology/')
    assert.equal(guide.headline, 'Aṅguttara Nikāya')
    assert.deepEqual(guide.author, [
      { '@type': 'Person', name: 'Bhikkhu Sujato' },
    ])
    assert.equal(guide.datePublished, '2019')
    assert.deepEqual(
      methodology.author.map(({ name }) => name),
      ['Rod Bucknell', 'Sujato', 'Bhikkhu Sujato']
    )
    assert.equal(methodology.datePublished, undefined)
  })

  it("lists the map's places, with a journey's stops in order and no route line", () => {
    const index = jsonLdOf('/map/').hasPart.find(
      part => part['@type'] === 'Table'
    )
    const [cities, journey] = index.mainEntity.itemListElement
    assert.deepEqual(cities.itemListElement, [
      {
        '@type': 'Place',
        name: 'Rājagaha',
        url: `${origin}/define/rājagaha`,
        sameAs: `${origin}/map#place-1-1`,
      },
      {
        '@type': 'Place',
        name: 'A nameless village',
        sameAs: `${origin}/map#place-1-2`,
      },
    ])
    assert.equal(cities.itemListOrder, undefined)
    assert.deepEqual(
      journey.itemListElement.map(({ position, item }) => [
        position,
        item.name,
      ]),
      [[1, 'Rājagaha']]
    )
  })
})

describe('Site page strings', () => {
  it('has every key the pages use', async () => {
    const files = await Promise.all(
      STRING_FILES.map(name =>
        fetchStrings(name)
          .then(result => result.strings)
          .catch(() => ({}))
      )
    )
    const strings = Object.assign({}, ...files)
    const missing = [...templateKeys()].filter(key => !(key in strings))
    assert.equal(
      missing.length,
      0,
      `Keys .net doesn't have, which src/pages/site/ needs changing for:\n${listSome(missing)}`
    )
  })
})

const { pages } = await scanSite()

describe('Every site page', () => {
  const sitePages = [...pages.values()].filter(page => page.kind === 'site')

  it('in the menu is built', () => {
    const missing = siteMap
      .flatMap(({ pages }) => pages.map(({ href }) => href))
      .filter(href => href.startsWith('/') && !pages.has(`${href}/`))
    assert.equal(
      missing.length,
      0,
      `Site pages not built:\n${listSome(missing)}`
    )
  })

  it('has a heading and its text', () => {
    const bad = sitePages
      .filter(page => !page.h1 || page.mainTextLength < MIN_TEXT_LENGTH)
      .map(page => `${page.url}: ${page.mainTextLength} characters`)
    assert.equal(
      bad.length,
      0,
      `Site pages without a heading or text:\n${listSome(bad)}`
    )
  })

  it('includes the edition pages', () => {
    const editions = sitePages.filter(page =>
      /^\/edition\/[^/]+\/[^/]+\/[^/]+\/$/.test(page.url)
    )
    assert.ok(editions.length > 0, 'No /edition/<uid>/<lang>/<author> pages')
  })

  it("lists no journey's route line in the map's index of places", async () => {
    const html = await readPage('/map/')
    const index = html.slice(html.indexOf('id="places-index-heading"'))
    const routes = [...index.matchAll(/<li>([^<]* journey)<\/li>/g)].map(
      ([, name]) => name
    )
    assert.deepEqual(
      routes,
      [],
      `The index lists routes:\n${routes.join('\n')}`
    )
    assert.match(index, /<summary>Mahāparinibbāna journey<\/summary>/)
  })

  it('gives the journeys their stops in sequence, and no other layer a position', async () => {
    const html = await readPage('/map/')
    const jsonLd = JSON.parse(
      html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]
    )
    const index = jsonLd.hasPart.find(part => part['@type'] === 'Table')
    const [journeys, alphabetical] = [
      index.mainEntity.itemListElement.filter(
        layer => layer.itemListOrder === 'ItemListOrderAscending'
      ),
      index.mainEntity.itemListElement.filter(
        layer => layer.itemListOrder === undefined
      ),
    ]
    const names = journeys.map(layer => layer.name)
    assert.deepEqual(names, [
      'Mahāparinibbāna journey',
      'Pārāyanavagga journey',
    ])
    for (const journey of journeys) {
      assert.deepEqual(
        journey.itemListElement.map(({ position }) => position),
        journey.itemListElement.map((place, i) => i + 1)
      )
      assert.equal(journey.itemListElement[0].item['@type'], 'Place')
    }
    for (const layer of alphabetical) {
      assert.ok(
        layer.itemListElement.every(place => place['@type'] === 'Place'),
        `${layer.name} has a positioned ListItem`
      )
    }
  })
})

describe('Edition matter', () => {
  it('drops epub:type and keeps the DPUB role', () => {
    assert.equal(
      tidyMatter("<a epub:type='noteref' href='#n1' role='doc-noteref'>1</a>"),
      "<a href='#n1' role='doc-noteref'>1</a>"
    )
  })

  it('normalises to NFC', () => {
    assert.equal(tidyMatter('Pa\u0304li'), 'P\u0101li')
  })

  it("merges a tag's class attributes", () => {
    assert.equal(
      tidyMatter("<a class='ref' href='/snp' class='text-root'>Snp</a>"),
      '<a class="ref text-root" href=\'/snp\'>Snp</a>'
    )
  })

  it('keeps only the first of each id', () => {
    assert.equal(
      tidyMatter(
        "<dl><dt id='kala'>kāla</dt><dd>time</dd><dt id='kala'>kaḷa</dt><dd>?</dd></dl>"
      ),
      "<dl><dt id='kala'>kāla</dt><dd>time</dd><dt>kaḷa</dt><dd>?</dd></dl>"
    )
  })

  it('lists a term once where it comes twice in a row', () => {
    assert.equal(
      tidyMatter(
        "<dl>\n<dt id='s'>sammuti</dt>\n<dd>appointment</dd>\n<dt id='s'>sammuti</dt>\n<dd>a building</dd>\n</dl>"
      ),
      "<dl>\n<dt id='s'>sammuti</dt>\n<dd>appointment</dd>\n<dd>a building</dd>\n</dl>"
    )
  })

  it('gives a term with no description an empty one', () => {
    assert.equal(
      tidyMatter(
        '<dl><dt>Sosa</dt>\n<dt>Taka</dt><dd>?</dd>\n<dt>Kāla</dt></dl>'
      ),
      '<dl><dt>Sosa</dt><dd></dd>\n<dt>Taka</dt><dd>?</dd>\n<dt>Kāla</dt><dd></dd></dl>'
    )
  })
})

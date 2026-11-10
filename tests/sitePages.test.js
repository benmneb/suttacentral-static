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

  it('builds breadcrumbs for language, edition, and front-matter routes', async () => {
    const pages = await buildSitePageMetadata({
      titleFor: key =>
        ({
          'abhidhamma:2': 'Bhikkhu Sujato',
          'an-guide-sujato:2': 'Bhikkhu Sujato, 2019',
          'interface:anGuideSujato': 'Aṅguttara Nikāya',
          'discourses:2': 'Bhikkhu Sujato',
          'dn-guide-sujato:2': 'Bhikkhu Sujato, 2019',
          'general-guide-sujato:2': 'Bhikkhu Sujato, 2019',
          'interface:aboutTitle': 'About SuttaCentral',
          'interface:languages': 'Languages on SuttaCentral',
          'interface:mnGuideSujato': 'The Middle Discourses',
          'map:1': 'The Buddha’s India',
          'map:2': 'Poster map',
          'map:3':
            'Jambudīpa: India in the time of the Buddha. Hand-drawn by Jonas for SuttaCentral, CC0.',
          'map:4': 'Interactive map',
          'map:5': 'Capital cities',
          'map:6': 'Towns & villages',
          'map:11': 'Mahāparinibbāna journey',
          'methodology:16': 'Rod Bucknell, updated by Sujato',
          'methodology:33': 'Bhikkhu Sujato',
          'publication:editionsToolbarTitle': 'SuttaCentral Editions',
          'an-introduction-bodhi:2': 'Bhikkhu Bodhi, 2012',
          'sn-guide-sujato:2': 'Bhikkhu Sujato, 2019',
          'vinaya:2': 'Bhikkhu Brahmali',
        })[key] ?? key,
      languagePages: [{ scx_path: 'languages/pli', name: 'Pali' }],
      abbreviations: {
        texts: [{ acronym: 'DN', name: 'Dīgha Nikāya' }],
        editions: [{ acronym: 'PTS', name: 'Pali Text Society' }],
        schools: [{ acronym: 'Mū', name: 'Mūlasarvāstivāda' }],
      },
      imageFor: async (url, options) => {
        if (url.endsWith('/static-pages/jambudipa_map.jpg')) {
          assert.deepEqual(options, { dir: 'site-pages', height: 2068 })
          return {
            src: '/images/site-pages/jambudipa_map-test.avif',
            width: 1400,
            height: 1900,
          }
        }
        assert.equal(url, `${SC_ORIGIN}/img/publication-pages/mn-book.jpg`)
        assert.deepEqual(options, { dir: 'site-pages', height: 600 })
        return { src: '/images/site-pages/mn-book-test.avif' }
      },
      map: {
        layers: [
          {
            name: 'Capital cities',
            labelKey: 'map:5',
            places: [
              {
                id: 'place-1-1',
                name: 'Rājagaha',
                define: 'rājagaha',
                shape: { type: 'point', x: 1, y: 2 },
              },
            ],
          },
          {
            name: 'Towns & villages',
            labelKey: 'map:6',
            places: [
              {
                id: 'place-2-1',
                name: 'A nameless village',
                define: undefined,
                shape: { type: 'point', x: 3, y: 4 },
              },
            ],
          },
          {
            name: 'Mahāparinibbāna journey',
            labelKey: 'map:11',
            // Its stops are numbered, so `mapPlaces.js` counts it a sequence
            ordered: true,
            places: [
              {
                id: 'place-3-1',
                name: '1) Rājagaha',
                define: 'rājagaha',
                shape: { type: 'point', x: 5, y: 6 },
              },
              {
                id: 'place-3-2',
                name: 'Mahāparinibbāna journey',
                route: true,
                shape: { type: 'line', x: 7, y: 8 },
              },
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
            translation_subtitle: 'A meaningful translation',
            publication_date: '2024-05-12',
            text_description: '<p>A translation of the Middle Discourses.</p>',
          },
          files: { updated: '2026-10-18' },
          volumes: [{ isbn: '9781234567890' }],
          menu: { original_title: 'Majjhima Nikāya' },
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
    const about = JSON.parse(pages['/about/'].scx_json_ld)
    const language = JSON.parse(pages['/languages/pli/'].scx_json_ld)
    const abbreviation = JSON.parse(pages['/abbreviations/'].scx_json_ld)
    const subjectIndex = JSON.parse(pages['/subjects/'].scx_json_ld)
    const article = JSON.parse(pages['/an-guide-sujato/'].scx_json_ld)
    const edition = JSON.parse(pages['/edition/mn/en/sujato/'].scx_json_ld)
    const matter = JSON.parse(
      pages['/edition/mn/en/sujato/introduction/'].scx_json_ld
    )

    assert.equal(about['@type'], 'AboutPage')
    assert.equal(about.name, 'About SuttaCentral')
    assert.equal(about.url, `${origin}/about`)
    assert.equal(abbreviation['@type'], 'CollectionPage')
    assert.equal(abbreviation.mainEntity['@type'], 'ItemList')
    assert.equal(abbreviation.mainEntity.numberOfItems, 3)
    assert.equal(
      abbreviation.mainEntity.description,
      'Comprehensive list of abbreviations for suttas, Vinaya rules, editions, and schools'
    )
    assert.equal(abbreviation.mainContentOfPage['@type'], 'Table')
    assert.equal(abbreviation.mainContentOfPage.about, 'Sutta abbreviations')
    for (const url of [
      '/subjects/',
      '/similes/',
      '/names/',
      '/terminology/',
      '/pali-tipitaka/',
    ]) {
      assert.equal(
        JSON.parse(pages[url].scx_json_ld)['@type'],
        'CollectionPage'
      )
    }
    assert.deepEqual(article['@type'], ['WebPage', 'ScholarlyArticle'])
    assert.equal(article.headline, 'Aṅguttara Nikāya')
    assert.equal(article.name, undefined)
    assert.deepEqual(article.author, [
      { '@type': 'Person', name: 'Bhikkhu Sujato' },
    ])
    assert.equal(article.datePublished, '2019')
    assert.equal(article.inLanguage, 'en')
    assert.equal(article.publisher.name, 'SuttaCentral')
    assert.deepEqual(edition['@type'], ['WebPage', 'Book'])
    assert.equal(edition.name, 'Middle Discourses—A meaningful translation')
    assert.deepEqual(edition.author, {
      '@type': 'Person',
      name: 'Bhikkhu Sujato',
    })
    assert.deepEqual(edition.translator, edition.author)
    assert.equal(edition.datePublished, '2024-05-12')
    assert.equal(edition.dateModified, '2026-10-18')
    assert.equal(edition.inLanguage, 'en')
    assert.equal(edition.isbn, '9781234567890')
    assert.equal(edition.image, `${origin}/images/site-pages/mn-book-test.avif`)
    assert.deepEqual(edition.potentialAction, {
      '@type': 'ReadAction',
      url: `${origin}/pitaka/sutta/middle/mn`,
    })
    assert.deepEqual(edition.isBasedOn, {
      '@type': 'Book',
      name: 'Majjhima Nikāya',
      inLanguage: 'pi',
      description: 'Original Pāli Buddhist text',
    })
    const articleRoutes = [
      '/abhidhamma-guide-sujato/',
      '/an-guide-sujato/',
      '/an-introduction-bodhi/',
      '/discourses-guide-sujato/',
      '/dn-guide-sujato/',
      '/general-guide-sujato/',
      '/mn-guide-sujato/',
      '/methodology/',
      '/sn-guide-sujato/',
      '/vinaya-guide-brahmali/',
    ]
    for (const url of articleRoutes) {
      assert.deepEqual(JSON.parse(pages[url].scx_json_ld)['@type'], [
        'WebPage',
        'ScholarlyArticle',
      ])
    }
    assert.equal(
      JSON.parse(pages['/discourses-guide-sujato/'].scx_json_ld).datePublished,
      undefined
    )
    assert.equal(about.sameAs, `${SC_ORIGIN}/about`)
    assert.deepEqual(
      language.breadcrumb.itemListElement.map(({ name }) => name),
      ['Home', 'Languages on SuttaCentral', 'Pali']
    )
    assert.deepEqual(
      edition.breadcrumb.itemListElement.map(({ name }) => name),
      ['Home', 'SuttaCentral Editions', 'Middle Discourses']
    )
    assert.deepEqual(
      matter.breadcrumb.itemListElement.map(({ name }) => name),
      ['Home', 'SuttaCentral Editions', 'Middle Discourses', 'Introduction']
    )
    assert.equal(matter.description, 'How this translation was prepared.')
    const book = {
      '@type': 'Book',
      '@id': `${origin}/edition/mn/en/sujato`,
      name: 'Middle Discourses',
    }
    assert.deepEqual(matter.isPartOf, book)
    // The chapter is a CreativeWork with an identity of its own, and the book it belongs to
    assert.deepEqual(matter.hasPart, {
      '@type': 'Chapter',
      '@id': `${origin}/edition/mn/en/sujato/introduction#chapter`,
      name: 'Introduction',
      url: `${origin}/edition/mn/en/sujato/introduction`,
      isPartOf: book,
      inLanguage: 'en',
    })
    assert.equal(edition.isPartOf.name, title)

    const mapPage = JSON.parse(pages['/map/'].scx_json_ld)
    const [poster, interactiveMap, index] = mapPage.hasPart
    assert.equal(mapPage['@type'], 'WebPage')
    assert.equal(mapPage.name, 'The Buddha’s India')
    assert.deepEqual(
      mapPage.hasPart.map(part => part['@type']),
      ['ImageObject', 'Map', 'Table']
    )
    assert.equal(
      poster.url,
      `${origin}/images/site-pages/jambudipa_map-test.avif`
    )
    assert.equal(poster.encodingFormat, 'image/avif')
    assert.equal(poster.width, 1400)
    assert.equal(poster.height, 1900)
    assert.equal(poster.name, 'Poster map')
    assert.match(poster.description, /^Jambudīpa: India in the time/)
    assert.equal(interactiveMap.url, `${origin}/map`)
    assert.equal(interactiveMap.encodingFormat, 'image/svg+xml')
    assert.equal(index.name, 'Index of Places')
    // A list of lists, as `hasPart` only takes CreativeWorks, and gives no position
    assert.equal(index.hasPart, undefined)
    assert.equal(index.mainEntity['@type'], 'ItemList')
    // The journey's route line isn't one of the places it lists
    assert.equal(index.mainEntity.numberOfItems, 3)
    const categories = index.mainEntity.itemListElement
    assert.deepEqual(
      categories.map(({ name }) => name),
      ['Capital cities', 'Towns & villages', 'Mahāparinibbāna journey']
    )
    // Sorted by name, so the places stand on their own, with no position
    assert.equal(categories[0]['@type'], 'ItemList')
    assert.equal(categories[0].numberOfItems, 1)
    assert.equal(categories[0].itemListOrder, undefined)
    assert.deepEqual(categories[0].itemListElement, [
      {
        '@type': 'Place',
        name: 'Rājagaha',
        url: `${origin}/define/rājagaha`,
        sameAs: `${origin}/map#place-1-1`,
      },
    ])
    // A place with no /define page is still listed, without a url
    assert.equal(categories[1].itemListElement[0].url, undefined)
    assert.equal(categories[1].itemListElement[0].name, 'A nameless village')
    // A journey's stops are in sequence, so each is a positioned ListItem, minus its number
    assert.equal(categories[2].itemListOrder, 'ItemListOrderAscending')
    assert.equal(categories[2].numberOfItems, 1)
    assert.deepEqual(categories[2].itemListElement, [
      {
        '@type': 'ListItem',
        position: 1,
        item: {
          '@type': 'Place',
          name: 'Rājagaha',
          url: `${origin}/define/rājagaha`,
          sameAs: `${origin}/map#place-3-1`,
        },
      },
    ])
    assert.equal(mapPage.spatialCoverage['@type'], 'Place')
    assert.equal(mapPage.spatialCoverage.name, 'India')
    assert.equal(mapPage.temporalCoverage, '6th–5th century BCE')
    assert.deepEqual(
      mapPage.about.map(({ name }) => name),
      ['Buddhism in Ancient India', 'Mahajanapadas']
    )
    assert.equal(mapPage.isPartOf.name, title)
    assert.equal(
      JSON.parse(
        generateSitePageOGTags({
          title: 'About SuttaCentral',
          description: 'About',
          url: '/about',
        })
      )['og:url'],
      `${origin}/about`
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

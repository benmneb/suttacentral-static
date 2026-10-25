/**
 * The site pages have their words and are all built.
 *
 * Their words are fetched from .net at build time, and the markup in
 * `src/pages/site/` names each one by its key, so a key .net drops or renames
 * leaves a hole. The keys are checked against `.cache`, so without a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSitePageMetadata,
  generateSitePageJsonLd,
  generateSitePageOGTags,
} from '../src/helpers/sitePageMetadata.js'
import { siteMap } from '../src/helpers/sitePages.js'
import {
  fetchStrings,
  STRING_FILES,
  templateKeys,
} from '../src/helpers/siteStrings.js'
import { listSome, readPage, scanSite } from './lib/site.js'

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

    assert.equal(og['og:url'], 'https://suttacentral.express/about')
    assert.equal(og['og:description'], page.description)
    assert.equal(jsonLd['@type'], 'AboutPage')
    assert.equal(jsonLd['@id'], og['og:url'])
    assert.equal(jsonLd.sameAs, 'https://suttacentral.net/about')
    assert.equal(jsonLd.isPartOf.name, 'SuttaCentral Express')
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
        assert.equal(
          url,
          'https://suttacentral.net/img/publication-pages/mn-book.jpg'
        )
        assert.deepEqual(options, { dir: 'site-pages', height: 600 })
        return { src: '/images/site-pages/mn-book-test.avif' }
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
              html: '<p>How this translation was prepared.</p>',
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
    assert.equal(about.url, 'https://suttacentral.express/about')
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
    assert.equal(article['@type'], 'ScholarlyArticle')
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
    assert.equal(
      edition.image,
      'https://suttacentral.express/images/site-pages/mn-book-test.avif'
    )
    assert.deepEqual(edition.potentialAction, {
      '@type': 'ReadAction',
      url: 'https://suttacentral.express/pitaka/sutta/middle/mn',
    })
    assert.deepEqual(edition.isBasedOn, {
      '@type': 'Book',
      name: 'Majjhima Nikāya',
      inLanguage: 'pli',
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
      assert.equal(
        JSON.parse(pages[url].scx_json_ld)['@type'],
        'ScholarlyArticle'
      )
    }
    assert.equal(
      JSON.parse(pages['/discourses-guide-sujato/'].scx_json_ld).datePublished,
      undefined
    )
    assert.equal(about.sameAs, 'https://suttacentral.net/about')
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
    assert.equal(
      JSON.parse(
        generateSitePageOGTags({
          title: 'About SuttaCentral',
          description: 'About',
          url: '/about',
        })
      )['og:url'],
      'https://suttacentral.express/about'
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

describe('Every site page', async () => {
  const { pages } = await scanSite()
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
})

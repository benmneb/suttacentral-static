import siteMetaData from '../data/_siteMetaData.js'
import { localImage } from './images.js'
import {
  absoluteUrl,
  breadcrumbList,
  excerpt,
  jsonLd,
  ogTags,
  routePath,
  SUTTACENTRAL,
  textFromHtml,
  website,
} from './pageMetadata.js'
import { SC_ORIGIN } from './scApi.js'
import { siteMap } from './sitePages.js'
import { langTag } from './strings.js'
import { t } from './siteStrings.js'

const STATIC_PAGES = {
  '/abbreviations/': {
    titleKey: 'abbreviations:1',
    description:
      'Look up abbreviations used for Buddhist texts, editions, and schools in SuttaCentral.',
    schemaType: 'CollectionPage',
    mainEntity: {
      '@type': 'ItemList',
      name: 'Buddhist Text Abbreviations',
      description:
        'Comprehensive list of abbreviations for suttas, Vinaya rules, editions, and schools',
    },
    mainContentOfPage: {
      '@type': 'Table',
      about: 'Sutta abbreviations',
    },
  },
  '/abhidhamma-guide-sujato/': {
    titleKey: 'interface:abhidhamma',
    description:
      'A guide to the Abhidhamma texts, their structure, and their place in the Buddhist canon.',
  },
  '/about/': {
    titleKey: 'interface:aboutTitle',
    description:
      'Learn about SuttaCentral, its collection of early Buddhist texts, translations, parallels, and community.',
    schemaType: 'AboutPage',
  },
  '/acknowledgments/': {
    titleKey: 'interface:acknowledgmentsTitle',
    description:
      'Recognize the translators, editors, donors, and contributors whose work supports SuttaCentral.',
  },
  '/an-guide-sujato/': {
    titleKey: 'interface:anGuideSujato',
    description:
      'A guide to the Aṅguttara Nikāya and its numbered collection of Buddhist discourses.',
  },
  '/an-introduction-bodhi/': {
    titleKey: 'an-introduction-bodhi:1',
    description:
      'An introduction to the Aṅguttara Nikāya by Bhikkhu Bodhi, with context for reading its discourses.',
  },
  '/discourses-guide-sujato/': {
    titleKey: 'interface:discourses',
    description:
      'An overview of the early Buddhist discourses and how they are organized in the collections.',
  },
  '/dn-guide-sujato/': {
    titleKey: 'interface:dnGuideSujato',
    description:
      'A guide to the Dīgha Nikāya, the collection of long Buddhist discourses.',
  },
  '/editions/': {
    titleKey: 'publication:editionsToolbarTitle',
    description:
      'Browse SuttaCentral editions of selected translations, available to read or download in book formats.',
    schemaType: 'CollectionPage',
  },
  '/general-guide-sujato/': {
    titleKey: 'general-guide-sujato:1',
    description:
      'A general guide to the early Buddhist texts and the collections preserved on SuttaCentral.',
  },
  '/introduction/': {
    titleKey: 'introduction:1',
    description:
      'An introduction to SuttaCentral and its resources for studying early Buddhist texts.',
  },
  '/languages/': {
    titleKey: 'interface:languages',
    description:
      'Explore the languages represented in SuttaCentral and the texts and translations available in each.',
    schemaType: 'CollectionPage',
  },
  '/licensing/': {
    titleKey: 'interface:licensingTitle',
    description:
      'Read the licensing terms for SuttaCentral texts, translations, data, and other materials.',
  },
  '/map/': {
    titleKey: 'map:1',
    description:
      'Explore places mentioned in early Buddhist texts on a map, with references to related passages.',
  },
  '/methodology/': {
    titleKey: 'methodology:1',
    description:
      'Learn how SuttaCentral identifies, compares, and presents parallels between Buddhist texts.',
  },
  '/mn-guide-sujato/': {
    titleKey: 'interface:mnGuideSujato',
    description:
      'A guide to the Majjhima Nikāya, the collection of middle-length Buddhist discourses.',
  },
  '/names/': {
    titleKey: 'names:1',
    description:
      'Browse names of people and places found in the early Buddhist texts and their translations.',
  },
  '/numbering/': {
    titleKey: 'numbering:1',
    description:
      'Understand the numbering systems used to identify Buddhist texts across collections and editions.',
  },
  '/offline/': {
    titleKey: 'interface:offlineTitle',
    description:
      'Learn how to use SuttaCentral offline and access texts without an internet connection.',
  },
  '/pali-tipitaka/': {
    titleKey: 'palitipitaka:palitipitaka',
    description:
      'An overview of the Pāli Tipiṭaka and its Vinaya, Sutta, and Abhidhamma collections.',
  },
  '/pirivena-project/': {
    titleKey: 'pirivenaPage:title',
    description:
      'Learn about the Pirivena Project and its work with Buddhist texts and education.',
  },
  '/similes/': {
    titleKey: 'similes:1',
    description:
      'Find similes in the early Buddhist texts and follow them to their source passages.',
  },
  '/sn-guide-sujato/': {
    titleKey: 'interface:snGuideSujato',
    description:
      'A guide to the Saṁyutta Nikāya and its connected collections of Buddhist discourses.',
  },
  '/start/': {
    titleKey: 'start:1',
    description:
      'Get started reading Buddhist discourses with an introduction to SuttaCentral’s text collections.',
  },
  '/subjects/': {
    titleKey: 'subjects:1',
    description:
      'Browse early Buddhist texts by subject and follow topics to their related discourses.',
  },
  '/terminology/': {
    titleKey: 'terminology:1',
    description:
      'Explore terminology used in Buddhist texts, translations, and SuttaCentral resources.',
  },
  '/vinaya-guide-brahmali/': {
    titleKey: 'interface:vinaya',
    description:
      'A guide to the Vinaya and its collection of monastic discipline texts.',
  },
}

const SCHOLARLY_PAGES = {
  '/abhidhamma-guide-sujato/': {
    bylineKeys: ['abhidhamma:2'],
    about: ['Abhidhamma', 'Buddhist philosophy'],
    keywords: [
      'Abhidhamma',
      'Systematic Treatise',
      'Buddhist philosophy',
      'Pāli Canon',
    ],
  },
  '/an-guide-sujato/': {
    bylineKeys: ['an-guide-sujato:2'],
    about: ['Aṅguttara Nikāya', 'Buddhist discourses'],
    keywords: [
      'Aṅguttara Nikāya',
      'Numbered Discourses',
      'Buddhist discourses',
      'Pāli Canon',
    ],
  },
  '/an-introduction-bodhi/': {
    bylineKeys: ['an-introduction-bodhi:2'],
    about: ['Aṅguttara Nikāya', 'Buddhist discourses'],
    keywords: [
      'Aṅguttara Nikāya',
      'Numberical Discourses',
      'Buddhist discourses',
      'Pāli Canon',
    ],
  },
  '/discourses-guide-sujato/': {
    bylineKeys: ['discourses:2'],
    about: ['Early Buddhist texts', 'Buddhist discourses'],
    keywords: [
      'Early Buddhist texts',
      'Suttas',
      'Buddhist discourses',
      'Pāli Canon',
    ],
  },
  '/dn-guide-sujato/': {
    bylineKeys: ['dn-guide-sujato:2'],
    about: ['Dīgha Nikāya', 'Buddhist discourses'],
    keywords: [
      'Dīgha Nikāya',
      'Long Discourses',
      'Buddhist discourses',
      'Pāli Canon',
    ],
  },
  '/general-guide-sujato/': {
    bylineKeys: ['general-guide-sujato:2'],
    about: ['Early Buddhist texts', 'Pāli Canon'],
    keywords: ['Early Buddhist texts', 'Buddhist texts', 'Pāli Canon'],
  },
  '/mn-guide-sujato/': {
    bylineKeys: ['mn-guide-sujato:2'],
    about: ['Majjhima Nikāya', 'Buddhist discourses'],
    keywords: [
      'Majjhima Nikāya',
      'Middle Discourses',
      'Buddhist discourses',
      'Pāli Canon',
    ],
  },
  '/methodology/': {
    bylineKeys: ['methodology:16', 'methodology:33'],
    about: ['Textual studies', 'Early Buddhist texts'],
    keywords: ['Textual studies', 'Textual parallels', 'Early Buddhist texts'],
  },
  '/sn-guide-sujato/': {
    bylineKeys: ['sn-guide-sujato:2'],
    about: ['Saṁyutta Nikāya', 'Buddhist discourses'],
    keywords: [
      'Saṁyutta Nikāya',
      'Linked Discourses',
      'Buddhist discourses',
      'Pāli Canon',
    ],
  },
  '/vinaya-guide-brahmali/': {
    bylineKeys: ['vinaya:2'],
    about: ['Vinaya', 'Buddhist monastic discipline'],
    keywords: ['Vinaya', 'Buddhist monastic discipline', 'Pāli Canon'],
  },
}

function routeKey(url) {
  const path = routePath(url)
  return path === '/' ? path : `${path}/`
}

const COLLECTION_ROUTES = new Set([
  ...siteMap
    .filter(({ heading }) => heading === 'Indexes')
    .flatMap(({ pages }) => pages.map(({ href }) => href))
    .filter(href => href.startsWith('/'))
    .map(routeKey),
  '/abbreviations/',
  '/editions/',
  '/languages/',
])

/**
 * A page's first paragraph of prose, for a description: the text itself, not the title, byline or contents
 * menu an edition's front matter starts with
 */
function firstParagraph(html) {
  const body = String(html ?? '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(
      /<p\b[^>]*\bclass=['"][^'"]*\bbyline\b[^'"]*['"][^>]*>[\s\S]*?<\/p>/gi,
      ' '
    )
  const paragraph = body.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1]
  return excerpt(textFromHtml(paragraph ?? body))
}

function withBreadcrumbs(page, ancestors = []) {
  return {
    ...page,
    breadcrumbs: [
      { name: 'Home', url: '/' },
      ...ancestors,
      { name: page.breadcrumbTitle ?? page.title, url: page.url },
    ],
  }
}

// The poster map /map shows, at the same size it does, and the interactive one it draws
const MAP_POSTER = `${SC_ORIGIN}/img/static-pages/jambudipa_map.jpg`
const MAP_POSTER_HEIGHT = 2068

/** The MIME type of an image, from its file extension */
function imageFormat(src) {
  const extension = src.split(/[?#]/)[0].split('.').pop().toLowerCase()
  if (extension === 'avif') return 'image/avif'
  if (extension === 'png') return 'image/png'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webp') return 'image/webp'
  return 'image/jpeg'
}

/**
 * What /map is made of, for its JSON-LD: its poster and interactive maps, and its index of every place, in the
 * layers the page groups them by, each by its /define page if it has one, and the place on the map
 */
async function mapParts(map, titleFor, imageFor) {
  const { origin } = siteMetaData()
  const poster = await imageFor(MAP_POSTER, {
    dir: 'site-pages',
    height: MAP_POSTER_HEIGHT,
  })
  const posterUrl = new URL(poster.src, `${origin}/`).href
  const layers = map.layers.map(layer => ({
    layer,
    ordered: layer.ordered,
    places: layer.places
      // A journey's own route line isn't one of the places its index lists
      .filter(place => !place.route)
      .map(place => ({
        '@type': 'Place',
        // A journey numbers its stops, as "1) Rājagaha", which isn't part of the place's name
        name: place.name?.trim().replace(/^\d+\)\s*/, ''),
        ...(place.define && {
          url: absoluteUrl(`/define/${place.define}`),
        }),
        sameAs: absoluteUrl(`/map#${place.id}`),
      })),
  }))
  const placeCount = layers.reduce(
    (count, { places }) => count + places.length,
    0
  )
  return {
    hasPart: [
      {
        '@type': 'ImageObject',
        name: textFromHtml(titleFor('map:2')),
        description: textFromHtml(titleFor('map:3')),
        url: posterUrl,
        encodingFormat: imageFormat(poster.src),
        ...(poster.width && { width: poster.width, height: poster.height }),
      },
      {
        '@type': 'InteractiveResource',
        name: textFromHtml(titleFor('map:4')),
        description:
          'The places of the early Buddhist texts on an interactive SVG map, with references to related passages.',
        url: absoluteUrl('/map'),
        encodingFormat: 'image/svg+xml',
      },
      {
        '@type': 'Table',
        name: 'Index of Places',
        description: 'Categorized index of locations featured on the map',
        // Its places as lists, as `hasPart` only takes the parts of a CreativeWork, and the
        // places are Things. A journey's stops need a position, which only a `ListItem` can give,
        // while a list sorted by name needs none, and there a `Place` can stand alone
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: placeCount,
          itemListElement: layers.map(({ layer, ordered, places }) => ({
            '@type': 'ItemList',
            name: layer.labelKey
              ? textFromHtml(titleFor(layer.labelKey))
              : layer.name,
            numberOfItems: places.length,
            ...(ordered && { itemListOrder: 'ItemListOrderAscending' }),
            itemListElement: places.map((place, index) =>
              ordered
                ? {
                    '@type': 'ListItem',
                    position: index + 1,
                    item: place,
                  }
                : place
            ),
          })),
        },
      },
    ],
    spatialCoverage: {
      '@type': 'Place',
      name: 'India',
      description: 'India during the time of the Buddha',
    },
    temporalCoverage: '6th–5th century BCE',
    about: [
      { '@type': 'Thing', name: 'Buddhism in Ancient India' },
      { '@type': 'Thing', name: 'Mahajanapadas' },
    ],
  }
}

function scholarlyData(url, titleFor) {
  const article = SCHOLARLY_PAGES[routeKey(url)]
  if (!article) return {}

  const bylines = article.bylineKeys.map(key => textFromHtml(titleFor(key)))
  const authors = new Set()
  let datePublished
  for (const byline of bylines) {
    const year = byline.match(/\b(?:18|19|20)\d{2}\b/)?.[0]
    datePublished ??= year
    const names = byline
      .replace(/,\s*(?:18|19|20)\d{2}\b/g, '')
      .replace(/,\s*updated by\s+/gi, ';')
      .split(/\s*;\s*/)
      .map(name => name.trim())
      .filter(Boolean)
    for (const name of names) authors.add(name)
  }

  return {
    schemaType: 'ScholarlyArticle',
    author: [...authors].map(name => ({ '@type': 'Person', name })),
    ...(datePublished && { datePublished }),
    about: article.about.map(name => ({ '@type': 'Thing', name })),
    keywords: article.keywords,
    inLanguage: 'en',
    publisher: SUTTACENTRAL,
  }
}

export function generateSitePageOGTags({ title, description, url }) {
  return ogTags({ title, description, url })
}

export function generateSitePageJsonLd({
  title,
  name,
  description,
  url,
  schemaType = 'WebPage',
  breadcrumbs,
  author,
  datePublished,
  dateModified,
  about,
  keywords,
  inLanguage,
  publisher,
  mainEntity,
  mainContentOfPage,
  hasPart,
  translator,
  image,
  potentialAction,
  isbn,
  isBasedOn,
  spatialCoverage,
  temporalCoverage,
  isPartOf,
}) {
  const canonicalUrl = absoluteUrl(url)
  return jsonLd({
    '@type': schemaType,
    '@id': canonicalUrl,
    ...(schemaType === 'ScholarlyArticle'
      ? { headline: title }
      : { name: name ?? title }),
    description,
    url: canonicalUrl,
    sameAs: `${SC_ORIGIN}${routePath(url)}`,
    ...(author && { author }),
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    ...(about && { about }),
    ...(keywords && { keywords }),
    ...(inLanguage && { inLanguage }),
    ...(publisher && { publisher }),
    ...(mainEntity && { mainEntity }),
    ...(mainContentOfPage && { mainContentOfPage }),
    ...(hasPart && { hasPart }),
    ...(translator && { translator }),
    ...(image && { image }),
    ...(potentialAction && { potentialAction }),
    ...(isbn && { isbn }),
    ...(isBasedOn && { isBasedOn }),
    ...(spatialCoverage && { spatialCoverage }),
    ...(temporalCoverage && { temporalCoverage }),
    ...(breadcrumbs?.length && { breadcrumb: breadcrumbList(breadcrumbs) }),
    isPartOf: isPartOf ?? website(),
  })
}

function pageMetadata(page) {
  return {
    scx_og_tags: generateSitePageOGTags(page),
    scx_json_ld: generateSitePageJsonLd(page),
  }
}

export async function buildSitePageMetadata({
  languagePages,
  editions,
  abbreviations = {},
  map,
  titleFor = t,
  imageFor = localImage,
}) {
  // Awaited here, as only /map has a part to make with an image, and the rest of the pages need no await
  const mapStructuredData = map ? await mapParts(map, titleFor, imageFor) : null
  const pages = Object.fromEntries(
    Object.entries(STATIC_PAGES).map(([url, page]) => {
      const article = scholarlyData(url, titleFor)
      const abbreviationCount = Object.values(abbreviations).reduce(
        (count, entries) =>
          count + (Array.isArray(entries) ? entries.length : 0),
        0
      )
      const data = withBreadcrumbs({
        ...page,
        ...article,
        ...(COLLECTION_ROUTES.has(routeKey(url)) && {
          schemaType: 'CollectionPage',
        }),
        ...(url === '/abbreviations/' && {
          mainEntity: {
            ...page.mainEntity,
            numberOfItems: abbreviationCount,
          },
        }),
        ...(url === '/map/' && mapStructuredData),
        url,
        title: textFromHtml(titleFor(page.titleKey)),
      })
      return [routeKey(url), pageMetadata(data)]
    })
  )

  const languagesTitle = textFromHtml(titleFor('interface:languages'))
  const editionsTitle = textFromHtml(
    titleFor('publication:editionsToolbarTitle')
  )

  for (const language of languagePages) {
    const url = `/${language.scx_path}/`
    const title = language.name
    const data = withBreadcrumbs(
      {
        url,
        title,
        description: `Read Buddhist texts and translations in ${title}, grouped by collection and language.`,
      },
      [{ name: languagesTitle, url: '/languages' }]
    )
    pages[routeKey(url)] = pageMetadata(data)
  }

  for (const edition of editions) {
    const url = `/${edition.scx_path}/`
    const publication = edition.publication
    const author = { '@type': 'Person', name: publication.creator_name }
    const isbn = (edition.volumes ?? [])
      .map(volume => volume.isbn)
      .filter(Boolean)
    const name = [edition.title, publication.translation_subtitle]
      .filter(Boolean)
      .join('—')
    const title = `${edition.title}—${publication.creator_name}`
    const coverSource = `${SC_ORIGIN}/img/publication-pages/${edition.uid}-book.jpg`
    const cover = await imageFor(coverSource, {
      dir: 'site-pages',
      height: 600,
    })
    const image = new URL(cover.src, `${siteMetaData().origin}/`).href
    const data = withBreadcrumbs(
      {
        url,
        title,
        name,
        breadcrumbTitle: edition.title,
        description:
          textFromHtml(publication.text_description) ||
          `Read or download the SuttaCentral edition of ${edition.title}, translated by ${publication.creator_name}.`,
        schemaType: ['WebPage', 'Book'],
        author,
        translator:
          publication.translation_lang_iso !== 'pli' ? author : undefined,
        ...(publication.publication_date && {
          datePublished: publication.publication_date,
        }),
        ...(edition.files?.updated && {
          dateModified: edition.files.updated,
        }),
        inLanguage: langTag(publication.translation_lang_iso) || 'en',
        publisher: SUTTACENTRAL,
        image,
        potentialAction: {
          '@type': 'ReadAction',
          url: absoluteUrl(edition.readHref),
        },
        ...(isbn.length && { isbn: isbn.length === 1 ? isbn[0] : isbn }),
        isBasedOn: {
          '@type': 'Book',
          name:
            edition.menu?.original_title ||
            edition.menu?.root_name ||
            publication.text_uid,
          inLanguage: 'pi',
          description: 'Original Pāli Buddhist text',
        },
      },
      [{ name: editionsTitle, url: '/editions' }]
    )
    pages[routeKey(url)] = pageMetadata(data)

    // The book the edition's page is, which its front matter is part of too
    const book = {
      '@type': 'Book',
      '@id': absoluteUrl(url),
      name: edition.title,
    }
    for (const matter of edition.matter) {
      const matterUrl = `/${matter.scx_path}/`
      const matterAbsoluteUrl = absoluteUrl(matterUrl)
      const matterData = withBreadcrumbs(
        {
          url: matterUrl,
          title: `${matter.label}—${edition.title}`,
          breadcrumbTitle: matter.label,
          description: firstParagraph(matter.html),
          // A sample of the book it's front matter of
          isPartOf: book,
          // The chapter the page is, as a part of the book rather than a page of its own: a
          // chapter usually has a name, and the book it's in says what else it belongs with
          hasPart: {
            '@type': 'Chapter',
            '@id': `${matterAbsoluteUrl}#chapter`,
            name: matter.label,
            url: matterAbsoluteUrl,
            isPartOf: book,
            inLanguage: langTag(publication.translation_lang_iso) || 'en',
          },
        },
        [
          { name: editionsTitle, url: '/editions' },
          { name: edition.title, url },
        ]
      )
      pages[routeKey(matterUrl)] = pageMetadata(matterData)
    }
  }

  return pages
}

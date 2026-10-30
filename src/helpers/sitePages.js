/**
 * Site Pages
 *
 * The pages about SuttaCentral and its texts that .net has besides the texts themselves: guides, essays,
 * indexes, the map, editions and so on, grouped mostly as in .net's menus. Their words are .net's, fetched
 * at build time (`siteStrings.js`), and their markup is in `pages/site/`.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { SC_ORIGIN } from './scApi.js'

// For the comfort of donors, the donations has no page here, so it goes to the official one
const DONATIONS_HREF = `${SC_ORIGIN}/donations`

/**
 * The site pages menu in the header, as `{ heading, pages }`, each page `{ href, label }` */
export const siteMap = [
  {
    heading: 'Explore',
    pages: [
      { href: '/introduction', label: 'Introduction' },
      { href: '/start', label: 'Getting Started' },
      { href: DONATIONS_HREF, label: 'Donations' },
      { href: '/map', label: 'Map' },
      { href: '/offline', label: 'Use Offline' },
      { href: '/editions', label: 'Editions' },
    ],
  },
  {
    heading: 'Guides',
    pages: [
      { href: '/general-guide-sujato', label: 'General' },
      { href: '/dn-guide-sujato', label: 'Long' },
      { href: '/mn-guide-sujato', label: 'Middle' },
      { href: '/sn-guide-sujato', label: 'Linked' },
      { href: '/an-guide-sujato', label: 'Numbered' },
    ],
  },
  {
    heading: 'Essays',
    pages: [
      { href: '/discourses-guide-sujato', label: 'Discourses' },
      { href: '/vinaya-guide-brahmali', label: 'Monastic Law' },
      { href: '/abhidhamma-guide-sujato', label: 'Systematic Treatises' },
    ],
  },
  {
    heading: 'Indexes',
    pages: [
      { href: '/subjects', label: 'Subjects' },
      { href: '/similes', label: 'Similes' },
      { href: '/names', label: 'Names' },
      { href: '/terminology', label: 'Terminology' },
      { href: '/pali-tipitaka', label: 'Canon Overview' },
    ],
  },
  {
    heading: 'Reference',
    pages: [
      { href: '/languages', label: 'Languages' },
      { href: '/numbering', label: 'Numbering' },
      { href: '/abbreviations', label: 'Abbreviations' },
      { href: '/methodology', label: 'Methodology' },
      { href: '/define', label: 'Definitions' },
    ],
  },
  {
    heading: 'About',
    pages: [
      { href: '/acknowledgments', label: 'Acknowledgments' },
      { href: '/licensing', label: 'Licensing' },
      { href: '/about', label: 'About' },
    ],
  },
]

/** The guides to a piṭaka or collection, on its page, as `{ href, title, byline }` */
export const pitakaGuides = {
  sutta: [
    {
      href: '/general-guide-sujato',
      title: 'A Reader’s Guide to the Pali Suttas',
      byline: 'Bhikkhu Sujato, 2019',
    },
    {
      href: '/discourses-guide-sujato',
      title: 'Discourses: conversations with the Buddha',
      byline: 'Bhikkhu Sujato',
    },
  ],
  vinaya: [
    {
      href: '/vinaya-guide-brahmali',
      title: 'The Monastic Law: how monastic communities should live',
      byline: 'Bhikkhu Brahmali',
    },
  ],
  abhidhamma: [
    {
      href: '/abhidhamma-guide-sujato',
      title: 'Abhidhamma: a systematic analysis of the doctrine',
      byline: 'Bhikkhu Sujato',
    },
  ],
  dn: [
    {
      href: '/dn-guide-sujato',
      title: 'The Long Discourses: Dhamma as literature and compilation',
      byline: 'Bhikkhu Sujato, 2019',
    },
  ],
  mn: [
    {
      href: '/mn-guide-sujato',
      title: 'The Middle Discourses: conversations on matters of deep truth',
      byline: 'Bhikkhu Sujato, 2019',
    },
  ],
  sn: [
    {
      href: '/sn-guide-sujato',
      title: 'The Linked Discourses: the blueprint for Buddhist philosophy',
      byline: 'Bhikkhu Sujato, 2019',
    },
  ],
  an: [
    {
      href: '/an-guide-sujato',
      title: 'The Numbered Discourses: things that are useful every day',
      byline: 'Bhikkhu Sujato, 2019',
    },
    {
      href: '/an-introduction-bodhi',
      title: 'A Thematic Guide to the Aṅguttara Nikāya',
      byline: 'Bhikkhu Bodhi, 2012',
    },
  ],
}

/** Each page's icon, as in .net's menu, by its path, as a heroicon name */
export const pageIcons = {
  '/introduction': 'lightBulb',
  '/start': 'flag',
  [DONATIONS_HREF]: 'heart',
  '/map': 'map',
  '/offline': 'bolt',
  '/editions': 'bookOpen',
  '/edition': 'bookOpen',
  '/general-guide-sujato': 'academicCap',
  '/dn-guide-sujato': 'academicCap',
  '/mn-guide-sujato': 'academicCap',
  '/sn-guide-sujato': 'academicCap',
  '/an-guide-sujato': 'academicCap',
  '/an-introduction-bodhi': 'academicCap',
  '/discourses-guide-sujato': 'documentText',
  '/vinaya-guide-brahmali': 'documentText',
  '/abhidhamma-guide-sujato': 'documentText',
  '/pirivena-project': 'documentText',
  '/define': 'bookOpen',
  '/subjects': 'tag',
  '/similes': 'sparkles',
  '/names': 'identification',
  '/terminology': 'chatBubbleBottomCenterText',
  '/pali-tipitaka': 'rectangleStack',
  '/languages': 'language',
  '/numbering': 'numberedList',
  '/abbreviations': 'scissors',
  '/methodology': 'beaker',
  '/acknowledgments': 'users',
  '/licensing': 'scale',
  '/about': 'informationCircle',
}

/** The collections with a SuttaCentral Edition, in .net's order, and where each is read on the site */
export const editionCollections = new Map([
  ['dn', '/pitaka/sutta/long/dn'],
  ['mn', '/pitaka/sutta/middle/mn'],
  ['sn', '/pitaka/sutta/linked/sn'],
  ['an', '/pitaka/sutta/numbered/an'],
  ['dhp', '/dhp'],
  ['ud', '/pitaka/sutta/minor/kn/ud'],
  ['iti', '/pitaka/sutta/minor/kn/iti'],
  ['snp', '/pitaka/sutta/minor/kn/snp'],
  ['thag', '/pitaka/sutta/minor/kn/thag'],
  ['thig', '/pitaka/sutta/minor/kn/thig'],
  ['pli-tv-vi', '/pitaka/vinaya/pli-tv-vi'],
])

/** .net's names for the map's layers, as keys of their translations */
export const mapLayerKeys = {
  'Capital cities': 'map:5',
  'Towns & villages': 'map:6',
  'Temples & features': 'map:7',
  Regions: 'map:8',
  Mahajanapadas: 'map:9',
  'Republics / countries': 'map:10',
  'Mahāparinibbāna journey': 'map:11',
  'Pārāyanavagga journey': 'map:12',
  'Extraterrestrial Places': 'map:13',
}

/** The first step of every site page's path, ie "edition" for /edition/mn/en/sujato */
export const sitePageRoots = new Set([
  ...siteMap.flatMap(({ pages }) =>
    pages
      .map(({ href }) => href)
      .filter(href => href.startsWith('/'))
      .map(href => href.slice(1))
  ),
  'an-introduction-bodhi',
  'pirivena-project',
  'edition',
])

/** Keys the templates use only through `mapLayerKeys`, so the strings check can find them */
export function configKeys() {
  return Object.values(mapLayerKeys)
}

/** An edition's front or back matter as valid HTML, as the editions' EPUB markup isn't */
export function tidyMatter(html) {
  const ids = new Set()
  return (
    html
      .normalize('NFC')
      .replace(/\s+epub:type=(['"])[^'"]*\1/g, '')
      .replace(/<[a-z][^>]*\sclass=[^>]*\sclass=[^>]*>/g, tag => {
        const classes = []
        const rest = tag.replace(
          /\s+class=(['"])([^'"]*)\1/g,
          (match, quote, value) => {
            classes.push(value)
            return ''
          }
        )
        return rest.replace(
          /^<[a-z\d]+/,
          name => `${name} class="${classes.join(' ')}"`
        )
      })
      .replace(/\sid=(['"])([^'"]*)\1/g, (match, quote, id) => {
        if (ids.has(id)) return ''
        ids.add(id)
        return match
      })
      .replace(
        /(<dt\b[^>]*>((?:(?!<\/dt>)[\s\S])*)<\/dt>(?:\s*<dd\b(?:(?!<\/?d[dlt]\b)[\s\S])*<\/dd>)+)\s*<dt\b[^>]*>\2<\/dt>/g,
        '$1'
      )
      .replace(/<\/dt>(?=\s*(?:<dt\b|<\/dl>))/g, '</dt><dd></dd>')
      // A markdown link the editions left in an href, which ends at its first ")"
      .replace(
        /href=(['"])(https:\/\/suttacentral\.net\/[^)'"\s]+)\)(?:(?!\1)[\s\S])*\1/g,
        'href=$1$2$1'
      )
  )
}

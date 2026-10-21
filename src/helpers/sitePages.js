/**
 * Site Pages
 *
 * The pages about SuttaCentral and its texts that .net has besides the texts themselves: guides, essays,
 * indexes, the map, editions and so on, grouped as in .net's menus. Their words are .net's, fetched at build
 * time (`siteStrings.js`), and their markup is in `pages/site/`.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

/**
 * Each group of related pages, linked above each other page in the group, as `{ href, label }`, the label a
 * key of .net's strings, or `{ href, text }`
 */
export const relatedPages = {
  guides: [
    { href: '/general-guide-sujato', label: 'interface:general' },
    { href: '/dn-guide-sujato', label: 'interface:long' },
    { href: '/mn-guide-sujato', label: 'interface:middle' },
    { href: '/sn-guide-sujato', label: 'interface:linked' },
    { href: '/an-guide-sujato', label: 'interface:numbered' },
  ],
  essays: [
    { href: '/discourses-guide-sujato', label: 'interface:discourses' },
    { href: '/vinaya-guide-brahmali', label: 'interface:vinaya' },
    { href: '/abhidhamma-guide-sujato', label: 'interface:abhidhamma' },
  ],
  misc: [
    { href: '/introduction', label: 'interface:introduction' },
    { href: '/start', label: 'interface:start' },
    {
      href: 'https://suttacentral.net/donations',
      label: 'interface:donations',
    },
    { href: '/map', label: 'interface:map' },
    { href: '/offline', label: 'interface:offline' },
  ],
  meta: [
    { href: '/acknowledgments', label: 'interface:acknowledgments' },
    { href: '/licensing', label: 'interface:licensing' },
    { href: '/about', label: 'interface:about' },
  ],
  tech: [
    { href: '/languages', label: 'interface:languages' },
    { href: '/numbering', label: 'interface:numbering' },
    { href: '/abbreviations', label: 'interface:abbreviations' },
    { href: '/methodology', label: 'interface:methodology' },
    { href: '/pali-tipitaka', label: 'interface:overview' },
    // .net's own name for /define, which has no key in its strings
    { href: '/define', text: 'Definitions' },
  ],
  indexes: [
    { href: '/subjects', label: 'interface:subjects' },
    { href: '/similes', label: 'interface:similes' },
    { href: '/names', label: 'interface:names' },
    { href: '/terminology', label: 'interface:terminology' },
  ],
}

/** The site pages menu in the header, as `{ heading, pages }` */
export const siteMap = [
  {
    heading: 'Explore',
    pages: [
      ...relatedPages.misc,
      { href: '/editions', label: 'publication:editionsToolbarTitle' },
    ],
  },
  { heading: 'Guides', pages: relatedPages.guides },
  { heading: 'Essays', pages: relatedPages.essays },
  { heading: 'Indexes', pages: relatedPages.indexes },
  { heading: 'Reference', pages: relatedPages.tech },
  { heading: 'About', pages: relatedPages.meta },
]

/**
 * The guides to a piṭaka or collection, on its page, as the keys of their title (`:1`) and byline (`:2`)
 */
export const pitakaGuides = {
  sutta: [
    { href: '/general-guide-sujato', label: 'general-guide-sujato' },
    { href: '/discourses-guide-sujato', label: 'discourses' },
  ],
  vinaya: [{ href: '/vinaya-guide-brahmali', label: 'vinaya' }],
  abhidhamma: [{ href: '/abhidhamma-guide-sujato', label: 'abhidhamma' }],
  dn: [{ href: '/dn-guide-sujato', label: 'dn-guide-sujato' }],
  mn: [{ href: '/mn-guide-sujato', label: 'mn-guide-sujato' }],
  sn: [{ href: '/sn-guide-sujato', label: 'sn-guide-sujato' }],
  an: [
    { href: '/an-guide-sujato', label: 'an-guide-sujato' },
    { href: '/an-introduction-bodhi', label: 'an-introduction-bodhi' },
  ],
}

/** Each page's icon, as in .net's menu, by its path, as a heroicon name */
export const pageIcons = {
  '/introduction': 'lightBulb',
  '/start': 'flag',
  'https://suttacentral.net/donations': 'heart',
  '/map': 'map',
  '/offline': 'bolt',
  '/editions': 'bookOpen',
  '/general-guide-sujato': 'academicCap',
  '/dn-guide-sujato': 'academicCap',
  '/mn-guide-sujato': 'academicCap',
  '/sn-guide-sujato': 'academicCap',
  '/an-guide-sujato': 'academicCap',
  '/an-introduction-bodhi': 'academicCap',
  '/discourses-guide-sujato': 'documentText',
  '/vinaya-guide-brahmali': 'documentText',
  '/abhidhamma-guide-sujato': 'documentText',
  '/pali-tipitaka': 'rectangleStack',
  '/define': 'bookOpen',
  '/subjects': 'tag',
  '/similes': 'sparkles',
  '/names': 'identification',
  '/terminology': 'chatBubbleBottomCenterText',
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

/** Keys the templates use only through the lists above, so the strings check can find them */
export function configKeys() {
  return [
    ...Object.values(relatedPages).flatMap(pages =>
      pages.map(p => p.label).filter(Boolean)
    ),
    ...siteMap.flatMap(({ pages }) => pages.map(p => p.label).filter(Boolean)),
    ...Object.values(pitakaGuides).flatMap(guides =>
      guides.flatMap(({ label }) => [`${label}:1`, `${label}:2`])
    ),
    ...Object.values(mapLayerKeys),
  ]
}

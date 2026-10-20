import masterData from './_masterData.js'
import siteMetaData from './_siteMetaData.js'

function generateIndexOGTags() {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': 'Tipiṭaka—the Three Baskets of the Buddhist canon',
    'og:description':
      'A fast and minimal alternative frontend for SuttaCentral.net. Early Buddhist texts, translations, and parallels. The largest collection of Buddhist suttas available in translation.',
    'og:url': `${metadata.origin}/`,
    'og:type': 'website',
    'og:site_name': metadata.title,
    'og:image': '/images/og-image2.jpg',
  })
}

/*
 * Don't need this deep nesting, and logging them breaks dev server.
 */
function removeGrandChildren(node) {
  const { children, ...rest } = node

  if (children) {
    return {
      ...rest,
      children: children.map(({ children: grandChildren, ...child }) => {
        const result = { ...child }
        if (grandChildren) result.children = [{ scx_redacted: true }]
        return result
      }),
    }
  }

  return { ...rest }
}

function flatten(nodes) {
  return nodes.flatMap(node => {
    return removeGrandChildren(node)
  })
}

function generateIndexJsonLd(data) {
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': '/#website',
      name: 'SuttaCentral Express',
      alternateName: 'SCX',
      description: `${siteMetaData.description} - Early Buddhist texts, translations, and parallels. The largest collection of Buddhist suttas available in translation.`,
      url: '/',
      sameAs: 'https://suttacentral.net',
      inLanguage: 'en',
      keywords: [
        'Buddhism',
        'Buddhist texts',
        'Pali Canon',
        'Tipitaka',
        'suttas',
        'dharma',
        'ancient texts',
        'translations',
      ],
      about: {
        '@type': 'Thing',
        name: 'Buddhist Canon',
        description:
          'The Tipiṭaka (Three Baskets) - the traditional term for the Buddhist canon',
      },
      mainEntity: {
        '@type': 'CollectionPage',
        name: 'Tipiṭaka—the Three Baskets of the Buddhist canon',
        description:
          'Collection of the three main divisions of the Buddhist canon: Vinaya Pitaka, Sutta Pitaka, and Abhidhamma Pitaka',
        hasPart: data.map(item => ({
          '@type': 'Collection',
          '@id': `/pitaka/${item.uid}`,
          name: `${item.root_name}—${item.translated_name}`,
          description: item.blurb,
          url: `${siteMetaData().origin}/pitaka/${item.uid}`,
          sameAs: `https://suttacentral.net/pitaka/${item.uid}`,
          identifier: item.uid,
          isPartOf: {
            '@id': '/#website',
          },
        })),
      },
      publisher: {
        '@type': 'Organization',
        '@id': '/#organization',
        name: 'SuttaCentral',
        url: '/',
        description: 'Early Buddhist texts, translations, and parallels',
        foundingDate: '2012',
        sameAs: ['https://suttacentral.net', 'https://github.com/suttacentral'],
      },
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: '/',
          },
        ],
      },
    },
    null,
    2
  )
}

/*
 * Returns just the data necessary for the root tipitka links.
 *
 * These are then prefixed with /pitaka in `index.md`
 * to sync URL structure with SuttaCentral.net.
 *
 * @returns
 * [
 *  { uid: 'sutta', scx_path: '/sutta', ... },
 *  { uid: 'vinaya', scx_path: '/vinaya', ... },
 *  { uid: 'abhidhamma', scx_path: '/abhidhamma', ... },
 * ]
 */
export default async function () {
  const menu = await masterData()
  const data = flatten(menu).filter(Boolean)

  return data.map(item => ({
    ...item,
    scx_json_ld: generateIndexJsonLd(data),
    scx_og_tags: generateIndexOGTags(),
  }))
}

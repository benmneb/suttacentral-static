import siteMetaData from '../data/_siteMetaData.js'

function definitionText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function excerpt(text, length = 160) {
  if (text.length <= length) return text
  const shortened = text.slice(0, length - 1)
  const boundary = shortened.lastIndexOf(' ')
  return `${shortened.slice(0, boundary > 0 ? boundary : shortened.length)}…`
}

function defineDescription(term) {
  return `Pāli dictionary results for “${term.word}”.`
}

function aliasesOf(entry, word) {
  if (entry.name !== 'dppn' || !entry.html) return []
  return [...entry.html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/gi)]
    .map(([, html]) => definitionText(html))
    .filter((name, index, names) => {
      return (
        name &&
        name.toLocaleLowerCase() !== word.toLocaleLowerCase() &&
        names.indexOf(name) === index
      )
    })
}

function dictionaryTerms(term) {
  return term.entries.flatMap(entry => {
    const descriptions = [
      ...(entry.definitions ?? []),
      entry.html,
      ...(entry.xrs ?? []).map(({ text }) => text),
    ]
      .map(definitionText)
      .filter(Boolean)
    if (!descriptions.length) return []

    const aliases = aliasesOf(entry, term.word)
    return [
      {
        '@type': 'DefinedTerm',
        name: `${term.word} (${entry.title})`,
        description: excerpt(descriptions.join(' ')),
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          name: entry.title,
        },
        ...(aliases.length && { alternateName: aliases }),
      },
    ]
  })
}

function breadcrumbs(term) {
  return [
    { name: 'Home', url: '/' },
    { name: 'Definitions', url: '/define' },
    { name: term.word, url: term.href },
  ].map((crumb, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: crumb.name,
    item: `${siteMetaData().origin}${crumb.url}`,
  }))
}

export function generateDefineOGTags(term) {
  const metadata = siteMetaData()
  const url = `${metadata.origin}${term.href}`
  const description = defineDescription(term)
  return JSON.stringify({
    'og:title': `Definitions for ${term.word}`,
    'og:description': description,
    'og:url': url,
    'og:type': 'website',
    'og:locale': 'en',
    'og:site_name': metadata.title,
    'og:image': `${metadata.origin}/images/og-image2.jpg`,
    'og:image:alt': 'SuttaCentral Express',
  })
}

export function generateDefineJsonLd(term) {
  const metadata = siteMetaData()
  const url = `${metadata.origin}${term.href}`
  const description = defineDescription(term)
  // The page, whose breadcrumb only `WebPage` can take, and the word itself, as its main entity
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': url,
      name: `Definitions for ${term.word}`,
      description,
      url,
      sameAs: `https://suttacentral.net${term.href}`,
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs(term),
      },
      mainEntity: {
        '@type': 'DefinedTerm',
        '@id': `${url}#term`,
        name: term.word,
        description,
        url,
        sameAs: `https://suttacentral.net${term.href}`,
        inLanguage: 'pli',
        inDefinedTermSet: {
          '@type': 'DefinedTermSet',
          name: 'SuttaCentral Pāli dictionaries',
          url: `${metadata.origin}/define`,
          sameAs: 'https://suttacentral.net/define',
        },
      },
      // Each dictionary's entry for the word, as `about`, which takes any Thing: `hasPart` only
      // takes the parts of a CreativeWork, and a DefinedTerm isn't one
      about: dictionaryTerms(term),
    },
    null,
    2
  )
}

export function generateDefineSearchOGTags() {
  const metadata = siteMetaData()
  return JSON.stringify({
    'og:title': 'Pāli dictionary and definitions',
    'og:description':
      'Search Pāli definitions across dictionaries and explore related terms.',
    'og:url': `${metadata.origin}/define`,
    'og:type': 'website',
    'og:locale': 'en',
    'og:site_name': metadata.title,
    'og:image': `${metadata.origin}/images/og-image2.jpg`,
    'og:image:alt': 'SuttaCentral Express',
  })
}

export function generateDefineSearchJsonLd() {
  const metadata = siteMetaData()
  return JSON.stringify(
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${metadata.origin}/define`,
      name: 'Pāli dictionary and definitions',
      description:
        'Search Pāli definitions across dictionaries and explore related terms.',
      url: `${metadata.origin}/define`,
      sameAs: 'https://suttacentral.net/define',
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${metadata.origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Definitions',
            item: `${metadata.origin}/define`,
          },
        ],
      },
      isPartOf: {
        '@type': 'WebSite',
        '@id': `${metadata.origin}/#website`,
        name: metadata.title,
      },
    },
    null,
    2
  )
}

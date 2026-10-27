import {
  absoluteUrl,
  breadcrumbList,
  excerpt,
  jsonLd,
  ogTags,
  textFromHtml,
  website,
} from './pageMetadata.js'
import { SC_ORIGIN } from './scApi.js'

function defineDescription(term) {
  return `Pāli dictionary results for “${term.word}”.`
}

function aliasesOf(entry, word) {
  if (entry.name !== 'dppn' || !entry.html) return []
  return [...entry.html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/gi)]
    .map(([, html]) => textFromHtml(html))
    .filter((name, index, names) => {
      return (
        name &&
        name.toLocaleLowerCase() !== word.toLocaleLowerCase() &&
        names.indexOf(name) === index
      )
    })
}

/** What a dictionary says of the word, as plain text, its definitions and any senses it lists */
function descriptionsOf(entry) {
  return [
    ...(entry.definitions ?? []),
    entry.html,
    ...(entry.xrs ?? []).map(({ text }) => text),
  ]
    .map(textFromHtml)
    .filter(Boolean)
}

/**
 * A definition without the headword DPD repeats before it, as "dhamma 1.01: masc. nature; character"
 * is "masc. nature; character". Only DPD writes them so: the other dictionaries' text is prose
 */
function withoutHeadword(entry, definition) {
  if (entry.name !== 'dpd') return definition
  const [, rest] = definition.match(/^[^:]+:\s*(.+)$/s) ?? []
  return rest ?? definition
}

/**
 * The first definition any dictionary gives the word, which describes the word itself rather than the
 * page, or nothing if they give none
 */
function firstDefinition(term) {
  for (const entry of term.entries) {
    const [definition] = descriptionsOf(entry)
    if (definition) return excerpt(withoutHeadword(entry, definition))
  }
}

function dictionaryTerms(term) {
  return term.entries.flatMap(entry => {
    const descriptions = descriptionsOf(entry)
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
  return breadcrumbList([
    { name: 'Home', url: '/' },
    { name: 'Definitions', url: '/define' },
    { name: term.word, url: term.href },
  ])
}

export function generateDefineOGTags(term) {
  return ogTags({
    title: `Definitions for ${term.word}`,
    description: defineDescription(term),
    url: term.href,
  })
}

export function generateDefineJsonLd(term) {
  const url = absoluteUrl(term.href)
  const description = defineDescription(term)
  // The word's own first definition, falling back to the page's description where no dictionary has one
  const termDescription = firstDefinition(term) ?? description
  // The page, whose breadcrumb only `WebPage` can take, and the word itself, as its main entity
  return jsonLd({
    '@type': 'WebPage',
    '@id': url,
    name: `Definitions for ${term.word}`,
    description,
    url,
    sameAs: `${SC_ORIGIN}${term.href}`,
    breadcrumb: breadcrumbs(term),
    isPartOf: website(),
    mainEntity: {
      '@type': 'DefinedTerm',
      '@id': `${url}#term`,
      name: term.word,
      description: termDescription,
      url,
      sameAs: `${SC_ORIGIN}${term.href}`,
      inLanguage: 'pi',
      inDefinedTermSet: {
        '@type': 'DefinedTermSet',
        name: 'SuttaCentral Pāli dictionaries',
        url: absoluteUrl('/define'),
        sameAs: `${SC_ORIGIN}/define`,
      },
    },
    // Each dictionary's entry for the word, as `about`, which takes any Thing: `hasPart` only
    // takes the parts of a CreativeWork, and a DefinedTerm isn't one
    about: dictionaryTerms(term),
  })
}

const DEFINE_SEARCH = {
  title: 'Pāli dictionary and definitions',
  description:
    'Search Pāli definitions across dictionaries and explore related terms.',
  url: '/define',
}

export function generateDefineSearchOGTags() {
  return ogTags(DEFINE_SEARCH)
}

export function generateDefineSearchJsonLd() {
  const url = absoluteUrl(DEFINE_SEARCH.url)
  return jsonLd({
    '@type': 'CollectionPage',
    '@id': url,
    name: DEFINE_SEARCH.title,
    description: DEFINE_SEARCH.description,
    url,
    sameAs: `${SC_ORIGIN}/define`,
    breadcrumb: breadcrumbList([
      { name: 'Home', url: '/' },
      { name: 'Definitions', url: '/define' },
    ]),
    isPartOf: website(),
  })
}

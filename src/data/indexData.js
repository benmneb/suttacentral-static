import masterData from './_masterData.js'
import { builds } from '../helpers/buildStage.js'
import {
  absoluteUrl,
  jsonLd,
  menuTitle,
  ogTags,
  textFromHtml,
  website,
} from '../helpers/pageMetadata.js'
import { SC_ORIGIN } from '../helpers/scApi.js'
import siteMetaData from './_siteMetaData.js'

const TITLE = 'Tipiṭaka—the Three Baskets of the Buddhist canon'

function description() {
  return `${siteMetaData().description}. Early Buddhist texts, translations, and parallels. The largest collection of Buddhist suttas available in translation.`
}

function generateIndexOGTags() {
  return ogTags({ title: TITLE, description: description(), url: '/' })
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
  const { maintainer, mirrors = [], source } = siteMetaData()
  const repositories = [source, ...mirrors].filter(Boolean)
  const home = absoluteUrl('/')
  // The site, whose name and alternate names are what search engines show for it, and its home page
  return jsonLd({
    '@graph': [
      {
        ...website(),
        alternateName: ['SCX', 'SuttaCentral.Express'],
        ...(repositories.length && { sameAs: repositories }),
        description: description(),
        inLanguage: 'en',
        isBasedOn: {
          '@type': 'WebSite',
          name: 'SuttaCentral',
          url: SC_ORIGIN,
        },
        ...(maintainer && {
          maintainer: { '@type': 'Person', ...maintainer },
        }),
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absoluteUrl('/search')}?query={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'CollectionPage',
        '@id': home,
        name: TITLE,
        description: description(),
        url: home,
        sameAs: SC_ORIGIN,
        inLanguage: 'en',
        isPartOf: { '@id': website()['@id'] },
        about: {
          '@type': 'Thing',
          name: 'Tipiṭaka',
          description: 'The three baskets of the Buddhist canon',
        },
        hasPart: data.map(item => ({
          '@type': 'Collection',
          '@id': absoluteUrl(`/pitaka/${item.uid}`),
          name: menuTitle(item),
          ...(item.blurb && { description: textFromHtml(item.blurb) }),
          url: absoluteUrl(`/pitaka/${item.uid}`),
          sameAs: `${SC_ORIGIN}/pitaka/${item.uid}`,
        })),
      },
    ],
  })
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
  if (!builds('nav')) return []
  const menu = await masterData()
  const data = flatten(menu).filter(Boolean)

  return data.map(item => ({
    ...item,
    scx_json_ld: generateIndexJsonLd(data),
    scx_og_tags: generateIndexOGTags(),
  }))
}

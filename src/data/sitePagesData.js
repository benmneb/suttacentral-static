import { AssetCache } from '@11ty/eleventy-fetch'
import { loadDictionaries } from '../helpers/dictionaries.js'
import { fetchWithRetry } from '../helpers/fetchRetry.js'
import { mapData } from '../helpers/mapPlaces.js'
import {
  abbreviationUrl,
  creatorBioUrl,
  editionBlurbsUrl,
  fetchOptions,
  githubDirectoryUrl,
  mapDataUrl,
  menuUrl,
  publicationEditionFilesUrl,
  publicationEditionUrl,
  publicationEditionsUrl,
  STRICT,
  translationCountUrl,
} from '../helpers/scApi.js'
import { buildSitePageMetadata } from '../helpers/sitePageMetadata.js'
import {
  editionCollections,
  pageIcons,
  pitakaGuides,
  siteMap,
  tidyMatter,
} from '../helpers/sitePages.js'
import { loadStrings } from '../helpers/siteStrings.js'
import { normalizeStrings } from '../helpers/strings.js'
import masterData from './_masterData.js'

const EDITIONS_REPO = 'https://github.com/suttacentral/editions'

// Named by the hash alone where the URL's query would make too long a file name. Not /menu, as the tree caches
// it by its full name, which a build reading the saved tree would otherwise fetch from .net again
function cacheOptions(url) {
  const options = fetchOptions(url)
  if (url.includes('?') && !url.includes('/api/menu/')) {
    options.filenameFormat = (cacheKey, hash) =>
      `${new URL(url).pathname.split('/').pop()}-${hash}`
  }
  return options
}

async function fetchJson(url) {
  return normalizeStrings(await fetchWithRetry(url, cacheOptions(url)))
}

/** When `url` was fetched from .net, for the footer */
function fetchedAt(url) {
  const cache = new AssetCache(url, '.cache', cacheOptions(url))
  return new Date(cache.getCachedTimestamp() ?? Date.now()).toUTCString()
}

/** `fetchJson`, or `fallback` and a warning if it fails, so one missing page doesn't fail a build that isn't `STRICT` */
async function tryFetchJson(url, fallback) {
  try {
    return await fetchJson(url)
  } catch (error) {
    console.warn(`Couldn't fetch ${url} for a site page:`, error.message)
    if (STRICT) throw error
    return fallback
  }
}

async function abbreviations() {
  const [texts, editions, schools] = await Promise.all(
    ['texts', 'editions', 'schools'].map(kind =>
      tryFetchJson(abbreviationUrl(kind), [])
    )
  )
  return { texts, editions, schools }
}

/**
 * The root languages and English, the languages built here, and a page for each with its texts grouped
 * by root language
 */
async function languages() {
  const counts = await tryFetchJson(translationCountUrl(), {
    ancient: [],
    modern: [],
  })
  const modern = counts.modern.filter(({ iso_code }) => iso_code === 'en')
  const all = [...counts.ancient, ...modern]
  const pages = await Promise.all(
    all.map(async ({ iso_code, name, percent }) => {
      const data = await tryFetchJson(translationCountUrl(iso_code), {
        division: [],
        author: [],
      })
      const groups = new Map()
      for (const division of data.division ?? []) {
        // No root language means several, which in English are all suttas, and on a root language's page are in it
        const root = division.root_lang
          ? (counts.ancient.find(l => l.iso_code === division.root_lang)
              ?.name ?? division.root_lang)
          : percent
            ? 'Suttas'
            : name
        if (!groups.has(root)) groups.set(root, [])
        groups.get(root).push(division)
      }
      return {
        uid: iso_code,
        scx_path: `languages/${iso_code}`,
        name,
        percent,
        divisions: [...groups].map(([root, divisions]) => ({
          root,
          divisions,
        })),
        authors: data.author ?? [],
      }
    })
  )
  return { ancient: counts.ancient, modern, pages }
}

// The downloads of an edition, from the editions repo through .net's proxy of GitHub's API
async function editionFiles(lang, author, uid) {
  const list = async kind => {
    const data = await tryFetchJson(
      githubDirectoryUrl(EDITIONS_REPO, `${lang}/${author}/${uid}/${kind}`),
      {}
    )
    return data.contents ?? []
  }
  const [epub, html, paperback] = await Promise.all(
    ['epub', 'html', 'paperback'].map(list)
  )
  const files = {
    epub: epub.find(f => f.name.endsWith('.epub')),
    pdf: paperback.find(
      f =>
        f.name.endsWith('.zip') &&
        !f.name.includes('-cover') &&
        !f.name.includes('-tex')
    ),
    html: html.find(f => f.name.endsWith('.html')),
    tex: paperback.find(f => f.name.includes('-tex.zip')),
  }
  const dates = Object.values(files)
    .map(file => file?.name.match(/\d{4}-\d{2}-\d{2}/)?.[0])
    .filter(Boolean)
    .sort()
  return { ...files, updated: dates.at(-1) }
}

// "./matter/foreword.html" -> { slug: "foreword", label: "Foreword" }
function matterName(file) {
  const slug = file
    .split('/')
    .pop()
    .replace(/\.html$/, '')
  const label = slug.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
  return { slug, label }
}

/**
 * The SuttaCentral Editions in English, in .net's order, each with what its own page and the pages
 * of its front matter show
 */
async function editions() {
  const all = await tryFetchJson(publicationEditionsUrl(), [])
  const [blurbs, bios] = await Promise.all([
    tryFetchJson(editionBlurbsUrl('en'), []),
    tryFetchJson(creatorBioUrl(), []),
  ])

  const found = await Promise.all(
    [...editionCollections].map(async ([uid, readHref]) => {
      const edition = id =>
        all.find(
          e =>
            e.edition_id.startsWith(`${uid}-en-`) && e.edition_id.includes(id)
        )
      const web = edition('-web_')
      if (!web) return null
      const paperback = edition('-paperback_')
      const [data, paperbackData, files, menu] = await Promise.all([
        tryFetchJson(publicationEditionUrl(web.edition_id), {}),
        paperback &&
          tryFetchJson(publicationEditionUrl(paperback.edition_id), {}),
        tryFetchJson(publicationEditionFilesUrl(web.edition_id), {}),
        tryFetchJson(menuUrl(uid), []),
      ])
      const { publication } = data
      if (!publication) return null

      const lang = publication.translation_lang_iso
      const author = publication.creator_uid
      const path = `edition/${uid}/${lang}/${author}`
      const title =
        publication.translation_title ||
        menu[0]?.translated_name?.replace('Collection', '').trim()

      return {
        uid,
        scx_path: path,
        href: `/${path}`,
        readHref,
        title,
        publication,
        blurb: blurbs.find(b => b.uid === uid)?.blurb,
        menu: menu[0],
        bio: bios.find(b => b.creator_uid === author)?.creator_biography,
        volumes: paperbackData?.edition?.volumes ?? [],
        files: await editionFiles(lang, author, uid),
        matter: (data.edition?.frontmatter ?? [])
          .filter(file => files[file])
          .map(file => ({
            ...matterName(file),
            uid,
            scx_path: `${path}/${matterName(file).slug}`,
            html: tidyMatter(files[file]),
          })),
      }
    })
  )
  return found.filter(Boolean)
}

/** A name's words without diacritics, as /search matches them, ie "Dīgha Nikāya" as "digha nikaya" */
function searchName(name) {
  return (
    name
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? ''
  )
}

/** Each collection's uid, acronym and names, ie dn, Long Discourses, Dīghanikāya, Dīgha, by uid */
async function collectionNames(uids) {
  const names = new Map()
  ;(function walk(nodes) {
    for (const node of nodes ?? []) {
      if (uids.has(node.uid) && !names.has(node.uid)) {
        names.set(node.uid, [
          node.uid,
          node.acronym,
          node.translated_name,
          node.root_name,
          node.root_name?.replace(/nikāya$/, ''),
        ])
      }
      walk(node.children)
    }
  })(await masterData())
  return names
}

/**
 * The cards /search can show above its results: each site page, and each guide and edition, found by their names
 * and their collection's, or the heading they're under in the menu, as `{ href, title, byline, icon, edition, names,
 * category, tags }`. The names are split by |, and a tag is a word a query can add to a name, ie "dn guide"
 */
async function searchCards(editionLinks) {
  const uids = [...Object.keys(pitakaGuides), ...Object.keys(editionLinks)]
  const names = await collectionNames(new Set(uids))
  for (const [uid, { title }] of Object.entries(editionLinks)) {
    names.get(uid)?.push(title)
  }
  const labels = new Map(
    siteMap.flatMap(({ pages }) =>
      pages.map(({ href, label }) => [href, label])
    )
  )
  const headings = new Map(
    siteMap.flatMap(({ heading, pages }) =>
      pages.map(({ href }) => [href, heading])
    )
  )
  const guides = new Map(
    Object.values(pitakaGuides)
      .flat()
      .map(guide => [guide.href, guide])
  )
  const guideCards = [...guides.values()].map(({ href, title, byline }) => {
    const guideUids = uids.filter(uid =>
      pitakaGuides[uid]?.some(guide => guide.href === href)
    )
    return {
      href,
      title,
      byline,
      names: [
        labels.get(href),
        title,
        ...guideUids.flatMap(uid => names.get(uid) ?? []),
      ],
      tags: 'guide guides',
    }
  })
  const editionCards = Object.entries(editionLinks).map(
    ([uid, { href, title, creator }]) => ({
      href,
      title,
      byline: creator,
      icon: 'bookOpen',
      edition: true,
      names: names.get(uid) ?? [uid, title],
      tags: 'edition editions',
    })
  )
  const pages = [...labels]
    .filter(([href]) => href.startsWith('/') && !guides.has(href))
    .map(([href, label]) => ({
      href,
      title: label,
      names: [label, href.slice(1)],
      tags: '',
    }))
  return [...pages, ...guideCards, ...editionCards].map(card => ({
    icon: pageIcons[card.href],
    ...card,
    names: [...new Set(card.names.filter(Boolean).map(searchName))].join('|'),
    category: searchName(headings.get(card.href) ?? ''),
  }))
}

/**
 * The site pages' data: the menus, and what the pages made from .net's API show
 */
export default async function () {
  const [
    stringsFetchedAt,
    dictionaries,
    abbreviationsData,
    map,
    languagesData,
    editionsData,
  ] = await Promise.all([
    loadStrings(),
    loadDictionaries(),
    abbreviations(),
    mapData(),
    languages(),
    editions(),
  ])
  const editionLinks = Object.fromEntries(
    editionsData.map(({ uid, href, title, publication }) => [
      uid,
      { href, title, creator: publication.creator_name },
    ])
  )

  return {
    siteMap,
    pageIcons,
    pitakaGuides,
    abbreviations: abbreviationsData,
    map,
    languages: languagesData,
    languagePages: languagesData.pages,
    editions: editionsData,
    pageMetadata: await buildSitePageMetadata({
      languagePages: languagesData.pages,
      editions: editionsData,
      abbreviations: abbreviationsData,
      map,
    }),
    // The editions as menus and cards link them, by collection
    editionLinks,
    searchCards: await searchCards(editionLinks),
    editionPages: editionsData,
    // For the footer, by the `fetchedFrom` a page names, or the strings for the rest
    fetchedAt: {
      strings: stringsFetchedAt,
      abbreviations: fetchedAt(abbreviationUrl('texts')),
      map: fetchedAt(mapDataUrl()),
      languages: fetchedAt(translationCountUrl()),
      editions: fetchedAt(publicationEditionsUrl()),
      dictionaries: Object.values(dictionaries)
        .filter(Boolean)
        .map(({ fetchedAt }) => fetchedAt)
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0],
    },
    matterPages: editionsData.flatMap(({ matter, title, href }) =>
      matter.map(page => ({
        ...page,
        editionTitle: title,
        editionHref: href,
      }))
    ),
  }
}

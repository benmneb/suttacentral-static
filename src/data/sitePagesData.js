import Fetch, { AssetCache } from '@11ty/eleventy-fetch'
import {
  geometryPath,
  labelPoint,
  mapBase,
  onMap,
  project,
} from '../helpers/mapBase.js'
import { mapMarkers } from '../helpers/mapMarkers.js'
import {
  editionCollections,
  mapLayerKeys,
  pageIcons,
  pitakaGuides,
  siteMap,
} from '../helpers/sitePages.js'
import { loadDictionaries } from '../helpers/dictionaries.js'
import { loadStrings } from '../helpers/siteStrings.js'
import { fetchOptions, menuUrl } from './_masterData.js'

const API = 'https://suttacentral.net/api'
const EDITIONS_REPO = 'https://github.com/suttacentral/editions'

// Named by the hash alone where the URL's query would make too long a file name
function cacheOptions(url) {
  const options = fetchOptions(url)
  if (url.includes('?')) {
    options.filenameFormat = (cacheKey, hash) =>
      `${new URL(url).pathname.split('/').pop()}-${hash}`
  }
  return options
}

function fetchJson(url) {
  return Fetch(url, cacheOptions(url))
}

/** When `url` was fetched from .net, for the footer */
function fetchedAt(url) {
  const cache = new AssetCache(url, '.cache', cacheOptions(url))
  return new Date(cache.getCachedTimestamp() ?? Date.now()).toUTCString()
}

/** `fetchJson`, or `fallback` and a warning if it fails, so one missing page doesn't fail the build */
async function tryFetchJson(url, fallback) {
  try {
    return await fetchJson(url)
  } catch (error) {
    console.warn(`Couldn't fetch ${url} for a site page:`, error.message)
    return fallback
  }
}

async function abbreviations() {
  const [texts, editions, schools] = await Promise.all(
    ['texts', 'editions', 'schools'].map(kind =>
      tryFetchJson(`${API}/abbreviation_${kind}`, [])
    )
  )
  return { texts, editions, schools }
}

// Numeric, so the journeys' 10) comes after 9), not 1)
const byName = new Intl.Collator('en', { numeric: true })

// .net's marker fills, by the name of the variable each is drawn with, as dark mode needs lighter ones
const MARKER_COLOURS = {
  '#ffc107': 'amber',
  '#ffcb61': 'gold',
  '#3b763b': 'green',
  '#717171': 'grey',
  '#b30309': 'red',
}

// Where a feature goes on the map, or nothing for one off its edges. Outlines are left to the theme's colours,
// as .net's can barely be seen on the land
function mapShape(geometry, style = {}) {
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates
    if (!onMap(lon, lat)) return null
    const [x, y] = project(lon, lat)
    return { type: 'point', x, y }
  }
  const [x, y] = labelPoint(geometry)
  if (!geometry.type.endsWith('Polygon')) {
    return { type: 'line', d: geometryPath(geometry), x, y }
  }
  return {
    type: 'area',
    d: geometryPath(geometry),
    x,
    y,
    fill: style.fillColor ?? style.color ?? '#3f5ba9',
    fillOpacity: style.fillOpacity ?? 0.2,
  }
}

/**
 * The map's places, in its layers, as `{ name, labelKey, places: [{ id, name, define, icon, shape }] }`,
 * the id of each one's popover by its `define`, and its base and marker symbols for the SVG map
 */
async function mapData() {
  const [data, base] = await Promise.all([
    tryFetchJson(`${API}/map_data`, []),
    mapBase(),
  ])
  const layers = new Map()
  for (const { properties, geometry } of data[0]?.features ?? []) {
    if (!properties?.layer) continue
    if (!layers.has(properties.layer)) layers.set(properties.layer, [])
    const icon = mapMarkers[properties.icon] ? properties.icon : 'circle'
    layers.get(properties.layer).push({
      name: properties.name,
      define: properties.define,
      icon,
      // Off the map, as .net puts them at spots far from the subcontinent (Sagga at Perth)
      shape:
        geometry &&
        properties.layer !== 'Extraterrestrial Places' &&
        mapShape(geometry, properties.style),
    })
  }
  const sortedLayers = [...layers].map(([name, places], i) => ({
    name,
    labelKey: mapLayerKeys[name],
    onMap: places.some(place => place.shape),
    places: places
      .sort((a, b) => byName.compare(a.name ?? '', b.name ?? ''))
      .map((place, j) => ({ ...place, id: `place-${i + 1}-${j + 1}` })),
  }))
  // The popover of each place on the map, by the word of its /define page, for those pages' links to it
  const placeIds = {}
  for (const { places } of sortedLayers) {
    for (const place of places) {
      if (place.define && place.shape) placeIds[place.define] ??= place.id
    }
  }
  return {
    base,
    // Each icon once, for the places to <use>, outlined in the theme's colours too
    symbols: Object.entries(mapMarkers).map(([name, svg]) => ({
      name,
      viewBox: svg.match(/viewBox="([^"]+)"/)[1],
      content: svg
        .replace(/^<svg[^>]*>|<\/svg>$/g, '')
        .replace(/fill="([^"]*)" stroke="[^"]*"/g, (match, fill) => {
          const colour = MARKER_COLOURS[fill]
          const fillStyle = colour ? `var(--map-marker-${colour})` : fill
          return `style="fill: ${fillStyle}; stroke: var(--map-marker-outline); stroke-width: 1"`
        }),
    })),
    layers: sortedLayers,
    placeIds,
  }
}

/**
 * The root languages and English, the languages built here, and a page for each with its texts grouped
 * by root language
 */
async function languages() {
  const counts = await tryFetchJson(`${API}/translation_count`, {
    ancient: [],
    modern: [],
  })
  const modern = counts.modern.filter(({ iso_code }) => iso_code === 'en')
  const all = [...counts.ancient, ...modern]
  const pages = await Promise.all(
    all.map(async ({ iso_code, name, percent }) => {
      const data = await tryFetchJson(`${API}/translation_count/${iso_code}`, {
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
    const path = encodeURIComponent(`${lang}/${author}/${uid}/${kind}`)
    const repo = encodeURIComponent(EDITIONS_REPO)
    const data = await tryFetchJson(
      `${API}/github-directory?repo_url=${repo}&path=${path}&branch=main`,
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
  const all = await tryFetchJson(`${API}/publication/editions`, [])
  const [blurbs, bios] = await Promise.all([
    tryFetchJson(`${API}/publication/edition/blurbs/en`, []),
    tryFetchJson(`${API}/creator_bio`, []),
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
        tryFetchJson(`${API}/publication/edition/${web.edition_id}`, {}),
        paperback &&
          tryFetchJson(
            `${API}/publication/edition/${paperback.edition_id}`,
            {}
          ),
        tryFetchJson(`${API}/publication/edition/${web.edition_id}/files`, {}),
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
            html: files[file],
          })),
      }
    })
  )
  return found.filter(Boolean)
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

  return {
    siteMap,
    pageIcons,
    pitakaGuides,
    abbreviations: abbreviationsData,
    map,
    languages: languagesData,
    languagePages: languagesData.pages,
    editions: editionsData,
    // The editions as menus and cards link them, by collection
    editionLinks: Object.fromEntries(
      editionsData.map(({ uid, href, title, publication }) => [
        uid,
        { href, title, creator: publication.creator_name },
      ])
    ),
    editionPages: editionsData,
    // For the footer, by the `fetchedFrom` a page names, or the strings for the rest
    fetchedAt: {
      strings: stringsFetchedAt,
      abbreviations: fetchedAt(`${API}/abbreviation_texts`),
      map: fetchedAt(`${API}/map_data`),
      languages: fetchedAt(`${API}/translation_count`),
      editions: fetchedAt(`${API}/publication/editions`),
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

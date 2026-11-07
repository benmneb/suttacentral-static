/**
 * Map Base
 *
 * Made with Natural Earth. Free vector and raster map data.
 * Public domain: https://www.naturalearthdata.com/about/terms-of-use/
 *
 * The land, rivers and borders under the places on /map as SVG paths.
 * Fetched once into `.cache` like the API data, then cut down to the part of the world the places are in,
 * thinned and Web Mercator projected (as .net's map tiles are), so the map needs nothing from online.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { fetchWithRetry } from './fetchRetry.js'
import { CACHE_DURATION, STRICT } from './scApi.js'

const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'

// Every place but the extraterrestrial ones, Yona (Greece) included
const BOX = { west: 18, east: 105, south: 5, north: 48 }

// What the map shows first, and without JS: the subcontinent
const VIEW = { west: 66, east: 92, south: 17, north: 35 }

// SVG units per degree of longitude
const SCALE = 10

// Points closer than this (in SVG units) to the last one kept are dropped, about 3km
const MIN_STEP = 0.3

// Natural Earth ranks rivers and towns from 0 or 1 (biggest), and those past these are too many to be worth
// the bytes
const MAX_RIVER_RANK = 7
const MAX_TOWN_RANK = 6

/** A longitude and latitude as SVG `[x, y]` */
export function project(lon, lat) {
  const phi = (lat * Math.PI) / 180
  const y = Math.log(Math.tan(Math.PI / 4 + phi / 2)) * (180 / Math.PI)
  return [round(lon * SCALE), round(-y * SCALE)]
}

function round(n) {
  return Math.round(n * 10) / 10
}

// A number as briefly as SVG reads it, ie 0.5 as .5 and -0.5 as -.5
function number(n) {
  return String(round(n)).replace(/^(-?)0\./, '$1.')
}

function inBox([lon, lat]) {
  return (
    lon >= BOX.west && lon <= BOX.east && lat >= BOX.south && lat <= BOX.north
  )
}

/** One edge of the box, as a test for which side a point is on and where a line crosses it */
const EDGES = [
  [p => p[0] >= BOX.west, (a, b) => crossX(a, b, BOX.west)],
  [p => p[0] <= BOX.east, (a, b) => crossX(a, b, BOX.east)],
  [p => p[1] >= BOX.south, (a, b) => crossY(a, b, BOX.south)],
  [p => p[1] <= BOX.north, (a, b) => crossY(a, b, BOX.north)],
]

function crossX([x1, y1], [x2, y2], x) {
  return [x, y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)]
}

function crossY([x1, y1], [x2, y2], y) {
  return [x1 + ((x2 - x1) * (y - y1)) / (y2 - y1), y]
}

/** A polygon ring cut to the box (Sutherland–Hodgman) */
function clipRing(ring) {
  let points = ring
  for (const [inside, cross] of EDGES) {
    const kept = []
    points.forEach((point, i) => {
      const prev = points.at(i - 1)
      if (inside(point)) {
        if (!inside(prev)) kept.push(cross(prev, point))
        kept.push(point)
      } else if (inside(prev)) {
        kept.push(cross(prev, point))
      }
    })
    points = kept
    if (!points.length) break
  }
  return points
}

/** The runs of a line inside the box, each with a point either side so it reaches the edge */
function clipLine(line) {
  const runs = []
  let run = []
  line.forEach((point, i) => {
    const near =
      inBox(point) || inBox(line[i - 1] ?? point) || inBox(line[i + 1] ?? point)
    if (near) {
      run.push(point)
    } else if (run.length) {
      runs.push(run)
      run = []
    }
  })
  if (run.length) runs.push(run)
  return runs.filter(r => r.length > 1)
}

/** SVG path data for some lines or rings, projected and thinned */
function pathData(lines, close) {
  return lines
    .map(line => {
      const points = []
      for (const [lon, lat] of line) {
        const point = project(lon, lat)
        const last = points.at(-1)
        if (
          !last ||
          Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) >=
            MIN_STEP
        ) {
          points.push(point)
        }
      }
      if (points.length < 2) return ''
      // Relative steps after the first point, as their small numbers are shorter, with no space
      // before a minus, which SVG doesn't need
      const steps = points
        .slice(1)
        .flatMap((p, i) => [p[0] - points[i][0], p[1] - points[i][1]])
        .map(number)
        .join(' ')
        .replaceAll(' -', '-')
      return `M${points[0].join(' ').replace(' -', '-')}l${steps}${close ? 'z' : ''}`
    })
    .join('')
}

/** The rings or lines of a GeoJSON geometry */
function partsOf({ type, coordinates }) {
  if (type === 'Polygon' || type === 'MultiLineString') return coordinates
  if (type === 'MultiPolygon') return coordinates.flat()
  if (type === 'LineString') return [coordinates]
  return []
}

/** SVG path data for a GeoJSON geometry, for the places' own regions and journeys */
export function geometryPath(geometry) {
  const isArea = geometry.type.endsWith('Polygon')
  return pathData(partsOf(geometry), isArea)
}

async function layer(name, keep = () => true) {
  const url = `${SOURCE}/${name}.geojson`
  const data = await fetchWithRetry(url, {
    duration: CACHE_DURATION,
    type: 'json',
    filenameFormat: (cacheKey, hash) => `natural-earth-${name}-${hash}`,
  })
  return data.features.filter(feature => feature.geometry && keep(feature))
}

// Only the subcontinent's rivers, as the places beyond it are few
function touchesView(coordinates) {
  if (typeof coordinates[0] === 'number') return inView(coordinates)
  return coordinates.some(touchesView)
}

/** Where a region or journey's name goes, in SVG units: the middle of its outline's points, or its line's */
export function labelPoint(geometry) {
  const ring = partsOf(geometry)[0] ?? []
  if (!geometry.type.endsWith('Polygon')) {
    return project(...ring[Math.floor(ring.length / 2)])
  }
  const lon = ring.reduce((sum, [x]) => sum + x, 0) / ring.length
  const lat = ring.reduce((sum, [, y]) => sum + y, 0) / ring.length
  return project(lon, lat)
}

function inView([lon, lat]) {
  return (
    lon >= VIEW.west &&
    lon <= VIEW.east &&
    lat >= VIEW.south &&
    lat <= VIEW.north
  )
}

/** Present-day towns, and countries' names, around the subcontinent, to compare with the old places */
async function presentDay() {
  const [places, countries] = await Promise.all([
    layer(
      'ne_10m_populated_places_simple',
      ({ properties }) =>
        properties.scalerank <= MAX_TOWN_RANK &&
        inView([properties.longitude, properties.latitude])
    ),
    layer('ne_110m_admin_0_countries'),
  ])
  return {
    towns: places.map(({ properties }) => {
      const [x, y] = project(properties.longitude, properties.latitude)
      return { name: properties.name, x, y, major: properties.scalerank <= 3 }
    }),
    countries: countries
      .filter(({ properties }) =>
        inView([properties.LABEL_X, properties.LABEL_Y])
      )
      .map(({ properties }) => {
        const [x, y] = project(properties.LABEL_X, properties.LABEL_Y)
        return { name: properties.NAME, x, y }
      }),
  }
}

function viewBox({ west, east, south, north }) {
  const [x1, y1] = project(west, north)
  const [x2, y2] = project(east, south)
  return `${x1} ${y1} ${round(x2 - x1)} ${round(y2 - y1)}`
}

/**
 * The base map as SVG path data, or null if Natural Earth couldn't be fetched and the build isn't `STRICT`
 * @returns {Promise<{ viewBox: string, extent: string, land: string, rivers: string, borders: string, today: object } | null>}
 */
export async function mapBase() {
  try {
    const [land, rivers, borders, today] = await Promise.all([
      layer('ne_50m_land'),
      layer(
        'ne_10m_rivers_lake_centerlines',
        ({ properties, geometry }) =>
          properties.scalerank <= MAX_RIVER_RANK &&
          touchesView(geometry.coordinates)
      ),
      layer('ne_50m_admin_0_boundary_lines_land', ({ geometry }) =>
        touchesView(geometry.coordinates)
      ),
      presentDay(),
    ])
    const areas = features =>
      pathData(
        features
          .map(feature => feature.geometry)
          .flatMap(partsOf)
          .map(clipRing)
          .filter(r => r.length > 2),
        true
      )
    const lines = features =>
      pathData(
        features
          .map(feature => feature.geometry)
          .flatMap(partsOf)
          .flatMap(clipLine),
        false
      )
    return {
      viewBox: viewBox(VIEW),
      extent: viewBox(BOX),
      land: areas(land),
      rivers: lines(rivers),
      borders: lines(borders),
      today,
    }
  } catch (error) {
    console.warn("Couldn't make the base of the map:", error.message)
    if (STRICT) throw error
    return null
  }
}

/** Whether a longitude and latitude is on the map */
export function onMap(lon, lat) {
  return inBox([lon, lat])
}

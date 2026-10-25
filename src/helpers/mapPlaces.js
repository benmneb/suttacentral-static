/**
 * Map Places
 *
 * The places on /map from .net's map data, in their layers, with where each goes on the base map, and a
 * view of each for the mini maps on /define and /search.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import Fetch from '@11ty/eleventy-fetch'
import { fetchOptions } from '../data/_masterData.js'
import { geometryPath, labelPoint, mapBase, onMap, project } from './mapBase.js'
import { mapMarkers } from './mapMarkers.js'
import { mapLayerKeys } from './sitePages.js'

const MAP_DATA = 'https://suttacentral.net/api/map_data'

// Numeric, so the journeys' 10) comes after 9), not 1)
const byName = new Intl.Collator('en', { numeric: true })

// The number a journey puts before each of its stops, as "1) Rājagaha", which no place's name starts with
const STOP_NUMBER = /^\d+\)/

// .net's marker fills, by the name of the variable each is drawn with, as dark mode needs lighter ones
const MARKER_COLOURS = {
  '#ffc107': 'amber',
  '#ffcb61': 'gold',
  '#3b763b': 'green',
  '#717171': 'grey',
  '#b30309': 'red',
}

// The mini maps are this much wider than they're high, and a town's this many SVG units across, about 600km,
// and a region's no more than this, about 2,000km
const MINI_MAP_RATIO = 1.5
const MINI_MAP_WIDTH = 60
const MINI_MAP_MAX_WIDTH = 200

const round = n => Math.round(n * 10) / 10

/** The viewBox of a mini map of some points, ie a region's outline, with some land around them */
function miniMapView(points) {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const [left, right] = [Math.min(...xs), Math.max(...xs)]
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)]
  const width = Math.min(
    Math.max(
      (right - left) * 1.2,
      (bottom - top) * 1.2 * MINI_MAP_RATIO,
      MINI_MAP_WIDTH
    ),
    MINI_MAP_MAX_WIDTH
  )
  const height = width / MINI_MAP_RATIO
  return [
    (left + right - width) / 2,
    (top + bottom - height) / 2,
    width,
    height,
  ]
    .map(round)
    .join(' ')
}

const pointsOf = coordinates =>
  typeof coordinates[0] === 'number'
    ? [coordinates]
    : coordinates.flatMap(pointsOf)

// Where a feature goes on the map, or nothing for one off its edges. Outlines are left to the theme's colours,
// as .net's can barely be seen on the land
function mapShape(geometry, style = {}) {
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates
    if (!onMap(lon, lat)) return null
    const [x, y] = project(lon, lat)
    return { type: 'point', x, y, view: miniMapView([[x, y]]) }
  }
  const [x, y] = labelPoint(geometry)
  const view = miniMapView(
    pointsOf(geometry.coordinates).map(point => project(...point))
  )
  if (!geometry.type.endsWith('Polygon')) {
    return { type: 'line', d: geometryPath(geometry), x, y, view }
  }
  return {
    type: 'area',
    d: geometryPath(geometry),
    x,
    y,
    view,
    fill: style.fillColor ?? style.color ?? '#3f5ba9',
    fillOpacity: style.fillOpacity ?? 0.2,
  }
}

/**
 * The map's places, in its layers, as `{ name, labelKey, ordered, places: [{ id, name, define, icon, shape }] }`,
 * each one's popover id, icon and shape by its `define` for the mini maps, and its base and marker symbols
 * for the SVG map
 */
async function makeMapData() {
  const [data, base] = await Promise.all([
    Fetch(MAP_DATA, fetchOptions(MAP_DATA)).catch(error => {
      console.warn(`Couldn't fetch ${MAP_DATA} for the map:`, error.message)
      return []
    }),
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
      // A journey's own route line is named after its layer, and isn't one of the places it lists
      route: properties.name === properties.layer,
      icon,
      // Off the map, as .net puts them at spots far from the subcontinent (Sagga at Perth)
      shape:
        geometry &&
        properties.layer !== 'Extraterrestrial Places' &&
        mapShape(geometry, properties.style),
    })
  }
  const sortedLayers = [...layers].map(([name, places], i) => {
    const stops = places
      .sort((a, b) => byName.compare(a.name ?? '', b.name ?? ''))
      // A journey's own route line isn't one of the places its index lists
      .filter(place => !place.route)
    return {
      name,
      labelKey: mapLayerKeys[name],
      onMap: places.some(place => place.shape),
      // A journey numbers its stops, so they're a sequence, which JSON-LD has to say as positions. The
      // other layers are sorted by name, and the order of an alphabetical list means nothing
      ordered:
        stops.length > 1 &&
        stops.every(({ name }) => STOP_NUMBER.test(name ?? '')),
      places: places.map((place, j) => ({
        ...place,
        id: `place-${i + 1}-${j + 1}`,
      })),
    }
  })
  // Each place on the map, by the word of its /define page, for those pages' and /search's mini maps of it
  const places = {}
  for (const { places: layerPlaces } of sortedLayers) {
    for (const { define, id, icon, shape } of layerPlaces) {
      if (define && shape) {
        places[define] ??= { id, icon, ...shape }
      }
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
    places,
  }
}

let map

/** The map's data, made once, as the build writes the mini maps' files from it too */
export function mapData() {
  map ??= makeMapData()
  return map
}

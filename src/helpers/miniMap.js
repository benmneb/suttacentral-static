/**
 * Mini Map
 *
 * Writes the files the mini maps of a place share, on its /define page and above /search's results:
 *
 * - `_site/map/base.svg`: the land and rivers, the marker symbols, and each region's and journey's outline,
 *   for them to `<use>`. Their colours are the page's variables, which reach into a `<use>`
 * - `_site/map/places.json`: each place's popover id on /map, icon, kind and viewBox, by its /define word
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_DIR = path.join('_site', 'map')

// Not a stroke that grows with the zoom, which a mini map's is
const LINE = 'vector-effect: non-scaling-stroke'

/** Writes the files from `mapPlaces.js`'s `mapData()`, or nothing where the base map couldn't be made */
export async function writeMiniMap({ base, symbols, layers, places }) {
  if (!base) return
  const shapes = layers.flatMap(layer =>
    layer.places.filter(place => place.shape?.d)
  )
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg">',
    ...symbols.map(
      ({ name, viewBox, content }) =>
        `<symbol id="marker-${name}" viewBox="${viewBox}">${content}</symbol>`
    ),
    '<g id="base">',
    `<path style="fill: var(--map-land); stroke: var(--map-coast); stroke-width: 0.75px; ${LINE}" d="${base.land}"/>`,
    `<path style="fill: none; stroke: var(--map-river); stroke-width: 1px; ${LINE}" d="${base.rivers}"/>`,
    '</g>',
    ...shapes.map(
      ({ id, shape }) =>
        `<path id="${id.replace('place', 'shape')}" style="${LINE}" d="${shape.d}"/>`
    ),
    '</svg>',
  ].join('\n')
  const placesJson = Object.fromEntries(
    Object.entries(places).map(([word, { id, icon, type, view, x, y }]) => [
      word,
      { id, icon, type, view, x, y },
    ])
  )
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await Promise.all([
    fs.writeFile(path.join(OUTPUT_DIR, 'base.svg'), svg),
    fs.writeFile(
      path.join(OUTPUT_DIR, 'places.json'),
      JSON.stringify(placesJson)
    ),
  ])
  console.log(`🗺️  Wrote the mini maps' base, with ${shapes.length} outlines`)
}

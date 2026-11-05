/**
 * Mini Map
 *
 * Writes the files /map and the mini maps of a place, on its /define page and above /search's results, share:
 *
 * - `_site/map/base.<hash>.svg`: the land, rivers and borders, the marker symbols, and each region's and journey's
 *   outline, for them to `<use>`. Their colours are the page's variables, which reach into a `<use>`
 * - `_site/map/places.json`: each place's popover id on /map, icon, kind and viewBox, by its /define word
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { writeHashedAsset } from './minifyAssets.js'
import { outputDir } from './outputDir.js'

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
    `<path id="land" style="fill: var(--map-land); stroke: var(--map-coast); stroke-width: 0.75px; ${LINE}" d="${base.land}"/>`,
    `<path id="rivers" style="fill: none; stroke: var(--map-river); stroke-width: 0.75px; ${LINE}" d="${base.rivers}"/>`,
    '</g>',
    `<path id="borders" style="fill: none; stroke: var(--map-coast); stroke-width: 0.5px; stroke-dasharray: 4 3; ${LINE}" d="${base.borders}"/>`,
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
  const dir = path.join(outputDir, 'map')
  await fs.mkdir(dir, { recursive: true })
  writeHashedAsset(dir, '/map', 'base.svg', svg)
  await fs.writeFile(path.join(dir, 'places.json'), JSON.stringify(placesJson))
  console.log(`🗺️  Wrote the mini maps' base, with ${shapes.length} outlines`)
}

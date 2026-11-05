/**
 * Images
 *
 * Remote images as local files in `_site/images/`, as everything has to work offline. Each is downloaded once into
 * `.cache` (again with REFETCH, like the API data), shrunk and re-encoded as AVIF, and named by a hash of its bytes
 * and the settings, so a changed image gets a new name and an unchanged one isn't encoded again.
 *
 * The images in `src/images` are copied as they are, under the same names, and vercel.json lets
 * browsers keep them for a day and then a week while refreshing, so a changed one needs a new name
 * to appear immediately.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { fetchWithRetry } from './fetchRetry.js'
import { outputDir } from './outputDir.js'
import { CACHE_DURATION } from './scApi.js'

const QUALITY = 60

const images = new Map()

/**
 * @param {string} url - The remote image
 * @param {Object} options
 * @param {string} options.dir - Its folder in `/images/`
 * @param {number} options.height - The tallest it's shown on a high density screen, which it's shrunk to
 * @returns {Promise<{ src: string, width?: number, height?: number }>} Its local path and size, or just the remote
 *   URL if it couldn't be downloaded
 */
export function localImage(url, { dir, height }) {
  const key = `${url} ${dir} ${height}`
  if (!images.has(key)) images.set(key, encode(url, dir, height))
  return images.get(key)
}

async function encode(url, dir, height) {
  try {
    const input = await fetchWithRetry(url, {
      duration: CACHE_DURATION,
      type: 'buffer',
    })
    const hash = createHash('sha256')
      .update(input)
      .update(`${height} ${QUALITY}`)
      .digest('base64url')
      .slice(0, 10)
    const name = `${path.parse(new URL(url).pathname).name}-${hash}.avif`
    const file = path.join(outputDir, 'images', dir, name)

    let info
    try {
      info = await sharp(file).metadata()
    } catch {
      await fs.mkdir(path.dirname(file), { recursive: true })
      info = await sharp(input)
        .resize({ height, withoutEnlargement: true })
        .avif({ quality: QUALITY })
        .toFile(file)
    }
    return {
      src: `/images/${dir}/${name}`,
      width: info.width,
      height: info.height,
    }
  } catch (error) {
    console.warn(
      `Couldn't make a local copy of ${url}, so it stays remote:`,
      error.message
    )
    return { src: url }
  }
}

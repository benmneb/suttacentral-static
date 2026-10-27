/**
 * Cleanup script for Pagefind UI files
 *
 * Removes unused Pagefind UI assets after the build process, from the main bundle and the
 * extra ones `searchExtras.js` writes. SCX uses a custom search UI and only import the core
 * pagefind.js, so the default UI CSS/JS files are not needed and can be safely deleted.
 * Then patches each bundle's search so one with only filters (ie `in:mn10` alone) doesn't load
 * every index chunk.
 *
 * @module cleanupPagefind
 */

import { readFile, readdir, unlink, writeFile } from 'fs/promises'

const uiFiles = [
  'pagefind-ui.css',
  'pagefind-ui.js',
  'pagefind-modular-ui.css',
  'pagefind-modular-ui.js',
  'pagefind-component-ui.css',
  'pagefind-component-ui.js',
  'pagefind-highlight.js',
]

const bundles = (await readdir('_site')).filter(dir =>
  dir.startsWith('pagefind')
)

for (const file of bundles.flatMap(dir =>
  uiFiles.map(name => `_site/${dir}/${name}`)
)) {
  try {
    await unlink(file)
    console.log(`Deleted: ${file}`)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`Error deleting ${file}:`, err)
    }
  }
}

// Pagefind 1.5 looks up the chunks for an empty term, which loose-matches all of them (~34MB)
// even though a search of filters alone needs none
const CHUNKS_CALL = 'this.backend.request_indexes(ptr,term)'
const PATCHED_CALL = `(filter_only?"[]":${CHUNKS_CALL})`
for (const file of bundles.flatMap(dir =>
  ['pagefind.js', 'pagefind-worker.js'].map(name => `_site/${dir}/${name}`)
)) {
  const js = await readFile(file, 'utf8')
  if (js.includes(PATCHED_CALL)) continue
  if (js.split(CHUNKS_CALL).length !== 2 || !js.includes('filter_only=')) {
    throw new Error(
      `${file} has changed, so its filter-only patch needs a look`
    )
  }
  await writeFile(file, js.replace(CHUNKS_CALL, PATCHED_CALL))
  console.log(`Patched: ${file}`)
}

console.log('Pagefind cleanup complete')

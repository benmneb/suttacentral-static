/**
 * Cleanup script for Pagefind UI files
 *
 * Removes unused Pagefind UI assets after the build process, from the main bundle and the
 * extra ones `searchExtras.js` writes. SCX uses a custom search UI and only import the core
 * pagefind.js, so the default UI CSS/JS files are not needed and can be safely deleted.
 *
 * @module cleanupPagefind
 */

import { readdir, unlink } from 'fs/promises'

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

console.log('Pagefind cleanup complete')

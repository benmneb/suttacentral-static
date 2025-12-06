/**
 * Cleanup script for Pagefind UI files
 *
 * Removes unused Pagefind UI assets after the build process.
 * SCX uses a custom search UI and only import the core pagefind.js,
 * so the default UI CSS/JS files are not needed and can be safely deleted.
 *
 * @module cleanupPagefind
 */

import { unlink } from 'fs/promises'

const filesToRemove = [
  '_site/pagefind/pagefind-ui.css',
  '_site/pagefind/pagefind-ui.js',
  '_site/pagefind/pagefind-modular-ui.css',
  '_site/pagefind/pagefind-modular-ui.js',
  '_site/pagefind/pagefind-highlight.js',
]

for (const file of filesToRemove) {
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

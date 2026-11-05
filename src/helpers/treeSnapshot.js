/**
 * Tree Snapshot
 *
 * With `SKIP_FETCH=1`, the finished `_masterData` tree is saved to `.tree-cache` and read back by the next
 * build, rather than walking ~129k files in `.cache` again. It's only good while the code that makes the tree
 * and `.cache` are as they were, so its key hashes both.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.join(process.cwd(), '.tree-cache')
const MANIFEST = path.join(DIR, 'manifest.json')
const CACHE_DIR = path.join(process.cwd(), '.cache')
const TREE_CODE = fileURLToPath(
  new URL('../data/_masterData.js', import.meta.url)
)
const LOCAL_IMPORT = /\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

/**
 * A hash of `_masterData.js` and every local file it imports, however deep, and of when a file was last added
 * to `.cache`
 */
function snapshotKey() {
  const hash = createHash('sha256')
  const seen = new Set()
  const files = [TREE_CODE]
  while (files.length) {
    const file = files.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const code = fs.readFileSync(file, 'utf8')
    hash.update(`${path.relative(path.dirname(TREE_CODE), file)}\0${code}\0`)
    for (const [, specifier] of code.matchAll(LOCAL_IMPORT)) {
      files.push(path.resolve(path.dirname(file), specifier))
    }
  }
  hash.update(String(fs.statSync(CACHE_DIR).mtimeMs))
  return hash.digest('hex')
}

/** Deletes the saved tree, if there is one */
export function clearTreeSnapshot() {
  fs.rmSync(DIR, { recursive: true, force: true })
}

/**
 * Saves the tree as JSON, a file per child of each root, as the whole tree is longer than a string can be.
 * Never throws
 * @param {object[]} tree - `_masterData`
 * @returns {boolean} Whether it was saved
 */
export function saveTreeSnapshot(tree) {
  try {
    clearTreeSnapshot()
    fs.mkdirSync(DIR, { recursive: true })
    const roots = tree.map((root, i) => {
      if (!Array.isArray(root?.children)) return root
      const children = root.children.map((child, j) => {
        const file = `${i}-${j}.json`
        fs.writeFileSync(path.join(DIR, file), JSON.stringify(child))
        return file
      })
      return { ...root, children }
    })
    // Last, so a save cut short leaves no snapshot to read
    fs.writeFileSync(
      MANIFEST,
      JSON.stringify({ key: snapshotKey(), savedAt: Date.now(), roots })
    )
    return true
  } catch (error) {
    console.warn(`Could not save the tree to ${DIR}:`, error.message)
    clearTreeSnapshot()
    return false
  }
}

/**
 * The saved tree and when it was saved, or null if there's none or the code or `.cache` has changed since
 * @returns {{ tree: object[], savedAt: number } | null}
 */
export function readTreeSnapshot() {
  try {
    const { key, savedAt, roots } = JSON.parse(
      fs.readFileSync(MANIFEST, 'utf8')
    )
    if (key !== snapshotKey()) return null
    for (const root of roots) {
      if (!Array.isArray(root?.children)) continue
      root.children = root.children.map(file =>
        JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'))
      )
    }
    return { tree: roots, savedAt }
  } catch {
    return null
  }
}

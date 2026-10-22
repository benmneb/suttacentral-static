/**
 * Search Extras
 *
 * Builds the Pagefind bundles /search loads only when a search needs them, from the text pages
 * already in `_site`:
 *
 *   _site/pagefind-titles/   each text's titles, for .net's `title: term`
 *
 * Run by `pnpm build:search`, after the main index.
 *
 * @module searchExtras
 */

import fs from 'fs/promises'
import path from 'path'
import * as pagefind from 'pagefind'
import { recordStat } from '../src/helpers/buildStats.js'

const SITE_DIR = '_site'
const READ_CONCURRENCY = 64

// The few entities the templates and API put in attributes
const ENTITIES = {
  amp: '&',
  quot: '"',
  '#39': "'",
  apos: "'",
  lt: '<',
  gt: '>',
}
const decode = text =>
  text.replace(/&(amp|quot|#39|apos|lt|gt);/g, (_, name) => ENTITIES[name])

/** Every `uid/lang/author/index.html` in the site, which the text pages are among */
async function candidatePages() {
  const dirs = async dir =>
    (await fs.readdir(path.join(SITE_DIR, dir), { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(dir, entry.name))
  const pages = []
  for (const uid of await dirs('')) {
    if (uid.startsWith('pagefind')) continue
    for (const lang of await dirs(uid)) {
      for (const author of await dirs(lang)) {
        pages.push(path.join(author, 'index.html'))
      }
    }
  }
  return pages
}

/**
 * A text page's details, as `data-pagefind-meta` and `data-pagefind-filter` give them to the main index,
 * or null for any other page
 */
function textPage(file, html) {
  const main = html.match(/<main\b([^>]*)>/)?.[1]
  if (!main?.includes('data-pagefind-body')) return null
  const attribute = name =>
    decode(main.match(new RegExp(` data-${name}="([^"]*)"`))?.[1] ?? '').trim()
  const header = html.slice(0, html.indexOf('<main'))
  const parts = file.split(path.sep)
  return {
    url: `/${parts.slice(0, -1).join('/')}/`,
    uid: parts[0],
    meta: {
      acronym: attribute('acronym'),
      author: attribute('author'),
      lang: attribute('lang'),
      title: attribute('title'),
      translatorsTitle: attribute('translatorstitle'),
      originalTitle: attribute('originaltitle'),
      rootLang: attribute('rootlang'),
    },
    filters: {
      in: [
        ...header.matchAll(/data-uid="([^"]*)" data-pagefind-filter="in/g),
      ].map(match => match[1]),
      author: [attribute('authoruid')],
      lang: [attribute('lang')],
    },
  }
}

/** Each bundle's index, and how it takes in a text page */
const bundles = {
  titles: {
    outputPath: path.join(SITE_DIR, 'pagefind-titles'),
    add: (index, page) =>
      index.addCustomRecord({
        url: page.url,
        content: [
          page.meta.acronym,
          page.uid,
          page.meta.originalTitle,
          page.meta.title,
          page.meta.translatorsTitle,
        ].join(' '),
        language: 'en',
        meta: page.meta,
        filters: page.filters,
      }),
  },
}

const start = Date.now()
const indexes = {}
for (const name of Object.keys(bundles)) {
  const { index, errors } = await pagefind.createIndex({ forceLanguage: 'en' })
  if (errors.length) throw new Error(`${name}: ${errors.join(', ')}`)
  indexes[name] = index
}

const files = await candidatePages()
const counts = Object.fromEntries(Object.keys(bundles).map(name => [name, 0]))
for (let i = 0; i < files.length; i += READ_CONCURRENCY) {
  await Promise.all(
    files.slice(i, i + READ_CONCURRENCY).map(async file => {
      const html = await fs
        .readFile(path.join(SITE_DIR, file), 'utf8')
        .catch(() => null)
      const page = html && textPage(file, html)
      if (!page) return
      for (const [name, bundle] of Object.entries(bundles)) {
        const { errors } = await bundle.add(indexes[name], page)
        if (errors.length)
          console.warn(`${name} ${page.url}:`, errors.join(', '))
        else counts[name]++
      }
    })
  )
}

for (const [name, { outputPath }] of Object.entries(bundles)) {
  const { errors } = await indexes[name].writeFiles({ outputPath })
  if (errors.length) throw new Error(`${name}: ${errors.join(', ')}`)
  console.log(`🔎 Wrote ${counts[name]} records to ${outputPath}`)
}
await pagefind.close()

recordStat('searchExtras', {
  ...counts,
  seconds: (Date.now() - start) / 1000,
})

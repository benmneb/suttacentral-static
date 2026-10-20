/**
 * The site pages have their words and are all built.
 *
 * Their words are fetched from .net at build time, and the markup in
 * `pages/site/` names each one by its key, so a key .net drops or renames
 * leaves a hole. The keys are checked against `.cache`, so without a build.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { siteMap } from '../tools/sitePages.js'
import {
  fetchStrings,
  STRING_FILES,
  templateKeys,
} from '../tools/siteStrings.js'
import { listSome, scanSite } from './lib/site.js'

// Characters of text a site page's <main> has at least
const MIN_TEXT_LENGTH = 20

describe('Site page strings', () => {
  it('has every key the pages use', async () => {
    const files = await Promise.all(
      STRING_FILES.map(name =>
        fetchStrings(name)
          .then(result => result.strings)
          .catch(() => ({}))
      )
    )
    const strings = Object.assign({}, ...files)
    const missing = [...templateKeys()].filter(key => !(key in strings))
    assert.equal(
      missing.length,
      0,
      `Keys .net doesn't have, which pages/site/ needs changing for:\n${listSome(missing)}`
    )
  })
})

describe('Every site page', async () => {
  const { pages } = await scanSite()
  const sitePages = [...pages.values()].filter(page => page.kind === 'site')

  it('in the menu is built', () => {
    const missing = siteMap
      .flatMap(({ pages }) => pages.map(({ href }) => href))
      .filter(href => href.startsWith('/') && !pages.has(`${href}/`))
    assert.equal(
      missing.length,
      0,
      `Site pages not built:\n${listSome(missing)}`
    )
  })

  it('has a heading and its text', () => {
    const bad = sitePages
      .filter(page => !page.h1 || page.mainTextLength < MIN_TEXT_LENGTH)
      .map(page => `${page.url}: ${page.mainTextLength} characters`)
    assert.equal(
      bad.length,
      0,
      `Site pages without a heading or text:\n${listSome(bad)}`
    )
  })

  it('includes the edition pages', () => {
    const editions = sitePages.filter(page =>
      /^\/edition\/[^/]+\/[^/]+\/[^/]+\/$/.test(page.url)
    )
    assert.ok(editions.length > 0, 'No /edition/<uid>/<lang>/<author> pages')
  })
})

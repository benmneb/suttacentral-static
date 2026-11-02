/**
 * Every page has the content its data should give it.
 *
 * Liquid prints missing data as an empty string, so a field the API stops
 * sending doesn't fail the build, it just leaves holes in pages: titles
 * like ": —", empty texts, links to "/undefined".
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import siteMetaData from '../src/data/_siteMetaData.js'
import {
  listSome,
  pageRoute,
  scanSite,
  SITE_DIR,
  UNLISTED_PAGES,
} from './lib/site.js'

// Characters of text a text page's <main> has at least, besides its parallels
// and popovers. The shortest real texts are a line or two of verse
const MIN_TEXT_LENGTH = 20

// A text's title is "AN 1.1: Rūpādivagga—Bhikkhu Sujato", or "AN 1.1—Bhikkhu Sujato" for a sutta of a range
const TEXT_TITLE = /^[^:—]*\S(: \S.*)?—\S.*$/

function failures(pages, isBad, describeBad = page => page.url) {
  return [...pages.values()].filter(isBad).map(describeBad)
}

const { pages } = await scanSite()

describe('Every page', () => {
  it('has a title', () => {
    const bad = failures(pages, page => !page.title)
    assert.equal(bad.length, 0, `Pages without a <title>:\n${listSome(bad)}`)
  })

  // Everything has to work offline, so a remote image is one that couldn't be downloaded at build time
  it('has no images from off the site', () => {
    const bad = failures(
      pages,
      page => page.remoteImages.length > 0,
      page => `${page.url}: ${page.remoteImages.slice(0, 3).join(', ')}`
    )
    assert.equal(bad.length, 0, `Pages with remote images:\n${listSome(bad)}`)
  })

  it('has no links built from missing data', () => {
    const bad = failures(
      pages,
      page => page.brokenLinks.length > 0,
      page => `${page.url}: ${page.brokenLinks.slice(0, 3).join(', ')}`
    )
    assert.equal(
      bad.length,
      0,
      `Links with undefined/null/NaN in them:\n${listSome(bad)}`
    )
  })

  it('uses only icons its stylesheets have', () => {
    const iconsIn = new Map()
    const iconsOf = sheet => {
      if (!iconsIn.has(sheet)) {
        const css = fs.readFileSync(
          path.join(SITE_DIR, 'styles', sheet),
          'utf8'
        )
        iconsIn.set(
          sheet,
          new Set([...css.matchAll(/\.i-([A-Za-z0-9]+)[,{]/g)].map(m => m[1]))
        )
      }
      return iconsIn.get(sheet)
    }
    const missingIcons = page =>
      page.icons.filter(
        icon => !page.stylesheets.some(sheet => iconsOf(sheet).has(icon))
      )
    const bad = failures(
      pages,
      page => missingIcons(page).length > 0,
      page => `${page.url}: ${missingIcons(page).join(', ')}`
    )
    assert.equal(
      bad.length,
      0,
      `Icons in none of the page's stylesheets:\n${listSome(bad)}`
    )
  })

  it('has no titles built from missing data', () => {
    const bad = failures(
      pages,
      page => /\b(undefined|null|NaN)\b|\[object /.test(page.title),
      page => `${page.url}: ${page.title}`
    )
    assert.equal(
      bad.length,
      0,
      `Titles with undefined/null/NaN in them:\n${listSome(bad)}`
    )
  })
})

describe('Every page’s metadata', () => {
  const { origin, description } = siteMetaData()
  const listed = new Map(
    [...pages].filter(([url]) => !UNLISTED_PAGES.includes(url))
  )

  it('has one canonical link, to itself', () => {
    const bad = failures(
      new Map([...pages].filter(([url]) => url !== '/404.html')),
      page =>
        page.canonicals.length !== 1 ||
        decodeURI(page.canonicals[0]) !== `${origin}${pageRoute(page.url)}`,
      page => `${page.url}: ${page.canonicals.join(', ') || 'none'}`
    )
    assert.equal(
      bad.length,
      0,
      `Pages with a wrong canonical:\n${listSome(bad)}`
    )
  })

  it('has JSON-LD with absolute URLs and no missing data', () => {
    const bad = failures(
      listed,
      page => page.jsonLdProblems.length > 0,
      page => `${page.url}: ${page.jsonLdProblems.join('; ')}`
    )
    assert.equal(bad.length, 0, `Pages with bad JSON-LD:\n${listSome(bad)}`)
  })

  it('has a description of its own', () => {
    const bad = failures(
      listed,
      page => !page.description || page.description === description
    )
    assert.equal(
      bad.length,
      0,
      `Pages with only the site's description:\n${listSome(bad)}`
    )
  })
})

describe('Every text page', () => {
  const texts = new Map([...pages].filter(([, page]) => page.kind === 'text'))

  it('has an acronym, title and author in its <title>', () => {
    const bad = failures(
      texts,
      page => !TEXT_TITLE.test(page.title),
      page => `${page.url}: "${page.title}"`
    )
    assert.equal(
      bad.length,
      0,
      `Text pages with a malformed title:\n${listSome(bad)}`
    )
  })

  it('has its text', () => {
    const bad = failures(
      texts,
      page => page.segments === 0 && page.mainTextLength < MIN_TEXT_LENGTH,
      page => `${page.url}: ${page.mainTextLength} characters`
    )
    assert.equal(bad.length, 0, `Text pages with no text:\n${listSome(bad)}`)
  })

  it('is searchable', () => {
    const bad = failures(texts, page => !page.searchable)
    assert.equal(
      bad.length,
      0,
      `Text pages without data-pagefind-body:\n${listSome(bad)}`
    )
  })
})

describe('Every navigation page', () => {
  const navs = new Map(
    [...pages].filter(
      ([, page]) => page.kind === 'nav' || page.kind === 'pitaka'
    )
  )

  it('links to something', () => {
    const bad = failures(navs, page => page.mainLinks === 0)
    assert.equal(
      bad.length,
      0,
      `Navigation pages with no links:\n${listSome(bad)}`
    )
  })
})

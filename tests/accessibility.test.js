/**
 * A sample of every kind of page has no accessibility problems axe-core can find,
 * by WCAG 2.2 A and AA and axe's best practices, and by AAA with more contrast.
 *
 * Each runs in a headless browser, in light and dark mode, on a phone's width and
 * with `prefers-contrast: more`, so it's a sample rather than every page: the sample builds' pages, and the
 * first few of each kind of page in each collection.
 *
 * Uses Brave or Chrome, whichever is installed, or `BROWSER_PATH`.
 * `AXE_PAGES=/mn1/en/sujato/,/about/` checks just those, and `AXE_MAX_PAGES` caps the sample.
 */

import axe from 'axe-core'
import assert from 'node:assert/strict'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import puppeteer from 'puppeteer-core'
import sirv from 'sirv'
import { defineSample } from '../src/helpers/samplePages.js'
import {
  collectionOf,
  listSome,
  pageKind,
  scanSite,
  SITE_DIR,
  UNLISTED_PAGES,
} from './lib/site.js'

const MAX_PAGES = Number(process.env.AXE_MAX_PAGES) || 300
const PAGES_PER_GROUP = 2
const TABS = 4

const AXE_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
  'best-practice',
]
// Only AAA where there's more contrast, as the other runs cover the rest
const MORE_CONTRAST_TAGS = ['wcag2aaa']

const desktop = { width: 1280, height: 800, open: true, tags: AXE_TAGS }
const VARIANTS = [
  { ...desktop, name: 'light', scheme: 'light' },
  { ...desktop, name: 'dark', scheme: 'dark' },
  {
    ...desktop,
    name: 'phone',
    width: 375,
    height: 812,
    scheme: 'light',
    open: false,
  },
  {
    ...desktop,
    name: 'light, more contrast',
    scheme: 'light',
    contrast: 'more',
    tags: MORE_CONTRAST_TAGS,
  },
  {
    ...desktop,
    name: 'dark, more contrast',
    scheme: 'dark',
    contrast: 'more',
    tags: MORE_CONTRAST_TAGS,
  },
]

const BROWSERS = [
  process.env.BROWSER_PATH,
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

/** The uids `pnpm build:sample` builds */
function sampleBuildUids() {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'))
  return scripts['build:sample'].match(/ONLY_UIDS:-([^}]*)/)[1].split(',')
}

/** The pages to check: the sample builds' pages first, then the first few of each kind in each collection */
function samplePages(urls) {
  if (process.env.AXE_PAGES) return process.env.AXE_PAGES.split(',')
  const uids = sampleBuildUids()
  const isSample = url => {
    const first = url.split('/')[1]
    return (
      uids.includes(first) ||
      uids.some(uid => url === `/pitaka/${uid}/`) ||
      defineSample.some(word => url === `/define/${word}/`)
    )
  }
  const sorted = [...urls].sort()
  const picked = new Set(['/', ...UNLISTED_PAGES, ...sorted.filter(isSample)])
  const groups = Map.groupBy(
    sorted,
    url => `${pageKind(url)} ${collectionOf(url)}`
  )
  for (let i = 0; i < PAGES_PER_GROUP; i++) {
    for (const group of groups.values()) if (group[i]) picked.add(group[i])
  }
  return [...picked].slice(0, MAX_PAGES)
}

/** Serves the site on a free port, like `pnpm dev` but as built */
async function serveSite() {
  const assets = sirv(SITE_DIR, {
    dev: true,
    onNoMatch(req, res) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      createReadStream(path.join(SITE_DIR, '404.html')).pipe(res)
    },
  })
  const server = createServer(assets)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return server
}

/** Each axe violation on a page, as one string per element, or why it didn't load */
async function violationsOn(page, origin, url, pending) {
  const found = []
  for (const variant of VARIANTS) {
    // Not resized on the last page, which can take minutes to lay out again
    await page.goto('about:blank')
    await page.setViewport({ width: variant.width, height: variant.height })
    await page.emulateMediaFeatures([
      { name: 'prefers-color-scheme', value: variant.scheme },
      { name: 'prefers-contrast', value: variant.contrast ?? 'no-preference' },
    ])
    pending.clear()
    try {
      // Not waitUntil load, which headless Brave sometimes never fires for a mini map's <use>
      await page.goto(`${origin}${encodeURI(url)}`, {
        waitUntil: 'domcontentloaded',
      })
      await page.waitForNetworkIdle({ idleTime: 250 })
    } catch (error) {
      const waiting = [...pending].map(request => request.url()).join(' ')
      found.push({
        rule: `Didn't load: ${error.message}`,
        place: `${url} [${variant.name}] waiting on ${waiting || 'nothing'}`,
      })
      continue
    }
    if (variant.open) {
      await page.evaluate(() => {
        for (const details of document.querySelectorAll('details')) {
          details.open = true
        }
      })
    }
    await page.addScriptTag({ content: axe.source })
    const violations = await page
      .evaluate(
        tags => axe.run(document, { runOnly: { type: 'tag', values: tags } }),
        variant.tags
      )
      .then(results => results.violations)
    for (const { id, impact, help, helpUrl, nodes } of violations) {
      for (const node of nodes) {
        found.push({
          rule: `${id} (${impact}): ${help} ${helpUrl}`,
          place: `${url} [${variant.name}] ${node.target.join(' ')}`,
        })
      }
    }
  }
  return found
}

describe('Accessibility', async () => {
  const { pages } = await scanSite()
  const urls = samplePages(new Set(pages.keys()))
  let server
  let browser
  let profile

  before(async () => {
    server = await serveSite()
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'scx-axe-'))
    const executablePath = BROWSERS.find(file => file && existsSync(file))
    if (!executablePath) return
    browser = await puppeteer.launch({
      executablePath,
      userDataDir: profile,
      headless: true,
      args: [
        // Nothing off the site, ie the analytics, so tests never count as visits
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--no-proxy-server',
        // Ubuntu's AppArmor stops Chrome's sandbox on GitHub's runners
        ...(process.env.CI ? ['--no-sandbox'] : []),
      ],
    })
  })

  after(async () => {
    await browser?.close()
    server?.close()
    if (profile) await fs.rm(profile, { recursive: true, force: true })
  })

  it(
    `has no axe violations on ${urls.length} pages`,
    { timeout: 2 * 60 * 60 * 1000 },
    async () => {
      assert.ok(
        browser,
        'No Brave or Chrome found, so set BROWSER_PATH to a Chromium browser'
      )
      const origin = `http://127.0.0.1:${server.address().port}`
      const queue = [...urls]
      const found = []
      const openTab = async () => {
        const page = await browser.newPage()
        const pending = new Set()
        page.on('request', request => pending.add(request))
        page.on('requestfinished', request => pending.delete(request))
        page.on('requestfailed', request => pending.delete(request))
        return { page, pending }
      }
      const next = async () => {
        let tab = await openTab()
        for (let url; browser.connected && (url = queue.shift()); ) {
          try {
            found.push(
              ...(await violationsOn(tab.page, origin, url, tab.pending))
            )
          } catch (error) {
            found.push({ rule: `Couldn't check: ${error.message}`, place: url })
            // A crashed tab can't load the next page
            if (browser.connected) {
              await tab.page.close().catch(() => {})
              tab = await openTab()
            }
          }
        }
        if (browser.connected) await tab.page.close()
      }
      await Promise.all(Array.from({ length: TABS }, next))
      if (queue.length > 0) {
        found.push({
          rule: `The browser closed, so ${queue.length} pages weren't checked`,
          place: queue[0],
        })
      }

      const byRule = Map.groupBy(found, ({ rule }) => rule)
      const report = [...byRule]
        .sort(([, a], [, b]) => b.length - a.length)
        .map(
          ([rule, items]) =>
            `${rule} (${items.length})\n${items
              .slice(0, 5)
              .map(({ place }) => `    ${place}`)
              .join('\n')}`
        )
      assert.equal(
        byRule.size,
        0,
        `${byRule.size} kinds of accessibility problem:\n${listSome(report, 30)}`
      )
    }
  )
})

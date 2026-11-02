/**
 * Pages match the API data they were built from.
 *
 * One page for each shape of data the build handles. Each is compared with the
 * API responses behind it, read back from the build's own `.cache`, so these
 * keep passing when SuttaCentral edits a text, and fail when the page and its
 * data stop matching.
 */

import Fetch from '@11ty/eleventy-fetch'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  fetchOptions,
  leafUrl,
  menuUrl,
  parallelsUrl,
  segmentedTranslationUrl,
  suttasUrl,
} from '../src/helpers/scApi.js'
import { decodeEntities, readPage, scanSite, textOf } from './lib/site.js'

/**
 * The response the build used, from `.cache`. Never fetched, as the page was built from
 * what's cached, and anything else would be comparing it with different data
 * @param {string} url
 */
async function api(url) {
  const cache = Fetch.Fetch(url, fetchOptions(url, '*'))
  assert.ok(
    cache.isCacheValid('*'),
    `${url} isn't in .cache, was the site built here?`
  )
  return cache.getCachedValue()
}

// The same translations `_masterData.js` builds pages for
const builtTranslations = suttaplex =>
  suttaplex.translations.filter(t => t.lang === 'en' || t.is_root)

const normalise = str => decodeEntities(str).replace(/\s+/g, ' ').trim()

const titleOf = html =>
  normalise(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '')

const segmentIds = html =>
  [...html.matchAll(/<span id="([^"]+)" class="segment"[ >]/g)].map(m => m[1])

const parallelCount = html =>
  html.match(/class="parallel-list-item-(full|mention)"/g)?.length ?? 0

/**
 * Asserts the parts every text page shares: its title, a link to every built
 * translation, and every parallel. A range sutta's parallels are its own share
 * of the range's, so those are only checked on the range page.
 */
async function assertTextPage({ uid, lang, author, html, rangeSutta }) {
  const [suttaplex] = await api(leafUrl(rangeSutta?.range ?? uid))
  const translation = suttaplex.translations.find(
    t => t.lang === lang && t.author_uid === author
  )
  assert.ok(
    translation,
    `/suttaplex/${uid} has no ${lang}/${author} translation`
  )

  const expectedTitle = rangeSutta
    ? `${rangeSutta.acronym}—${translation.author}`
    : `${suttaplex.acronym}: ${suttaplex.original_title}—${translation.author}`
  assert.equal(titleOf(html), normalise(expectedTitle))

  const linkUid = rangeSutta?.range ?? uid
  for (const t of builtTranslations(suttaplex)) {
    const href = `/${t.segmented || !rangeSutta ? uid : linkUid}/${t.lang}/${t.author_uid}`
    assert.ok(
      html.includes(`href="${href}"`),
      `No link to the ${href} translation`
    )
  }

  if (!rangeSutta) {
    const parallels = await api(parallelsUrl(uid))
    const expected = Object.values(parallels)
      .filter(Array.isArray)
      .reduce((sum, list) => sum + list.length, 0)
    assert.equal(
      parallelCount(html),
      expected,
      'Parallels on the page vs from /parallels'
    )
  }
}

/**
 * Asserts a segmented page has a segment for each key, with its text
 * @param {string} html
 * @param {Object} bilara - The /bilarasuttas response
 * @param {'root_text' | 'translation_text'} field - Which text the page shows
 * @param {string[]} keys - The keys the page shows
 */
function assertSegments(html, bilara, field, keys) {
  assert.deepEqual(segmentIds(html), keys, 'Segments on the page vs keys_order')
  const withText = keys.filter(key => bilara[field][key]?.trim())
  assert.ok(withText.length > 0, `No ${field} in /bilarasuttas`)
  const page = normalise(html)
  for (const key of [withText[0], withText.at(-1)]) {
    const text = normalise(bilara[field][key])
    assert.ok(
      page.includes(text),
      `The ${field} of ${key} isn't on the page: "${text}"`
    )
  }
}

/**
 * Asserts a legacy (unsegmented) page has its text, by a run of words from the middle
 * of it, clear of the header and footer the template rearranges
 * @param {string} html
 * @param {string} url - The /suttas URL it was built from
 */
async function assertLegacyText(html, url) {
  const suttas = await api(url)
  const body = suttas.translation?.text?.split('</header>').at(-1) ?? ''
  const words = textOf(body.split('<footer')[0]).split(' ')
  assert.ok(words.length > 12, `${url} has no text`)
  const middle = Math.floor(words.length / 2)
  const excerpt = words.slice(middle, middle + 12).join(' ')
  assert.ok(
    normalise(textOf(html)).includes(excerpt),
    `"${excerpt}" isn't on the page`
  )
}

const { pages } = await scanSite()

describe('Golden pages', () => {
  const page = async url => {
    assert.ok(pages.has(url), `${url} wasn't built`)
    return readPage(url)
  }

  it('segmented translation: /mn1/en/sujato', async () => {
    const html = await page('/mn1/en/sujato/')
    await assertTextPage({ uid: 'mn1', lang: 'en', author: 'sujato', html })
    const bilara = await api(segmentedTranslationUrl('mn1', 'sujato', 'en'))
    assertSegments(html, bilara, 'translation_text', bilara.keys_order)
  })

  it('root text: /mn1/pli/ms', async () => {
    const html = await page('/mn1/pli/ms/')
    await assertTextPage({ uid: 'mn1', lang: 'pli', author: 'ms', html })
    const bilara = await api(segmentedTranslationUrl('mn1', 'ms', 'pli'))
    assertSegments(html, bilara, 'root_text', bilara.keys_order)
  })

  it('legacy translation: /mn1/en/bodhi', async () => {
    const html = await page('/mn1/en/bodhi/')
    await assertTextPage({ uid: 'mn1', lang: 'en', author: 'bodhi', html })
    await assertLegacyText(html, suttasUrl('mn1', 'bodhi', 'en'))
  })

  it('range: /an1.1-10/en/sujato', async () => {
    const html = await page('/an1.1-10/en/sujato/')
    await assertTextPage({
      uid: 'an1.1-10',
      lang: 'en',
      author: 'sujato',
      html,
    })
    const bilara = await api(
      segmentedTranslationUrl('an1.1-10', 'sujato', 'en')
    )
    assertSegments(html, bilara, 'translation_text', bilara.keys_order)
  })

  it('sutta of a range: /an1.1/en/sujato', async () => {
    const html = await page('/an1.1/en/sujato/')
    await assertTextPage({
      uid: 'an1.1',
      lang: 'en',
      author: 'sujato',
      html,
      rangeSutta: { range: 'an1.1-10', acronym: 'AN 1.1' },
    })
    const bilara = await api(
      segmentedTranslationUrl('an1.1-10', 'sujato', 'en')
    )
    const ownKeys = bilara.keys_order.filter(key => key.startsWith('an1.1:'))
    assert.ok(ownKeys.length > 0, 'No an1.1 keys in /bilarasuttas/an1.1-10')
    // Its own segments, and none of the next sutta's
    const ids = segmentIds(html)
    for (const key of ownKeys) assert.ok(ids.includes(key), `No segment ${key}`)
    assert.ok(!ids.some(id => id.startsWith('an1.2:')), 'Has segments of an1.2')
  })

  it('vinaya: /pli-tv-bu-vb-pj1/en/brahmali', async () => {
    const html = await page('/pli-tv-bu-vb-pj1/en/brahmali/')
    await assertTextPage({
      uid: 'pli-tv-bu-vb-pj1',
      lang: 'en',
      author: 'brahmali',
      html,
    })
    const bilara = await api(
      segmentedTranslationUrl('pli-tv-bu-vb-pj1', 'brahmali', 'en')
    )
    assertSegments(html, bilara, 'translation_text', bilara.keys_order)
  })

  it('abhidhamma root text: /ds1.1/pli/ms', async () => {
    const html = await page('/ds1.1/pli/ms/')
    await assertTextPage({ uid: 'ds1.1', lang: 'pli', author: 'ms', html })
    const bilara = await api(segmentedTranslationUrl('ds1.1', 'ms', 'pli'))
    assertSegments(html, bilara, 'root_text', bilara.keys_order)
  })

  it('abhidhamma translation: /ds1.1/en/sujato', async () => {
    const html = await page('/ds1.1/en/sujato/')
    await assertTextPage({ uid: 'ds1.1', lang: 'en', author: 'sujato', html })
    await assertLegacyText(html, suttasUrl('ds1.1', 'sujato', 'en'))
  })

  it('pātimokkha: /pli-tv-bu-pm/en/brahmali', async () => {
    const html = await page('/pli-tv-bu-pm/en/brahmali/')
    const bilara = await api(
      segmentedTranslationUrl('pli-tv-bu-pm', 'brahmali', 'en')
    )
    assertSegments(html, bilara, 'translation_text', bilara.keys_order)
  })

  it('home: /', async () => {
    const html = await page('/')
    for (const pitaka of ['sutta', 'vinaya', 'abhidhamma']) {
      assert.ok(
        html.includes(`href="pitaka/${pitaka}"`),
        `No link to the ${pitaka} piṭaka`
      )
    }
  })

  it('piṭaka: /pitaka/sutta', async () => {
    const html = await page('/pitaka/sutta/')
    const [menu] = await api(menuUrl('sutta'))
    assert.ok(menu.children?.length > 0, '/menu/sutta has no children')
    for (const child of menu.children) {
      assert.ok(
        html.includes(`href="/pitaka/sutta/${child.uid}/"`),
        `No link to /pitaka/sutta/${child.uid}/`
      )
    }
  })

  it('collection: /mn', async () => {
    const html = await page('/mn/')
    const [menu] = await api(menuUrl('mn'))
    assert.ok(menu.children?.length > 0, '/menu/mn has no children')
    for (const child of menu.children) {
      const heading = normalise(`${child.root_name}—${child.translated_name}`)
      assert.ok(normalise(html).includes(heading), `No heading "${heading}"`)
    }
  })

  it('chapter: /mn-mulapariyayavagga', async () => {
    const html = await page('/mn-mulapariyayavagga/')
    const [menu] = await api(menuUrl('mn-mulapariyayavagga'))
    assert.ok(
      menu.children?.length > 0,
      '/menu/mn-mulapariyayavagga has no children'
    )
    for (const child of menu.children) {
      assert.ok(
        html.includes(`href="/${child.uid}/`),
        `No links to ${child.uid}'s texts`
      )
    }
  })
})

/**
 * The build fetched the whole site from SuttaCentral's APIs.
 *
 * A full build stops on a failed fetch, and any other build leaves that branch
 * or text out of the site, so this checks the stats for either.
 */

import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { describe, it } from 'node:test'

// The last full fetch hit ~129,000 endpoints
const MIN_ENDPOINTS = 100_000

// Failures other than /publication_info, which fails for most translators
// (only root texts and some translators have data there)
const MAX_FETCH_ERRORS = 0

const statsFile = path.join(process.cwd(), '.build-stats.json')

describe('API fetch', () => {
  const stats = fs.existsSync(statsFile)
    ? JSON.parse(fs.readFileSync(statsFile, 'utf8'))
    : {}

  it('recorded its stats', () => {
    assert.ok(
      stats.fetch,
      `No fetch stats in ${statsFile}, was the site built in this directory?`
    )
  })

  it(`hit at least ${MIN_ENDPOINTS.toLocaleString('en-US')} endpoints`, () => {
    assert.ok(
      stats.fetch?.endpointsHit >= MIN_ENDPOINTS,
      `Only ${stats.fetch?.endpointsHit} endpoints were hit`
    )
  })

  it('fetched every dictionary', () => {
    const counts = stats.dictionaries ?? {}
    const failed = Object.keys(counts).filter(name => !counts[name])
    assert.ok(stats.dictionaries, 'No dictionary stats were recorded')
    assert.equal(failed.length, 0, `Couldn't fetch: ${failed.join(', ')}`)
  })

  it('had no failed fetches, other than /publication_info', () => {
    const errors = stats.fetch?.fetchErrors - stats.fetch?.pubInfoErrors
    assert.ok(
      errors <= MAX_FETCH_ERRORS,
      `${errors} fetches failed (see "Fetch error" in the build log)`
    )
  })
})

/**
 * Internal links go to pages that exist.
 *
 * The API links texts that may not exist (see `tools/textLinks.js`), and those
 * are pointed at pages that do at build time, so a jump in dead links means
 * data changed under that. A few are known and left as they are, like parallels
 * in languages that aren't built (ie vi).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { listSome, resolves, scanSite } from './lib/site.js'

// Dead link targets in the last full build, plus some headroom
const MAX_DEAD_LINKS = 0

describe('Internal links', async () => {
  const { files, linkSources } = await scanSite()

  it(`have at most ${MAX_DEAD_LINKS} dead targets`, () => {
    const dead = [...linkSources]
      .filter(([target]) => !resolves(files, target))
      .map(([target, source]) => `${target} (linked from ${source})`)
    assert.ok(
      dead.length <= MAX_DEAD_LINKS,
      `${dead.length} link targets don't exist:\n${listSome(dead)}`
    )
  })
})

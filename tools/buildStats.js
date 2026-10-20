/**
 * Build Stats
 *
 * Prints the stats from `src/helpers/buildStats.js` after a build, and adds them to `$GITHUB_OUTPUT` in CI.
 * Never throws or exits non-zero, so stats can't break a build.
 */

import fs from 'fs'
import { collect } from '../src/helpers/buildStats.js'

try {
  const outputs = collect()
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`)
  console.log(lines.join('\n'))
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n')
  }
} catch (e) {
  console.warn('Could not collect build stats:', e.message)
}

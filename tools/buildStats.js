/**
 * Build Stats
 *
 * Collects stats during the build so CI can show them in the release body
 * without scraping log output from third-party packages.
 *
 * Writes numbers to `.build-stats.json`.
 *
 * After the build, the CLI reads that file plus Pagefind's own manifest and
 * writes formatted values to `$GITHUB_OUTPUT`. Every value falls back to `n/a`
 * and nothing here ever throws or exits non-zero, so stats can't break a build.
 *
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const statsFile = path.join(process.cwd(), '.build-stats.json')
const pagefindEntry = path.join(
  process.cwd(),
  '_site',
  'pagefind',
  'pagefind-entry.json'
)
const buildLog = path.join(process.cwd(), 'build.log')

const NA = 'n/a'

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
}

/**
 * Merge a value into `.build-stats.json` under `key`. Never throws.
 * @param {string} key
 * @param {unknown} value
 */
export function recordStat(key, value) {
  if (process.env.ONLY_UIDS) return
  try {
    const stats = readJson(statsFile)
    stats[key] = value
    fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2))
  } catch (e) {
    console.warn(`Could not record build stat "${key}":`, e.message)
  }
}

const num = n => (Number.isFinite(n) ? n.toLocaleString('en-US') : NA)

function duration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return NA
  const s = Math.round(seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

function safe(fn) {
  try {
    return fn() ?? NA
  } catch {
    return NA
  }
}

function collect() {
  const stats = readJson(statsFile)
  const buildSeconds = Number.parseFloat(process.env.BUILD_SECONDS)
  const eleventySeconds = stats.eleventy?.seconds

  const fetchSummary = safe(() => {
    const f = stats.fetch
    if (!Number.isFinite(f?.endpointsHit)) return NA
    const rate =
      f.endpointsHit > 0
        ? ((f.successCount / f.endpointsHit) * 100).toFixed(1)
        : 0
    return `${num(f.successCount)}/${num(f.endpointsHit)} endpoints OK (${rate}%) in ~${f.elapsedMins.toFixed(1)} mins`
  })

  // Empty when there were no failures, so the release body can omit the line
  const fetchFailures = safe(() => {
    const f = stats.fetch
    if (!Number.isFinite(f?.fetchErrors)) return NA
    if (f.fetchErrors === 0) return ''
    const parts = [`${num(f.fetchErrors)} failed`]
    if (f.pubInfoErrors > 0)
      parts.push(`${num(f.pubInfoErrors)} from /publication_info`)
    if (f.cacheTimeErrors > 0)
      parts.push(`${num(f.cacheTimeErrors)} cache timestamp errors`)
    return parts.length > 1
      ? `${parts[0]} (${parts.slice(1).join(', ')})`
      : parts[0]
  })

  const assetsSummary = safe(() => {
    const files = [stats.assetsCss, stats.assetsJs].filter(Array.isArray).flat()
    if (files.length === 0) return NA
    const original = files.reduce((sum, f) => sum + f.originalSize, 0)
    const minified = files.reduce((sum, f) => sum + f.minifiedSize, 0)
    if (
      !Number.isFinite(original) ||
      !Number.isFinite(minified) ||
      original === 0
    )
      return NA
    const saved = (((original - minified) / original) * 100).toFixed(1)
    return `${files.length} files, ${num(original)} → ${num(minified)} bytes (−${saved}%)`
  })

  const searchPages = safe(() => {
    const languages = Object.values(readJson(pagefindEntry).languages ?? {})
    if (languages.length === 0) return NA
    return num(languages.reduce((sum, l) => sum + l.page_count, 0))
  })

  // Pagefind only reports this in its log output, so it's best-effort
  const searchWords = safe(() => {
    const match = fs
      .readFileSync(buildLog, 'utf8')
      .match(/Indexed ([\d,]+) words/)
    return match ? num(Number(match[1].replaceAll(',', ''))) : NA
  })

  return {
    build_duration: duration(buildSeconds),
    eleventy_duration: duration(eleventySeconds),
    search_duration: duration(buildSeconds - eleventySeconds),
    eleventy_files: num(stats.eleventy?.files),
    fetch_summary: fetchSummary,
    fetch_failures: fetchFailures,
    assets_summary: assetsSummary,
    search_pages: searchPages,
    search_words: searchWords,
  }
}

// Handle CLI execution
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const outputs = collect()
    const lines = Object.entries(outputs).map(
      ([key, value]) => `${key}=${value}`
    )
    console.log(lines.join('\n'))
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n')
    }
  } catch (e) {
    console.warn('Could not collect build stats:', e.message)
  }
}

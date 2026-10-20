/**
 * Site Strings
 *
 * The words of the site pages, from .net's `/localization/elements/<name>_en.json` files, fetched at build
 * time into `.cache` like the API data. Each paragraph, heading and so on is a key, ie "about:2", put in a
 * page with the `t` filter: {{ "about:2" | t }}. Most are HTML.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import Fetch, { AssetCache } from '@11ty/eleventy-fetch'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configKeys } from './sitePages.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TEMPLATE_DIRS = ['pages', 'includes', 'layouts']
const CACHE_DURATION = process.env.REFETCH ? '0s' : '*'

// Not donations, search etc, which have no pages here
export const STRING_FILES = [
  'abbreviations',
  'abhidhamma',
  'about',
  'acknowledgments',
  'an-guide-sujato',
  'an-introduction-bodhi',
  'discourses',
  'dn-guide-sujato',
  'general-guide-sujato',
  'interface',
  'introduction',
  'languages',
  'licensing',
  'map',
  'methodology',
  'mn-guide-sujato',
  'names',
  'numbering',
  'pali-tipitaka',
  'pirivena',
  'publication',
  'similes',
  'sn-guide-sujato',
  'start',
  'subjects',
  'terminology',
  'vinaya',
]

// A key in a template, ie {{ "about:2" | t }}
const TEMPLATE_KEY = /["']([\w-]+:[\w-]+)["']\s*\|\s*t\b/g

const strings = {}
const missing = new Set()

function stringsUrl(name) {
  return `https://suttacentral.net/localization/elements/${name}_en.json`
}

function fetchOptions(name, duration) {
  return {
    duration,
    type: 'json',
    filenameFormat: (cacheKey, hash) => `localization-${name}-${hash}`,
  }
}

/**
 * One strings file, less the empty strings .net keeps for untranslated keys. Throws if it can't be
 * fetched, as .net answers a missing file with its app's HTML, which isn't JSON
 * @param {string} name - ie "about"
 * @param {string} [duration] - How long a cached copy is good for
 * @returns {Promise<{ strings: object, fetchedAt: string }>}
 */
export async function fetchStrings(name, duration = CACHE_DURATION) {
  const url = stringsUrl(name)
  const options = fetchOptions(name, duration)
  const data = await Fetch(url, options)
  const timestamp = new AssetCache(url, '.cache', options).getCachedTimestamp()
  return {
    strings: Object.fromEntries(
      Object.entries(data).filter(
        ([, value]) => typeof value === 'string' && value.trim()
      )
    ),
    fetchedAt: new Date(timestamp ?? Date.now()).toUTCString(),
  }
}

/**
 * Fetches every strings file for the `t` filter. One that fails is left out, so its keys show up as missing
 * @returns {Promise<string>} when the newest of them was fetched
 */
export async function loadStrings() {
  const results = await Promise.all(
    STRING_FILES.map(name =>
      fetchStrings(name).catch(error => {
        console.warn(
          `Couldn't fetch the ${name} site page strings:`,
          error.message
        )
        return null
      })
    )
  )
  let newest = 0
  for (const result of results.filter(Boolean)) {
    Object.assign(strings, result.strings)
    newest = Math.max(newest, Date.parse(result.fetchedAt))
  }
  return new Date(newest || Date.now()).toUTCString()
}

/**
 * A site page string, or '' if .net no longer has it. Those are listed after the build, and the site
 * pages test fails on them
 * @param {string} key - ie "about:2"
 */
export function t(key) {
  if (Object.hasOwn(strings, key)) return strings[key]
  missing.add(key)
  return ''
}

/** The keys `t` was asked for that weren't there */
export function missingKeys() {
  return [...missing]
}

/** Every key the site pages use, from their templates and from `sitePages.js` */
export function templateKeys() {
  const keys = new Set(configKeys())
  for (const dir of TEMPLATE_DIRS) {
    const full = path.join(ROOT, dir)
    for (const file of fs.readdirSync(full, { recursive: true })) {
      if (!String(file).endsWith('.liquid')) continue
      const text = fs.readFileSync(path.join(full, String(file)), 'utf8')
      for (const [, key] of text.matchAll(TEMPLATE_KEY)) keys.add(key)
    }
  }
  return keys
}

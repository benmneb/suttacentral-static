/**
 * Dictionaries
 *
 * The dictionaries behind word lookup and the /define pages, fetched at build time into `.cache` from
 * SuttaCentral's repos on GitHub, so .net's own server is never asked for them. DPD's i2h (inflection to
 * headwords) and deconstructor (compound splits) tables are JS modules in .net's app, not JSON files.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import Fetch, { AssetCache } from '@11ty/eleventy-fetch'
import { recordStat } from './buildStats.js'
import { CACHE_DURATION } from './scApi.js'

const SC_DATA =
  'https://raw.githubusercontent.com/suttacentral/sc-data/main/dictionaries'
const DPD_LOOKUPS =
  'https://raw.githubusercontent.com/suttacentral/suttacentral/main/client/elements/lookups/dpd'

// Only the English ones, as the site is only in English
export const DICTIONARY_FILES = {
  dpd: `${SC_DATA}/simple/en/pli2en_dpd.json`,
  ncped: `${SC_DATA}/simple/en/pli2en_ncped.json`,
  ddb: `${SC_DATA}/simple/en/lzh2en_ddb.json`,
  pts: `${SC_DATA}/complex/en/pli2en_pts.json`,
  dppn: `${SC_DATA}/complex/en/pli2en_dppn.json`,
  dhammika: `${SC_DATA}/complex/en/pli2en_dhammika.json`,
  dpd_i2h: `${DPD_LOOKUPS}/dpd_i2h.js`,
  dpd_deconstructor: `${DPD_LOOKUPS}/dpd_deconstructor.js`,
}

let loaded = null

function fetchOptions(name, duration) {
  return {
    duration,
    type: DICTIONARY_FILES[name].endsWith('.js') ? 'text' : 'json',
    filenameFormat: (cacheKey, hash) => `dictionary-${name}-${hash}`,
  }
}

// Throws if it isn't the shape it should be
function parse(name, body) {
  const url = DICTIONARY_FILES[name]
  // ie `export const dpd_i2h = { … }`, which the cache reads back as a Buffer
  const text = url.endsWith('.js') && String(body)
  const data = text
    ? JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    : body
  if (url.endsWith('.js') === Array.isArray(data)) {
    throw new Error(`${url} isn't a dictionary`)
  }
  return data
}

/**
 * One dictionary: an array of entries for the sc-data files, or an object keyed by word form for DPD's
 * tables. Throws if it can't be fetched or isn't the shape it should be
 * @param {string} name - A key of `DICTIONARY_FILES`, ie "dpd"
 * @param {string} [duration] - How long a cached copy is good for
 * @returns {Promise<{ data: object[] | object, fetchedAt: string }>}
 */
export async function fetchDictionary(name, duration = CACHE_DURATION) {
  const url = DICTIONARY_FILES[name]
  const options = fetchOptions(name, duration)
  const data = parse(name, await Fetch(url, options))
  const timestamp = new AssetCache(url, '.cache', options).getCachedTimestamp()
  return {
    data,
    fetchedAt: new Date(timestamp ?? Date.now()).toUTCString(),
  }
}

/**
 * The copy of a dictionary in `.cache`, however old, or null. Not through `fetchDictionary`, as Eleventy
 * Fetch hands a URL's second fetch in a run the first one's promise, whatever its duration
 * @param {string} name - A key of `DICTIONARY_FILES`
 * @returns {object[] | object | null}
 */
export function cachedDictionary(name) {
  const cache = new AssetCache(
    DICTIONARY_FILES[name],
    '.cache',
    fetchOptions(name, '*')
  )
  try {
    return cache.isCacheValid('*') ? parse(name, cache.getCachedValue()) : null
  } catch {
    return null
  }
}

/**
 * A dictionary as [word, entry] pairs. A word can have more than one entry, ie PTS homonyms
 * @param {object[] | object} data - As `fetchDictionary` gives it
 * @returns {Array<[string, unknown]>}
 */
export function entriesOf(data) {
  return Array.isArray(data)
    ? data.map(entry => [entry.entry ?? entry.word, entry])
    : Object.entries(data)
}

/**
 * Every dictionary, fetched once per build. One that fails is null, so the build carries on without what
 * needs it, and each one's entry count goes in `.build-stats.json` for the fetch test
 * @returns {Promise<Record<string, { data: object[] | object, fetchedAt: string } | null>>}
 */
export function loadDictionaries() {
  loaded ??= Promise.all(
    Object.keys(DICTIONARY_FILES).map(name =>
      fetchDictionary(name).catch(error => {
        console.warn(`Couldn't fetch the ${name} dictionary:`, error.message)
        return null
      })
    )
  ).then(results => {
    const dictionaries = Object.fromEntries(
      Object.keys(DICTIONARY_FILES).map((name, i) => [name, results[i]])
    )
    recordStat(
      'dictionaries',
      Object.fromEntries(
        Object.entries(dictionaries).map(([name, result]) => [
          name,
          result ? entriesOf(result.data).length : null,
        ])
      )
    )
    return dictionaries
  })
  return loaded
}

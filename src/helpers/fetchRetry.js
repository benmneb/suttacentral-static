/**
 * Fetch Retry
 *
 * Eleventy Fetch, tried again when a request fails in a way that may pass, ie a dropped connection, a timeout or
 * a 5xx, so a slow or flaky connection doesn't leave texts out of the build. A 404 or other 4xx fails at once.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { Fetch } from '@11ty/eleventy-fetch'

const RETRIES = 3
const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 60_000
const RETRY_STATUSES = new Set([408, 425, 429])

let retries = 0
let recovered = 0

// Eleventy Fetch throws with the response as `cause` when there was one
function isTransient(error) {
  const status = error?.cause?.status
  if (typeof status !== 'number') return true
  return RETRY_STATUSES.has(status) || status >= 500
}

function delayMs(error, attempt) {
  const retryAfter = Number(error?.cause?.headers?.get?.('retry-after'))
  if (retryAfter > 0) return Math.min(retryAfter * 1000, MAX_DELAY_MS)
  return BASE_DELAY_MS * 2 ** attempt * (0.75 + Math.random() / 2)
}

/**
 * `Fetch(url, options)`, tried up to `RETRIES` more times on a failure that may pass. Throws the last error
 * as Eleventy Fetch gave it
 * @param {string} url
 * @param {object} options - Eleventy Fetch's
 */
export async function fetchWithRetry(url, options) {
  for (let attempt = 0; ; attempt++) {
    try {
      const data = await Fetch(url, options).queue()
      if (attempt) recovered++
      return data
    } catch (error) {
      if (attempt >= RETRIES || !isTransient(error)) throw error
      retries++
      await new Promise(resolve => setTimeout(resolve, delayMs(error, attempt)))
    }
  }
}

/** How many requests were tried again in this process, and how many of them then succeeded */
export function retryStats() {
  return { retries, recovered }
}

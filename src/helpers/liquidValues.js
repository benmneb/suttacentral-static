/**
 * Liquid Values
 *
 * Liquid's own semantics for the helpers that build HTML in JS rather than in a Liquid loop, so the
 * output is the same as the template's was.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

/** Only nil and false are falsy */
export const truthy = value => value != null && value !== false

/** Nil, false, or an empty or whitespace-only string */
export const blank = value =>
  !truthy(value) || (typeof value === 'string' && !value.trim())

/** A value as `{{ }}` outputs it */
export const out = value => (value == null ? '' : String(value))

/** As the `default` filter: the fallback for nil, false or an empty string or array */
export const orDefault = (value, fallback) =>
  Array.isArray(value) || typeof value === 'string'
    ? value.length
      ? value
      : fallback
    : truthy(value)
      ? value
      : fallback

/** What `{% for %}` loops over: an array, a non-empty string as one item, or an object's entries */
export function each(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value ? [value] : []
  if (value?.[Symbol.iterator]) return Array.from(value)
  if (value && typeof value === 'object') return Object.entries(value)
  return []
}

/** As `.size`: a `size` of its own, else an array's or string's length, or an object's key count */
export function sizeOf(value) {
  if (value == null) return undefined
  if (value.size !== undefined) return value.size
  if (Array.isArray(value) || typeof value === 'string') return value.length
  if (typeof value === 'object') return Object.keys(value).length
}

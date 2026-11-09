/**
 * Segments HTML
 *
 * A segmented text's segments, with their reference numbers, notes, variants and illustrations, and the
 * popovers they open. In JS, not `text.liquid`, as Liquid tags run per segment are slow.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { loadLookup } from './lookupAnswers.js'
import { referenceEditionName, referenceGroup } from './referenceEditions.js'
import { SC_ORIGIN } from './scApi.js'
import {
  isHeadingHTML,
  langTag,
  normalise,
  softHyphenateTitle,
} from './strings.js'

// As Liquid has it: only nil and false are falsy, and blank is those, or an empty or whitespace-only string
const truthy = value => value != null && value !== false
const blank = value =>
  !truthy(value) || (typeof value === 'string' && !value.trim())
const nonEmpty = value =>
  (Array.isArray(value) || typeof value === 'string') && !value.length
    ? undefined
    : value

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
  "'": '&#39;',
}
const escapeHtml = text =>
  String(text ?? '').replace(/[&<>"']/g, c => ESCAPES[c])
const out = value => (value == null ? '' : String(value))
const withoutOrigin = html => out(html).split(SC_ORIGIN).join('')

/** Each word of a Pāli text into word lookup's answers, leaving the text as it is */
async function lookupWords(text, lang) {
  if (lang === 'pli') (await loadLookup()).addWords(text)
  return text
}

/** Spans, as a <figure> can't go inside the <p> they usually end */
function illustrationsHtml(illustrations) {
  return (illustrations ?? [])
    .map(
      ({ src, alt, width, height, credit }) =>
        `\n<span class="illustration" role="figure" data-pagefind-ignore="all">\n<img\nsrc="${out(src)}"\nalt="${escapeHtml(alt)}"\n` +
        (truthy(width)
          ? `width="${out(width)}"\nheight="${out(height)}"\n`
          : '') +
        `loading="lazy"\ndecoding="async"\n>\n` +
        (blank(credit) ? '' : `<span class="caption">${out(credit)}</span>\n`) +
        '</span>\n'
    )
    .join('')
}

/**
 * The segment number, and every printed-edition reference too, hidden like the number, so a link like
 * /mn2/en/sujato#bj10.20 has somewhere to land - CSS reveals whichever is targeted. Not searchable, they'd
 * only add noise like "pts" and "pli1"
 */
function referenceHtml(entry, key, ref, refId) {
  const repeated = entry.scx_repeated_refs?.[key]
  const refs = out(entry._bilarasuttas_data.reference_text?.[key])
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(id => {
      const unique = Array.isArray(repeated)
        ? !repeated.includes(id)
        : typeof repeated?.indexOf !== 'function' || repeated.indexOf(id) < 0
      return `<a class="ref ${out(referenceGroup(id))}"${unique ? ` id="${id}"` : ''} href="#${id}" title="${out(referenceEditionName(id) ?? id)}">${id}</a>`
    })
  return `\n<span class="reference" id="${out(refId)}" hidden>\n<a href="#${out(refId)}" title="SuttaCentral segment number">${out(ref)}</a>${refs.join('')}\n</span>\n`
}

/**
 * A root text's or translation's segments, and the popovers for their notes and variants
 * @param {object} entry
 * @param {boolean} isRoot - Whether to show the root text as the text, with its variants
 * @returns {Promise<{ html: string, comments: string }>}
 */
export async function segmentsHtml(entry, isRoot) {
  const data = entry._bilarasuttas_data
  const keys = nonEmpty(entry.scx_keys) ?? data.keys_order ?? []
  const normalisedTitle = normalise(entry.original_title)
  const html = []
  const comments = []

  for (const [i, key] of keys.entries()) {
    const segmentHtml = data.html_text?.[key]
    if (!truthy(segmentHtml)) continue
    const index = i + 1
    let ref = out(key).split(':').at(-1)
    const refId = nonEmpty(entry.scx_segment_ids?.[key]) ?? ref
    if (entry.scx_full_segment_refs) ref = key
    const isHeading = isHeadingHTML(segmentHtml)
    const retitled = truthy(entry.scx_retitled_keys?.[key])
    const anchor = entry.scx_parallel_anchors?.[key]

    let segment = `\n<span id="${key}" class="segment"${truthy(anchor) ? ` style="--anchor: ${out(anchor)}"` : ''}>`
    segment += referenceHtml(entry, key, ref, refId)

    if (isRoot) {
      const text = data.root_text?.[key]
      const comment = data.variant_text?.[key]
      if (truthy(text) || retitled) {
        const shown = retitled ? entry.scx_range_sutta_title : text
        const words = await lookupWords(
          isHeading ? softHyphenateTitle(shown) : shown,
          entry.lang
        )
        // The root text, but classed as a translation, so it isn't `display: none` by default
        segment +=
          `<span class="translation" lang="${out(langTag(entry.lang))}" translate="no">\n` +
          `<span class="text">${out(words)}</span>\n`
        if (!blank(comment)) {
          segment +=
            `<button class="variant-btn" popovertarget="comment-${key}" style="--anchor: --comment${index}" aria-label="Show variant reading for segment ${out(ref)}">*</button>\n` +
            `<span class="inline-comment" hidden>\nVariant: ${withoutOrigin(comment)}\n</span>\n`
        }
        segment += '</span>\n'
      }
      if (!blank(comment)) {
        comments.push(
          `<article id="comment-${key}" popover style="--anchored-to: --comment${index}">\nVariant: <span lang="${out(langTag(entry.lang))}" translate="no">${withoutOrigin(comment)}</span>\n</article>`
        )
      }
    } else {
      const text = data.translation_text?.[key]
      const rootText = data.root_text?.[key]
      const comment = data.comment_text?.[key]
      const variant = data.variant_text?.[key]
      if (truthy(text) || retitled) {
        const weighted =
          text === entry.translated_title || text === entry.translated_name
        segment +=
          `<span class="translation" lang="${out(langTag(entry.lang))}"${weighted ? ' data-pagefind-weight="8"' : ''}>\n` +
          `<span class="text">${out(retitled ? entry.scx_range_sutta_title : text)}</span>\n`
        if (!blank(comment)) {
          segment +=
            `<button popovertarget="comment-${key}" style="--anchor: --comment${index}" aria-label="Show ${out(entry.author)}'s footnote for segment ${key}">*</button>\n` +
            `<span class="inline-comment" hidden>\n<span class="sr-only">Note:</span> ${withoutOrigin(comment)}\n</span>\n`
        }
        segment += '</span>\n'
      }
      if (truthy(rootText)) {
        const indexed = normalise(rootText).includes(normalisedTitle)
        const words = await lookupWords(
          isHeading ? softHyphenateTitle(rootText) : rootText,
          entry.root_lang
        )
        segment +=
          `<span class="root" lang="${out(langTag(entry.root_lang))}" translate="no" hidden${indexed ? ' data-indexed' : ''}>\n` +
          `<span class="text">${out(words)}</span>\n`
        if (!blank(variant)) {
          segment +=
            `<button class="variant-btn" popovertarget="variant-${key}" style="--anchor: --variant${index}" aria-label="Show variant reading for segment ${out(ref)}">*</button>\n` +
            `<span class="inline-comment" hidden>\nVariant: ${withoutOrigin(variant)}\n</span>\n`
        }
        segment += '</span>\n'
      }
      if (!blank(comment)) {
        comments.push(
          `<article id="comment-${key}" popover style="--anchored-to: --comment${index}">\n${withoutOrigin(comment)}\n</article>`
        )
      }
      if (!blank(variant)) {
        comments.push(
          `<article id="variant-${key}" popover style="--anchored-to: --variant${index}">\nVariant: <span lang="${out(langTag(entry.root_lang))}" translate="no">${withoutOrigin(variant)}</span>\n</article>`
        )
      }
    }

    if (truthy(entry.scx_illustrations)) {
      segment += illustrationsHtml(entry.scx_illustrations[key])
    }
    segment += '</span>\n'
    let template = out(segmentHtml)
    if (key === entry.scx_range_sutta_heading_key) {
      const heading = `<h2 class="sutta-title">${out(entry.scx_range_sutta_title)}</h2>`
      template = template.replace(
        /^(?:<(?:article|div|section) id=(['"])[^'"]*\1>)?/,
        wrapper => wrapper + heading
      )
    }
    html.push(template.split('{}').join(segment))
  }

  return {
    html: `\n${html.join('\n')}\n`,
    comments: comments.length ? `\n${comments.join('\n')}\n` : '',
  }
}

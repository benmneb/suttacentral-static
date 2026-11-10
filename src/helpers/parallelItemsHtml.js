/**
 * Parallel Items HTML
 *
 * The list items for a text's parallels, on its own page, in its popovers and under each text on a chapter page.
 * In JS, not a Liquid include, as there are ~900k of them across the nav pages, and Liquid tags run per item are slow.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

import { blank, each, orDefault, out, sizeOf, truthy } from './liquidValues.js'
import { langTag, rootTitle, textRefs } from './strings.js'

const TYPES = {
  full: {
    label: 'Full parallel:',
    title: 'Full parallel: different versions of the same text',
  },
  resembling: {
    label: 'Resembling parallel:',
    title: 'Resembling parallel: texts are comparable',
  },
  mention: {
    label: 'Mention:',
    title: 'Mention: one text is quoted or mentioned in another',
  },
  retelling: {
    label: 'Retelling:',
    title: 'Retelling: the events of one text are retold in another',
  },
}

function notesHtml(to, refs) {
  const paragraphs = [
    ...each(to.scx_remarks),
    ...[to.scx_volpages_full, to.biblio].filter(truthy),
  ]
  return (
    `\n<div class="text-refs">\n${refs}\n<details class="parallel-notes">\n` +
    '<summary title="Notes"><i class="icon i-informationCircle"></i>\n<span class="sr-only">Notes</span>\n</summary>\n' +
    paragraphs.map(text => `\n<p>${out(text)}</p>\n`).join('') +
    '\n</details>\n</div>\n'
  )
}

function translationsHtml(to, anchor) {
  const links = each(to.scx_translations).map(
    trans =>
      `<a href="/${out(to.uid)}/${out(trans.lang)}/${out(trans.author_uid)}${anchor}" hreflang="${out(langTag(trans.lang))}">${out(trans.author).trim()}</a>`
  )
  return `\n<p class="parallel-translations">\nEnglish:\n${links.join('\n<span aria-hidden="true">∙</span>\n')}\n</p>\n`
}

function itemHtml(parallel, typed) {
  const to = parallel?.to ?? {}
  const type = orDefault(to.scx_type, to.type)
  const { label = '', title: typeTitle = '' } = TYPES[type] ?? {}
  const typeHtml = typed
    ? `<span class="parallel-type" title="${typeTitle}"><span class="sr-only">${label}</span></span>`
    : '<span class="parallel-type"></span>'

  // Only English and root texts are built, see `filterTranslations` in `_masterData.js`
  const builtTrans = each(to.translations).find(
    trans => trans?.lang === 'en' || trans?.lang === to.root_lang
  )
  const anchor = out(to.scx_anchor)
  const href = truthy(builtTrans)
    ? `/${out(to.uid)}/${out(builtTrans.lang)}/${out(orDefault(builtTrans.author_uid, 'null'))}${anchor}`
    : ''
  const titled = !blank(to.original_title) || !blank(to.translated_title)
  const title = titled
    ? out(rootTitle(to, href))
    : !blank(href)
      ? `<a href="${href}" hreflang="${out(langTag(builtTrans.lang))}">${out(to.scx_label)}</a>`
      : `<span>${out(to.scx_label)}</span>`

  const refs = out(
    textRefs(
      titled ? to.scx_label : '',
      to.alt_acronym,
      to.scx_lang_name,
      to.scx_volpages,
      to.scx_alt_volpages
    )
  )
  const refsHtml = truthy(to.scx_has_notes)
    ? notesHtml(to, refs)
    : !blank(refs)
      ? `\n<p class="text-refs">${refs}</p>\n`
      : ''
  const translations =
    sizeOf(to.scx_translations) > 0 ? translationsHtml(to, anchor) : ''

  return `\n<li class="parallel-list-item-${out(type)}">\n${typeHtml}\n${title}\n${refsHtml}${translations}\n</li>\n`
}

/**
 * @param {object[]} parallels - Each with the text it's a parallel `to`
 * @param {boolean} typed - Each with a title saying its type, for a list not headed by it
 */
export function parallelItemsHtml(parallels, typed) {
  return each(parallels)
    .map(parallel => itemHtml(parallel, typed))
    .join('')
}

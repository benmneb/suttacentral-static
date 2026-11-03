/**
 * Strings
 *
 * Formatting for titles and references, used as filters and shortcodes in `.eleventy.js`.
 */

/**
 * The site's spelling of a language name, as .net's API gives "Pali" for `pli` in a text's publication info
 * @param {string} name - ie "Pali"
 */
export function languageName(name) {
  return name === 'Pali' ? 'Pāli' : name
}

// Not .net's own codes, as BCP 47 takes the two-letter one where there is one
const LANG_TAGS = {
  pli: 'pi',
  san: 'sa',
  jpn: 'ja',
  kan: 'kn',
  uig: 'ug',
  // `sld` is Sissala, and Saarländisch has no subtag of its own
  sld: 'de',
}

/**
 * A language code as `lang`, `hreflang` and `inLanguage` take it, ie "pli" as "pi"
 * @param {string} code - SuttaCentral's code for it, as in its URLs
 */
export function langTag(code) {
  return LANG_TAGS[code] ?? code
}

/** Lets a long Pāli compound title wrap before its suffix, ie "Mahādukkhakkhandha-" over "sutta" */
export function softHyphenateTitle(title) {
  return String(title ?? '').replace(
    /(?<=\p{L})(sutta|vagga|paṇṇāsa|saṁyutta|nipāta)(?=\s*$)/u,
    '­$1'
  )
}

/** A uid or acronym as `in:` takes it, ie "AN 1.1–10" as an1.1-10, keeping hyphens so it isn't an1.110 */
export function searchId(text) {
  return String(text).toLowerCase().replace(/\s+/g, '').replaceAll('–', '-')
}

/**
 * A segment's text with bilara's own tags as HTML: <supplied> and <unclear> as the classes legacy
 * texts use, and <j>, which starts a verse's next half-line, as a span closed at the segment's end
 */
export function bilaraMarkup(text) {
  if (!text?.includes('<')) return text
  let joins = 0
  const html = text
    .replace(/<j>/g, () => {
      joins++
      return '<span class="j">'
    })
    .replace(/<(\/?)(supplied|unclear)>/g, (match, close, tag) =>
      close ? '</span>' : `<span class="${tag}">`
    )
  return html + '</span>'.repeat(joins)
}

/**
 * `data` with every string in it in Unicode Normalization Form C, in place, as some of the API's text spells
 * "ā" as "a" and a combining macron
 */
export function normalizeStrings(data) {
  if (typeof data === 'string') return data.normalize('NFC')
  if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) data[key] = normalizeStrings(data[key])
  }
  return data
}

/**
 * A page's headings renumbered so none is more than a level below the one it's under, ie an h4 straight
 * after the h1 as an h2, as .net's texts, dictionaries and site pages skip levels
 */
export function closeHeadingGaps(html) {
  const renumber = headingRenumberer()
  const open = []
  return html.replace(/<(\/?)h([1-6])(?=[\s>])/g, (match, close, digit) => {
    if (close) return `</h${open.pop() ?? digit}`
    open.push(renumber(Number(digit)))
    return `<h${open.at(-1)}`
  })
}

/**
 * A page's headings with no text unwrapped, and a section one of them opens made a div. On a root text's page
 * these are headings only translations fill, ie /ma1/lzh/sct, /pli-tv-bu-vb-pj1/pli/ms and /pli-tv-bi-vb-np10/pli/ms
 */
export function dropEmptyHeadings(html) {
  const unsectioned = html.replace(
    /<section\b([^>]*)>(\s*<(h[1-6])\b[^>]*>((?:(?!<\/h[1-6]>)[\s\S])*)<\/\3>)/g,
    (match, attrs, heading) =>
      isEmptyHeading(heading)
        ? `<div${attrs} data-unsectioned>${heading}`
        : match
  )
  const open = []
  return unsectioned.replace(
    /<div([^>]*) data-unsectioned>|<section\b|<\/section>|<(h[1-6])\b[^>]*>((?:(?!<\/h[1-6]>)[\s\S])*)<\/\2>/g,
    (match, divAttrs, tag, inner) => {
      if (divAttrs !== undefined) {
        open.push('div')
        return `<div${divAttrs}>`
      }
      if (match === '<section') open.push('section')
      else if (match === '</section>') {
        return open.pop() === 'div' ? '</div>' : match
      } else if (tag && isEmptyHeading(match)) return inner
      return match
    }
  )
}

/** Has a heading nothing to read, leaving aside its hidden segment number? */
function isEmptyHeading(heading) {
  const text = heading
    .replace(
      /<span class="reference"[^>]*>(?:(?!<\/span>)[\s\S])*<\/span>/g,
      ''
    )
    .replace(/<[^>]*>/g, '')
  return !text.trim() && !/<(?:img|svg)\b|aria-label/.test(heading)
}

/** Gives each heading level in turn the one `closeHeadingGaps` makes it, ie h1, h4, h6, h4 as 1, 2, 3, 2 */
export function headingRenumberer() {
  // Each open section as its heading's level and new level, under one for anything before the h1
  const sections = [{ level: 0, to: 1 }]
  return level => {
    while (sections.length > 1 && sections.at(-1).level >= level) sections.pop()
    const to = level === 1 ? 1 : sections.at(-1).to + 1
    sections.push({ level, to })
    return to
  }
}

/** Is a segment's bilara html a heading? ie "<h1 class='sutta-title'>{}</h1>" */
export function isHeadingHTML(html) {
  return /<h[1-6][^>]*>\{\}/.test(html ?? '')
}

/**
 * Make pretty PTS volpages, "PTS MN 1.1, PTS 1.2, PTS 1.3" to "PTS 1.1–1.3".
 * The book is left out, as the acronym is always beside it
 */
export function formatVolpages(volpages) {
  if (!volpages) return ''
  if (!volpages.includes('PTS')) return volpages.trim()

  // Some end in a comma
  const parts = volpages
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const firstParts = parts[0].split(' ')
  const lastParts = parts[parts.length - 1].split(' ')
  // Keeps the edition, as in "PTS (2nd ed) SN 1.1"
  const prefix = parts[0].match(/^PTS(?: \(\w+ ed\))?/)?.[0] ?? firstParts[0]

  if (parts.length < 2) {
    // Can be "PTS AN iv 349", whose volume is a word of its own
    const rest = parts[0].slice(prefix.length).trim().split(' ')
    const book = rest.length > 1 && /^[A-Z]/.test(rest[0]) ? 1 : 0
    return `${prefix} ${rest.slice(book).join(' ')}`
  }

  const firstNum = firstParts[firstParts.length - 1]
  const lastNum = lastParts[lastParts.length - 1]
  return `${prefix} ${firstNum}–${lastNum}`
}

/**
 * A text's acronym and references on one line, ie "MA 1 ∙ T 26.1 ∙ Chinese ∙ T i 421a12", each a span, and
 * each volpage after an icon. No space before a ∙ or after an icon, so a line only wraps after a ∙
 */
export function textRefs(acronym, altAcronym, language, volpages, altVolpages) {
  const parts = [
    [acronym?.trim()],
    [
      altAcronym?.trim(),
      altAcronym?.startsWith('T ') ? 'Taishō number' : 'Alternate number',
      'alt-acronym',
    ],
    [language],
    [volpages, 'Volume and page', 'volpages'],
    [altVolpages !== volpages && altVolpages, 'Volume and page', 'volpages'],
  ].filter(([text]) => text)
  return parts
    .map(([text, title, className], i) => {
      const icon =
        className === 'volpages' ? '<i class="icon i-bookOpen"></i>' : ''
      const dot = i ? '<span aria-hidden="true">∙</span> ' : ''
      const value = title
        ? `<span title="${title}"><span class="sr-only" data-pagefind-ignore>${title}: </span>${icon}${text}</span>`
        : text
      return `<span${className ? ` class="${className}"` : ''}>${dot}${value}</span>`
    })
    .join('')
}

// By script, as romanised titles like Madhyamāgama are tagged lzh too
const UPRIGHT_SCRIPTS =
  /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Tibetan}]/u

// The API leaves trailing spaces on names
const rootNameOf = entry => (entry?.original_title || entry?.root_name)?.trim()
const translatedNameOf = entry =>
  (entry?.translated_title || entry?.translated_name)?.trim()

/** Has a menu or suttaplex entry a name, not just its acronym or range? */
export const isTitled = entry =>
  Boolean(rootNameOf(entry) || translatedNameOf(entry))

/**
 * A menu or suttaplex entry's title, its root title in italics over the translation. Just the one where
 * there's only one, or they're the same, and plain if that's the translation or, untitled, its acronym or range
 * @param {Object} entry - With `original_title` or `root_name`, and `translated_title` or `translated_name`
 * @param {string} [href] - Links the root title
 */
export function rootTitle(entry, href) {
  const root = rootNameOf(entry)
  const translation = translatedNameOf(entry)
  const lang = entry?.root_lang || entry?.root_lang_iso
  const link = text => (href ? `<a href="${href}">${text}</a>` : text)

  // Some, ie lzh-sarv-bi-pm-pc170, have the English as their root name too, so no lang for those
  const single = !root || root.toLowerCase() === translation?.toLowerCase()
  const title = single
    ? translation || root || entry?.acronym || entry?.child_range || ''
    : root
  const attributes = [
    !single && lang && ` lang="${langTag(lang)}"`,
    UPRIGHT_SCRIPTS.test(title) && ' class="upright"',
  ]
  const name = softHyphenateTitle(title)
  const i = single
    ? name
    : `<i${attributes.filter(Boolean).join('')}>${name}</i>`
  if (single || !translation) return link(i)
  // The space keeps the two apart in reader mode and copied text
  return `<span class="root-title">${link(i)}<span> ${translation}</span></span>`
}

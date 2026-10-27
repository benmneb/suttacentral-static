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
        ? `<span title="${title}">${icon}${text}</span>`
        : text
      return `<span${className ? ` class="${className}"` : ''}>${dot}${value}</span>`
    })
    .join('')
}

// By script, as romanised titles like Madhyamāgama are tagged lzh too
const UPRIGHT_SCRIPTS =
  /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Tibetan}]/u

/**
 * A menu or suttaplex entry's title, its root title in italics over the translation. Just the one in italics
 * where there's only one, or they're the same
 * @param {Object} entry - With `original_title` or `root_name`, and `translated_title` or `translated_name`
 * @param {string} [href] - Links the root title
 */
export function rootTitle(entry, href) {
  // The API leaves trailing spaces on names
  const root = (entry?.original_title || entry?.root_name)?.trim()
  const translation = (
    entry?.translated_title || entry?.translated_name
  )?.trim()
  const lang = entry?.root_lang || entry?.root_lang_iso
  const link = text => (href ? `<a href="${href}">${text}</a>` : text)

  // Some, ie lzh-sarv-bi-pm-pc170, have the English as their root name too, so no lang for those
  const single = !root || root.toLowerCase() === translation?.toLowerCase()
  const title = single ? translation || root || '' : root
  const attributes = [
    !single && lang && ` lang="${langTag(lang)}"`,
    UPRIGHT_SCRIPTS.test(title) && ' class="upright"',
  ]
  const dfn = `<dfn${attributes.filter(Boolean).join('')}>${softHyphenateTitle(title)}</dfn>`
  if (single || !translation) return link(dfn)
  // The space keeps the two apart in reader mode and copied text
  return `<span class="root-title">${link(dfn)}<span> ${translation}</span></span>`
}

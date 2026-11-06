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
 * texts use, and <j>, which starts a verse's next half-line, as a span closed at the segment's end.
 * Drops the <reference> and empty <root> left in sf36:70.27, whose reference is in its references too
 */
export function bilaraMarkup(text) {
  if (!text?.includes('<')) return text
  let joins = 0
  const html = text
    .replace(/<reference>[^<]*<\/reference>|<root><\/root>/g, '')
    .replace(/<j>/g, () => {
      joins++
      return '<span class="j">'
    })
    .replace(/<(\/?)(supplied|unclear)>/g, (match, close, tag) =>
      close ? '</span>' : `<span class="${tag}">`
    )
  return html + '</span>'.repeat(joins)
}

const LEGACY_TOKENS = /<(\/?)([a-z][a-z0-9]*)\b[^>]*>|<![^>]*>|[^<]+|</g
const VOID_TAGS = /^(?:area|br|col|embed|hr|img|input|link|meta|source|wbr)$/
const BLOCK_TAGS =
  /^(?:address|article|aside|blockquote|div|dl|figure|footer|h[1-6]|header|hr|nav|p|pre|section|table)$/

/**
 * A legacy text with its slips mended: a list with what only an item can hold (`tidyLists`), a stray comma among
 * a tag's attributes, ie patthana1.23's `<ol type="1", start="5">`, a URL with %7C for every /, ie sf81's, and
 * an empty link, ie kv1.1's `<a class='pc' id='pc8' href='#pc8'></a>`, which .net fills only with paragraph
 * numbers on, made an anchor
 */
export function tidyLegacyHtml(html) {
  return tidyLists(html)
    .replace(/(<[a-z][^<>]*?['"])\s*,(?=\s)/g, '$1')
    .replace(
      /\bhref=(['"])http:%7C%7C([^'"]*)/g,
      (match, quote, rest) =>
        `href=${quote}http://${rest.replaceAll('%7C', '/')}`
    )
    .replace(/(<a\b[^>]*?)\s+href=(['"])[^'"]*\2([^>]*>\s*<\/a>)/g, '$1$3')
}

/**
 * Lists with only items in them. What follows an item's end tag that isn't another item goes back into it, as a
 * nested list or a sentence after a stray </li> was meant to, and a heading or paragraph ends a list left open,
 * ie in patthana1.8/en/narada
 */
export function tidyLists(html) {
  const open = []
  const out = []
  const inList = () => /^[ou]l$/.test(open.at(-1))
  let itemEnd = -1
  for (const [token, close, name] of html.matchAll(LEGACY_TOKENS)) {
    if (!name && (!token.trim() || token.startsWith('<!'))) {
      out.push(token)
      continue
    }
    if (inList() && !close && name !== 'li') {
      if (BLOCK_TAGS.test(name)) {
        while (inList()) out.push(`</${open.pop()}>`)
      } else if (itemEnd !== -1) {
        out[itemEnd] = ''
        open.push('li')
      }
    }
    itemEnd = close && name === 'li' && open.at(-1) === 'li' ? out.length : -1
    out.push(token)
    if (!name || VOID_TAGS.test(name)) continue
    if (close) {
      const i = open.lastIndexOf(name)
      if (i !== -1) open.length = i
    } else {
      // An item, or a paragraph, ends the one before it
      if (/^(?:li|p)$/.test(name) && open.at(-1) === name) open.pop()
      open.push(name)
    }
  }
  return out.join('')
}

// The Private Use Area characters in the API's texts, which no font the site uses has
const PRIVATE_USE = {
  // Word's Symbol font angle brackets, in sa107/en/analayo
  '\uF0E1': '⟨',
  '\uF0F1': '⟩',
  // pdhp414's ṛ
  '\uF82A': 'ṛ',
  // CBETA's gaiji CB00595, CB00596 and CB02213 in Taishō texts, as CBETA normalises them
  '\u{F0253}': '麨',
  '\u{F0254}': '䴵',
  '\u{F08A5}': '爆',
}
const PRIVATE_USE_PATTERN = new RegExp(
  `[${Object.keys(PRIVATE_USE).join('')}]`,
  'gu'
)

/**
 * `data` with every string in it in Unicode Normalization Form C, in place, as some of the API's text spells
 * "ā" as "a" and a combining macron, and with the Private Use Area characters it has swapped for real ones
 */
export function normalizeStrings(data) {
  if (typeof data === 'string') {
    return data
      .normalize('NFC')
      .replace(PRIVATE_USE_PATTERN, char => PRIVATE_USE[char])
  }
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

const SECTIONS_AND_HEADINGS =
  /<(\/?)(section|article)\b|<(h[1-6])\b[^>]*>((?:(?!<\/h[1-6]>)[\s\S])*)<\/\3>/g

/**
 * A page's headings with no text unwrapped, and a section they leave with none made a div. On a root text's page
 * these are headings only translations fill, ie /ma1/lzh/sct, /pli-tv-bu-vb-pj1/pli/ms and /pli-tv-bi-vb-np10/pli/ms
 */
export function dropEmptyHeadings(html) {
  const open = []
  const unsectioned = new Set()
  let tag = 0
  for (const [match, close, name, heading] of html.matchAll(
    SECTIONS_AND_HEADINGS
  )) {
    const n = tag++
    // As the validator counts them, a heading in a nested section isn't the outer one's
    if (heading) {
      const section = open.at(-1)
      if (!section) continue
      if (isEmptyHeading(match)) section.emptied = true
      else section.titled = true
    } else if (!close) {
      open.push({ name, tag: n, emptied: false, titled: false })
    } else if (open.at(-1)?.name === name) {
      const section = open.pop()
      if (name === 'section' && section.emptied && !section.titled) {
        unsectioned.add(section.tag).add(n)
      }
    }
  }
  tag = 0
  return html.replace(
    SECTIONS_AND_HEADINGS,
    (match, close, name, heading, inner) => {
      const n = tag++
      if (heading) return isEmptyHeading(match) ? inner : match
      return unsectioned.has(n) ? `<${close}div` : match
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

/** Whitespace runs as single spaces, trimmed */
export function normalise(value) {
  return value?.replace(/\s+/g, ' ').trim() ?? ''
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

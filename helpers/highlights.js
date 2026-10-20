/**
 * Highlights
 *
 * Whether a text has any of the markup the "Highlight text-critical details" setting styles, in styles.css:
 * the structure of Vinaya rules, the speakers of the Kathāvatthu, the questions of the Yamaka, counters on lists,
 * and the editors' marks in the legacy Sanskrit, Gāndhārī and Chinese editions. .net offers the setting on every
 * text, though most have none of it, so here it only shows where it does something.
 */
const MARKS = [
  'kamma',
  'patimokkha',
  'suttanta',
  'jataka',
  'nidana',
  'padabhajaniya',
  'cakka',
  'anapatti',
  'vinaya-vinita',
  'term',
  'gloss',
  'supplied2?',
  'surplus',
  'var',
  'corr(?:ected)?',
  'unclear',
  'expanded',
  'metre',
]

const markupOf = marks =>
  new RegExp(
    `class=['"](?:[^'"]*\\s)?(?:${marks.join('|')})['"\\s]|data-(?:counter|doxy|direction)=`
  )

const LEGACY_MARKUP = markupOf(MARKS)
// A rule is only highlighted with a segment in it, as legacy texts mark every rule
const SEGMENTED_MARKUP = markupOf([...MARKS, 'rule'])

/**
 * @param {Object} entry - A text page entry
 * @param {string[] | null} keys - The segment keys the page shows, or null for a legacy text
 */
export function highlightsOf(entry, keys) {
  const html = entry._bilarasuttas_data?.html_text
  return {
    scx_has_highlights: keys
      ? keys.some(key => SEGMENTED_MARKUP.test(html[key]))
      : LEGACY_MARKUP.test(entry._suttas_data?.translation?.text ?? ''),
  }
}

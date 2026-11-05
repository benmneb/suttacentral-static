/**
 * SC API
 *
 * Every route the build reads from SuttaCentral's API, and the way Eleventy Fetch caches each one, in one
 * place: .net changing a route, or where its API lives, is edited here and nowhere else.
 *
 * Lives here, not in `data/`, as every file in there becomes global data.
 */

/** SuttaCentral.net, which serves the API and the localization strings */
export const SC_ORIGIN = 'https://suttacentral.net'
const API = `${SC_ORIGIN}/api`

const refetchSince = Number(process.env.REFETCH)

/**
 * How long a cached response is good for: https://www.11ty.dev/docs/plugins/fetch/#change-the-cache-duration
 * Forever, or with `REFETCH=1` not at all. `REFETCH` as a Unix time in seconds, ie a staged build's start, keeps
 * only what was fetched since, so its later stages and reruns read what its first stage fetched
 */
export const CACHE_DURATION =
  refetchSince > 1e9
    ? `${Math.max(1, Math.floor(Date.now() / 1000 - refetchSince))}s`
    : process.env.REFETCH
      ? '0s'
      : '*'

/**
 * Eleventy Fetch options for a SuttaCentral API URL, so the tests read back the same cache files
 * @param {string} url
 * @param {string} [duration] - How long a cached response is good for
 */
export function fetchOptions(url, duration = CACHE_DURATION) {
  return {
    duration,
    type: 'json',
    filenameFormat: (cacheKey, hash) => {
      return `${url.split('/api/')[1]}-${cacheKey}-${hash}`
    },
  }
}

/**
 * The menu under `uid`, which is required.
 * Without the `/uid` it returns an unusable data structure that no one should ever fetch recursively...
 */
export function menuUrl(uid) {
  return `${API}/menu/${uid}?language=en`
}

/** One text's details, as the leaf of the menu tree */
export function leafUrl(uid) {
  return `${API}/suttaplex/${uid}?language=en`
}

/** A segmented translation's segments, by their keys */
export function segmentedTranslationUrl(uid, author, lang) {
  return `${API}/bilarasuttas/${uid}/${author}?lang=${lang}`
}

/** A text's translation as one document, legacy (unsegmented) ones included */
export function suttasUrl(uid, author, lang) {
  return `${API}/suttas/${uid}/${author}?lang=${lang}&siteLanguage=en`
}

/** The parallels of a text, by its own uid and its segments' */
export function parallelsUrl(uid) {
  return `${API}/parallels/${uid}`
}

/** The uids with parallels but no text, which /menu leaves out, by the chapter they're listed in */
export function fallenLeavesUrl() {
  return `${API}/fallen_leaves`
}

/** The branches that get a "shortcut to all suttas" link, which lists every text in them */
export function shortcutsUrl() {
  return `${API}/shortcuts`
}

/** A translation's publication details, which .net answers with an error for most translators */
export function publicationInfoUrl(suttaUid, lang, translatorUid) {
  return `${API}/publication_info/${suttaUid}/${lang}/${translatorUid}`
}

/** One of the abbreviation lists: 'texts', 'editions' or 'schools' */
export function abbreviationUrl(kind) {
  return `${API}/abbreviation_${kind}`
}

/** The counts of translations in each language, or of the divisions in the one `isoCode` names */
export function translationCountUrl(isoCode = '') {
  return `${API}/translation_count${isoCode ? `/${isoCode}` : ''}`
}

/** The files in a folder of a GitHub repo, as .net's proxy of GitHub's API lists them */
export function githubDirectoryUrl(repoUrl, path, branch = 'main') {
  const repo = encodeURIComponent(repoUrl)
  return `${API}/github-directory?repo_url=${repo}&path=${encodeURIComponent(path)}&branch=${branch}`
}

/** Every published edition */
export function publicationEditionsUrl() {
  return `${API}/publication/editions`
}

/** The blurbs of every edition, in the language `lang` names */
export function editionBlurbsUrl(lang) {
  return `${API}/publication/edition/blurbs/${lang}`
}

/** Every author's biography */
export function creatorBioUrl() {
  return `${API}/creator_bio`
}

/** One edition, by its id, ie "mn-en-sujato-web_" */
export function publicationEditionUrl(editionId) {
  return `${API}/publication/edition/${editionId}`
}

/** The downloadable files of one edition */
export function publicationEditionFilesUrl(editionId) {
  return `${API}/publication/edition/${editionId}/files`
}

/** The places on /map, as geoJSON features */
export function mapDataUrl() {
  return `${API}/map_data`
}

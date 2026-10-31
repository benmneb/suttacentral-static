/**
 * Kiwix ZIM
 *
 * Writes the site build into one `.zim` file for Kiwix readers, with every page's
 * root-absolute URLs made relative and the site's scripts finding their files from
 * wherever the reader serves it. `_site` itself is only read, so the web and app
 * builds stay as they are.
 *
 * Usage:
 *   pnpm build:zim [version] [zimPath] [siteDir]
 *   ONLY_UIDS=mn1,dn33 pnpm build:zim  (just those pages, plus every asset, for testing)
 *
 * Reuses a ZIM that already exists at `zimPath`. One that fails the checks at
 * the end is left beside it, ending `.unchecked.zim`.
 */
import { Archive, Blob, Creator, FileItem, StringItem } from '@openzim/libzim'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
} from 'fs'
import { availableParallelism } from 'os'
import { dirname, extname, join, relative } from 'path'
import sharp from 'sharp'
import { fileURLToPath, pathToFileURL } from 'url'
import siteMetaData from '../src/data/_siteMetaData.js'
import {
  entryPath,
  isPage,
  patchPagefind,
  rewriteHtml,
  rewriteScript,
  ZIM_FILES,
} from './rewrite.js'

const here = dirname(fileURLToPath(import.meta.url))

const TEXT_TYPES = {
  html: 'text/html',
  css: 'text/css',
  js: 'application/javascript',
  json: 'application/json',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  xml: 'application/xml',
}
const BINARY_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  avif: 'image/avif',
  // Pagefind's own files, gzipped already
  pagefind: 'application/octet-stream',
  pf_meta: 'application/octet-stream',
  pf_index: 'application/octet-stream',
  pf_fragment: 'application/octet-stream',
  pf_filter: 'application/octet-stream',
}

// The root languages of the texts, as ISO 639-3, after the English of the site and translations
// Not SuttaCentral's pra for Prakrit, which isn't ISO 639-3
const LANGUAGES = 'eng,pli,lzh,san,xct,pgd'

// Pages kept with ONLY_UIDS, as the others link to them
const ALWAYS = ['index.html', 'search', 'map', 'define']

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

/** Every file in `dir`, as paths from it, leaving out dotfiles like .DS_Store */
function siteFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .filter(file => !file.split('/').some(part => part.startsWith('.')))
    .sort()
}

function pageTitle(html, siteTitle) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  return title
    .replace(` @ ${siteTitle}`, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ENTITIES[name])
}
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }

/** A ContentProvider for a buffer, as libzim's StringProvider only takes text */
function bufferProvider(buffer) {
  let fed = false
  return {
    size: buffer.length,
    feed() {
      if (fed) return new Blob()
      fed = true
      return new Blob(buffer)
    },
  }
}

/** Whether a root-absolute URL from a page reaches a file in `_site`, as on the web */
function onWeb(files, url) {
  const raw = url.match(/^\/([^?#]*)/)[1].replace(/\/$/, '')
  let path
  try {
    path = decodeURIComponent(raw)
  } catch {
    return false
  }
  return path === ''
    ? files.has('index.html')
    : files.has(path) || files.has(`${path}/index.html`)
}

/** Whether a root-absolute URL is a stylesheet, script, image or the like, not a page */
function isAsset(url) {
  const ext = extname(url.match(/^[^?#]*/)[0]).slice(1)
  return ext !== 'html' && ext in { ...TEXT_TYPES, ...BINARY_TYPES }
}

/** The ZIM path a relative URL in a page goes to */
function zimTarget(entry, url) {
  const base = new URL(encodeURI(entry), 'http://zim/')
  return decodeURIComponent(new URL(url, base).pathname.slice(1))
}

function check(zimPath, targets) {
  const archive = new Archive(zimPath)
  const problems = []
  for (const path of [
    'index.html',
    'pagefind/pagefind-entry.json',
    ...Object.keys(ZIM_FILES),
  ]) {
    if (!archive.hasEntryByPath(path)) problems.push(`no ${path}`)
  }
  if (archive.mainEntry.getItem(true).path !== 'index.html') {
    problems.push('main page')
  }
  if (!archive.hasIllustration(48)) problems.push('no 48x48 illustration')
  if (!archive.hasFulltextIndex()) problems.push('no full-text index')
  if (!archive.hasTitleIndex()) problems.push('no title index')
  for (const [target, source] of targets) {
    if (!archive.hasEntryByPath(target)) {
      problems.push(`${target} (linked from ${source})`)
    }
  }
  return problems
}

export async function createZim(version, zimPath, siteDir = '_site') {
  if (!existsSync(siteDir)) {
    console.error(`Error: Source directory ${siteDir} does not exist!`)
    console.error('Make sure to run `pnpm build` first.')
    process.exit(1)
  }
  if (existsSync(zimPath)) {
    console.log(
      `ZIM already exists at ${zimPath}, using that (delete it to build anew)`
    )
    return
  }

  const meta = siteMetaData()
  if ([...meta.title].length > 30) {
    console.error(
      'Error: The site title is longer than a ZIM title can be (30)'
    )
    process.exit(1)
  }
  const only = process.env.ONLY_UIDS?.split(',').filter(Boolean)
  const files = siteFiles(siteDir)
  const fileSet = new Set(files)
  const uncheckedPath = zimPath.replace(/\.zim$/, '') + '.unchecked.zim'
  const started = Date.now()
  mkdirSync(dirname(zimPath), { recursive: true })

  const creator = new Creator()
    .configIndexing(true, 'eng')
    .configNbWorkers(availableParallelism())
    .startZimCreation(uncheckedPath)

  // Each ZIM path a page links to that exists on the web, and a page linking it
  const targets = new Map()
  const skipped = new Set()
  let added = 0

  console.log(`Creating ZIM from ${siteDir} (${files.length} files)...`)
  for (const file of files) {
    const entry = entryPath(file)
    if (!entry) continue
    const ext = extname(file).slice(1)
    const source = join(siteDir, file)

    if (isPage(file)) {
      if (
        only &&
        !ALWAYS.includes(entry) &&
        !only.some(uid => entry === uid || entry.startsWith(`${uid}/`))
      ) {
        skipped.add(entry)
        continue
      }
      const { html, links } = rewriteHtml(readFileSync(source, 'utf8'), entry)
      for (const { original, rewritten } of links) {
        if (!onWeb(fileSet, original)) {
          if (!isAsset(original)) continue
          console.error(
            `Error: ${entry} needs ${original}, which ${siteDir} doesn't have`
          )
          console.error('Its pages are from different builds, so rebuild it')
          process.exit(1)
        }
        const target = zimTarget(entry, rewritten)
        if (!targets.has(target)) targets.set(target, entry)
      }
      await creator.addItem(
        new StringItem(
          entry,
          TEXT_TYPES.html,
          pageTitle(html, meta.title),
          {
            COMPRESS: 1,
            FRONT_ARTICLE: entry.startsWith('define/') ? 0 : 1,
          },
          html
        )
      )
    } else if (TEXT_TYPES[ext]) {
      let text = readFileSync(source, 'utf8')
      if (/^scripts\/[^/]+\.js$/.test(file)) text = rewriteScript(text, file)
      if (/^pagefind[^/]*\/pagefind(-worker)?\.js$/.test(file)) {
        text = patchPagefind(text, file)
      }
      await creator.addItem(
        new StringItem(entry, TEXT_TYPES[ext], '', { COMPRESS: 1 }, text)
      )
    } else if (BINARY_TYPES[ext]) {
      await creator.addItem(
        new FileItem(entry, BINARY_TYPES[ext], '', { COMPRESS: 0 }, source)
      )
    } else {
      throw new Error(`No MIME type for ${file}, so it can't go in the ZIM`)
    }

    if (++added % 20000 === 0) {
      const seconds = Math.round((Date.now() - started) / 1000)
      console.log(`  ${added} entries added (${seconds}s)`)
    }
  }
  for (const [entry, file] of Object.entries(ZIM_FILES)) {
    await creator.addItem(
      new StringItem(
        entry,
        TEXT_TYPES[extname(file).slice(1)],
        '',
        { COMPRESS: 1 },
        readFileSync(join(here, file), 'utf8')
      )
    )
  }

  const illustration = await sharp(
    join(here, '../src/images/favicon-250x250.png')
  )
    .resize(48, 48)
    .png()
    .toBuffer()
  creator.addIllustration(48, bufferProvider(illustration))

  creator.addMetadata('Name', `${new URL(meta.origin).hostname}_en_all`)
  creator.addMetadata('Title', meta.title)
  creator.addMetadata(
    'Description',
    'Early Buddhist texts, translations and parallels'
  )
  creator.addMetadata(
    'LongDescription',
    `A complete offline copy of ${meta.origin}, version ${version}. It has every sutta, vinaya and abhidhamma text in its root language, all English translations, notes, parallels and search. The texts are from SuttaCentral (https://suttacentral.net), as they were on the build date.`
  )
  creator.addMetadata('Language', LANGUAGES)
  creator.addMetadata('Creator', 'SuttaCentral')
  creator.addMetadata('Publisher', meta.maintainer.name)
  creator.addMetadata('Date', new Date().toISOString().slice(0, 10))
  creator.addMetadata('Source', meta.origin)
  creator.addMetadata(
    'License',
    'CC0 1.0 for SuttaCentral’s own texts and translations; others as each one states'
  )
  creator.addMetadata('Tags', 'buddhism;suttas;pali;_ftindex:yes;_pictures:yes')
  const { name } = JSON.parse(readFileSync(join(here, '../package.json')))
  creator.addMetadata('Scraper', `${name} ${version}`)
  creator.setMainPath('index.html')

  console.log(`Finishing ZIM (compressing and indexing ${added} entries)...`)
  await creator.finishZimCreation()

  for (const entry of skipped) targets.delete(entry)
  console.log(`Checking ${targets.size} link targets...`)
  const problems = check(uncheckedPath, targets)
  if (problems.length) {
    console.error(`Error: the ZIM has ${problems.length} problems:`)
    for (const problem of problems.slice(0, 20)) console.error(`  ${problem}`)
    console.error(`It's left at ${uncheckedPath}`)
    process.exit(1)
  }
  renameSync(uncheckedPath, zimPath)

  const minutes = Math.round((Date.now() - started) / 60000)
  console.log(`ZIM created: ${zimPath} (${minutes} min)`)
  console.log(`ZIM size: ${formatBytes(statSync(zimPath).size)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [
    version = '0.0.0-test',
    zimPath = `.dist/scx_archive-${version}.zim`,
    siteDir,
  ] = process.argv.slice(2)
  await createZim(version, zimPath, siteDir)
}

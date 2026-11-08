/**
 * Release Archive
 *
 * Packs the site build into a `.tar.gz` holding a `{slug}_{version}` folder, plus a
 * README.txt beside it saying what it is and how to use it.
 *
 * Usage:
 *   node tools/archive.js <version> <archivePath>
 *   or import `createArchive` (as `tools/release.js` does)
 */
import { execFileSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join, resolve } from 'path'
import { pathToFileURL } from 'url'
import siteMetaData from '../src/data/_siteMetaData.js'

export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function siteStats(siteDir) {
  let pages = 0
  let files = 0
  let bytes = 0
  for (const entry of readdirSync(siteDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue
    files++
    if (entry.name.endsWith('.html')) pages++
    bytes += statSync(join(entry.parentPath, entry.name)).size
  }
  return { pages, files, bytes }
}

function readme(version, folder, { pages, files, bytes }) {
  const { origin, releases = [], title } = siteMetaData()
  const num = n => n.toLocaleString('en-US')
  const width = Math.max(folder.length + 1, 'README.txt'.length) + 3
  const date = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return `${title} offline archive
Version ${version}, built ${date}

A complete offline copy of ${origin}. It has every
sutta, vinaya and abhidhamma text in its root language, all English
translations, notes, parallels and search. The texts are from
SuttaCentral (https://suttacentral.net), as they were on the build date.

Contents
  ${`${folder}/`.padEnd(width)}the site: ${num(pages)} pages, ${num(files)} files, ${formatBytes(bytes)}
  ${'README.txt'.padEnd(width)}this file

Using it
The folder has to be served over HTTP. Opening index.html directly
won't work, as its links start from the site root, which a file:// URL
doesn't have.

  Computer: in a terminal, from this folder, run
    python3 -m http.server --directory ${folder}
  then visit the URL provided

  Phone or tablet: use a free "HTTP server" app from the App Store or
  Play Store, and point it at the ${folder} folder.

Reading works without JavaScript. Search, saved settings and dictionary
lookups need it.

Apps and updates
Native desktop and mobile apps with this same content, and any newer
versions with fresher content, are at:
${releases.map(url => `  ${url}`).join('\n')}

Licence
The site's code is public domain (CC0). Texts and translations keep
their own licences: see /licensing on the site.
`
}

/**
 * Pack `siteDir` into `archivePath` as `{slug}_{version}/`, with a README.txt beside it.
 * Reuses an archive that already exists.
 */
export function createArchive(version, archivePath, siteDir = '_site') {
  if (!existsSync(siteDir)) {
    console.error(`Error: Source directory ${siteDir} does not exist!`)
    console.error('Make sure to run `pnpm build` first.')
    process.exit(1)
  }
  if (existsSync(archivePath)) {
    console.log(`Archive already exists at ${archivePath}, using that`)
    return
  }

  const folder = `${siteMetaData().slug}_${version}`
  const site = resolve(siteDir)
  const tmp = mkdtempSync(join(tmpdir(), 'scx-archive-'))

  try {
    console.log(`Creating archive from ${siteDir} as ${folder}/...`)
    writeFileSync(
      join(tmp, 'README.txt'),
      readme(version, folder, siteStats(site))
    )
    mkdirSync(dirname(archivePath), { recursive: true })

    // GNU tar renames with --transform, bsdtar (macOS) with -s
    const gnu = execFileSync('tar', ['--version'], {
      encoding: 'utf-8',
    }).includes('GNU tar')
    const rename = `,^${basename(site)},${folder},`
    execFileSync('tar', [
      '-czf',
      archivePath,
      ...(gnu ? [`--transform=s${rename}`] : ['-s', rename]),
      '-C',
      tmp,
      'README.txt',
      '-C',
      dirname(site),
      basename(site),
    ])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  const archiveSize = statSync(archivePath).size
  console.log(`Archive created: ${archivePath}`)
  console.log(`Archive size: ${formatBytes(archiveSize)}`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, archivePath] = process.argv.slice(2)
  if (!version || !archivePath) {
    console.error('Usage: node tools/archive.js <version> <archivePath>')
    process.exit(1)
  }
  createArchive(version, archivePath)
}

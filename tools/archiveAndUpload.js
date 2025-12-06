#!/usr/bin/env node

/**
 * Creates a timestamped archive of the site build directory and optionally uploads it to
 * Codeberg and GitHub releases. Supports dry-run mode for testing without uploads.
 * Sourcehut currently has 100mb file size limits so doesn't work there.
 *
 * Environment Variables:
 *   CODEBERG_TOKEN   - Personal access token for Codeberg API
 *   CODEBERG_REPO    - Codeberg repository in format "owner/repo"
 *   GITHUB_TOKEN     - Personal access token for GitHub API
 *   GITHUB_REPO      - GitHub repository in format "owner/repo"
 *   SITE_BUILD_DIR   - Directory to archive (11ty's default: "_site")
 *
 * Usage:
 *   1. Add an annotated tag to a commit hash, ie `git tag -a v1.1.0 31615a1`, then a useful message
 *   2. Push the tag to remotes, ie `git push origin v1.1.0`
 *   3. Checkout that commit, ie `git checkout 31615a1`, if not already
 *   4. Run this script with `pnpm run archive:upload`
 *
 * Notes:
 *   - Requires Node.js >= 18 (for fetch support) or uses execSync for curl-based SourceHut uploads.
 *   - Must be run on a git tag.
 *   - Archives are stored in `.dist` directory.
 */
import { execSync } from 'child_process'
import { createReadStream, existsSync, mkdirSync, statSync } from 'fs'
import https from 'https'
import { basename, join } from 'path'

// const SOURCEHUT_TOKEN = process.env.SOURCEHUT_TOKEN
const CODEBERG_TOKEN = process.env.CODEBERG_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
// const SOURCEHUT_REPO = process.env.SOURCEHUT_REPO // format: "~owner/repo"
const CODEBERG_REPO = process.env.CODEBERG_REPO // format: "owner/repo"
const GITHUB_REPO = process.env.GITHUB_REPO // format: "owner/repo"

const SITE_BUILD_DIR = process.env.SITE_DIR || '_site'
const DRY_RUN = process.argv.includes('dry') // skips uploads

function getGitTag(dryRun = false) {
  try {
    return execSync('git describe --tags --exact-match', {
      encoding: 'utf-8',
    }).trim()
  } catch (error) {
    if (dryRun) {
      console.warn(
        "⚠️  Warning: No git tag found. Using 'dry-run' as tag (OK for dry runs)"
      )
      return 'dry-run'
    }
    console.error(
      "Error: No git tag found. Make sure you're on a tagged commit."
    )
    process.exit(1)
  }
}

function getGitTagMessage(tag) {
  try {
    const message = execSync(`git tag -l --format='%(contents)' ${tag}`, {
      encoding: 'utf-8',
    }).trim()

    return message
  } catch (error) {
    console.warn('⚠️  Warning: Could not get tag message, using default')
    return `Release ${tag}`
  }
}

function getTimestamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')

  return `${year}${month}${day}-${hours}${minutes}${seconds}`
}

function getArchiveName(tag) {
  const timestamp = getTimestamp()
  // Remove 'v' prefix from tag if present for cleaner filename
  const cleanTag = tag.startsWith('v') ? tag.substring(1) : tag
  // return `scx_archive-${cleanTag}-${timestamp}.tar.gz`
  return `scx_archive-${cleanTag}.tar.gz`
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function ensureDistDirectory() {
  const distDir = join(process.cwd(), '.dist')
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
  }
  return distDir
}

function createArchive(sourceDir, archivePath) {
  if (!existsSync(sourceDir)) {
    console.error(`Error: Source directory ${sourceDir} does not exist!`)
    console.error('Make sure to run `pnpm run build` first.')
    process.exit(1)
  }
  if (existsSync(archivePath)) {
    console.log(`Archive already exists at ${archivePath}, using that`)
    return
  }

  console.log(`Creating archive from ${sourceDir}...`)
  execSync(`tar -czf ${archivePath} -C ${sourceDir} .`)

  const archiveSize = statSync(archivePath).size
  console.log(`Archive created: ${archivePath}`)
  console.log(`Archive size: ${formatBytes(archiveSize)}`)
}

function makeHTTPRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      ...options,
      timeout: 60000, // 60 second timeout
      family: 4, // Force IPv4
    }

    const req = https.request(requestOptions, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        console.log(`Response status: ${res.statusCode}`)
        console.log(`Response body: ${body}`)

        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body || '{}'))
          } catch (e) {
            resolve(body)
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        }
      })
    })

    req.on('error', err => {
      console.error('Request error:', err)
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timed out'))
    })

    if (data) {
      req.write(data)
    }
    req.end()
  })
}

// /**
//  * @see https://docs.sourcehut.org/git.sr.ht/
//  */
// async function uploadToSourcehut(tag, archivePath) {
// 	console.log('→ Fetching all accessible SourceHut repositories...')

// 	const [owner, repo] = SOURCEHUT_REPO.split('/')

// 	const getReposCmd = `curl -s -H "Authorization: Bearer ${SOURCEHUT_TOKEN}" \
//     -X POST -H "Content-Type: application/json" \
//     -d '{"query":"query { repositories { results { id name owner { canonicalName } } cursor } }"}' \
//     https://git.sr.ht/query`

// 	let repoId
// 	try {
// 		const resp = execSync(getReposCmd, { encoding: 'utf-8' })
// 		const json = JSON.parse(resp)

// 		if (
// 			!json.data ||
// 			!json.data.repositories ||
// 			!json.data.repositories.results
// 		) {
// 			console.error('[srht] Failed to get repositories:', resp)
// 			process.exit(1)
// 		}

// 		const match = json.data.repositories.results.find(
// 			(r) => r.name === repo && r.owner?.canonicalName === owner
// 		)

// 		if (!match) {
// 			console.error(`[srht] Repository not found: ${owner}/${repo}`)
// 			process.exit(1)
// 		}

// 		repoId = match.id
// 		console.log(
// 			`[srht] ✓ Found repository '${owner}/${repo}' with ID ${repoId}`
// 		)
// 	} catch (err) {
// 		console.error('[srht] Error fetching repositories:', err.message)
// 		process.exit(1)
// 	}

// 	console.log(
// 		`[srht] → Uploading archive '${basename(archivePath)}' to ${SOURCEHUT_REPO} at revspec '${tag}'...`
// 	)

// 	const uploadCmd = `curl -s -H "Authorization: Bearer ${SOURCEHUT_TOKEN}" \
//     -F 'operations={"query":"mutation Upload($repoId: Int!, $revspec: String!, $file: Upload!) { uploadArtifact(repoId: $repoId, revspec: $revspec, file: $file) { id size created } }","variables":{"repoId":${repoId},"revspec":"${tag}","file":null}}' \
//     -F 'map={ "0": ["variables.file"] }' \
//     -F "0=@${archivePath}" \
//     https://git.sr.ht/query`

// 	try {
// 		const uploadResp = execSync(uploadCmd, { encoding: 'utf-8' })
// 		const uploadJson = JSON.parse(uploadResp)
// 		console.log('[srht] Response:', uploadJson)

// 		if (uploadJson.errors) {
// 			console.error('[srht] ✗ Upload failed', uploadJson.errors)
// 			process.exit(1)
// 		}
// 	} catch (err) {
// 		console.error('[srht] Error uploading artifact:', err.message)
// 		process.exit(1)
// 	}
// }

async function createCodebergRelease(tag, message) {
  console.log('Creating Codeberg release...')

  const [owner, repo] = CODEBERG_REPO.split('/')
  const options = {
    hostname: 'codeberg.org',
    path: `/api/v1/repos/${owner}/${repo}/releases`,
    method: 'POST',
    headers: {
      Authorization: `token ${CODEBERG_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }

  const releaseData = JSON.stringify({
    tag_name: tag,
    name: tag,
    body: message,
    draft: false,
    prerelease: false,
  })

  return makeHTTPRequest(options, releaseData)
}

async function uploadToCodeberg(release, archivePath) {
  console.log('Uploading to Codeberg...')

  const [owner, repo] = CODEBERG_REPO.split('/')
  const fileName = basename(archivePath)
  const fileSize = statSync(archivePath).size

  const options = {
    hostname: 'codeberg.org',
    path: `/api/v1/repos/${owner}/${repo}/releases/${release.id}/assets?name=${fileName}`,
    method: 'POST',
    headers: {
      Authorization: `token ${CODEBERG_TOKEN}`,
      'Content-Type': 'application/gzip',
      'Content-Length': fileSize,
      Accept: 'application/json',
    },
    family: 4,
    timeout: 0, // Disable timeout
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        console.log(`Upload response status: ${res.statusCode}`)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body || '{}'))
          } catch (e) {
            resolve(body)
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        }
      })
    })

    req.on('error', err => {
      console.error('Upload error:', err)
      reject(err)
    })

    // Stream the file instead of loading it all into memory
    const fileStream = createReadStream(archivePath)

    let uploadedBytes = 0
    fileStream.on('data', chunk => {
      uploadedBytes += chunk.length
      const progress = ((uploadedBytes / fileSize) * 100).toFixed(1)
      process.stdout.write(
        `\rUploading: ${progress}% (${formatBytes(uploadedBytes)} / ${formatBytes(fileSize)})`
      )
    })

    fileStream.on('end', () => {
      console.log('\nUpload stream finished, waiting for server response...')
    })

    fileStream.on('error', reject)
    fileStream.pipe(req)
  })
}

async function createGitHubRelease(tag, message) {
  console.log('Creating GitHub release...')

  const [owner, repo] = GITHUB_REPO.split('/')
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/releases`,
    method: 'POST',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Node.js Release Script',
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
  }

  const releaseData = JSON.stringify({
    tag_name: tag,
    name: tag,
    body: message,
    draft: false,
    prerelease: false,
  })

  return makeHTTPRequest(options, releaseData)
}

async function uploadToGitHub(release, archivePath) {
  console.log('Uploading to GitHub...')

  const [owner, repo] = GITHUB_REPO.split('/')
  const fileName = basename(archivePath)
  const fileSize = statSync(archivePath).size

  const options = {
    hostname: 'uploads.github.com',
    path: `/repos/${owner}/${repo}/releases/${release.id}/assets?name=${fileName}`,
    method: 'POST',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Node.js Release Script',
      'Content-Type': 'application/gzip',
      'Content-Length': fileSize,
      Accept: 'application/vnd.github.v3+json',
    },
    family: 4,
    timeout: 0, // Disable timeout
  }

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = ''
      res.on('data', chunk => (body += chunk))
      res.on('end', () => {
        console.log(`Upload response status: ${res.statusCode}`)
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body || '{}'))
          } catch (e) {
            resolve(body)
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`))
        }
      })
    })

    req.on('error', err => {
      console.error('Upload error:', err)
      reject(err)
    })

    const fileStream = createReadStream(archivePath)

    let uploadedBytes = 0
    fileStream.on('data', chunk => {
      uploadedBytes += chunk.length
      const progress = ((uploadedBytes / fileSize) * 100).toFixed(1)
      process.stdout.write(
        `\rUploading: ${progress}% (${formatBytes(uploadedBytes)} / ${formatBytes(fileSize)})`
      )
    })

    fileStream.on('end', () => {
      console.log('\nUpload stream finished, waiting for server response...')
    })

    fileStream.on('error', reject)
    fileStream.pipe(req)
  })
}

async function main() {
  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - Archive will be created but not uploaded\n')
  }

  // const hasSourcehut = SOURCEHUT_TOKEN && SOURCEHUT_REPO
  const hasCodeberg = CODEBERG_TOKEN && CODEBERG_REPO
  const hasGitHub = GITHUB_TOKEN && GITHUB_REPO

  // if (!DRY_RUN && !hasSourcehut && !hasCodeberg && !hasGitHub) {
  if (!DRY_RUN && !hasCodeberg && !hasGitHub) {
    // console.log('⊘ Sourcehut not configured')
    console.log('⊘ Codeberg not configured')
    console.log('⊘ GitHub not configured')
    console.error('Error: At least one platform must be configured.')
    process.exit(1)
  }

  if (!DRY_RUN) {
    // if (hasSourcehut) console.log('✓ Sourcehut configured')
    // else console.log('⊘ Sourcehut not configured (skipping)')

    if (hasCodeberg) console.log('✓ Codeberg configured')
    else console.log('⊘ Codeberg not configured (skipping)')

    if (hasGitHub) console.log('✓ GitHub configured')
    else console.log('⊘ GitHub not configured (skipping)')
  }

  const tag = getGitTag(DRY_RUN)
  console.log(`Found git tag: ${tag}`)

  const tagMessage = getGitTagMessage(tag)
  console.log(
    `Tag message: ${tagMessage.substring(0, 100)}${tagMessage.length > 100 ? '...' : ''}`
  )

  const distDir = ensureDistDirectory()
  const archiveName = getArchiveName(tag)
  const archivePath = join(distDir, archiveName)
  console.log(`Archive filename: ${archiveName}`)

  createArchive(SITE_BUILD_DIR, archivePath)

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - Skipping uploads')
    console.log('\n✓ Dry run completed successfully!')
    return
  }

  try {
    // if (hasSourcehut) {
    // 	await uploadToSourcehut(tag, archivePath)
    // 	console.log('✓ Successfully uploaded to Sourcehut')
    // }

    if (hasCodeberg) {
      const codebergRelease = await createCodebergRelease(tag, tagMessage)
      await uploadToCodeberg(codebergRelease, archivePath)
      console.log('✓ Successfully uploaded to Codeberg')
    }

    if (hasGitHub) {
      const githubRelease = await createGitHubRelease(tag, tagMessage)
      await uploadToGitHub(githubRelease, archivePath)
      console.log('✓ Successfully uploaded to GitHub')
    }

    console.log('\n✓ All uploads completed successfully!')
  } catch (error) {
    console.error('\n✗ Error:', error.message)
    process.exit(1)
  }
}

main()

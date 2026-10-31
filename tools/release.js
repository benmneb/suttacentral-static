#!/usr/bin/env node

/**
 * Handle Codeberg/Github releases
 *
 * Creates an archive of the site build directory and a Kiwix ZIM of it, and uploads
 * them to Codeberg and GitHub releases with PGP-signed SHA256 checksums. Supports
 * dry-run mode for testing without uploads.
 * Supports CI mode for automated releases in GitHub Actions.
 * Sourcehut currently has 100mb file size limits so doesn't work there.
 *
 * Environment Variables:
 *   CODEBERG_TOKEN    - Personal access token for Codeberg API
 *   CODEBERG_REPO     - Codeberg repository in format "owner/repo"
 *   GITHUB_TOKEN      - Personal access token for GitHub API
 *   GITHUB_REPO       - GitHub repository in format "owner/repo"
 *   VERCEL_TOKEN      - Authentication token for Vercel CLI
 *   VERCEL_ORG_ID     - Vercel organization/user ID
 *   VERCEL_PROJECT_ID - Vercel project ID
 *   SITE_DIR          - Directory to archive (default: "_site")
 *   CI                - Set to enable CI mode (disables interactive prompts)
 *   GITHUB_ACTIONS    - Auto-set by GitHub Actions (enables CI mode)
 *
 * Usage:
 *   Manual workflow:
 *     1. Create and push git tag: git tag -a v1.0.0 -m "Release notes"
 *     2. Run: `pnpm release:upload`
 *     3. Script creates archive and ZIM, signs their checksums and uploads to Codeberg/GitHub
 *     4. Script deploys to Vercel production
 *
 *   Dry run mode (testing):
 *     - Run: `pnpm release:dry`
 *     - Creates archive and ZIM but skips signing, uploads and deployments
 *     - Uses test tag v0.0.0-test if no git tag exists
 *
 *   Without the ZIM:
 *     - Add `nozim`, ie `pnpm release:dry nozim`
 *
 *   Signing:
 *     - Needs gpg with the key in `_siteMetaData.js`'s `pgpPublicKey`; skipped with a warning without it
 *
 *   CI mode (GitHub Actions):
 *     - Detected via CI or GITHUB_ACTIONS environment variables
 *     - Requires git tag to already exist
 *
 * Requirements:
 *   - Git tag must exist and start with lowercase "v" (e.g., v1.3.0)
 *   - At least one platform (Codeberg or GitHub) must be configured
 *   - Archives are stored in `.dist` directory
 *   - Node.js >= 18 required
 */
import { execFileSync, execSync } from 'child_process'
import { createHash } from 'crypto'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'fs'
import https from 'https'
import { basename, join } from 'path'
import siteMetaData from '../src/data/_siteMetaData.js'
import { createArchive, formatBytes } from './archive.js'

// const SOURCEHUT_TOKEN = process.env.SOURCEHUT_TOKEN
const CODEBERG_TOKEN = process.env.CODEBERG_TOKEN
const GITHUB_TOKEN = process.env.GITHUB_TOKEN
// const SOURCEHUT_REPO = process.env.SOURCEHUT_REPO // format: "~owner/repo"
const CODEBERG_REPO = process.env.CODEBERG_REPO // format: "owner/repo"
const GITHUB_REPO = process.env.GITHUB_REPO // format: "owner/repo"
const VERCEL_TOKEN = process.env.VERCEL_TOKEN
const VERCEL_ORG_ID = process.env.VERCEL_ORG_ID
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID

const SITE_BUILD_DIR = process.env.SITE_DIR || '_site'

const PGP_KEY = siteMetaData().pgpPublicKey
const CHECKSUMS_NAME = 'SHA256SUMS.txt'

// Parse command-line arguments
const args = process.argv.slice(2)
const DRY_RUN = args.includes('dry')
const NO_ZIM = args.includes('nozim')

function isCI() {
  return !!(process.env.CI || process.env.GITHUB_ACTIONS)
}

function getGitTag(allowNull = false) {
  try {
    return execSync('git describe --tags --exact-match', {
      encoding: 'utf-8',
    }).trim()
  } catch (error) {
    if (allowNull) {
      return null
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
    return `Version ${tag}`
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
  const cleanTag = tag.startsWith('v') ? tag.substring(1) : tag
  return `scx_archive-${cleanTag}.tar.gz`
}

function getZimName(tag) {
  const cleanTag = tag.startsWith('v') ? tag.substring(1) : tag
  return `scx_archive-${cleanTag}.zim`
}

function contentType(filePath) {
  if (filePath.endsWith('.tar.gz')) return 'application/gzip'
  if (filePath.endsWith('.zim')) return 'application/x-openzim'
  if (filePath.endsWith('.asc')) return 'application/pgp-signature'
  return 'text/plain'
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/**
 * Write SHA256SUMS.txt for the assets, as `sha256sum -c` reads it, and sign it with
 * the release key where gpg has it
 * @returns {Promise<string[]>} the checksums file, and its signature if signed
 */
async function signAssets(distDir, assetPaths) {
  const checksumsPath = join(distDir, CHECKSUMS_NAME)
  const lines = []
  for (const assetPath of assetPaths) {
    console.log(`Checksumming ${basename(assetPath)}...`)
    lines.push(`${await sha256(assetPath)}  ${basename(assetPath)}`)
  }
  writeFileSync(checksumsPath, lines.join('\n') + '\n')
  console.log(`✓ Wrote ${CHECKSUMS_NAME}`)

  try {
    if (!PGP_KEY) throw new Error('No pgpPublicKey')
    execFileSync('gpg', ['--list-secret-keys', PGP_KEY], { stdio: 'ignore' })
  } catch {
    console.warn(
      `⚠️  gpg or the release key (pgpPublicKey in _siteMetaData.js) isn't available, so ${CHECKSUMS_NAME} is unsigned`
    )
    return [checksumsPath]
  }
  execFileSync(
    'gpg',
    [
      '--yes',
      '--armor',
      '--local-user',
      PGP_KEY,
      '--detach-sign',
      checksumsPath,
    ],
    { stdio: 'inherit' }
  )
  console.log(`✓ Signed ${CHECKSUMS_NAME}`)
  return [checksumsPath, `${checksumsPath}.asc`]
}

function ensureDistDirectory() {
  const distDir = join(process.cwd(), '.dist')
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
  }
  return distDir
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

async function uploadWithRetry(uploadFunc, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await uploadFunc()
    } catch (error) {
      if (error.code === 'EPIPE' && i < maxRetries - 1) {
        console.log(`\n⚠️  Upload failed, retrying (${i + 1}/${maxRetries})...`)
        await new Promise(resolve => setTimeout(resolve, 2000)) // wait 2s
        continue
      }
      throw error
    }
  }
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
      'Content-Type': contentType(archivePath),
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
      'Content-Type': contentType(archivePath),
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

async function deployToVercel(isDryRun = false) {
  const deployType = isDryRun ? 'Preview' : 'Production'
  console.log(`Deploying to Vercel ${deployType}...`)

  const prodFlag = isDryRun ? '' : '--prod'
  const command = `npx vercel deploy --archive=tgz --cwd=_site ${prodFlag} -A "${join(process.cwd(), 'vercel.json')}" --token="${VERCEL_TOKEN}"`

  try {
    // Run deployment and capture output
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
    })

    // Extract deployment URL from output
    // Vercel outputs the URL on a line by itself
    const urlMatch = output.match(/https:\/\/[^\s]+/)
    const deploymentUrl = urlMatch ? urlMatch[0] : null

    return deploymentUrl
  } catch (error) {
    throw new Error(`Vercel deployment failed: ${error.message}`)
  }
}

async function main() {
  if (isCI()) {
    console.log('🤖 Running in CI mode\n')
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - Archives will be created but not uploaded\n')
  }

  // const hasSourcehut = SOURCEHUT_TOKEN && SOURCEHUT_REPO
  const hasCodeberg = CODEBERG_TOKEN && CODEBERG_REPO
  const hasGitHub = GITHUB_TOKEN && GITHUB_REPO
  const hasVercel = VERCEL_TOKEN && VERCEL_ORG_ID && VERCEL_PROJECT_ID

  // if (!DRY_RUN && !hasSourcehut && !hasCodeberg && !hasGitHub && !hasVercel) {
  if (!DRY_RUN && !hasCodeberg && !hasGitHub && !hasVercel) {
    // console.log('⊘ Sourcehut not configured')
    console.log('⊘ Codeberg not configured')
    console.log('⊘ GitHub not configured')
    console.log('⊘ Vercel not configured')
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

    if (hasVercel) console.log('✓ Vercel configured')
    else console.log('⊘ Vercel not configured (skipping)')
  }

  // Require git tag to exist (allow test tag only in dry run mode)
  let tag = getGitTag(true)

  if (!tag) {
    if (DRY_RUN) {
      console.log('🔍 DRY RUN: Using test version v0.0.0-test')
      tag = 'v0.0.0-test'
    } else {
      console.error('Error: No git tag found.')
      console.error(
        'Create a git tag first: git tag -a v1.0.0 -m "Release notes"'
      )
      process.exit(1)
    }
  } else {
    console.log(`Found git tag: ${tag}`)
  }

  // Validate tag format
  if (tag && !tag.startsWith('v')) {
    console.error(`Error: Tag '${tag}' does not start with lowercase 'v'`)
    console.error('Version tags must follow the format: v1.2.3')
    process.exit(1)
  }

  const tagMessage = getGitTagMessage(tag)
  console.log(
    `Tag message: ${tagMessage.substring(0, 100)}${tagMessage.length > 100 ? '...' : ''}`
  )

  const distDir = ensureDistDirectory()
  const archiveName = getArchiveName(tag)
  const archivePath = join(distDir, archiveName)
  console.log(`Archive filename: ${archiveName}`)

  createArchive(tag.replace(/^v/, ''), archivePath, SITE_BUILD_DIR)
  const assetPaths = [archivePath]

  if (!NO_ZIM) {
    const zimName = getZimName(tag)
    const zimPath = join(distDir, zimName)
    console.log(`ZIM filename: ${zimName}`)
    execFileSync(
      'pnpm',
      ['build:zim', tag.replace(/^v/, ''), zimPath, SITE_BUILD_DIR],
      { stdio: 'inherit' }
    )
    assetPaths.push(zimPath)
  }

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - Skipping uploads')
    console.log('\n✓ Dry run completed successfully!')
    return
  }

  try {
    if (hasCodeberg || hasGitHub) {
      assetPaths.push(...(await signAssets(distDir, assetPaths)))
    }

    if (hasCodeberg) {
      const codebergRelease = await createCodebergRelease(tag, tagMessage)
      for (const assetPath of assetPaths) {
        await uploadWithRetry(() =>
          uploadToCodeberg(codebergRelease, assetPath)
        )
      }
      console.log('✓ Successfully uploaded to Codeberg')
    }

    if (hasGitHub) {
      const githubRelease = await createGitHubRelease(tag, tagMessage)
      for (const assetPath of assetPaths) {
        await uploadWithRetry(() => uploadToGitHub(githubRelease, assetPath))
      }
      console.log('✓ Successfully uploaded to GitHub')
    }

    if (hasVercel) {
      const vercelUrl = await deployToVercel(DRY_RUN)
      if (vercelUrl) {
        console.log(`✓ Successfully deployed to Vercel: ${vercelUrl}`)
      } else {
        console.log('✓ Successfully deployed to Vercel')
      }
    }

    console.log('\n✓ All uploads completed successfully!')
  } catch (error) {
    console.error('\n✗ Error:', error.message)
    process.exit(1)
  }
}

main()

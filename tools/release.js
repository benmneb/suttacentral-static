#!/usr/bin/env node

/**
 * Handle Codeberg/Github releases
 *
 * Creates an archive of the site build directory and uploads it to
 * Codeberg and GitHub releases. Supports dry-run mode for testing without uploads.
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
 *   SITE_BUILD_DIR    - Directory to archive (default: "_site")
 *   CI                - Set to enable CI mode (disables interactive prompts)
 *   GITHUB_ACTIONS    - Auto-set by GitHub Actions (enables CI mode)
 *
 * Usage:
 *   With existing git tag:
 *     1. Checkout a tagged commit
 *     2. Run: `pnpm run release:upload`
 *
 *   Without git tag (local, interactive workflow):
 *     1. Run with version argument: `pnpm run release:upload v1.3.0`
 *     2. Script updates package.json version
 *     3. Script prompts to commit changes
 *     4. Script opens editor to create annotated git tag
 *     5. Script prompts to push tag to remotes
 *     6. Script creates archive and uploads to configured platforms
 *
 *   Dry run mode:
 *     - Use dry run script: `pnpm run release:dry v1.3.0`
 *     - Creates archive but skips uploads and remote push
 *
 *   CI mode (on Github, automated):
 *     - Detected via CI or GITHUB_ACTIONS environment variables
 *     - Requires git tag to already exist
 *     - Skips all interactive prompts
 *     - Skips git tag creation and push operations
 *
 * Requirements:
 *   - Version argument must start with lowercase "v" (e.g., v1.3.0)
 *   - At least one platform (Codeberg or GitHub) must be configured
 *   - Archives are stored in `.dist` directory
 *   - Node.js >= 18 required
 *
 * Interactive workflow ensures:
 *   - package.json version stays in sync with git tags
 *   - Tags are pushed to remotes before creating releases
 *   - All releases are associated with tagged commits
 */
import { execSync } from 'child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs'
import https from 'https'
import { basename, join } from 'path'
import * as readline from 'readline'

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

// Parse command-line arguments
const args = process.argv.slice(2)
const DRY_RUN = args.includes('dry')
const versionArg = args.find(arg => arg.startsWith('v') && arg !== 'dry')

// Detect CI environment
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

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function updatePackageVersion(version) {
  const packagePath = join(process.cwd(), 'package.json')

  if (!existsSync(packagePath)) {
    console.error(`✗ Error: package.json not found at ${packagePath}`)
    process.exit(1)
  }

  try {
    const packageContent = readFileSync(packagePath, 'utf-8')
    const packageJson = JSON.parse(packageContent)

    const cleanVersion = version.startsWith('v')
      ? version.substring(1)
      : version

    const oldVersion = packageJson.version
    packageJson.version = cleanVersion

    writeFileSync(
      packagePath,
      JSON.stringify(packageJson, null, 2) + '\n',
      'utf-8'
    )

    console.log(
      `✓ Updated package.json version: ${oldVersion} → ${cleanVersion}`
    )
    return true
  } catch (error) {
    console.error(`✗ Error updating package.json: ${error.message}`)
    process.exit(1)
  }
}

function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim().toLowerCase())
    })
  })
}

function hasUncommittedChanges() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' })
    return status.trim().length > 0
  } catch (error) {
    return false
  }
}

async function createGitTagInteractively(version) {
  if (hasUncommittedChanges()) {
    console.log(
      '\nℹ️  You have uncommitted changes (including the package.json update).'
    )
    const shouldCommit = await promptUser(
      'Would you like to commit these changes now? (y/n): '
    )

    if (shouldCommit === 'y' || shouldCommit === 'yes') {
      console.log('\nStaging all changes...')
      execSync('git add -A', { stdio: 'inherit' })

      const cleanVersion = version.startsWith('v')
        ? version.substring(1)
        : version
      try {
        execSync(`git commit -m "chore: release version ${cleanVersion}"`, {
          stdio: 'inherit',
        })
        console.log('✓ Changes committed')
      } catch (error) {
        console.error('✗ Commit failed or was cancelled')
        process.exit(1)
      }
    } else {
      console.log('\n⚠️  Cannot create tag without committing changes first.')
      console.log(
        'Please commit your changes manually, then run this script again.'
      )
      process.exit(0)
    }
  }

  console.log(`\nCreating annotated git tag: ${version}`)
  console.log('Opening editor for tag message...')

  try {
    const cleanVersion = version.startsWith('v')
      ? version.substring(1)
      : version

    // Create a temporary file with the default message
    const { mkdtempSync, writeFileSync, rmSync } = await import('fs')
    const { tmpdir } = await import('os')
    const tempDir = mkdtempSync(join(tmpdir(), 'git-tag-'))
    const tempFile = join(tempDir, 'TAG_EDITMSG')

    writeFileSync(
      tempFile,
      `Version ${cleanVersion}\n\n# Add release notes below:\n`
    )

    // Use git tag with the pre-filled message file
    execSync(`git tag -a ${version} -F ${tempFile} -e`, {
      stdio: 'inherit',
    })

    // Clean up
    rmSync(tempDir, { recursive: true })

    console.log(`✓ Git tag '${version}' created successfully`)
  } catch (error) {
    console.error('✗ Tag creation failed or was cancelled')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✓ Tag creation complete')
  console.log('='.repeat(60) + '\n')
}

async function pushTagToRemotes(tag) {
  console.log('\n' + '='.repeat(60))
  console.log('PUSHING TAG TO REMOTES')
  console.log('='.repeat(60))

  // Get list of remotes
  let remotes
  try {
    remotes = execSync('git remote', { encoding: 'utf-8' })
      .trim()
      .split('\n')
      .filter(r => r)
  } catch (error) {
    console.error('✗ Failed to get git remotes')
    process.exit(1)
  }

  if (remotes.length === 0) {
    console.log('⚠️  No git remotes configured. Skipping push.')
    return
  }

  console.log(`\nFound remotes: ${remotes.join(', ')}`)
  const shouldPush = await promptUser(
    `\nPush commits and tag '${tag}' to all remotes? (y/n): `
  )

  if (shouldPush === 'y' || shouldPush === 'yes') {
    console.log('\nPushing commits to remotes...')
    for (const remote of remotes) {
      try {
        execSync(`git push ${remote}`, { stdio: 'inherit' })
        console.log(`✓ Successfully pushed commits to ${remote}`)
      } catch (error) {
        console.warn(`⚠️  Warning: Failed to push commits to ${remote}`)
      }
    }

    for (const remote of remotes) {
      try {
        console.log(`\nPushing to ${remote}...`)
        execSync(`git push ${remote} ${tag}`, { stdio: 'inherit' })
        console.log(`✓ Successfully pushed to ${remote}`)
      } catch (error) {
        console.error(`✗ Failed to push to ${remote}`)
        console.error('Please push the tag manually before continuing.')
        process.exit(1)
      }
    }
    console.log('\n' + '='.repeat(60))
    console.log('✓ Tag pushed to all remotes')
    console.log('='.repeat(60) + '\n')
  } else {
    console.log('\n⚠️  Tag was not pushed to remotes.')
    console.log(
      'You must push the tag manually before the release can be created.'
    )
    console.log(`Run: git push origin ${tag}`)
    process.exit(0)
  }
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

async function deployToVercel(isDryRun = false) {
  const deployType = isDryRun ? 'Preview' : 'Production'
  console.log(`Deploying to Vercel ${deployType}...`)

  const prodFlag = isDryRun ? '' : '--prod'
  const command = `npx vercel deploy --archive=tgz --cwd=_site ${prodFlag} --token="${VERCEL_TOKEN}"`

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
    console.log('🔍 DRY RUN MODE - Archive will be created but not uploaded\n')
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

  // Check if we're on a git tag
  let tag = getGitTag(true)
  let tagWasCreated = false

  // Validate tag format if tag exists
  if (tag && !tag.startsWith('v')) {
    console.error(`Error: Tag '${tag}' does not start with lowercase 'v'`)
    console.error('Version tags must follow the format: v1.2.3')
    process.exit(1)
  }

  if (!tag) {
    // No git tag found
    if (isCI() && !DRY_RUN) {
      // In CI (non-dry-run), we expect the tag to already exist
      console.error('Error: No git tag found in CI environment.')
      console.error('CI workflows should only run on tagged commits.')
      process.exit(1)
    }

    if (!versionArg) {
      if (DRY_RUN) {
        // For dry runs without a tag, use a test version
        console.log('🔍 DRY RUN: Using test version v0.0.0-test')
        tag = 'v0.0.0-test'
      } else {
        console.error(
          'Error: No git tag found and no version argument provided.'
        )
        console.error(
          "Either run on a tagged commit or provide a version argument starting with 'v'"
        )
        console.error('Example: pnpm release:upload v1.3.0')
        process.exit(1)
      }
    } else {
      // We have a version argument, so create tag interactively
      console.log(
        `\nNo git tag found. Starting interactive tag creation for version: ${versionArg}`
      )

      updatePackageVersion(versionArg)

      await createGitTagInteractively(versionArg)
      tagWasCreated = true

      tag = getGitTag(false)
    }
  } else {
    console.log(`Found git tag: ${tag}`)
  }

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
    if (tagWasCreated) {
      console.log(
        `\nNote: Don't forget to push your tag with: git push origin ${tag}`
      )
    }
    return
  }

  // Need to have tags pushed before can do a release based on them, duh
  // Skip in CI as tags should already be pushed
  if (tagWasCreated && !isCI()) {
    await pushTagToRemotes(tag)
  }

  try {
    if (hasCodeberg) {
      const codebergRelease = await createCodebergRelease(tag, tagMessage)
      await uploadWithRetry(() =>
        uploadToCodeberg(codebergRelease, archivePath)
      )
      console.log('✓ Successfully uploaded to Codeberg')
    }

    if (hasGitHub) {
      const githubRelease = await createGitHubRelease(tag, tagMessage)
      await uploadWithRetry(() => uploadToGitHub(githubRelease, archivePath))
      console.log('✓ Successfully uploaded to GitHub')
    }

    if (hasVercel) {
      // Deploy to Vercel: preview for dry runs, production otherwise
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

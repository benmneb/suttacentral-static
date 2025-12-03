#!/usr/bin/env node

/**
 * Test script for uploading an artifact to git.sr.ht using curl.
 *
 * Requires environment variable:
 *   SOURCEHUT_TOKEN      personal access token
 *   SOURCEHUT_REPO       "~owner/repo" format
 * Optional environment variables:
 *   TAG                  git tag/revspec (default 'v1.0.0')
 *   FILE                 path to file to upload (default 'test.txt')
 */

import { execSync } from 'child_process'
import { existsSync } from 'fs'

const TOKEN = process.env.SOURCEHUT_TOKEN
const REPO = process.env.SOURCEHUT_REPO // "~owner/repo"
const REVSPEC = process.env.TAG || 'v1.0.0' // tag or commit
const FILE = process.env.FILE || 'test.txt' // path to a file to upload

if (!TOKEN || !REPO) {
  console.error(
    'Missing environment variables: SOURCEHUT_TOKEN and SOURCEHUT_REPO'
  )
  process.exit(1)
}

if (!existsSync(FILE)) {
  console.error(`File does not exist: ${FILE}`)
  process.exit(1)
}

// Extract owner and repo name from "~owner/repo"
const [owner, repo] = REPO.split('/')

console.log('→ Fetching all accessible repositories...')

const getReposCmd = `curl -s -H "Authorization: Bearer ${TOKEN}" \
  -X POST -H "Content-Type: application/json" \
  -d '{"query":"query { repositories { results { id name owner { canonicalName } } cursor } }"}' \
  https://git.sr.ht/query`

let repoId
try {
  const resp = execSync(getReposCmd, { encoding: 'utf-8' })
  const json = JSON.parse(resp)

  if (
    !json.data ||
    !json.data.repositories ||
    !json.data.repositories.results
  ) {
    console.error('Failed to get repositories:', resp)
    process.exit(1)
  }

  const match = json.data.repositories.results.find(
    r => r.name === repo && r.owner?.canonicalName === owner
  )

  if (!match) {
    console.error(`Repository not found: ${owner}/${repo}`)
    process.exit(1)
  }

  repoId = match.id
  console.log(`✓ Found repository '${owner}/${repo}' with ID ${repoId}`)
} catch (err) {
  console.error('Error fetching repositories:', err.message)
  process.exit(1)
}

// Upload artifact using GraphQL multipart via curl with properly escaped JSON
console.log(
  `→ Uploading artifact '${FILE}' to ${REPO} at revspec '${REVSPEC}'...`
)

const uploadCmd = `curl -s -H "Authorization: Bearer ${TOKEN}" \
  -F 'operations={"query":"mutation Upload($repoId: Int!, $revspec: String!, $file: Upload!) { uploadArtifact(repoId: $repoId, revspec: $revspec, file: $file) { id size created } }","variables":{"repoId":${repoId},"revspec":"${REVSPEC}","file":null}}' \
  -F 'map={ "0": ["variables.file"] }' \
  -F "0=@${FILE}" \
  https://git.sr.ht/query`

try {
  const uploadResp = execSync(uploadCmd, { encoding: 'utf-8' })
  const uploadJson = JSON.parse(uploadResp)
  console.log('Response:', uploadJson)

  if (uploadJson.errors) {
    console.error('✗ Upload failed', uploadJson.errors)
    process.exit(1)
  }

  console.log('✓ Upload succeeded!')
} catch (err) {
  console.error('Error uploading artifact:', err.message)
  process.exit(1)
}

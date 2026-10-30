/**
 * Every page is valid HTML, with no errors or warnings from the Nu validator,
 * the checker validator.w3.org/nu runs.
 *
 * It's a Java program, so it uses Java 11+ from the PATH, or else downloads a Java
 * runtime into `node_modules` once. `JAVA` or `JAVA_HOME` point at another.
 */

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import vnuJar from 'vnu-jar'
import javaDownloader from 'vnu-jar/vnu-java-downloader.js'
import { listFiles, listSome, SITE_DIR, urlForFile } from './lib/site.js'

// Files per run of the validator, few enough to stay under the OS's argument length limit
const BATCH_SIZE = 1000

/** Runs a command, resolving to its exit code and stdout */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const out = []
    const err = []
    child.stdout.on('data', chunk => out.push(chunk))
    child.stderr.on('data', chunk => err.push(chunk))
    child.on('error', reject)
    child.on('close', code =>
      resolve({
        code,
        stdout: Buffer.concat(out).toString(),
        stderr: Buffer.concat(err).toString(),
      })
    )
  })
}

/** `JAVA` or `JAVA_HOME`'s Java if it runs, else a Java 11+ on the PATH or one vnu-jar downloads */
async function findJava() {
  const candidates = [
    process.env.JAVA,
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java'),
  ].filter(Boolean)
  for (const java of candidates) {
    const { code } = await run(java, ['-version']).catch(() => ({}))
    if (code === 0) return java
  }
  return javaDownloader.resolveJava()
}

/** The validator's messages for some files */
async function validate(java, files) {
  const { stdout, stderr } = await run(java, [
    // Not the 512k the validator suggests, which overflows on newer Javas
    '-Xss4m',
    '-Xmx1g',
    '-jar',
    String(vnuJar),
    '--format',
    'json',
    '--stdout',
    ...files,
  ])
  try {
    return JSON.parse(stdout).messages
  } catch {
    throw new Error(`The validator didn't give JSON:\n${stderr || stdout}`)
  }
}

describe('Every page’s HTML', async () => {
  it('passes the Nu validator', { timeout: 4 * 60 * 60 * 1000 }, async () => {
    const java = await findJava().catch(error => {
      throw new Error(
        `Couldn't download Java for the Nu validator, so install Java 11+ or set JAVA: ${error.message}`
      )
    })

    const files = (await listFiles(SITE_DIR))
      .filter(file => file.endsWith('.html'))
      .map(file => path.join(SITE_DIR, file))
    const batches = []
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      batches.push(files.slice(i, i + BATCH_SIZE))
    }

    // Problems by message, with how many there are and where the first few are
    const byMessage = new Map()
    const add = message => {
      if (message.type !== 'error' && message.subType !== 'warning') return
      const key = `${message.subType ?? message.type}: ${message.message}`
      if (!byMessage.has(key)) byMessage.set(key, { count: 0, places: [] })
      const problem = byMessage.get(key)
      problem.count++
      if (problem.places.length >= 5) return
      const file =
        message.url && path.relative(SITE_DIR, fileURLToPath(message.url))
      const extract = message.extract?.replace(/\s+/g, ' ').trim() ?? ''
      problem.places.push(
        `${file ? urlForFile(file) : '?'}:${message.lastLine ?? '?'} ${extract}`
      )
    }

    // Each validator is one thread, so one per core
    const next = async () => {
      for (let batch; (batch = batches.shift()); ) {
        for (const message of await validate(java, batch)) add(message)
      }
    }
    await Promise.all(Array.from({ length: os.availableParallelism() }, next))

    const report = [...byMessage]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(
        ([key, { count, places }]) =>
          `${key} (${count})\n${places.map(place => `    ${place}`).join('\n')}`
      )
    assert.equal(
      byMessage.size,
      0,
      `${byMessage.size} kinds of HTML problem in ${files.length} pages:\n${listSome(report, 30)}`
    )
  })
})

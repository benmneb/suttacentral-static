import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { styleText } from 'node:util'
import sirv from 'sirv'
import siteMetaData from '../src/data/_siteMetaData.js'
import { minifyCssCode, minifyJsCode } from '../src/helpers/minifyAssets.js'

const defaultPort = 3000
const dir = '_site'
const { title } = siteMetaData()
// Set by the Tauri CLI, whose devUrl needs the default port
const tauri = 'TAURI_ENV_PLATFORM' in process.env
let port = defaultPort

if (!existsSync(dir)) {
  console.error(
    styleText('red', `✗ No ${dir} folder, so run \`pnpm build\` first`)
  )
  process.exit(1)
}

const assets = sirv(dir, {
  // Stats per request, not crawling every file in _site at startup
  dev: true,
  onNoMatch(req, res) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    createReadStream(`${dir}/404.html`)
      .on('error', () => res.end('<h1>404</h1>'))
      .pipe(res)
  },
})

const ASSET = /^\/(styles|scripts)\/([\w-]+)(?:\.[0-9a-f]{8})?\.(css|js)$/
const assetTypes = {
  styles: { ext: 'css', type: 'text/css; charset=utf-8' },
  scripts: { ext: 'js', type: 'text/javascript; charset=utf-8' },
}
const minified = new Map()

/**
 * Serves a stylesheet or script minified from its source, whatever hash the page asks for
 * @returns {Promise<boolean>} Whether there was one to serve
 */
async function serveAsset(req, res) {
  const [, dir, name, ext] =
    new URL(req.url, 'http://localhost').pathname.match(ASSET) ?? []
  const assetType = assetTypes[dir]
  if (assetType?.ext !== ext) return false
  const file = `${name}.${ext}`
  const src = `src/${dir}/${file}`
  const { mtimeMs } = await stat(src).catch(() => ({}))
  if (!mtimeMs) return false
  let cached = minified.get(src)
  if (cached?.mtimeMs !== mtimeMs) {
    const code = await readFile(src, 'utf8')
    cached = {
      mtimeMs,
      code:
        ext === 'css' ? minifyCssCode(file, code) : await minifyJsCode(code),
    }
    minified.set(src, cached)
  }
  res.writeHead(200, {
    'Content-Type': assetType.type,
    'Cache-Control': 'no-cache',
  })
  res.end(req.method === 'HEAD' ? undefined : cached.code)
  return true
}

const statusColors = { 2: 'green', 3: 'cyan', 4: 'yellow', 5: 'red' }
const statusColor = status => statusColors[Math.floor(status / 100)]

const server = createServer(async (req, res) => {
  const start = performance.now()
  res.on('finish', () => {
    const ms = Math.round(performance.now() - start)
    console.log(
      `${styleText('dim', req.method)} ${req.url} ${styleText(statusColor(res.statusCode), String(res.statusCode))} ${styleText('dim', `${ms}ms`)}`
    )
  })
  try {
    if (!(await serveAsset(req, res))) assets(req, res)
  } catch (error) {
    console.error(styleText('red', `✗ ${req.url}: ${error.message}`))
    if (!res.headersSent) res.writeHead(500)
    res.end()
  }
})

server.on('error', error => {
  if (error.code === 'EADDRINUSE' && !tauri && port < defaultPort + 20) {
    server.listen(++port)
    return
  }
  const reasons = {
    EADDRINUSE: tauri
      ? `Port ${port} is already in use, and Tauri dev needs it, so stop whatever is on it (\`lsof -i :${port}\`)`
      : `Ports ${defaultPort} to ${port} are all in use`,
    EACCES: `Not allowed to listen on port ${port}`,
    EPERM: `Not allowed to listen on port ${port}`,
  }
  console.error(styleText('red', `✗ ${reasons[error.code] ?? error.message}`))
  process.exit(1)
})

server.on('listening', () => {
  const network = Object.values(networkInterfaces())
    .flat()
    .find(net => net.family === 'IPv4' && !net.internal)?.address
  console.log(
    [
      '',
      `  ${styleText('bold', title)} ${styleText('dim', `serving ${dir}`)}`,
      '',
      `  ${styleText('dim', 'Local:  ')} ${styleText('cyan', `http://localhost:${port}`)}`,
      network &&
        `  ${styleText('dim', 'Network:')} ${styleText('cyan', `http://${network}:${port}`)}`,
      port !== defaultPort &&
        `\n  ${styleText('yellow', `Port ${defaultPort} is in use, so using ${port}`)}`,
      '',
    ]
      .filter(line => typeof line === 'string')
      .join('\n')
  )
})

server.listen(port)

process.on('SIGINT', () => {
  server.close()
  console.log(styleText('dim', '\n  Stopped'))
  process.exit(0)
})

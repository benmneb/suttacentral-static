import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { networkInterfaces } from 'node:os'
import { styleText } from 'node:util'
import sirv from 'sirv'

const defaultPort = 3000
const dir = '_site'
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

const statusColors = { 2: 'green', 3: 'cyan', 4: 'yellow', 5: 'red' }
const statusColor = status => statusColors[Math.floor(status / 100)]

const server = createServer((req, res) => {
  const start = performance.now()
  res.on('finish', () => {
    const ms = Math.round(performance.now() - start)
    console.log(
      `${styleText('dim', req.method)} ${req.url} ${styleText(statusColor(res.statusCode), String(res.statusCode))} ${styleText('dim', `${ms}ms`)}`
    )
  })
  // The plain copy, which `pnpm minify:*` keeps current for pages built earlier
  req.url = req.url.replace(
    /^(\/(?:styles|scripts)\/[\w-]+)\.[0-9a-f]{8}(\.(?:css|js))(?=$|\?)/,
    '$1$2'
  )
  try {
    assets(req, res)
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
      `  ${styleText('bold', 'SuttaCentral Express')} ${styleText('dim', `serving ${dir}`)}`,
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

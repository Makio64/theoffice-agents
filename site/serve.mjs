#!/usr/bin/env node
// Serves site/ here, for `pnpm site`: with no cache, a plain server leaves a stale art.js in the Browser pane, on the first
// free port from 4173. The pictures come from site/build.mjs, which `pnpm site` runs first, and the voxel office at /3d/
// from dist/voxel, which it builds next (scripts/build-site.mjs puts it at the same place on the published site).
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = path.dirname(fileURLToPath(import.meta.url))
// the voxel office, compiled by `pnpm site` into dist/voxel and served at /3d/ as the published site has it
const VOXEL = path.join(SITE, '..', 'dist', 'voxel')
const HOST = '127.0.0.1'
const PORT = 4173
const TRIES = 20
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`)
    const name = decodeURIComponent(url.pathname)
    // its assets are relative to the page: /3d (and the old /voxel) go to /3d/, the query kept (?mode=demo&view=week)
    if (name === '/3d' || name === '/voxel' || name === '/voxel/') {
      res.writeHead(302, { Location: `/3d/${url.search}`, 'Cache-Control': 'no-store' }).end()
      return
    }
    const [root, rest] = name.startsWith('/3d/') ? [VOXEL, name.slice(3)] : [SITE, name]
    const file = path.join(root, rest.endsWith('/') ? `${rest}index.html` : rest)
    if (!file.startsWith(`${root}${path.sep}`)) throw new Error('outside site/')
    const body = await fs.readFile(file)
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body)
  } catch {
    res.writeHead(404, { 'Cache-Control': 'no-store' }).end('Not found')
  }
})

let port = PORT
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE' || ++port >= PORT + TRIES) throw e
  server.listen(port, HOST)
})
server.on('listening', () => console.log(`The site: http://${HOST}:${port}/ · the voxel office: http://${HOST}:${port}/3d/`))
server.listen(port, HOST)

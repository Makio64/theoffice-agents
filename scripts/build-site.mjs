#!/usr/bin/env node
// Publish both editions without replacing the Voxel source tree with its compiled files.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { build } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const site = path.join(root, 'site')
const dist = path.join(root, 'dist')
const destination = path.join(dist, 'site')

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(site, 'build.mjs')], { cwd: root, stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Office artwork build exited with code ${code}`)))
})
await build({ configFile: path.join(site, 'voxel', 'vite.config.js') })
// Ship a compact entry and worker instead of making the first view traverse the source-module graph.
const landing = path.join(dist, 'landing')
await build({
  configFile: false,
  root: site,
  base: './',
  build: {
    outDir: landing,
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    rolldownOptions: { input: path.join(site, 'main.js'), output: { entryFileNames: 'main.js' } },
  },
})

await fs.mkdir(dist, { recursive: true })
const staged = await fs.mkdtemp(path.join(dist, '.site-'))
try {
  // The public route contains compiled assets; source files and development config stay in the checkout.
  await fs.cp(site, staged, {
    recursive: true,
    filter: source => source !== path.join(site, 'voxel'),
  })
  await fs.cp(landing, staged, { recursive: true })
  await fs.cp(path.join(dist, 'voxel'), path.join(staged, '3d'), { recursive: true })
  // Preserve links shared while the prototype lived at /voxel.
  await fs.mkdir(path.join(staged, 'voxel'), { recursive: true })
  await fs.writeFile(path.join(staged, 'voxel', 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="refresh" content="0;url=../3d/"><title>The Office / 3D</title><a href="../3d/">Open The Office in 3D</a><script>location.replace('../3d/'+location.search+location.hash)</script>\n`)
  await fs.rm(destination, { recursive: true, force: true })
  await fs.rename(staged, destination)
  process.stdout.write(`Website ready: ${destination}\n`)
} finally {
  await fs.rm(staged, { recursive: true, force: true })
}

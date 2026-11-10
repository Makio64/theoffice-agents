// The Netlify publish directory is also the source directory. Keep source files
// intact and put every content-addressed copy and generated page under assets/.
// Exact Netlify rewrites serve the pages at their original URLs. No npm packages
// are needed for the Netlify build.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const STATIC = /\.(?:m?js|css|json|svg|png|webp|jpe?g|gif|ico|woff2?|ttf|mp4|vtt)$/i
const TEXT = /\.(?:m?js|css)$/i
const FIXED = new Set(['og.png', 'apple-touch-icon.png'])
const BUILD_ONLY = new Set(['build.mjs', 'serve.mjs', 'fingerprint.mjs', 'initial-pictures.mjs', 'alternative/preview.mjs'])
const IMMUTABLE = 'public, max-age=31536000, immutable'
const REVALIDATE = 'public, max-age=0, must-revalidate'
const digest = bytes => createHash('sha256').update(bytes).digest('hex').slice(0, 16)

function filesUnder(root, directory = '') {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const file = path.posix.join(directory, entry.name)
    if (entry.name.startsWith('.') || file === 'assets' || file === 'voxel') return []
    if (entry.isDirectory()) return filesUnder(root, file)
    return entry.isFile() ? [file] : []
  }).sort()
}

export function fingerprintSite(root) {
  const files = filesUnder(root)
  const sources = new Map(files.filter(file => STATIC.test(file) && !FIXED.has(file) && !BUILD_ONLY.has(file))
    .map(file => [file, fs.readFileSync(path.join(root, file))]))
  const manifest = {}
  const output = new Map()
  const visiting = new Set()
  const outputPath = file => `assets/${file}`

  function rewriteURL(url, from, destination) {
    // External URLs, fragments and data URIs are deliberately left alone.
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return url
    const [, pathname, suffix = ''] = url.match(/^([^?#]*)([?#].*)?$/)
    const target = pathname.startsWith('/') ? pathname.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(from), pathname))
    if (!sources.has(target)) return url
    const emitted = fingerprint(target)
    if (pathname.startsWith('/')) return `/${emitted}${suffix}`
    let relative = path.posix.relative(path.posix.dirname(destination), emitted)
    if (!relative.startsWith('.')) relative = `./${relative}`
    return `${relative}${suffix}`
  }

  function rewrite(text, from, destination) {
    // Local URL literals cover static/side-effect/dynamic imports, Worker(new
    // URL(...)), fetch URLs and HTML's single-URL attributes. Resolve only known
    // files, so ordinary strings, data URLs and SVG fragments stay unchanged.
    text = text.replace(/(['"`])([^\s'"`<>]+)\1/g, (match, quote, url) =>
      `${quote}${rewriteURL(url, from, destination)}${quote}`)
    // CSS permits unquoted URLs; srcset can contain multiple URL/width pairs.
    text = text.replace(/url\(\s*([^'"\s)][^\s)]*)\s*\)/g, (match, url) =>
      `url(${rewriteURL(url, from, destination)})`)
    text = text.replace(/\bsrcset\s*=\s*(["'])([^"']*)\1/g, (match, quote, value) => {
      if (value.startsWith('data:')) return match
      return `srcset=${quote}${value.split(',').map(item => item.replace(/\S+/, url => rewriteURL(url, from, destination))).join(',')}${quote}`
    })
    return text
  }

  function fingerprint(file) {
    if (manifest[file]) return manifest[file]
    if (visiting.has(file)) throw new Error(`Circular asset reference: ${[...visiting, file].join(' -> ')}`)
    visiting.add(file)
    let bytes = sources.get(file)
    if (file === 'asset-path.js') {
      // Only computed image URLs need a runtime lookup. Return document-relative
      // URLs as absolute URLs so <base> and a bundled entry work equally well.
      const images = Object.fromEntries([...sources.keys()].filter(name => name.startsWith('img/')).map(name => [name, fingerprint(name)]))
      bytes = Buffer.from(`// Generated image URLs; do not edit.\nconst images = ${JSON.stringify(images)};\nexport const assetPath = file => new URL(images[file] ?? file, document.baseURI).href;\n`)
    } else if (TEXT.test(file)) bytes = Buffer.from(rewrite(bytes.toString('utf8'), file, outputPath(file)))
    const extension = path.posix.extname(file)
    const emitted = outputPath(`${file.slice(0, -extension.length)}.${digest(bytes)}${extension}`)
    manifest[file] = emitted
    output.set(emitted, bytes)
    visiting.delete(file)
    return emitted
  }

  for (const file of sources.keys()) fingerprint(file)
  const pages = new Map()
  for (const file of files.filter(file => file.endsWith('.html'))) {
    let html = fs.readFileSync(path.join(root, file), 'utf8')
    // Both alternative pages use a root-relative <base>. Resolve their assets
    // from that base rather than from the page's on-disk directory.
    const base = html.match(/<base\s+href=["']([^"']+)["']/i)?.[1]
    const from = base ? path.posix.join(path.posix.dirname(file), base, 'index.html') : file
    html = rewrite(html, from, from)
    const initial = Object.fromEntries(Object.entries(manifest).flatMap(([source, emitted]) => {
      const match = source.match(/^img\/initial-office-(\d+(?:-still)?)\.svg$/)
      return match ? [[match[1], emitted]] : []
    }))
    html = html.replace('/* build:initial-files */ null', JSON.stringify(initial))
    pages.set(file, html)
  }

  // Calculate everything before replacing output: a broken graph leaves the
  // last successful publish files available to the local development server.
  fs.rmSync(path.join(root, 'assets'), { recursive: true, force: true })
  for (const [file, bytes] of output) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), bytes)
  }
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(root, 'assets/manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const pageManifest = {}
  const rewrites = []
  const revalidating = new Set(['og.png', 'apple-touch-icon.png', 'install.md', 'assets/manifest.json', 'assets/pages.json'])
  for (const [file, html] of pages) {
    const generated = `assets/pages/${file}`
    pageManifest[file] = generated
    fs.mkdirSync(path.dirname(path.join(root, generated)), { recursive: true })
    fs.writeFileSync(path.join(root, generated), html)
    revalidating.add(generated)
    rewrites.push(`/${file} /${generated} 200!`)
    if (file.endsWith('index.html')) {
      const route = file.slice(0, -'index.html'.length)
      rewrites.push(`/${route} /${generated} 200!`)
      if (route) rewrites.push(`/${route.slice(0, -1)} /${generated} 200!`)
    }
  }
  fs.writeFileSync(path.join(root, 'assets/pages.json'), `${JSON.stringify(pageManifest, null, 2)}\n`)
  fs.writeFileSync(path.join(root, '_redirects'), `# Generated page routes; source HTML stays untouched.\n${rewrites.join('\n')}\n`)
  for (const file of pages.keys()) {
    revalidating.add(file)
    if (file.endsWith('index.html')) revalidating.add(file.slice(0, -'index.html'.length))
  }
  const headers = [
    '# Generated by site/fingerprint.mjs. Only existing content-addressed files are immutable.',
    ...[...new Set(Object.values(manifest))].sort().map(file => `/${file}\n  Cache-Control: ${IMMUTABLE}\n`),
    '# Fixed URLs and HTML always revalidate; other fixed source files keep Netlify defaults.',
    ...[...revalidating].sort().map(file => `/${file}\n  Cache-Control: ${REVALIDATE}\n`),
  ].join('\n')
  fs.writeFileSync(path.join(root, '_headers'), `${headers}\n`)
  return manifest
}

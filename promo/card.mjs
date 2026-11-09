#!/usr/bin/env node
// The site's share pictures, drawn by the plugin: site/og.png, the card a link to theoffice.makio.io unfolds into on X,
// Slack, Discord… (1200 × 630: the live floor at night, a camera on the moon, the lit sign and the top floor at work,
// cut at its floor), and site/apple-touch-icon.png (180 × 180: the favicon's Clawd, 9 px a pixel, on the night sky).
// Both are committed: the site's builds (GitHub Pages, Netlify) have no browser to draw them.
//   node promo/card.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORYBOARDS } from './boards.mjs'
import { still } from './slides.mjs'
import { browser } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SITE = path.join(HERE, '..', 'site')
const FRAME = [1200, 630]

// art pixel [160, 0] (the sign's top, the building's middle) on frame pixel [600, 86], at 2.4: the moon in, the 4F
// floor's slab on the frame's foot, a neighbour's lit windows bottom left
const ZOOM = 2.4, ART = [160, 0], AT = [600, 86]
const center = [ART[0] + (FRAME[0] / 2 - AT[0]) / ZOOM, ART[1] + (FRAME[1] / 2 - AT[1]) / ZOOM]
STORYBOARDS.card = {
  title: 'Share card (1200 × 630)', meta: '', blips: false,
  panels: [{ t: '0–3', move: '', frame: FRAME, sky: 'site', rate: 1, layers: [{ scene: 'liveNow', zoom: ZOOM, center }], captions: [], sounds: [], shot: 'card' }],
}

// the favicon's Clawd (site/index.html's <link rel="icon">) on the loader's night, 20 × 20 at 9 px a pixel
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="180" height="180" shape-rendering="crispEdges">` +
  `<path fill="#030616" d="M0 0h20v20H0z"/><g transform="translate(2 1)"><path fill="#d77757" d="M2 4h12v8H2zM0 7h16v3H0zM3 12h2v2H3zM11 12h2v2h-2z"/>` +
  `<path fill="#101424" d="M5 6h1v2H5zM10 6h1v2h-1z"/></g></svg>`

const { startServer } = await import('./editor.mjs')
const server = await startServer(0)
const b = await browser()
try {
  const card = path.join(SITE, 'og.png')
  await still(b, server.url, 'card', 1.2, card)
  console.log(path.relative(process.cwd(), card))
  await b.open(`data:text/html,${encodeURIComponent(`<style>html,body{margin:0;background:#030616}svg{display:block}</style>${ICON}`)}`, { width: 180, height: 180 })
  const icon = path.join(SITE, 'apple-touch-icon.png')
  fs.writeFileSync(icon, await b.capture())
  console.log(path.relative(process.cwd(), icon))
} finally {
  await b.close()
  await server.close()
}

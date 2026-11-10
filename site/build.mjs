#!/usr/bin/env node
// Draws the site's pictures with the plugin's own renderer, from the made-up sample facts (test/fixtures): every view
// as an animated SVG into site/img/, by night and by dawn, cut down to its rooms (rooms()), so the site's building is the
// only one, and the week's street front and commits line for the foot of the page (ground()); the plugin's cast, palette,
// skies, neon, props and version into site/data.js; the page's frames and tiles into site/art.css; the sample facts into
// site/sample.json and the plugin's menu, picture renderer and imports into site/lib/ for drawings at the page's width.
// So the page never drifts from what the plugin draws. None of these are in git: .github/workflows/site.yml writes them on each publish, `pnpm site` here to
// draw them and see the page (site/serve.mjs).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprintSite } from './fingerprint.mjs'
import { renderLoading, renderSvg } from '../plugin/lib/svg.mjs'
import { pageDays } from '../plugin/lib/period.mjs'
import { EDGE, FEATURE_VIEWS, TOWER, pictureParts } from './pictures.mjs'
import { officeScene } from './office.mjs'
import { createInitialPictures } from './initial-pictures.mjs'
import { deskProps } from '../plugin/lib/svg-live.mjs'
import { AGENT_IDS, CAST } from '../plugin/lib/cast.mjs'
import * as kit from '../plugin/lib/svg-kit.mjs'
import { K, ROLE, NEON, CLOUD, MOON, CAT, CAT_LEG, PLANT, PLANT_LEG, COOLER, COOLER_LEG, VAC, ROBOT, ROBOT_LEG } from '../plugin/lib/svg-kit.mjs'

const SITE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(SITE, '..')
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const { version } = read('plugin/.claude-plugin/plugin.json')
const clone = (o) => structuredClone(o)

// The sample keeps its five busiest projects, so the week's tower stands five floors high, in balance with the page; the
// rest wait in storage (projects_more), as those the collector's own cap leaves out do
const SHOWN = 5
function busiest(f) {
  const ranked = [...f.projects].sort((a, b) => (b.agent_minutes ?? 0) - (a.agent_minutes ?? 0))
  f.projects_more = (f.projects_more ?? 0) + Math.max(0, ranked.length - SHOWN)
  f.projects = ranked.slice(0, SHOWN)
  return f
}
// ...under the names of the author's own projects: the fixture keeps its made-up ones for the tests. Each pair is a whole
// quoted string (a name, the end of a path, a desk's task), so nothing else is touched; the book desk's tasks follow
// their project's new trade.
const REAL = [
  ['harborledger', 'cyprus3d'], ['glyph-atlas-webgpu', 'ultra-text'], ['island-tour-3d', 'konami-world'],
  ['webgl-swatch-demos', 'ultra-texture'], ['csv-batch-importer', 'makio-meshline'], ['recipe-chat', 'dreamfold'],
  ['md2epub', 'pdf-edit'], ['gizmo3d', 'mini3'], ['acme-meshlines', 'gpu-perf-agent'], ['quick-image-resize', 'draco.js'],
  ['Footnote links in EPUB 3', 'Fix a few words in a scanned PDF'],
  ['Validate the sample book with epubcheck', 'Check the edited page still prints'],
]
const realNames = (text) => REAL.reduce((t, [from, to]) => t.replaceAll(`"${from}"`, `"${to}"`).replaceAll(`/${from}"`, `/${to}"`), text)
const SAMPLE = busiest(JSON.parse(realNames(fs.readFileSync(path.join(ROOT, 'test/fixtures/facts-sample.json'), 'utf8'))))

// The tower's width, 2 CSS px per art pixel. A drawing is laid out EDGE art pixels wider on each side (lib/svg-kit.mjs EDGE),
// the margin outside its walls: rooms() takes it off, so its walls are the tower's
const WIDTH = TOWER + 2 * EDGE * 2
const { rooms, ground, lampsOf, feature } = pictureParts(kit)

// the sample is an office of Claude alone: seat the whole cast at its desks
const MIX = ['claude', 'codex', 'claude', 'gemini', 'cursor', 'claude', 'kimi', 'grok', 'claude', 'codex']
function seat(f) {
  f.live.desks.forEach((d, i) => { d.agent = MIX[i % MIX.length] })
  return f
}
// ...and credit it with the agent-time, so every view seats the cast: the range's share per agent, a floor's turned round
// by its number so no two floors look alike, and each agent's sessions (lib/model.mjs crewRows)
const SHARES = [['claude', 0.5], ['codex', 0.22], ['gemini', 0.13], ['cursor', 0.07], ['kimi', 0.05], ['grok', 0.03]]
const split = (minutes, turn = 0) => {
  const others = SHARES.slice(1)
  return Object.fromEntries(SHARES.map(([a, share], i) => [i ? others[(i - 1 + turn) % others.length][0] : a, Math.round(minutes * share)]))
}
function credit(f) {
  const { agent_minutes: minutes = 0, sessions = 0 } = f.totals
  f.totals.agents = split(minutes)
  f.accounts = SHARES.map(([agent, share]) => ({ agent, sessions: Math.round(sessions * share), minutes: Math.round(minutes * share) }))
  f.projects.forEach((p, i) => { p.agents = split(p.agent_minutes ?? 0, i) })
  return f
}

// The sample at 08:10 instead of 01:40, the plugin's own soft dawn light: every timestamp moves by the same 6h30, so each
// desk keeps its state
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
function shift(o, ms) {
  if (typeof o === 'string') return ISO.test(o) ? new Date(Date.parse(o) + ms).toISOString() : o
  if (Array.isArray(o)) return o.map((v) => shift(v, ms))
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shift(v, ms)]))
  return o
}
function byDay(f) {
  const d = shift(f, 6.5 * 3600e3)
  d.now = { ...d.now, local_time: '08:10', hour: 8, is_night: false }
  return d
}

// The sample is a week. Today: the last day, its hours an average day of the week's, lit up to now
function today(f) {
  const t = clone(f), date = t.now.local_date, upTo = Number(t.now.hour)
  const day = (hours) => hours.map((v, h) => (h <= upTo ? Math.round(v / 7) : 0))
  t.range = { ...t.range, kind: 'today', days: [date], label: t.range.label.split(' → ').at(-1) }
  t.per_day = { [date]: f.per_day[date] }
  t.per_hour = day(f.per_hour)
  for (const p of t.projects) p.per_hour = day(p.per_hour)
  const d = f.per_day[date]
  t.totals = { ...t.totals, agent_minutes: t.per_hour.reduce((a, b) => a + b, 0), desk_minutes: d.desk_minutes, sessions: d.sessions, subagents: d.subagents, workflows: d.workflows, prompts: d.prompts, commits: d.commits }
  return t
}
// ...and the month: last month and this one so far, as the Month tab's page of now, the week's days repeated, quieter at
// the weekends
function month(f) {
  const m = clone(f), week = f.range.days
  const days = pageDays('month', 0, m.now.local_date)
  m.range = { ...m.range, kind: 'month', days, label: `${days[0]} → ${days.at(-1)}` }
  m.per_day = Object.fromEntries(days.map((d, i) => {
    const base = f.per_day[week[i % week.length]]
    const weekend = [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())
    return [d, f.per_day[d] ?? Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * (weekend ? 0.3 : 0.8 + (i % 5) * 0.1))]))]
  }))
  const sum = (k) => Object.values(m.per_day).reduce((a, d) => a + (d[k] ?? 0), 0)
  m.totals = { ...m.totals, agent_minutes: sum('minutes'), desk_minutes: sum('desk_minutes'), sessions: sum('sessions'), subagents: sum('subagents'), workflows: sum('workflows'), prompts: sum('prompts'), commits: sum('commits') }
  return m
}

// all the drawings first, written at the end: a renderer that throws leaves the last good site as it was
const pictures = new Map()
// The same archive scene the app shows while it reads a month, ready before the site's JavaScript starts.
for (const width of [400, 640]) {
  for (const animate of [true, false]) {
    pictures.set(`loading-month-${width}${animate ? '' : '-still'}.svg`, renderLoading('month', {
      width, animate, card: true, night: true, idPrefix: 'site-loading-month',
    }))
  }
}
const samples = {}
let lamps = []
for (const [sky, base] of [['night', credit(seat(clone(SAMPLE)))], ['day', credit(seat(byDay(SAMPLE)))]]) {
  pictures.set(`lobby-${sky}.svg`, officeScene(kit, { width: 960, night: sky === 'night', animate: false, deskProps }))
  // the Office has the whole cast at its desks already: its basement, which the page does not show, seats three of them
  // and keeps the plugin's size budget for its rooms
  const office = clone(base)
  office.totals.agents = Object.fromEntries(Object.entries(office.totals.agents).slice(0, 3))
  const facts = { office, today: credit(today(base)), week: base, month: credit(month(base)), work: base }
  samples[sky] = facts
  for (const [name, f] of Object.entries(facts)) {
    const view = name === 'office' ? 'live' : name
    const svg = renderSvg(f, { view, width: WIDTH, animate: true, idPrefix: `${name}${sky}` })
    pictures.set(`${name}-${sky}.svg`, rooms(svg, name))
    const foot = name === 'week' && ground(svg)
    if (foot) for (const [part, s] of Object.entries(foot)) pictures.set(`${part}-${sky}.svg`, s)
    if (foot && sky === 'night') lamps = lampsOf(svg)
  }
  for (const [name, view] of Object.entries(FEATURE_VIEWS)) {
    const svg = renderSvg(facts[view], { view: view === 'office' ? 'live' : view, width: 448 + EDGE * 4, animate: true, idPrefix: `feature${name}${sky}` })
    const picture = feature(svg, name)
    if (picture) pictures.set(`feature-${name}-${sky}.svg`, picture)
  }
}
const initialStarted = performance.now()
const initial = createInitialPictures(samples)
const initialElapsed = performance.now() - initialStarted
// The menu and picture renderer are the plugin's own, drawn by the page at its available width. Ship their complete
// import graphs, including side-effect modules that register sprites. An older release without the menu keeps its keys.
const shipped = new Map()
function ship(file) {
  if (shipped.has(file)) return
  const src = fs.readFileSync(path.join(ROOT, 'plugin/lib', file), 'utf8')
  shipped.set(file, src)
  for (const [, dep] of src.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]\.\/([\w.-]+\.mjs)['"]/g)) ship(dep)
}
try { ship('svg-menu.mjs') } catch { shipped.clear() }
ship('svg.mjs')
const sample = JSON.stringify(samples)

const img = path.join(SITE, 'img')
fs.mkdirSync(img, { recursive: true })
for (const [file, svg] of pictures) {
  fs.writeFileSync(path.join(img, file), svg)
  console.log(`img/${file} ${Math.round(svg.length / 1024)}k`)
}
for (const [file, svg] of initial.pictures) fs.writeFileSync(path.join(img, file), svg)
console.log(`initial pictures: ${initial.stats.count} assets, ${(initial.stats.bytes / 1024 / 1024).toFixed(1)} MiB, ${(initialElapsed / 1000).toFixed(2)}s`)

fs.writeFileSync(path.join(SITE, 'sample.json'), sample)
console.log(`sample.json ${Math.round(sample.length / 1024)}k`)

const lib = path.join(SITE, 'lib')
fs.rmSync(lib, { recursive: true, force: true })
if (shipped.size) fs.mkdirSync(lib)
for (const [file, src] of shipped) fs.writeFileSync(path.join(lib, file), src)
console.log(shipped.size ? `lib/ ${[...shipped.keys()].join(' ')}` : 'lib/ none: the page keeps its own keys')

const cast = AGENT_IDS.map((a) => {
  const c = CAST[a]
  return { id: a, who: c.who, name: c.name, hex: c.hex, sprite: c.sprite, mini: c.mini, micro: c.micro, legend: c.legend, eyes: c.eyes, eye: c.eye, miniEye: c.miniEye }
})
// the neon's ink (lib/svg-kit.mjs NEON_INK): the lit line, the glass, the flickering letter's unlit glass
const NEON_INK = { core: '#fffbe0', glass: '#ffcf2e', off: '#54482a' }
// the plugin's own props, each a char map and its legend, for the page to draw at any whole scale
const PROPS = {
  cloud: [CLOUD, { c: K.cloud, s: K.cloudSh }], moon: [MOON, { m: K.moon, M: '#d9cfb0' }], cat: [CAT, CAT_LEG], plant: [PLANT, PLANT_LEG],
  cooler: [COOLER, COOLER_LEG], vacuum: [VAC, { d: '#3a3d44', D: '#4a4e57', L: ROLE.idle, k: '#1a1b1f' }], robot: [ROBOT, ROBOT_LEG],
}
fs.writeFileSync(path.join(SITE, 'data.js'), `// Written by build.mjs from plugin/lib/ and plugin/.claude-plugin/plugin.json: do not edit.
export const VERSION = ${JSON.stringify(version)}
// the cast: each character's colors (hex: dark for dark grounds, light for light ones), its 17 x 10 sprite (and its
// 11 x 6 mini and 7 x 5 micro), a legend per char, the eye chars and the eye color painted over them
export const CAST = ${JSON.stringify(cast)}
// the plugin's palette (lib/svg-kit.mjs K)
export const PALETTE = ${JSON.stringify(K)}
// the plugin's skies (lib/svg-kit.mjs SKIES, null in a release without them), one per light: head and fall, its color
// stops from the zenith down to the glow on the horizon
export const SKIES = ${JSON.stringify(kit.SKIES ?? null)}
// THE OFFICE in neon tubes, on its own pixel grid w x h: d (one path per word: the tube's center line), flick (the
// letter that flickers), glow (two paths, the glass grown by 1 then 2 pixels). Paint as the plugin does: glow[1] then
// glow[0] in glass at opacity .12 / .18 by night (glow[0] at .08 by day), each word stroked glass 2 wide, then filled core
export const NEON = ${JSON.stringify({ w: NEON.w, h: NEON.h, d: NEON.d, flick: NEON.flick, glow: NEON.glow })}
export const NEON_INK = ${JSON.stringify(NEON_INK)}
export const PROPS = ${JSON.stringify(PROPS)}
// the clouds' colors in each light (lib/svg-kit.mjs CLOUD_TINTS, null in a release without them): body, lit rim, underside
export const CLOUD_TINTS = ${JSON.stringify(kit.CLOUD_TINTS ?? null)}
// the street front's lit lamps (img/front-night.svg): the middle of each one's glass, in px from the tower's left at its
// full width, for their pools on the page's sidewalk
export const LAMPS = ${JSON.stringify(lamps)}
// Native CSS heights for office, week, month, front and subway, in that order.
// Every row advances four CSS pixels from width 376 through 1088: (width - 376) / 4.
export const INITIAL_LAYOUTS = ${JSON.stringify(initial.layouts)}
`)
console.log(`data.js v${version}`)

// the frames and tiles, drawn from the data.js just written
const { artCss } = await import('./theme.js')
fs.writeFileSync(path.join(SITE, 'art.css'), `${artCss()}\n`)
console.log('art.css')

const manifest = fingerprintSite(SITE)
console.log(`assets/: ${Object.keys(manifest).length} content-addressed files; HTML and _headers ready`)

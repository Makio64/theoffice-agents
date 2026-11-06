// The drawings the promo films: the plugin's own renderer, as committed (promo/.head, copied by promo/pin.mjs), on the
// made-up sample (test/fixtures), the whole cast seated,
// with a few desks set to the state a shot needs. Everything at 1080 CSS px wide: 540 art pixels at 2 px each, so the
// whole building is exactly a phone's width and every zoom is a whole number of screen pixels per art pixel
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderSvg, renderTimelapse } from './.head/plugin/lib/svg.mjs'
import { renderOffice } from './.head/plugin/lib/ascii.mjs'
import { ROLE_HEX } from './.head/plugin/lib/model.mjs'
import { timelapseFacts } from './.head/test/helpers/facts.mjs'
import { NEON, ROLE, castFigure, defsMarkup, pose, use } from './.head/plugin/lib/svg-kit.mjs'
import { dressEnd, dressLapseStreet, dressStill, nightCat, nightLights, streetLight, underground } from './finale.mjs'
import { HUE, tagLayer, walkerTag } from './tags.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const WIDTH = 1080
/**
 * The story's whole buildings, narrower than the frame: its now, the live floor 320 art px wide at 3× (960 px, its
 * floors stacked a little higher); its end, the timelapse 400 wide at 2.5× (1000 px, five floors, sky over its sign).
 */
export const NARROW = { now: 320, end: 400 }
// how far the wide end's dressing reaches past each side of its drawing (lapseEndWide): 400 + 2 × 180 art px, a
// 1080-px frame down to 1.42×
export const END_PAST = 180
const clone = (o) => structuredClone(o)
const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'promo/.head/test/fixtures/facts-sample.json'), 'utf8'))

// the sample's ten desks, every character of the cast at one: Clawd at the hand up and the ✓, Mooni testing, Rok and a
// Clawd at the water cooler
const MIX = ['claude', 'codex', 'claude', 'gemini', 'cursor', 'kimi', 'codex', 'claude', 'claude', 'grok']
export const DESK = { kitchen: 0, meeting: 1, coding: 2, gemini: 3, cursor: 4, kimi: 5, dex: 6, done: 7, asking: 8, grok: 9 }
const SHARES = [['claude', 0.5], ['codex', 0.22], ['gemini', 0.13], ['cursor', 0.07], ['kimi', 0.05], ['grok', 0.03]]
const split = (minutes) => Object.fromEntries(SHARES.map(([a, s]) => [a, Math.round(minutes * s)]))
function cast(f) {
  f.live.desks.forEach((d, i) => { d.agent = MIX[i % MIX.length] })
  f.totals.agents = split(f.totals.agent_minutes ?? 0)
  f.accounts = SHARES.map(([agent, s]) => ({ agent, sessions: Math.round((f.totals.sessions ?? 0) * s), minutes: Math.round((f.totals.agent_minutes ?? 0) * s) }))
  f.projects.forEach((p) => { p.agents = split(p.agent_minutes ?? 0) })
  return f
}

// every timestamp moved by the same amount, so each desk keeps its state (site/build.mjs byDay)
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
function shift(o, ms) {
  if (typeof o === 'string') return ISO.test(o) ? new Date(Date.parse(o) + ms).toISOString() : o
  if (Array.isArray(o)) return o.map((v) => shift(v, ms))
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shift(v, ms)]))
  return o
}
/** The sample (Mon 26 Oct, 01:40 local) moved to `hh:mm` local the same day. */
function at(f, hh, mm = 10) {
  const d = shift(f, ((hh * 60 + mm) - (1 * 60 + 40)) * 60e3)
  d.now = { ...d.now, local_time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, hour: hh, is_night: hh >= 20 || hh < 7 }
  return d
}
const ago = (f, min) => new Date(Date.parse(f.now.iso) - min * 60e3).toISOString()

/** Desk `i` set to a state: 'working' (typing in `file`), 'asking', 'done' (minutes ago) or dozing (done an hour+). */
function desk(f, i, state, { min = 3, file = 'cape-rig.js', question = 'Which cape anchor?' } = {}) {
  const d = f.live.desks[i]
  const since = ago(f, min)
  if (state === 'working') Object.assign(d, { status: 'busy', state: 'working', idle_reason: undefined, activity: { kind: 'coding', tool: 'Edit', label: file, since } })
  if (state === 'asking') Object.assign(d, { status: 'busy', state: 'asking', idle_reason: undefined, activity: { kind: 'talking', tool: 'AskUserQuestion', label: question, since } })
  if (state === 'done') Object.assign(d, { status: 'idle', state: 'idle', idle_reason: 'done', activity: { kind: 'idle', tool: null, label: null, since } })
  d.last_seen = since
  return f
}

// the month: 30 days, the week's days repeated, quieter at the weekends (site/build.mjs month)
function month(f) {
  const m = clone(f), week = f.range.days
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.parse(`${m.now.local_date}T12:00:00Z`) - (29 - i) * 86400e3).toISOString().slice(0, 10))
  m.range = { ...m.range, kind: 'month', days, label: `${days[0]} → ${days.at(-1)}` }
  m.per_day = Object.fromEntries(days.map((d, i) => {
    const base = f.per_day[week[i % week.length]]
    const weekend = [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())
    return [d, f.per_day[d] ?? Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * (weekend ? 0.3 : 0.8 + (i % 5) * 0.1))]))]
  }))
  const sum = (k) => Object.values(m.per_day).reduce((a, d) => a + (d[k] ?? 0), 0)
  m.totals = { ...m.totals, agent_minutes: sum('minutes'), desk_minutes: sum('desk_minutes'), sessions: sum('sessions'), subagents: sum('subagents'), workflows: sum('workflows'), prompts: sum('prompts'), commits: sum('commits') }
  return cast(m)
}

// The year before now, month after month (the story's flip of the wall calendar): each calendar month whole, its days
// the week's pattern scaled so the month comes to its level of a PEAK-hour month (the year growing toward now, a dip
// for the holidays and in August; this month so far its best)
export const YEAR = [['2025-11', 0.35], ['2025-12', 0.3], ['2026-01', 0.42], ['2026-02', 0.48], ['2026-03', 0.55], ['2026-04', 0.62],
  ['2026-05', 0.7], ['2026-06', 0.74], ['2026-07', 0.8], ['2026-08', 0.66], ['2026-09', 0.88], ['2026-10', 1]]
const PEAK = 1650
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
function calendarMonth(f, ym, level) {
  const m = clone(f), week = f.range.days
  const [y, mo] = ym.split('-').map(Number)
  const n = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const days = Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
  m.range = { ...m.range, kind: 'month', days, label: `${days[0]} → ${days.at(-1)}` }
  // the month so far when it is this one: nothing after today
  m.per_day = Object.fromEntries(days.filter((d) => d <= f.now.local_date).map((d, i) => {
    const base = f.per_day[week[i % week.length]]
    const weekend = [0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())
    return [d, Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v * (weekend ? 0.3 : 0.8 + (i % 5) * 0.1)]))]
  }))
  const raw = Object.values(m.per_day).reduce((a, d) => a + (d.minutes ?? 0), 0)
  const scale = (level * PEAK * 60) / (raw || 1)
  for (const d of Object.values(m.per_day)) for (const k of Object.keys(d)) d[k] = Math.round(d[k] * scale)
  const sum = (k) => Object.values(m.per_day).reduce((a, d) => a + (d[k] ?? 0), 0)
  m.totals = { ...m.totals, agent_minutes: sum('minutes'), desk_minutes: sum('desk_minutes'), sessions: sum('sessions'), subagents: sum('subagents'), workflows: sum('workflows'), prompts: sum('prompts'), commits: sum('commits') }
  return cast(m)
}
/** The year's months as the story's cards tell them: { ym, label: 'NOV 2025', hours } (whole hours, as the sign has them). */
export function yearOfMonths() {
  const base = cast(clone(SAMPLE))
  return YEAR.map(([ym, level]) => ({ ym, label: `${MON[Number(ym.slice(5)) - 1]} ${ym.slice(0, 4)}`, hours: Math.floor(calendarMonth(base, ym, level).totals.agent_minutes / 60) }))
}

/** The whole building at work (the story's now): every desk busy at its own kind of work, interns on two, a meeting on. */
function everyoneWorking(f) {
  const work = [['terminal', 'npm test'], null, ['coding', 'rhythm-drums.js'], ['reading', 'shader-notes.md'], ['coding', 'sprites.mjs'],
    ['testing', 'difficulty tests'], ['web', 'threejs.org/docs'], ['design', 'arcade-finale'], ['coding', 'cape-rig.js'], ['terminal', 'git push']]
  f.live.desks.forEach((d, i) => {
    if (!work[i]) return
    Object.assign(d, { status: 'busy', state: 'working', idle_reason: undefined, activity: { kind: work[i][0], tool: 'Edit', label: work[i][1], since: ago(f, 3 + i) } })
  })
  for (const i of [2, 4]) f.live.desks[i].interns = [0, 1, 2].map((k) => ({ id: `b${i}${k}`, type: 'Explore', description: 'research', state: 'working' }))
  return f
}

/**
 * A building standing on its street and nothing under it (the story's now and its week): everything under the sidewalk
 * (the live basement, the period's commits line) covered by a road (`road` art px of asphalt, a lane line down its
 * middle) and the far side's underground (promo/finale.mjs: its sidewalk, the ground in section) down past any frame's
 * foot, the sidewalk and the road carried on `wide` art px past both sides of the drawing, so a frame wider than the
 * building still has a street across it.
 */
function onStreet(svg, { wide = 300, road = 50 } = {}) {
  const walk = svg.match(/fill="#58514a" d="M0 (\d+)h(\d+)/)
  if (!walk) return svg
  const y = Number(walk[1]), { w } = size(svg), x = -wide, W = w + 2 * wide
  const r = (ry, h, fill) => `<rect x="${x}" y="${ry}" width="${W}" height="${h}" fill="${fill}"/>`
  const side = (fill, ry, h) => `<rect x="${x}" y="${ry}" width="${wide}" height="${h}" fill="${fill}"/><rect x="${w}" y="${ry}" width="${wide}" height="${h}" fill="${fill}"/>`
  const street = `<g data-street>${side('#58514a', y, 3)}${side('#433d37', y + 3, 1)}${r(y + 4, road, '#34363b')}${r(y + 4, 2, '#2a2b2f')}` +
    `<path stroke="#c9c2b4" stroke-width="2" stroke-dasharray="12 10" d="M${x} ${y + 5 + road / 2}H${x + W}"/>${underground(y + 4 + road, x, W)}</g>`
  const open = svg.includes('<svg overflow="visible"') ? svg : svg.replace('<svg ', '<svg overflow="visible" ')
  return open.replace(/<\/svg>\s*$/, `${street}</svg>`)
}

// today: the sample's last day, its hours an average day of the week's, lit up to now (site/build.mjs today)
function today(f) {
  const t = clone(f), date = t.now.local_date, upTo = Number(t.now.hour)
  const day = (hours) => hours.map((v, h) => (h <= upTo ? Math.round(v / 7) : 0))
  t.range = { ...t.range, kind: 'today', days: [date], label: t.range.label.split(' → ').at(-1) }
  t.per_day = { [date]: f.per_day[date] }
  t.per_hour = day(f.per_hour)
  for (const p of t.projects) p.per_hour = day(p.per_hour)
  const d = f.per_day[date]
  t.totals = { ...t.totals, agent_minutes: t.per_hour.reduce((a, b) => a + b, 0), desk_minutes: d.desk_minutes, sessions: d.sessions, subagents: d.subagents, workflows: d.workflows, prompts: d.prompts, commits: d.commits }
  return cast(t)
}

/**
 * The timelapse seen from the street: its cut-away floors closed behind a façade of the building's own brick, a row of
 * the street front's shop windows on every floor under a stone course (lit, by day or by night, when the street
 * front's are, by its faces' own switches), and a road under the sidewalk where the reel ran. So the agents walking
 * in go into a building, not a doll's house. The façade goes just before the street front's first face (after the
 * rooms, before the door and whoever walks by); the road last, over the reel.
 */
function withFacade(svg, { holes = false, fit = false } = {}) {
  // the street front's day face is drawn bare (its first shop window), its evening and night faces are groups shown by the hour
  const day = svg.match(/<use href="#([\w-]+)-fr-shop" x="\d+" y="(\d+)"\/>/)
  if (!day) return svg
  const [, id] = day
  const shown = [...svg.matchAll(/<g display="none"><use href="#[\w-]+-fr-shop(N|D)"/g)].map((m) => {
    const end = svg.indexOf('</g>', svg.indexOf('<animate attributeName="display"', m.index))
    return { kind: m[1], animate: svg.slice(svg.lastIndexOf('<animate', end), end) }
  })
  const { w } = size(svg), ww = w - 20
  const top = 56, street = Number(day[2]) - 16 // down to just over the canopy (windows at y, canopy at y − 12), the floor slab under
  // the windows' rows and columns: three floors evenly and nine columns (the opening's façade, 540 wide); or, `fit`, a
  // row on each of the building's own floors (its floor plates, the lobby's left out) and a column over each of the
  // street front's shop windows and over its door
  let rows, cols, courseAt
  if (fit) {
    const plates = [...new Set([...svg.matchAll(/<use href="#[\w-]+-fl-plate\d+" x="-?[\d.]+" y="(\d+)"\/>/g)].map((m) => Number(m[1])))].sort((a, b) => a - b).slice(0, -1)
    rows = plates.map((y) => y - 7)
    cols = [...new Set([...svg.matchAll(/<use href="#[\w-]+-fr-shop" x="(\d+)" y="\d+"\/>/g)].map((m) => Number(m[1]))), Math.round(w / 2 - 18)].sort((a, b) => a - b)
    courseAt = [...plates.slice(1).map((y) => y - 6), street - 4]
  } else {
    const fh = Math.floor((street - top) / 3)
    rows = [0, 1, 2].map((k) => top + k * fh)
    cols = [24, 79, 134, 189, 252, 315, 370, 425, 480]
    courseAt = [1, 2, 3].map((k) => top + k * fh - 4)
  }
  const course = (y) => `<rect x="10" y="${y}" width="${ww}" height="2" fill="#8a8072"/><rect x="10" y="${y}" width="${ww}" height="1" fill="#a39886"/><rect x="10" y="${y + 2}" width="${ww}" height="1" fill="#000" fill-opacity=".25"/>`
  const windows = (kind) => rows.map((y) => cols.map((x) => `<use href="#${id}-fr-shop${kind}" x="${x}" y="${y + 12}"/>`).join('')).join('')
  const courses = courseAt.map(course).join('')
  const facade = holes ? `<g data-facade>${cutWindows(id, top, street, rows.flatMap((y) => cols.map((x) => [x, y + 20])), ww)}${courses}</g>`
    : `<g data-facade><rect x="10" y="${top}" width="${ww}" height="${street - top}" fill="url(#${id}-brick)"/>${courses}${windows('')}` +
      shown.map((f) => `<g display="none">${windows(f.kind)}${f.animate}</g>`).join('') + '</g>'
  const ry = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1]) + 4
  const road = `<g data-road><rect x="0" y="${ry}" width="${w}" height="60" fill="#34363b"/><rect x="0" y="${ry}" width="${w}" height="2" fill="#2a2b2f"/>` +
    `<path stroke="#c9c2b4" stroke-width="2" stroke-dasharray="12 10" d="M0 ${ry + 26}H${w}"/><rect x="0" y="${ry + 50}" width="${w}" height="2" fill="#58514a"/></g>`
  const out = svg.slice(0, day.index) + facade + svg.slice(day.index)
  return out.replace(/<\/svg>\s*$/, `${road}</svg>`)
}

// ---------------------------------------------------------------- the extension in a portrait pane

// The extension as a 9:16 pane draws it: 270 art pixels wide (exactly the video's 1080 at 4 px each), its floors
// stacked to fit, no sky of its own (the video's pixel sky shows through), with only the desks a shot is about
export const PORTRAIT = 540
const deskOf = (f, o) => ({ worktree: null, branch: 'main', model: 'claude-opus-5-5', entrypoint: 'claude-desktop', interns: [], meetings: [], pid: 1,
  status: 'busy', started_at: ago(f, 90), last_seen: ago(f, 0), project_path: `/home/demo/git/${o.project}`, ...o })
const meetingOf = (f, id, name, phase, running, done, total) => ({ id, name, phase, agents_running: running, agents_done: done, agents_failed: 0, agents_total: total, started_at: ago(f, 20), labels: [] })
function portraitDesks(f, kind) {
  const busy = (agent, title, kindOf, label, project = 'island-tour-3d') => deskOf(f, { id: `${kind}-${title}`, agent, title, project, state: 'working', activity: { kind: kindOf, tool: null, label, since: ago(f, 3) } })
  const idle = (agent, title, project, reason, min) => deskOf(f, { id: `${kind}-${title}`, agent, title, project, state: 'idle', status: 'idle', idle_reason: reason, activity: { kind: 'idle', tool: null, label: null, since: ago(f, min) } })
  if (kind === 'meeting') {
    return [
      deskOf(f, { id: 'pm-1', agent: 'claude', title: 'Final arcade world design', project: 'glyph-atlas-webgpu', state: 'waiting_on_agents', activity: { kind: 'delegating', tool: 'Workflow', label: 'arcade-finale-brief', since: ago(f, 12) },
        meetings: [meetingOf(f, 'wf-a', 'arcade-finale-brief', 'Design', 2, 5, 8)] }),
      deskOf(f, { id: 'pm-2', agent: 'gemini', title: 'Swatch grid review', project: 'webgl-swatch-demos', state: 'waiting_on_agents', activity: { kind: 'delegating', tool: 'Workflow', label: 'swatch-review', since: ago(f, 8) },
        meetings: [meetingOf(f, 'wf-b', 'swatch-review', 'Review', 1, 2, 4)] }),
    ]
  }
  if (kind === 'kitchen') return [idle('grok', 'Lava Cavern camera', 'island-tour-3d', 'break', 20), idle('claude', 'Atlas glyph edge cleanup', 'glyph-atlas-webgpu', 'break', 25)]
  // the story's montage: the whole cast at work, each at its own kind of work (its own screen and script), no one
  // waiting, asking or on a break; Caret with interns hopping on their bench
  if (kind === 'work') {
    const intern = (i) => ({ id: `w${i}`, type: 'Explore', description: 'sprite sheets', state: 'working' })
    return [busy('claude', 'Coconut drum rhythm puzzle', 'coding', 'rhythm-drums.js'), busy('codex', 'Deploy previews and assets', 'terminal', 'npm run build'),
      busy('kimi', 'Playtest notes and difficulty', 'testing', 'difficulty curve tests'), busy('grok', 'Lava Cavern camera', 'web', 'threejs.org/docs'),
      deskOf(f, { id: 'work-gem', agent: 'gemini', title: 'Swatch grid review', project: 'webgl-swatch-demos', state: 'working', activity: { kind: 'reading', tool: 'Read', label: 'swatches.md', since: ago(f, 5) } }),
      deskOf(f, { id: 'work-caret', agent: 'cursor', title: 'Clawd desk sprites in pixel art', project: 'theoffice-agents', state: 'working', activity: { kind: 'coding', tool: 'Edit', label: 'sprites.mjs', since: ago(f, 4) },
        interns: [0, 1, 2].map(intern) }),
      deskOf(f, { id: 'work-art', agent: 'claude', title: 'Final arcade world design', project: 'glyph-atlas-webgpu', state: 'working', activity: { kind: 'design', tool: 'Artifact', label: 'arcade-finale', since: ago(f, 6) } })]
  }
  if (kind === 'office') return [...portraitDesks(f, 'meeting'), ...portraitDesks(f, 'desks'), ...portraitDesks(f, 'kitchen'),
    deskOf(f, { id: 'po-caret', agent: 'cursor', title: 'Clawd desk sprites in pixel art', project: 'theoffice-agents', state: 'working', activity: { kind: 'reading', tool: 'Read', label: 'office-notes.md', since: ago(f, 4) },
      interns: [{ id: 'i1', type: 'Explore', description: 'sprite sheets', state: 'working' }, { id: 'i2', type: 'Explore', description: 'palette', state: 'working' }] })]
  return [busy('claude', 'Coconut drum rhythm puzzle', 'coding', 'rhythm-drums.js'), busy('kimi', 'Playtest notes and difficulty', 'testing', 'difficulty curve tests'),
    busy('codex', 'Deploy previews and assets', 'web', 'app.netlify.com'),
    deskOf(f, { id: 'pd-ask', agent: 'claude', title: 'Wizard\'s cape shoulder positioning', project: 'island-tour-3d', state: 'asking', activity: { kind: 'talking', tool: 'AskUserQuestion', label: 'Which cape anchor?', since: ago(f, 2) } })]
}

/**
 * The plugin's sign at night, drawn as its header draws it (lib/svg-kit.mjs sign, neon): a dark board lit along its top
 * edge and shadowed under, a row of bulbs along its top and bottom (two sets, every other bulb, lit in turn: the
 * player's data-marquee swaps them), the neon THE OFFICE with its night glow (the glass grown twice, at .12 and .18 of
 * the glass over the board), a rail, then two lines of the board's type. `w` art pixels wide, 40 high, `scale` px a pixel.
 * `lines`: [[text, color], …] per line.
 */
const NEON_INK = { core: '#fffbe0', glass: '#ffcf2e' } // lib/svg-kit.mjs NEON_INK
export function pluginSign({ w = 170, lines = [], scale = 6 }) {
  const h = 40
  const rect = (x, y, rw, rh, fill, op) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`
  const board = rect(0, 0, w, h, '#1a1613') + rect(0, 0, w, 1, '#4a4038') + rect(0, 1, 1, h - 2, '#2e2721') + rect(w - 1, 1, 1, h - 2, '#0e0c0a') +
    rect(0, h - 1, w, 1, '#0e0c0a') + rect(0, h, w, 1, '#000', '.35') + rect(4, 20, w - 8, 1, '#0e0c0a') + rect(4, 21, w - 8, 1, '#3a322b')
  const k = Math.floor((w - 4) / 4)
  const row = (o) => `M${2 + o * 4} 2.5h${(k - 1 - o) * 4 + 1}M${2 + o * 4} ${h - 2.5}h${(k - 1 - o) * 4 + 1}`
  const bulbs = [0, 1].map((o) => `<path class="b${o}" stroke="${ROLE.accent}" stroke-dasharray="1 7" d="${row(o)}"/>`).join('')
  const nx = Math.round((w - NEON.w) / 2)
  const neon = `<g transform="translate(${nx} 3)"><path d="${NEON.glow[1]}" fill="${NEON_INK.glass}" fill-opacity=".12"/><path d="${NEON.glow[0]}" fill="${NEON_INK.glass}" fill-opacity=".18"/>` +
    NEON.d.map((d) => `<path d="${d}" fill="none" stroke="${NEON_INK.glass}" stroke-width="2"/><path d="${d}" fill="${NEON_INK.core}"/>`).join('') + '</g>'
  const base = lines.length === 2 ? [28, 34.5] : [31]
  const text = lines.map((line, i) => `<text x="${w / 2}" y="${base[i]}" font-size="5.5" text-anchor="middle">${line.map(([t, c]) => `<tspan fill="${c}">${t}</tspan>`).join('')}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h + 1}" width="${w * scale}" height="${(h + 1) * scale}" shape-rendering="crispEdges" data-marquee="1.2,0" ` +
    `font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"><style>.b1{opacity:.25}.alt .b0{opacity:.25}.alt .b1{opacity:1}</style>${board}${bulbs}${neon}` +
    `<g text-rendering="geometricPrecision">${text}</g></svg>`
}

/**
 * The earth under a drawing with no sky of its own: dark ground behind everything from its sidewalk down, so the
 * basement and the commits line are underground, not hanging in the video's sky.
 */
function withGround(svg) {
  const walk = svg.match(/fill="#58514a" d="M0 (\d+)h(\d+)/)
  if (!walk) return svg
  const y = Number(walk[1]) + 4, { w, h } = size(svg)
  const at = svg.indexOf('</defs>') + 7
  const open = svg.slice(0, at).replace('<svg ', '<svg overflow="visible" ')
  return `${open}<rect x="-400" y="${y}" width="${w + 800}" height="${h - y + 800}" fill="#15100c"/>${svg.slice(at)}`
}

/** Rows `heights` over a drawing's sidewalk, as rows of it: where its neighbours' roofs go (finale.mjs dressStill `roofs`). */
function roofsOver(svg, heights) {
  const walk = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)?.[1] ?? size(svg).h)
  return heights.map((h) => walk - h)
}

/**
 * A road laid under a building's sidewalk, down to the drawing's foot, over what ran under it (the live basement, the
 * timelapse's reel): asphalt, a lane line, the far curb, so a building cut at its street stands on one.
 */
function roadUnder(svg) {
  const walk = svg.match(/fill="#58514a" d="M0 (\d+)h(\d+)/)
  if (!walk) return svg
  const y = Number(walk[1]) + 4, w = Number(walk[2]), h = size(svg).h - y
  const road = `<g data-road><rect x="0" y="${y}" width="${w}" height="${h}" fill="#34363b"/><rect x="0" y="${y}" width="${w}" height="2" fill="#2a2b2f"/>` +
    `<path stroke="#c9c2b4" stroke-width="2" stroke-dasharray="12 10" d="M0 ${y + 26}H${w}"/><rect x="0" y="${y + 50}" width="${w}" height="2" fill="#58514a"/><rect x="0" y="${y + 52}" width="${w}" height="${Math.max(0, h - 52)}" fill="#1c1d21"/></g>`
  return svg.replace(/<\/svg>\s*$/, `${road}</svg>`)
}

/**
 * The façade's windows cut through its brick onto the rooms behind it (the timelapse's own floors, its agents at their
 * desks by day and the rooms dark by night, by the hour), one a column on each floor's desk row: 34 × 26, a stone
 * lintel over and a sill under, a dark frame with a mullion and a transom, a glint on each lower pane, a breath of
 * glass over it. The brick is one path with a hole a window (even-odd), so nothing else changes.
 */
function cutWindows(id, top, street, panes, ww) {
  const W = 34, H = 26
  const r = (x, y, w, h, fill, op) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`
  const wall = `<path fill="url(#${id}-brick)" fill-rule="evenodd" d="M10 ${top}h${ww}v${street - top}h-${ww}z${panes.map(([x, y]) => `M${x} ${y}h${W}v${H}h${-W}z`).join('')}"/>`
  const frames = panes.map(([x, y]) => r(x - 2, y - 4, W + 4, 3, '#8a8072') + r(x - 2, y - 4, W + 4, 1, '#a39886') + r(x, y, W, H, '#9fc6e8', '.07') +
    r(x - 1, y - 1, W + 2, 1, '#2b2520') + r(x - 1, y + H, W + 2, 1, '#2b2520') + r(x - 1, y, 1, H, '#2b2520') + r(x + W, y, 1, H, '#2b2520') +
    r(x + W / 2, y, 1, H, '#2b2520') + r(x, y + 8, W, 1, '#2b2520') +
    [3, W / 2 + 3].map((g) => [0, 1, 2, 3].map((i) => r(x + g + i, y + H - 3 - i, 1, 1, '#ffffff', '.22')).join('')).join('') +
    r(x - 2, y + H + 1, W + 4, 2, '#a39886') + r(x - 2, y + H + 3, W + 4, 1, '#000', '.3')).join('')
  return wall + frames
}

/**
 * The street with the ground under its road, down past any frame's foot (the far side's underground, promo/finale.mjs),
 * so a shot close on the door has no sky under the street. `quiet`: without the timelapse's own walkers, for a shot
 * whose walkers are its own (arrivals).
 */
function street(svg, { quiet = false } = {}) {
  const out = quiet ? svg.replace(/<g[^>]*>(?:<(?:animate|animateTransform|set)\b[^>]*\/>)*<use href="#[\w-]+W[lr]" y="\d+"\/><\/g>/g, '') : svg
  const far = Number(svg.match(/<g data-road><rect x="0" y="(\d+)"/)[1]) + 50, { w } = size(svg)
  return out.replace(/<\/svg>\s*$/, `${underground(far, -400, w + 800)}</svg>`)
}

// The story's arrivals: who, from which side (the right?) and when they set off, in seconds of the shot; their pace
// on the sidewalk (art px a second of the shot) and how far off the door they start
const ARRIVALS = [['claude', false, 0], ['codex', true, 0.2], ['gemini', false, 0.55], ['kimi', true, 0.75], ['cursor', false, 1.1], ['grok', true, 1.3]]
const HURRY = { speed: 55, from: 90 }

/**
 * The cast arriving for work, laid over the street (`svg`, the timelapse's): a drawing of its size holding only the six
 * characters, who walk up the sidewalk to the door one after another, by turns from the left and the right, and are
 * gone in when they reach it (the door the timelapse's walkers use). Its layer runs on its own clock at `pace` (a
 * second of the shot is `pace` of its own): they hurry in, legs going, while the morning behind them barely moves.
 */
function arrivals(svg, pace = 2, list = ARRIVALS, { id = 'ar-', speed = HURRY.speed, dist = HURRY.from } = {}) {
  const { w, h } = size(svg)
  const ctx = { id, defs: new Map(), animate: true }
  const door = Math.floor(w / 2) - 12, y = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1]) - 15
  const walk = (dist / speed) * pace
  // [agent, the right side?, when, out?, tag?]: in, from that side up to the door and gone in; out, from the door off to
  // that side; a tag (promo/tags.mjs) over its head as it goes, unclamped
  const people = list.map(([agent, right, t0, out = false, tag]) => {
    const b = r2(t0 * pace), side = right ? door + dist : door - dist
    const [from, to] = out ? [door, side] : [side, door]
    const facing = (out ? right : !right) ? 'Wr' : 'Wl'
    return `<g display="none"><set attributeName="display" to="inline" begin="${b}s"/>${out ? '' : `<set attributeName="display" to="none" begin="${r2(b + walk)}s"/>`}` +
      `<animateTransform attributeName="transform" type="translate" from="${from} 0" to="${to} 0" begin="${b}s" dur="${r2(walk)}s" fill="freeze"/>` +
      `${use(ctx, pose(agent, facing), 0, y)}${tag ? walkerTag({ ...tag, x: 8, y: y - 1, clamp: [-999, 999] }) : ''}</g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges"><defs>${defsMarkup(ctx)}</defs>${people}</svg>`
}
const r2 = (n) => Math.round(n * 100) / 100

/**
 * The crew in a row on the far sidewalk across the road from the month's building (`svg`, monthNow, its road and far
 * sidewalk onStreet's), a drawing of its size to lay over it: the six AIs in the order of their share of the month,
 * the first three looking right and the last three left (toward the middle), each hopping once in turn from `hopAt`,
 * `step` s apart, as the narrator says which AI did the work. On a clock of its own (the story's seconds).
 */
function crewLine(svg, { hopAt = 0.25, step = 0.22 } = {}) {
  const { w, h } = size(svg)
  const ctx = { id: 'cl-', defs: new Map(), animate: true }
  // onStreet's road runs 50 rows under the sidewalk, the far sidewalk's slabs 8 rows past its curb: feet on them
  const y = Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1]) + 47
  const order = ['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok']
  const gap = (w - 70) / (order.length - 1)
  const people = order.map((agent, i) => {
    const hop = `<animateTransform attributeName="transform" type="translate" values="0 0;0 -6;0 0" keyTimes="0;.4;1" begin="${r2(hopAt + i * step)}s" dur="0.3s" fill="freeze"/>`
    return `<g transform="translate(${Math.round(35 + i * gap - 8)} ${y})"><g>${hop}${use(ctx, pose(agent, i < 3 ? 'K0' : 'K1'), 0, 0)}</g></g>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 2}" height="${h * 2}" shape-rendering="crispEdges" overflow="visible"><defs>${defsMarkup(ctx)}</defs>${people}</svg>`
}

/**
 * A drawing without its words, for the story's montage: every label, count and caption gone, and what they stood on:
 * the plates the names stood on (a 9-high bar with its corners cut, lit along its top, shaded along its foot), the tags
 * on the slabs (svg-kit tagsSvg: a dark board in a faint frame, drawn together, and the bar round one that waits on
 * you), and the building's bar under the roof down to its plain plate (svg-live statusBar: its strip, rules, icons and
 * counts gone), so the pixel art is alone.
 */
function quiet(svg) {
  const plates = [...svg.matchAll(/M(\d+) (\d+)h(\d+)v9h-\3zM(\d+) (\d+)h(\d+)v7h-\6z/g)]
    .filter((m) => +m[4] === m[1] - 1 && +m[5] === +m[2] + 1 && +m[6] === +m[3] + 2)
  const boards = []
  let out = svg
    .replace(/<path fill="#1a1613" d="((?:M[\d.-]+ [\d.-]+h[\d.-]+v[\d.-]+h[\d.-]+z)+)"\/><path fill="none" stroke="#ece2cd" stroke-opacity="\.22" stroke-width="\.5" d="[^"]*"\/>/g, (m, d) => {
      for (const r of d.matchAll(/M([\d.-]+) ([\d.-]+)h([\d.-]+)v([\d.-]+)h/g)) boards.push(r.slice(1, 5).map(Number))
      return ''
    })
    .replace(/(<path fill="#14100c" d="M[\d.-]+ [\d.-]+h([\d.]+)v15h-\2z"\/>)((?:<path\b[^>]*\/>)*)(?:<use href="#[\w-]*ic-(?:work|you|wait|break)"[^>]*\/>)*(?:<g font-size="[\d.]+" font-weight="bold">[\s\S]*?<\/g>)?/g,
      (m, plate, w, rest) => plate + (rest.match(/<path fill="#(?:4a4038|0b0907)" d="[^"]*"\/>/g) ?? []).join(''))
    .replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, '')
  for (const [plate, x, y, w] of plates) {
    out = out.replace(plate, '').replace(`M${x} ${y}h${w}v1h-${w}z`, '').replace(`M${x} ${+y + 8}h${w}v1h-${w}z`, '')
  }
  // the bar of a tag that waits on you, as tagsSvg lays it round its board: down its left, along its top, foot and right
  for (const [x, y, w, h] of boards) {
    for (const [rx, ry, rw, rh] of [[x, y, 2, h], [x + 2, y, w - 2, 1], [x + 2, y + h - 1, w - 2, 1], [x + w - 1, y + 1, 1, h - 2]]) {
      out = out.replace(`M${rx} ${ry}h${rw}v${rh}h${-rw}z`, '')
    }
  }
  return out.replace(/<path [^>]*d=""\/>/g, '')
}

/** The month's building for the story's crew, as wide as its now (NARROW.now), its rooms' boxes on its root. */
const monthNow = (base) => renderSvg(month(base), { view: 'month', width: NARROW.now * 2, animate: true, transparent: true, rooms: true, idPrefix: 'mo' })
/** The story's crew room in that building: `box` [x, y, w, h] in its art px (the camera lands on it), `walk` its sidewalk's row. */
export function crewBox() {
  const svg = monthNow(cast(clone(SAMPLE)))
  const rooms = svg.match(/data-rooms="([^"]+)"/)[1]
  return { box: rooms.split(';').map((r) => r.split(' ')).find(([name]) => name === 'crew').slice(1).map(Number), walk: Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1]) }
}

/** The story's street (its timelapse NARROW.end wide): its door's middle row, its sidewalk's row and its width, for the shots on it. */
export function storyStreet() {
  const svg = renderTimelapse(timelapseFacts('week'), { width: NARROW.end * 2, idPrefix: 'ts' })
  return { w: NARROW.end, door: Number(svg.match(/<text x="[\d.]+" y="([\d.]+)" font-size="5"[^>]*>THE OFFICE<\/text>/)[1]) + 21,
    walk: Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1]) }
}

// ---------------------------------------------------------------- a day in the life (the `day` board)

// One Clawd followed through its Thursday, in the 9:16 pane (PORTRAIT), the same office every shot: its room
// (island-tour-3d) shared with Dex and Mooni, Gem and Caret next door, Rok down the hall. Only Clawd changes (and Dex,
// who takes the coffee with it). A shot is Clawd's states one after another, each its own drawing of the whole office
// at the shot's hour (the board shows each in turn: every desk on the same clock, so only Clawd changes at a switch),
// with what it is at as a tag over its head and a feeling now and then (promo/tags.mjs).
const HERO = { id: 'day-clawd', title: 'Cape clipping fix', project: 'island-tour-3d' }
// the cast by their desks' titles (the tags, the walks and the empty chairs find them by these) and their agents
const WHO = { hero: HERO.title, dex: 'Deploy previews', mooni: 'Playtest notes', gem: 'Swatch grid review', caret: 'Desk sprites', rok: 'Lava Cavern camera' }
const AGENT = { hero: 'claude', dex: 'codex', mooni: 'kimi', gem: 'gemini', caret: 'cursor', rok: 'grok' }
// who sits round the meeting's table, from the whiteboard along: Clawd's workflow, the whole cast at it
const TABLE = ['hero', 'dex', 'gem', 'mooni', 'caret', 'rok']
// a tag: its word in the hue of what it is about, then what on, plain; `dots` running after it
const T = (verb, hue, obj = '', o = {}) => ({ parts: [[verb, HUE[hue]], ...(obj ? [[` ${obj}`, HUE.plain]] : [])], ...o })
const DIM_TESTING = T('TESTING', 'run', '', { dots: true, dim: true })
/**
 * A state of Clawd's for `dur` seconds: what it is at (`doing`, dayDesks), its tag, its emote ([kind, at seconds into the
 * state, dx, dy from beside its head]); `away` whose chairs are empty in it (walking, in the meeting), `walk` walkers
 * crossing it ((places of each of the shot's states, this one's index) → [{ agent, from, to, tag }]).
 */
const S = (doing, dur, tag, emote, o = {}) => ({ doing, dur, tag, emote, ...o })
// a walk to or from someone's spot: its figure's top-left in a state's places (a kitchen spot, a desk's floor)
const spot = (p) => (p.at === 'kitchen' ? [p.x, p.y] : [p.x + 24, p.y + 21])
/**
 * The day's shots: `hh:mm` the hour each is drawn at, `states` Clawd's (S) one after the other, `tags` more, on anyone
 * (`on`: a WHO key, the interns' bench, `seat0`… round the meeting's table; `state` the one whose places it goes by),
 * from `from` to `to` seconds of the shot.
 */
export const DAY_SCRIPT = {
  morning: { hh: 9, mm: 4, states: [
    S('read', 1.5, T('READING', 'read', 'TICKET-42')),
    S('think', 1.4, T('THINKING', 'think', '', { dots: true }), ['bulb', 1.0]),
    S('grep', 1.5, T('GREP', 'run', "'ANCHOR'", { dots: true }))],
  tags: [{ on: 'mooni', from: 0.6, dx: 8, ...DIM_TESTING }] },
  fix: { hh: 9, mm: 40, states: [
    S('code', 1.5, T('EDIT', 'edit', 'CAPE-RIG.JS'), ['note', 0.4]),
    S('test', 1.1, T('NPM TEST', 'run', '', { dots: true })),
    S('fail', 1.3, T('2 FAILED!', 'fail'), ['bang', 0.05]),
    S('think', 1.2, T('HMM', 'think', '', { dots: true }), ['bulb', 0.75])],
  tags: [{ on: 'mooni', from: 0.3, to: 2.6, dx: 8, ...DIM_TESTING }] },
  // the coffee break: it sits back, gets up and walks off; in the kitchen it walks in, makes its coffee (the steam off
  // its mug), and Dex walks in and joins it, chatting by turns
  up: { hh: 10, mm: 40, states: [
    S('done', 1.0, T('BREAK TIME!', 'chat'), ['note', 0.25]),
    S('done', 1.3, null, null, { away: ['hero'], walk: (P, i) => [{ agent: 'claude', from: spot(P[0].hero), to: [P[0].hero.x + 84, P[0].hero.y + 21], tag: T('COFFEE', 'chat', '', { dots: true }) }] })],
  tags: [{ on: 'mooni', from: 0.2, dx: 8, ...DIM_TESTING }] },
  // (the kitchen drawn for two throughout, whoever is not in yet left out: it centres who stands in it, so Clawd would
  // move when Dex joins it; Clawd in from the left, Dex from the counter's side, so they never cross)
  coffee: { hh: 10, mm: 45, states: [
    S('break', 0.9, null, null, { away: ['hero', 'dex'], walk: (P, i) => [{ agent: 'claude', from: [P[i].hero.x - 30, P[i].hero.y], to: spot(P[i].hero), tag: T('COFFEE BREAK', 'chat') }] }),
    S('break', 1.5, T('MAKING COFFEE', 'chat', '', { dots: true }), ['steam', 0.2, -3, -8], { away: ['dex'] }),
    S('break', 1.0, null, ['steam', 0, -3, -8], { away: ['dex'], walk: (P, i) => [{ agent: 'codex', from: [P[i].dex.x + 66, P[i].dex.y], to: spot(P[i].dex), tag: T('COFFEE?', 'chat') }] }),
    S('break', 2.4)],
  tags: [{ on: 'dex', state: 3, from: 3.45, to: 4.5, ...T('CHATTING', 'chat', '', { dots: true }) }, { on: 'hero', state: 3, from: 4.5, ...T('CHATTING', 'chat', '', { dots: true }) },
    { on: 'hero', state: 3, emote: 'heart', from: 5.0, dx: -13, dy: 9 }] },
  team: { hh: 11, mm: 20, states: [
    S('plan', 0.9, T('PLANNING', 'think', '', { dots: true })),
    S('delegate', 1.3, T('SPAWNING', 'wait', '3 AGENTS'), ['spark', 0.1]),
    S('wait', 1.6, T('WAITING', 'wait', '', { dots: true })),
    S('reports', 0.9, T('3 REPORTS IN', 'done'), ['spark', 0.05])],
  tags: [{ on: 'bench', from: 1.0, to: 3.8, ...T('SEARCHING', 'read', '', { dots: true, below: true }) }] },
  // the meeting: Clawd's workflow, the whole cast round the table, their desks empty; each says its piece in turn
  // (every other tag a row higher, so neighbours never cross)
  meeting: { hh: 14, mm: 5, states: [S('meet', 4.8, null, null, { away: TABLE, seats: TABLE })],
    tags: [
      { on: 'seat0', from: 0.15, to: 1.5, ...T('PRESENTING', 'wait', '', { dots: true }) },
      { on: 'seat1', from: 1.2, to: 2.3, dy: -11, ...T("I'LL RUN IT", 'run') },
      { on: 'seat2', from: 2.0, to: 3.0, ...T('READ IT ALL', 'read') },
      { on: 'seat3', from: 2.7, to: 3.7, dy: -11, ...T('EDGE CASE?', 'think') },
      { on: 'seat4', from: 3.4, to: 4.4, ...T('TAB TAB TAB', 'edit') },
      { on: 'seat5', from: 4.0, dy: -11, ...T('HA HA!', 'chat') }] },
  // its tag lifted over the plugin's big ? (svg-kit bq: 13 × 14 over the raised hand, hopping)
  ask: { hh: 16, mm: 12, states: [S('ask', 2.6, T('WAITING ON YOU', 'ask', '', { dots: true, lift: 13 }), ['sweat', 1.3, -26])] },
  ship: { hh: 17, mm: 40, states: [
    S('code', 0.9, T('EDIT', 'edit', 'CAPE-RIG.JS')),
    S('test', 1.1, T('NPM TEST', 'run', '', { dots: true })),
    S('done', 1.6, T('24 PASSED!', 'done'), ['spark', 0.05])],
  tags: [{ on: 'mooni', from: 0.2, dx: 8, ...DIM_TESTING }] },
}
/** A shot's states with their times: [{ doing, from, to, scene, … }] (scene: the drawing's name). */
export const dayStates = (key) => {
  let t = 0
  return DAY_SCRIPT[key].states.map((st, i) => {
    const s = { ...st, from: t, to: t + st.dur, scene: `day_${key}_${i}_${st.doing}` }
    t += st.dur
    return s
  })
}
function dayDesks(f, doing) {
  const work = (who, project, kind, label) => deskOf(f, { id: `day-${who}`, agent: AGENT[who], title: WHO[who], project, state: 'working', activity: { kind, tool: null, label, since: ago(f, 20) } })
  const brk = (o) => Object.assign(o, { state: 'idle', status: 'idle', idle_reason: 'break', activity: { kind: 'idle', tool: null, label: null, since: ago(f, 3) } })
  const intern = (k, what) => ({ id: `di${k}`, type: 'Explore', description: what, state: 'working' })
  const interns = [intern(0, 'cape anchors'), intern(1, 'shoulder bones'), intern(2, 'cloth sim notes')]
  const act = (kind, tool, label, min = 2) => ({ kind, tool, label, since: ago(f, min) })
  const hero = deskOf(f, { ...HERO, agent: 'claude', started_at: ago(f, 30), state: 'working', activity: act('reading', 'Read', 'ticket-42.md') })
  const set = {
    read: {}, reports: { activity: act('reading', 'Read', 'agent reports') },
    think: { activity: act('thinking', null, null) }, plan: { activity: act('thinking', null, null) },
    grep: { activity: act('terminal', 'Grep', 'grep -r anchor') }, code: { activity: act('coding', 'Edit', 'cape-rig.js', 6) },
    test: { activity: act('testing', 'Bash', 'npm test', 1) },
    fail: { state: 'idle', status: 'idle', idle_reason: 'error', activity: { kind: 'idle', tool: null, label: '2 tests failed', since: ago(f, 1) } },
    delegate: { activity: act('delegating', 'Task', 'find every cape anchor', 1), interns },
    wait: { state: 'waiting_on_agents', activity: act('delegating', 'Task', 'find every cape anchor', 1), interns },
    meet: { state: 'waiting_on_agents', activity: act('delegating', 'Workflow', 'cape-physics', 15), meetings: [meetingOf(f, 'wf-cape', 'cape-physics', 'Review', TABLE.length, 3, 9)] },
    ask: { state: 'asking', activity: act('talking', 'AskUserQuestion', 'Which cape anchor?') },
    done: { state: 'idle', status: 'idle', idle_reason: 'done', activity: { kind: 'idle', tool: null, label: null, since: ago(f, 2) } },
  }
  if (doing === 'break' || doing === 'solo') brk(hero)
  else Object.assign(hero, set[doing])
  const dex = work('dex', 'island-tour-3d', 'terminal', 'npm run build')
  // Dex on break with it, come later: the kitchen lines them up by shift, so Clawd keeps its spot when Dex joins it
  if (doing === 'break') Object.assign(brk(dex), { started_at: ago(f, 10) })
  return [hero, dex, work('mooni', 'island-tour-3d', 'testing', 'difficulty tests'), work('gem', 'webgl-swatch-demos', 'reading', 'swatches.md'),
    work('caret', 'webgl-swatch-demos', 'coding', 'sprites.mjs'), work('rok', 'glyph-atlas-webgpu', 'web', 'threejs.org/docs')]
}
/** Where someone is in a day scene, in its art px: its desk's top-left, or its figure's in the kitchen. */
function placeOf(svg, title) {
  const desk = svg.match(new RegExp(`<g transform="translate\\(([\\d.]+) ([\\d.]+)\\)"><title>[\\w-]+ · ${title}`))
  if (desk) return { x: Number(desk[1]), y: Number(desk[2]), at: 'desk' }
  const fig = svg.match(new RegExp(`<g><title>[\\w-]+ · ${title}[^<]*</title><use href="[^"]+" x="([\\d.]+)" y="([\\d.]+)"`))
  if (fig) return { x: Number(fig[1]), y: Number(fig[2]), at: 'kitchen' }
  return null
}
/**
 * `svg` without `title`'s figure: at its desk (its figure, on its own timeline right after the chair: the chair left
 * empty, the screen on), or standing in the kitchen (the whole of it: figure, mug, speech bubble).
 */
function vacate(svg, title) {
  const i = svg.search(new RegExp(`<title>[\\w-]+ · ${title} · `))
  if (i < 0) throw new Error(`vacate: no ${title}`)
  if (svg.slice(i - 3, i) === '<g>') {
    const re = /<g><title>[^<]*<\/title><use[^>]*\/><use[^>]*\/>(?:<g opacity="0"><use[^>]*\/>(?:<animate[^>]*\/>)?<\/g>)?<\/g>/y
    re.lastIndex = i - 3
    const m = re.exec(svg)
    if (!m) throw new Error(`vacate: ${title}'s kitchen figure`)
    return svg.slice(0, m.index) + svg.slice(m.index + m[0].length)
  }
  const re = /<g transform="translate\(22 12\)" clip-path="url\(#[^"]+\)"><use href="#[^"]+">(?:<animateTransform[^>]*\/>)?<\/use><\/g>/g
  re.lastIndex = i
  const m = re.exec(svg)
  if (!m) throw new Error(`vacate: ${title}'s figure at its desk`)
  return svg.slice(0, m.index) + svg.slice(m.index + m[0].length)
}
/**
 * The meeting's table seated with `who` (WHO keys) in place of its own (its workflow's agent in every seat), each in its
 * own looks, nodding along; their seats ([x, y] of each figure's top-left, in the drawing's art px).
 */
function seatTable(svg, who) {
  const m = svg.match(/<g transform="translate\(([\d.]+) ([\d.]+)\)"><title>cape-physics/)
  const cell = m.index, [cx, cy] = [Number(m[1]), Number(m[2])]
  const ctx = { id: 'mt-', defs: new Map(), animate: true }
  const seats = []
  const end = svg.indexOf('</g>', cell)
  const body = svg.slice(cell, end).replace(/<use href="#[\w-]+-v-meet\d" x="([\d.]+)" y="([\d.]+)"\/>/g, (all, x, y) => {
    const k = seats.length
    if (k >= who.length) return all
    seats.push([cx + Number(x), cy + Number(y)])
    return castFigure(ctx, AGENT[who[k]], 'meet', `day-meet-${k}`, Number(x), Number(y), { shared: k })
  })
  const out = svg.slice(0, cell) + body + svg.slice(end)
  return { svg: out.replace('</defs>', `${defsMarkup(ctx)}</defs>`), seats }
}
const sidewalkOf = (svg) => Number(svg.match(/fill="#58514a" d="M0 (\d+)h/)[1])
/** Where a tag on `on` points, in a state's places: over a desk's figure, a kitchen figure's head, the bench, a seat. */
function anchor(places, on) {
  if (on.startsWith('seat')) {
    const [x, y] = places.seats[Number(on.slice(4))]
    return [x + 11, y - 1]
  }
  const p = places[on === 'bench' ? 'hero' : on]
  if (on === 'bench') return [p.x + 18, p.y + 37]
  return p.at === 'kitchen' ? [p.x + 12, p.y - 3] : [p.x + 32, p.y + 2]
}
/** Walkers crossing a drawing, each from `from` to `to` (its figure's top-left) between `t0` and `t0 + dur`, its tag over it. */
function walkersSvg(ctx, list) {
  return list.map(({ agent, from: [x0, y0], to: [x1, y1], t0, dur, tag }) => {
    const facing = x1 >= x0 ? 'Wr' : 'Wl'
    return `<g display="none"><set attributeName="display" to="inline" begin="${r2(t0)}s"/><set attributeName="display" to="none" begin="${r2(t0 + dur)}s"/>` +
      `<animateTransform attributeName="transform" type="translate" from="${x0} ${y0}" to="${x1} ${y1}" begin="${r2(t0)}s" dur="${r2(dur)}s" fill="freeze"/>` +
      `${use(ctx, pose(agent, facing), 0, 0)}${tag ? walkerTag({ ...tag, x: 8, y: -1, from: t0, clamp: [-999, 999] }) : ''}</g>`
  }).join('')
}
let dayCache = null
/**
 * The day's drawings by name (quiet: no words): every shot's states (day_<shot>_<i>_<state>) and its tags and walkers
 * (day_<shot>_tags), the street's walkers; and the places in each shot's states ({ hero, dex, …: { x, y, at }, seats,
 * meeting, walk, size }), as places[shot][state].
 */
export function dayScenes() {
  if (dayCache) return dayCache
  const base = cast(clone(SAMPLE))
  const svgs = {}, places = {}
  for (const [key, shot] of Object.entries(DAY_SCRIPT)) {
    const states = dayStates(key)
    const P = states.map((s) => {
      const f = at(clone(base), shot.hh, shot.mm)
      f.live.desks = dayDesks(f, s.doing)
      f.live.recently_left = []
      let raw = withGround(renderSvg(f, { view: 'live', width: PORTRAIT, animate: true, transparent: true, idPrefix: s.scene.replace(/_/g, '') }))
      const where = Object.fromEntries(Object.entries(WHO).map(([k, title]) => [k, placeOf(raw, title)]))
      const meeting = raw.match(/<g transform="translate\(([\d.]+) ([\d.]+)\)"><title>cape-physics/)
      Object.assign(where, { meeting: meeting && { x: Number(meeting[1]), y: Number(meeting[2]) }, walk: sidewalkOf(raw), size: size(raw) })
      if (s.seats) ({ svg: raw, seats: where.seats } = seatTable(raw, s.seats))
      for (const who of s.away ?? []) raw = vacate(raw, WHO[who])
      svgs[s.scene] = quiet(raw)
      return where
    })
    const items = [], walkers = []
    states.forEach((s, i) => {
      const [x, y] = anchor(P[i], 'hero')
      // (`lift`: rows higher, over what the plugin draws over a head)
      if (s.tag) items.push({ ...s.tag, x, y: y - (s.tag.lift ?? 0), from: s.from + 0.05, to: s.to })
      // a feeling beside its head, right of it (or `dx`, `dy` from there), clear of the tag over it
      if (s.emote) items.push({ emote: s.emote[0], x: x + 16 + (s.emote[2] ?? 0), y: y + 12 + (s.emote[3] ?? 0), from: s.from + s.emote[1], to: s.to })
      for (const w of s.walk?.(P, i) ?? []) walkers.push({ ...w, t0: s.from, dur: s.dur })
    })
    for (const t of shot.tags ?? []) {
      const [x, y] = anchor(P[t.state ?? 0], t.on)
      items.push({ ...t, x: x + (t.dx ?? 0), y: y + (t.dy ?? 0) })
    }
    places[key] = P
    const ctx = { id: `dw${key}-`, defs: new Map(), animate: true }
    const walking = walkersSvg(ctx, walkers)
    svgs[`day_${key}_tags`] = tagLayer(P[0].size.w, P[0].size.h, items, walking && `<defs>${defsMarkup(ctx)}</defs>${walking}`)
  }
  // the street: Clawd alone up the sidewalk from the left at 08:58, and out of the door off to the right at dusk, its
  // tag over its head (their clock the shot's: in from 0.2 s, at the door 2 s later; out of it at 0.6 s, off past the frame)
  const story = withFacade(renderTimelapse(timelapseFacts('week'), { width: NARROW.end * 2, idPrefix: 'ts' }), { fit: true })
  svgs.dayIn = arrivals(story, 1, [['claude', false, 0.2, false, T('CLOCKING IN', 'run', '', { dots: true })]], { id: 'di-', speed: 45 })
  svgs.dayOut = arrivals(story, 1, [['claude', true, 0.6, true, T('LOGGING OFF', 'wait', '', { dots: true })]], { id: 'do-', speed: 45, dist: 135 })
  dayCache = { svgs, places }
  return dayCache
}

/** Every drawing the storyboards cut their shots from, by name: an SVG string each. */
export function scenes() {
  const base = cast(clone(SAMPLE))
  desk(base, DESK.done, 'done', { min: 4 })
  const live = (f, name) => renderSvg(f, { view: 'live', width: WIDTH, animate: true, idPrefix: name })
  const s = {}
  s.liveNight = live(base, 'ln')
  s.liveDay = live(at(base, 10), 'ld')
  const empty = clone(base)
  empty.live.desks = []
  empty.live.recently_left = []
  s.liveEmpty = live(empty, 'le')
  s.weekNight = renderSvg(base, { view: 'week', width: WIDTH, animate: true, idPrefix: 'wn' })
  s.monthNight = renderSvg(month(base), { view: 'month', width: WIDTH, animate: true, idPrefix: 'mn' })
  s.todayNight = renderSvg(today(base), { view: 'today', width: WIDTH, animate: true, idPrefix: 'tn' })
  s.lapseWeek = renderTimelapse(timelapseFacts('week'), { width: WIDTH, idPrefix: 'tw' })
  s.lapseStreet = withFacade(s.lapseWeek)
  // the story: the street on ground, its windows onto the rooms behind, quiet for the cast's own arrivals; the arrivals
  // the story's street: the week's timelapse as wide as its end (NARROW.end: four floors over the lobby, five windows
  // across, a balanced building), its façade's windows onto its rooms, its sky dressed, neighbours each side
  const story = renderTimelapse(timelapseFacts('week'), { width: NARROW.end * 2, idPrefix: 'ts' })
  const lit = streetLight(dressLapseStreet(withFacade(story, { holes: true, fit: true }), NARROW.end))
  s.streetLapse = street(lit)
  s.streetQuiet = street(lit, { quiet: true })
  s.arrivals = arrivals(withFacade(story, { fit: true }))
  // the shut office at night: lights still blinking in its windows, a cat going by (each on its own clock)
  s.nightLights = nightLights(lit)
  s.nightCat = nightCat(lit)
  // the extension in a 9:16 pane: the meeting (2 Clawds, a Gem), the kitchen, a room of desks, what they did, the week
  const pane = (f, view, name) => renderSvg(f, { view, width: PORTRAIT, animate: true, transparent: true, idPrefix: name })
  for (const kind of ['meeting', 'kitchen', 'desks']) {
    const f = clone(base)
    f.live.desks = portraitDesks(f, kind)
    f.live.recently_left = []
    s[`p${kind[0].toUpperCase()}${kind.slice(1)}`] = roadUnder(pane(f, 'live', `p${kind[0]}`))
  }
  s.pWork = pane(base, 'work', 'pw')
  // the one office the camera travels through: every room at once, its basement and its commits line in the earth
  {
    const f = clone(base)
    f.live.desks = portraitDesks(f, 'office')
    f.live.recently_left = []
    // its legend under the commits line goes under the earth, from 40 rows into the line (under the train): the train
    // runs in the ground, nothing hangs below it
    const office = withGround(pane(f, 'live', 'po'))
    const line = Number(office.match(/<g transform="translate\(0 ([\d.]+)\)"><path fill="#1b1713" d="M0 0h/)?.[1])
    s.pOffice = Number.isFinite(line) ? office.replace(/<\/svg>\s*$/, `<rect x="-400" y="${line + 40}" width="1070" height="800" fill="#15100c"/></svg>`) : office
  }
  s.pMonth = withGround(pane(month(base), 'month', 'pn'))
  // the year, month after month: a calendar page each (pCal0 … pCal11)
  YEAR.forEach(([ym, level], i) => { s[`pCal${i}`] = dressStill(pane(calendarMonth(base, ym, level), 'month', `pc${i}`), PORTRAIT / 2, { moon: [44, -30] }) })
  // the story's now and its end: the building narrower than the frame (NARROW), from its sign down to its door, standing
  // on its street: the live floor with everyone at work under the video's night, and the week's timelapse under its own
  // sky stretched over the frame
  // (the neighbours' roofs as rows over each one's sidewalk, so they stand where they did whatever its height)
  const nowLive = renderSvg(everyoneWorking(clone(base)), { view: 'live', width: NARROW.now * 2, animate: true, transparent: true, idPrefix: 'lw' })
  s.liveNow = onStreet(dressStill(nowLive, NARROW.now, { moon: [34, -24], roofs: roofsOver(nowLive, [242, 182]) }))
  // its week and its crew dressed as its now: the week's tower and the month's building at the same width, the night
  // round them, neighbours lower than the tower each side, their street on the underground
  const nowWeek = renderSvg(base, { view: 'week', width: NARROW.now * 2, animate: true, transparent: true, idPrefix: 'wk' })
  s.weekNow = onStreet(dressStill(nowWeek, NARROW.now, { moon: [40, -30], roofs: roofsOver(nowWeek, [188, 108]) }))
  const nowMonth = monthNow(base)
  s.monthNow = onStreet(dressStill(nowMonth, NARROW.now, { moon: [40, -30], roofs: roofsOver(nowMonth, [325, 255]) }))
  s.crewLine = crewLine(s.monthNow)
  const lapse = streetLight(renderTimelapse(timelapseFacts('week'), { width: NARROW.end * 2, idPrefix: 'te' }))
  s.lapseEnd = dressEnd(lapse, NARROW.end)
  // the same, its sky, neighbours and street reaching further out, for a frame that shows it smaller (the story's 1:1)
  s.lapseEndWide = dressEnd(lapse, NARROW.end, { past: END_PAST })
  // the story's montage: the cast at work, without a word
  {
    const f = clone(base)
    f.live.desks = portraitDesks(f, 'work')
    f.live.recently_left = []
    s.pWorking = quiet(withGround(pane(f, 'live', 'pg')))
  }
  // the whole buildings with no sky of their own, the video's pixel sky behind them
  s.liveT = renderSvg(base, { view: 'live', width: WIDTH, animate: true, transparent: true, idPrefix: 'lt' })
  s.weekT = renderSvg(base, { view: 'week', width: WIDTH, animate: true, transparent: true, idPrefix: 'wt' })
  s.monthT = renderSvg(month(base), { view: 'month', width: WIDTH, animate: true, transparent: true, idPrefix: 'mt' })
  s.pWeek = withGround(pane(base, 'week', 'pk'))
  // the story's week: the tower on its street, nothing under it (its commits line, its tenants' table)
  s.pWeekUp = onStreet(dressStill(pane(base, 'week', 'pu'), PORTRAIT / 2, { moon: [44, -30] }))
  // the meme: the hand-up desk at 16:10 and again at 22:10, still waiting
  const day = at(base, 16), night = at(base, 22)
  const A = DESK.asking
  s.memeTyping = live(desk(clone(day), A, 'working', { min: 1 }), 'm1')
  s.memeAsk = live(desk(clone(day), A, 'asking', { min: 2 }), 'm2')
  s.memeStill = live(desk(clone(night), A, 'asking', { min: 362 }), 'm3')
  s.memeAnswer = live(desk(clone(night), A, 'working', { min: 0 }), 'm4')
  s.memeDone = live(desk(clone(night), A, 'done', { min: 2 }), 'm5')
  s.memeDoze = live(desk(at(base, 23, 40), A, 'done', { min: 75 }), 'm6')
  // a day in the life: one Clawd's Thursday
  Object.assign(s, dayScenes().svgs)
  // the sign's tired letter goes dark for a beat now and then: in a video that reads as a broken sign, so it stays lit
  for (const k of Object.keys(s)) s[k] = s[k].replace(/<g opacity="0"><use href="#[\w-]+-neon-f"[^>]*\/><animate[^>]*\/><\/g>/g, '')
  return s
}

/** The live floor as the terminal draws it, as HTML spans in each role's color. */
export function terminalHtml(width = 80) {
  const f = cast(clone(SAMPLE))
  const lines = renderOffice(f, { view: 'live', width, departments: false })
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return lines.map((l) => l.map(([t, r]) => (r && ROLE_HEX[r] ? `<span style="color:${ROLE_HEX[r].dark}">${esc(t)}</span>` : esc(t))).join('')).join('\n')
}

/** An SVG's art size (its viewBox), in art pixels. */
export function size(svg) {
  const [, , w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number)
  return { w, h }
}

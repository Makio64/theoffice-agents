import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { SVG_VIEWS, esc, officeCounts, renderSvg } from '../plugin/lib/svg.mjs'
import { SKY, SPRITE_CLASHES, SPRITES, fitMid, textW } from '../plugin/lib/svg-kit.mjs'
import { idleFacts, monthFacts, todayFacts } from './helpers/facts.mjs'
import { renderHtml } from '../plugin/lib/html.mjs'
import { renderOffice, toPlain } from '../plugin/lib/ascii.mjs'
import { ROLE_HEX } from '../plugin/lib/model.mjs'

const sample = JSON.parse(fs.readFileSync(new URL('./fixtures/facts-sample.json', import.meta.url), 'utf8'))
const clone = (o) => structuredClone(o)

// ---------------------------------------------------------------- fixtures

// Built from char codes so no editor or tool ever normalizes them away: BEL, ESC-CSI, RLO bidi override, a lone surrogate, U+FFFE.
const CTRL = String.fromCharCode(7) + String.fromCharCode(27) + '[31m' + String.fromCharCode(0x202e) + String.fromCharCode(0xd800) + String.fromCharCode(0xfffe)
const HOSTILE = '<script>alert(1)</script> & "x"'
const NASTY = `${HOSTILE} ${CTRL} 'q' ${String.fromCodePoint(0x1f600)} é`

// 20 desks over 20 projects (every class, interns everywhere), 3 meetings (one of 48 agents), 40 projects, all hostile text.
function stressFacts() {
  const f = clone(sample)
  const states = ['working', 'working', 'waiting_on_agents', 'asking', 'idle', 'working', 'idle']
  const kinds = ['coding', 'reading', 'terminal', 'testing', 'web', 'delegating', 'planning', 'talking', 'design', 'tools', 'thinking']
  f.live.desks = Array.from({ length: 20 }, (_, i) => {
    const state = states[i % states.length]
    return {
      id: `d${String(i).padStart(7, '0')}`, pid: 1000 + i, title: i % 3 ? `${NASTY} desk ${i} with a very long title that never ends` : NASTY,
      project: i % 4 === 0 ? `${NASTY}-${i}` : `project-with-a-really-long-name-${i}`, project_path: `/x/p${i}`, worktree: i % 4 ? null : NASTY, branch: i % 3 ? 'main' : NASTY,
      status: state === 'idle' ? 'idle' : 'busy', state,
      activity: { kind: state === 'idle' ? 'idle' : kinds[i % kinds.length], tool: 'Edit', label: NASTY, since: i % 2 ? '2026-10-25T20:00:00.000Z' : '2026-10-26T00:30:00.000Z' },
      model: 'claude-opus-5-5', started_at: `2026-10-25T2${i % 4}:00:00.000Z`, last_seen: '2026-10-26T00:39:00.000Z', entrypoint: 'cli',
      interns: Array.from({ length: (i % 6) + 1 }, (_, j) => ({ id: `i${i}-${j}`, type: ['Explore', 'general-purpose', 'Plan', NASTY][j % 4], description: NASTY, started_at: '', last_seen: '' })),
      meetings: i < 3 ? [{ id: `wf_${i}`, name: NASTY, phase: NASTY, agents_running: i === 0 ? 40 : 3, agents_done: 5, agents_failed: 3, agents_total: i === 0 ? 48 : 11, started_at: '', labels: [NASTY] }] : [],
    }
  })
  f.projects = Array.from({ length: 40 }, (_, i) => ({ ...clone(sample.projects[0]), name: i % 5 ? `project-with-a-really-long-name-${i}` : `${NASTY}-${i}`, titles: [NASTY] }))
  f.projects_more = 99
  f.live.recently_left = Array.from({ length: 5 }, (_, i) => ({ title: NASTY, project: `${NASTY}${i}`, left_at: '2026-10-26T00:31:00.000Z' }))
  f.contractors = [{ tool: NASTY, project: NASTY, title: NASTY, minutes: 90, start: '', end: '', live: true }]
  return f
}

// One desk per pose (sample + delegating, thinking, planning, a boss with 6 interns) and two live visitors.
function posesFacts() {
  const f = clone(sample)
  const base = f.live.desks[2]
  const mk = (i, state, kind, interns = 0) => ({
    ...clone(base), id: `pose${i}`, pid: 7000 + i, state, status: 'busy', activity: { ...base.activity, kind },
    interns: Array.from({ length: interns }, (_, j) => ({ id: `pi${i}-${j}`, type: 'Explore', description: 'look around' })), meetings: [],
  })
  f.live.desks.push(mk(1, 'working', 'delegating'), mk(2, 'working', 'thinking'), mk(3, 'working', 'planning'), mk(4, 'waiting_on_agents', 'delegating', 6))
  f.contractors = [{ ...f.contractors[0], live: true }, { ...f.contractors[0], tool: 'gemini', live: true }]
  return f
}

// Former human palette (skin, skin shade, pants, shoes, hair): none of it may come back.
const HUMAN = ['#f2c9a0', '#d9a47e', '#3b4560', '#2a201a', '#6b4226', '#d9b26a', '#a84f2a', '#4a2f4f', '#c9c3b8', '#1e1e24', '#8d8d93', '#2a201c']
const CLAWD = '#d77757'
const CLAWD_EYE = '#141414'
// The markup of one <defs> sprite (defs are flat siblings: each runs to the next id'd group or the end of <defs>).
const defOf = (svg, id) => {
  const i = svg.indexOf(`<g id="${id}">`)
  if (i < 0) return null
  const rest = svg.slice(i + 1)
  const end = Math.min(...[rest.search(/<g id="/), rest.indexOf('</defs>')].filter((n) => n >= 0))
  return rest.slice(0, end)
}

function emptyFacts(night = true) {
  const f = clone(sample)
  f.live.desks = []
  f.now.is_night = night
  return f
}

// ---------------------------------------------------------------- tiny checkers

// Balanced tags, no raw `<` or bare `&` in text, quoted attributes, no duplicate attributes. Returns the first problem or ''.
function xmlProblem(src) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<!--[\s\S]*?-->|<!doctype[^>]*>|([^<]+)|(<)/gi
  let m
  let pos = 0
  while ((m = re.exec(src))) {
    if (m.index !== pos) return `gap at ${pos}`
    pos = re.lastIndex
    if (m[6]) return `stray < at ${m.index}: ${src.slice(m.index, m.index + 40)}`
    if (m[5] != null) {
      const bad = /&(?!(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.exec(m[5])
      if (bad) return `bare & at ${m.index + bad.index}`
      continue
    }
    if (!m[2]) continue
    const names = [...(m[3] ?? '').matchAll(/([\w:.-]+)=/g)].map((a) => a[1])
    if (new Set(names).size !== names.length) return `duplicate attribute in <${m[2]}>`
    if (m[1]) {
      const open = stack.pop()
      if (open !== m[2]) return `</${m[2]}> closes <${open}>`
    } else if (!m[4]) stack.push(m[2])
  }
  if (pos !== src.length) return `trailing garbage at ${pos}`
  return stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

// HTML void elements never close; strip them before the XML check.
const xmlOfHtml = (html) => html.replace(/<(meta|link|br|hr|img|input)\b[^>]*>/gi, '')

function unsafe(src) {
  const hits = []
  if (/<script/i.test(src)) hits.push('script')
  if (/<foreignObject/i.test(src)) hits.push('foreignObject')
  if (/<iframe|<object|<embed|<image\b|<img\b|<link\b/i.test(src)) hits.push('embed')
  if (/\son[a-z]+\s*=/i.test(src)) hits.push('on* attribute')
  if (/\b(?:href|xlink:href|src|action)\s*=\s*(?!["']?#)/i.test(src)) hits.push('external href')
  if (/url\(\s*(?!["']?#)/i.test(src)) hits.push('external url()')
  if (/@import|javascript:/i.test(src)) hits.push('import/javascript')
  return hits
}

const ids = (src) => [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])

// ---------------------------------------------------------------- svg

describe('renderSvg', () => {
  test('minHeight: a short drawing grows a street down to the pane height; a tall one is left as drawn', () => {
    const size = (svg) => /^<svg\b[^>]*?\swidth="(\d+)"[^>]*?\sheight="(\d+)"/.exec(svg).slice(1).map(Number)
    const [w, h] = size(renderSvg(sample, { view: 'week', width: 640 }))
    const filled = renderSvg(sample, { view: 'week', width: 640, minHeight: h + 600 })
    const [fw, fh] = size(filled)
    assert.equal(fw, w)
    assert.ok(fh >= h + 600 && fh <= h + 604, `${fh} vs ${h + 600}`) // whole viewBox units of 2 px
    assert.equal(xmlProblem(filled), '')
    // the ground color behind it all, so a letterboxed drawing never shows bare page
    assert.match(filled, /^<svg [^>]*style="background:#14120f"/)
    assert.deepEqual(size(renderSvg(sample, { view: 'week', width: 640, minHeight: h - 100 })), [w, h])
  })

  test('sample: every view is well-formed, safe, sized and animated', () => {
    for (const view of ['live', 'week', 'all']) {
      const svg = renderSvg(sample, { view })
      assert.equal(xmlProblem(svg), '', view)
      assert.deepEqual(unsafe(svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')), [], view)
      assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), view)
      assert.match(svg, /shape-rendering="crispEdges"/)
      assert.match(svg, /viewBox="0 0 320 \d+"/)
      assert.match(svg, /<animate/, view)
      assert.ok(svg.length <= 120_000, `${view} ${svg.length}`)
      assert.equal(new Set(ids(svg)).size, ids(svg).length, `${view}: duplicate ids`)
      for (const ref of svg.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(svg).includes(ref[1]), `dangling #${ref[1]}`)
    }
  })

  test('live floor plan speaks the ASCII vocabulary', () => {
    const svg = renderSvg(sample, { view: 'live', animate: false })
    for (const s of ['island-tour-3d', 'glyph-atlas-webgpu', 'md2epub', 'theoffice-agents', 'MEETING ROOM', 'KITCHEN', '5/9 done', 'arcade-finale-brief',
      '2 on break', 'gizmo3d "Exporter cleanup" left 9m ago', 'night shift', 'dozing at the desk', 'asks: Which cape anchor?']) {
      assert.ok(svg.includes(esc(s)), s)
    }
    // no explaining under the building: no lights-off list, no coat rack line, no color key
    for (const s of ['lights off:', 'coat rack', '>dozing / on break<']) assert.ok(!svg.includes(s), s)
    // one tooltip per seated desk (the break desks stand in the kitchen), intern tooltips carry the job title
    assert.equal((svg.match(/<g transform="translate\([^)]*\)"><title>/g) ?? []).length, 8 + 1)   // 8 desks + 1 meeting cell
    assert.match(svg, /<title>researcher · Sketch the lobby layout<\/title>/)
    assert.match(svg, /href="#to-moon"/)
    assert.doesNotMatch(svg, /href="#to-sun"/)
  })

  test('every agent is Clawd: Claude orange, near-black eyes, no human skin or hair left', () => {
    for (const f of [sample, posesFacts(), stressFacts()]) {
      for (const view of ['live', 'week', 'all']) {
        const svg = renderSvg(f, { view })
        assert.ok(svg.includes(`fill="${CLAWD}"`) && svg.includes(`fill="${CLAWD_EYE}"`), view)
        for (const hex of HUMAN) assert.ok(!svg.toLowerCase().includes(hex), `${view}: ${hex}`)
      }
    }
  })

  test('one Clawd script per desk state, each desk on a timeline of its own; interns are mini Clawds, visitors are robots', () => {
    // drawn by day: at night this office (14 desks, a meeting, a boss with 6 interns, two visitors) sits at the size
    // budget's edge since the roof carries the sign, its neon and the skyline, and renderSvg trades the rooms' full art
    // (the scripts) for still frames that blink to keep its basement furnished; the lighter day sky leaves the scripts room
    const f = posesFacts()
    f.now.is_night = false
    const svg = renderSvg(f, { view: 'live' })
    const sheet = defOf(svg, 'to-c-sheet') ?? ''
    assert.ok(sheet, `the rooms in their full art: Clawd's sheet in <defs> (${svg.length} chars)`)
    // typing (coding, terminal, testing), the screen read line by line (web, planning), reading, delegating, thinking,
    // the boss, a hand up, dozing: each desk state shows its own frames (svg-kit FIGURE_BODY, FIGURE_EYES) in Clawd's sheet
    for (const frame of ['typeA', 'typeB', 'mouse', 'point', 'boss', 'wave', 'hand', 'doze1', 'doze2']) assert.match(sheet, new RegExp(`href="#to-c-f-${frame}"`), frame)
    for (const eyes of ['scr1', 'scr2', 'up', 'shutS', 'doze2']) assert.match(sheet, new RegExp(`href="#to-eye\\d-${eyes}"`), eyes)
    assert.match(svg, /href="#to-c-v-chat[01]\d"/, 'standing in the kitchen')
    assert.match(svg, /href="#to-c-v-meet\d"/, 'seated in the meeting room')
    assert.match(svg, /href="#to-cI[01]"/, 'interns on the bench')
    assert.equal((svg.match(/href="#to-robot"/g) ?? []).length, 2, 'two live visitors')
    // a boss with 6 interns: three minis on the bench and a +3
    assert.ok(svg.includes('<title>researcher · look around</title>'))
    // animated: no two desks move in step (a timeline each, seeded by the session id); typing hands take turns, a raised
    // hand waves; nothing human-shaped is left in the defs
    const tracks = [...svg.matchAll(/<use href="#to-c-sheet"><animateTransform ([^>]*)\/>/g)].map((m) => m[1])
    assert.ok(tracks.length >= 8, `a timeline per desk: ${tracks.length}`)
    assert.equal(new Set(tracks).size, tracks.length, 'two desks move in step')
    for (const t of tracks) assert.match(t, /calcMode="discrete" repeatCount="indefinite"/)
    assert.match(defOf(svg, 'to-arm-out0A'), /<animateTransform/)
    assert.match(defOf(svg, 'to-arm-high1W'), /<animateTransform/)
    for (const id of ['to-pw', 'to-pa', 'to-pb', 'to-pz', 'to-pk', 'to-pi0', 'to-hd0', 'to-feet']) assert.equal(defOf(svg, id), null, id)
  })

  test("Clawd's body never takes a project color; the plaque and the mug do", () => {
    const projectHex = new Set(Array.from({ length: 8 }, (_, i) => ROLE_HEX[`p${i}`].dark))
    for (const f of [sample, posesFacts(), stressFacts()]) {
      const svg = renderSvg(f, { view: 'live' })
      // his poses (cT0…, the other scenes'), his body as the live floors light it and his frames: his own colors, light
      // (translucent) on top; his arms are the cast's in his color, his eyes the cast's in his eye color
      for (const [, name] of svg.matchAll(/<g id="to-(c[A-Z]\d?|c-(?:lit|dim|legs|f-\w+))">/g)) {
        const def = defOf(svg, `to-${name}`)
        const fills = new Set([...def.matchAll(/fill="([^"]+)"(?! fill-opacity)/g)].map((m) => m[1]))
        assert.deepEqual([...fills].filter((x) => x !== CLAWD && x !== CLAWD_EYE), [], name)
        assert.doesNotMatch(def, /currentColor/, name)
        for (const u of def.match(/<use href="#to-arm-[^"]*"[^>]*>/g) ?? []) assert.match(u, new RegExp(` color="${CLAWD}"`), u)
      }
      for (const u of (defOf(svg, 'to-c-sheet') ?? '').match(/<use href="#to-eye[^"]*"[^>]*>/g) ?? []) assert.match(u, new RegExp(` color="${CLAWD_EYE}"`), u)
      for (const use of svg.match(/<use href="#to-c[A-Z]\d?"[^>]*>/g) ?? []) assert.doesNotMatch(use, /\s(?:color|fill)=/, use)
      // every desk front carries its plaque, in the project's color
      const body = svg.slice(svg.indexOf('</defs>'))
      const plaques = [...body.matchAll(/href="#to-(?:plaque|rm-desk|rm-d(?:cool|warm|ask|none))" color="([^"]+)"/g)].map((m) => m[1])
      assert.equal(plaques.length, (body.match(/href="#to-(?:chair|rm-chair|rm-k(?:cool|warm|ask|none))"/g) ?? []).length, 'one plaque per desk')
      assert.ok(plaques.length > 0 && plaques.every((c) => projectHex.has(c)), 'plaques in project colors')
      const mugs = [...svg.matchAll(/href="#to-mug"[^>]* color="([^"]+)"/g)].map((m) => m[1])
      assert.ok(mugs.length > 0 && mugs.every((c) => projectHex.has(c)), 'mugs in project colors')
    }
  })

  test('day sky and the empty office (the cat and the robot vacuum at night, the door closed)', () => {
    const day = clone(sample)
    day.now.is_night = false
    assert.match(renderSvg(day), /href="#to-sun"/)
    const night = renderSvg(emptyFacts(true), { view: 'live' })
    assert.equal(xmlProblem(night), '')
    for (const s of ['lights off', 'everyone clocked out', 'the office cat', 'closed', 'href="#to-vac"']) assert.ok(night.includes(s), s)
    const sunny = renderSvg(emptyFacts(false), { view: 'all' })
    assert.equal(xmlProblem(sunny), '')
    assert.ok(!sunny.includes('the office cat') && !sunny.includes('href="#to-vac"'))
    // the empty kitchen says nothing under itself: the vacuum and the coffee are there to see
    for (const s of ['the robot vacuum does laps', 'the coffee is still warm']) assert.ok(!night.includes(s) && !sunny.includes(s), s)
  })

  test('week facade: 12 floors max, 7 windows, storage basement, totals', () => {
    const svg = renderSvg(sample, { view: 'week', animate: false, width: 720 })
    assert.ok(svg.includes('>12F<') && !svg.includes('>13F<'))
    assert.ok(svg.includes('+23 more in storage'))
    // the week's totals on the rooftop sign's lines, under the neon
    for (const t of ['>528h agent-time<', '>163 sessions<', '>595 commits<']) assert.ok(svg.includes(t), t)
    // a tear-off card per day over the floors, its weekday in type (its date in pixel figures), at a 480-px pane too
    const narrow = renderSvg(sample, { view: 'week', animate: false, width: 480 })
    for (const d of ['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'MON']) assert.ok(svg.includes(`>${d}<`) && narrow.includes(`>${d}<`), d)
    // one tooltip per floor (the commits line under the street has its own)
    assert.equal((svg.match(/fill-opacity="0"[^>]*><title>(?!Commits line)/g) ?? []).length, 12)
  })

  test('animate=false emits no SMIL at all', () => {
    for (const f of [sample, stressFacts(), emptyFacts(true), emptyFacts(false)]) {
      for (const view of ['live', 'week', 'all']) {
        const svg = renderSvg(f, { view, animate: false })
        assert.doesNotMatch(svg, /<animate|<set\b|<animateTransform|<animateMotion/, view)
      }
    }
  })

  test('hostile titles are escaped everywhere', () => {
    const f = clone(sample)
    f.live.desks[2].title = HOSTILE
    f.live.desks[2].activity.label = HOSTILE
    f.live.desks[4].interns[0].description = HOSTILE
    f.live.recently_left[0].title = HOSTILE
    for (const view of ['live', 'all']) {
      const svg = renderSvg(f, { view })
      assert.doesNotMatch(svg, /<script/i)
      assert.ok(svg.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'), view)
      assert.equal(xmlProblem(svg), '')
    }
  })

  test('esc drops what XML forbids and escapes the rest', () => {
    assert.equal(esc(`a${CTRL}b`), 'ab')
    assert.equal(esc(HOSTILE), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
    assert.equal(esc("it's"), 'it&#39;s')
    assert.equal(esc(String.fromCodePoint(0x1f600) + 'é'), String.fromCodePoint(0x1f600) + 'é')
    assert.equal(esc(null), '')
  })

  test('stress: 20 desks + 3 meetings + 40 projects stays valid and under 120 000 chars', () => {
    const f = stressFacts()
    for (const view of ['live', 'week', 'all']) {
      for (const width of [240, 480, 640, 1200, 2400]) {
        const svg = renderSvg(f, { view, width })
        assert.ok(svg.length <= 120_000, `${view}@${width}: ${svg.length}`)
        assert.equal(xmlProblem(svg), '', `${view}@${width}`)
        assert.deepEqual(unsafe(svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')), [])
        assert.doesNotMatch(svg, /<script/i)
        for (let c = 0; c < 32; c++) if (c !== 9 && c !== 10 && c !== 13) assert.ok(!svg.includes(String.fromCharCode(c)), `control ${c}`)
        assert.ok(!svg.includes(String.fromCharCode(0x202e)) && !svg.includes(String.fromCharCode(0xfffe)))
        assert.doesNotMatch(svg, /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/)
      }
    }
    // capped meetings are signed: a fourth workflow over the 3 the meeting room seats
    f.live.desks[5].meetings = [{ ...f.live.desks[3].meetings[0], id: 'wf_x' }]
    assert.match(renderSvg(f, { view: 'live' }), /\+1 more/)
  })

  test('empty, partial and garbage facts never throw', () => {
    const inputs = [null, undefined, {}, [], 'x', { live: null }, { live: { desks: [null, 1, 'x', {}] }, projects: [null, {}, { name: 7 }] },
      { now: { is_night: false }, live: { desks: [{ state: 'asking' }, { state: 'idle', activity: { since: 'nope' } }] } }]
    for (const f of inputs) {
      for (const view of ['live', 'week', 'all', 'nonsense']) {
        const svg = renderSvg(f, { view, width: 'wide' })
        assert.equal(xmlProblem(svg), '', `${JSON.stringify(f)} ${view}`)
      }
    }
  })

  test('deterministic, and idPrefix keeps two drawings apart', () => {
    assert.equal(renderSvg(sample, { view: 'all' }), renderSvg(sample, { view: 'all' }))
    const a = renderSvg(sample, { idPrefix: 'aa' })
    assert.ok(ids(a).every((id) => id.startsWith('aa-')))
    assert.ok(renderSvg(sample, { idPrefix: '"><script>' }).includes('id="script-'))
  })

  test('the facade prints the same numbers as the ASCII tower beside it (floored hours, 0 ships)', () => {
    const f = clone(sample)
    f.projects[0].agent_minutes = 13369 // 222.8 h
    f.projects[1].agent_minutes = 1001 // 16.7 h
    f.projects[2].commits = 0
    f.per_day['2026-10-23'].minutes = 7679 // 127.98 h
    const texts = [...renderSvg(f, { view: 'week', animate: false, width: 720 }).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])
    const ascii = toPlain(renderOffice(f, { view: 'week', width: 100 }))
    for (const h of ['222h', '16h']) assert.ok(texts.includes(h) && ascii.includes(` ${h} `), h)
    assert.ok(!texts.includes('223h') && !texts.includes('17h'))
    // the week tower's redesign: the day's all-floors hours sit in the day band, its tooltip says so
    assert.ok(texts.includes('127h') && renderSvg(f, { view: 'week', animate: false, width: 720 }).includes('agent-time per day, all floors: '))
    // a floor with no commits leaves its commits column empty: no 0, no glyph
    assert.ok(!texts.includes('0'), 'no 0 for a floor without commits')
  })

  test('today’s window counts everyone in: its lamp says how many desks are open, its seats hold whom they can', () => {
    const f = clone(sample)
    const base = f.live.desks.find((d) => d.project === 'md2epub')
    f.live.desks.push(...Array.from({ length: 7 }, (_, i) => ({ ...clone(base), id: `x${i}`, pid: 9000 + i })))
    const svg = renderSvg(f, { view: 'week', animate: false, width: 720 })
    assert.ok(svg.includes('<title>8 desks open now on md2epub</title>'), '8 desks on its lamp')
  })

  test('storage minutes come from the hidden floors, not from rounding in the totals', () => {
    const f = clone(sample)
    f.projects.push({ ...clone(f.projects[11]), name: 'zero-a', agent_minutes: 0 }, { ...clone(f.projects[11]), name: 'zero-b', agent_minutes: 0 })
    f.projects_more = 0
    f.totals.agent_minutes = f.projects.reduce((a, p) => a + p.agent_minutes, 0) + 1
    const svg = renderSvg(f, { view: 'week', animate: false, width: 720 })
    assert.ok(svg.includes('>+2 more in storage<'), 'no "· 1m" for two empty floors')
  })

  test('alt text counts in the glance\'s words, agrees with the numbers and leaves out groups at zero', () => {
    const f = clone(sample)
    assert.match(renderSvg(f), /aria-label="The Office: 10 desks, 5 working, 1 in a meeting, 1 hand up, 2 on break, 1 done, 2 interns · B1 what they did: /)
    f.live.desks[0].state = 'asking'
    f.live.desks[3].interns = []
    f.live.desks[4].interns = f.live.desks[4].interns.slice(0, 1)
    assert.match(renderSvg(f), /2 hands up, 1 on break, 1 done, 1 intern · B1 /)
    for (const d of f.live.desks) d.state = 'working'
    assert.doesNotMatch(renderSvg(f), /aria-label="[^"]*\b0 /, 'no "0 hands up", no "0 on break"')
  })

  test('the week tower and `all` describe themselves: the week in numbers; the Office, the live headcount and its basement', () => {
    const week = /aria-label="([^"]*)"/.exec(renderSvg(sample, { view: 'week' }))[1]
    assert.match(week, /^The Office this week: 528h agent-time, 163 sessions, 595 commits, busiest floor \S+ \d+h$/)
    const all = /aria-label="([^"]*)"/.exec(renderSvg(sample, { view: 'all' }))[1]
    assert.match(all, /^The Office: 10 desks, 5 working, [^;]* · B1 what they did: terminal commands \d+%, writing code \d+%$/)
  })

  test('the week tower: its own moon or sun, commits not ships, line counts named, opaque label panels by day', () => {
    const night = renderSvg(sample, { view: 'week', width: 960, animate: false })
    assert.match(night, /href="#to-moon"/)
    const day = clone(sample)
    day.now = { ...day.now, is_night: false, hour: 14, local_time: '14:05' }
    const dsvg = renderSvg(day, { view: 'week', width: 640, animate: false })
    assert.match(dsvg, /href="#to-sun"/)
    for (const svg of [night, dsvg]) assert.ok(/>\d+ commits(?: this week)?</.test(svg) && !svg.includes('ships<'), 'commits, on the rooftop sign or the line’s sign, never ships')
    // where the rooftop sign's lines have room for them (they drop whole groups from the right to fit)
    assert.match(night, />\+[\d.]+[kM]?\/\u2212[\d.]+[kM]? lines</, 'the line counts say what they count')
    // by day a floor's name sits on its own opaque nameplate on the brick (the Office's: dark bold type on the project's
    // color), never on the bright sky
    assert.match(dsvg, /<g font-size="[\d.]+" font-weight="bold" fill="#16110d"><text x="[\d.]+" y="[\d.]+">harborledger<\/text>/)
    assert.doesNotMatch(dsvg, /<path fill="#0d1328" fill-opacity="\.62" d="M\d+ 5[89] /, 'no translucent panel over the floors')
  })

  test('an empty week: one vacant floor with its sign, no empty column panels, no 0m', () => {
    const f = clone(sample)
    f.projects = []
    f.projects_more = 0
    f.totals = { ...f.totals, agent_minutes: 0, commits: 0 }
    const svg = renderSvg(f, { view: 'week', width: 960, animate: false })
    assert.ok(svg.includes('>no tenants this week<'))
    assert.ok(!svg.includes('>agent-h<') && !svg.includes('>0m<'), 'no column heads over no rows, no 0m')
    // the sign sits on the vacant floor (under the cards, which end 40 under the roof; the floor is 30 tall), not on the
    // cornice
    const y = Number(/<text x="[\d.]+" y="([\d.]+)"[^>]*>no tenants this week</.exec(svg)[1])
    assert.ok(y > SKY + 40 && y < SKY + 74, `y ${y}`)
  })

  test('narrow week: the day totals never touch, the sign and the storage note shorten whole words first', () => {
    const f = stressFacts()
    for (const d of Object.keys(f.per_day)) f.per_day[d].minutes = 145 * 60
    const svg = renderSvg(f, { view: 'week', width: 480, animate: false })
    // the week tower's redesign: the day band's totals stand over each window column, never touching their neighbours
    const cells = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)" fill="[^"]+">145h<\/text>/g)].map((m) => [+m[1], +m[2]]).sort((a, b) => a[0] - b[0])
    assert.equal(cells.length, 7)
    for (let i = 1; i < 7; i++) assert.ok(cells[i][0] - cells[i - 1][0] >= textW('145h', 4.5) + 2, 'neighbours apart')
    assert.doesNotMatch(svg, />[^<]*commi…</, 'the sign never ends in commi…')
    assert.doesNotMatch(svg, /in s…</, 'the storage note never ends in s…')
  })

  test('the empty office at night keeps the cat it promises, in the kitchen when no room is left dark', () => {
    const f = clone(sample)
    f.live.desks = []
    f.projects = []
    f.now.is_night = true
    const svg = renderSvg(f, { view: 'live', animate: false })
    assert.ok(svg.includes('the office cat is in charge'))
    assert.match(svg, /<title>the office cat<\/title><use href="#to-cat"/)
    f.now.is_night = false
    assert.doesNotMatch(renderSvg(f, { view: 'live', animate: false }), /office cat/)
  })

  test('no float noise in the markup: coordinates and durations print short', () => {
    for (const f of [sample, stressFacts(), monthFacts(), todayFacts()]) {
      for (const view of ['live', 'today', 'week', 'month', 'work', 'all']) {
        for (const width of [480, 960, 2400]) {
          const svg = renderSvg(f, { view, width })
          assert.doesNotMatch(svg, /\d\.\d{4,}/, `${view}@${width}`)
        }
      }
    }
  })

  test('a room header past 20 desks says +N as a group, never a bare + before the count', () => {
    const f = stressFacts()
    f.live.desks = [...f.live.desks, ...f.live.desks.slice(0, 7).map((d, i) => ({ ...clone(d), id: `x${i}` }))]
    const svg = renderSvg(f, { view: 'today', width: 960, animate: false })
    assert.match(svg, /<tspan fill="[^"]+">\+7<\/tspan><tspan fill="[^"]+"> · <\/tspan><tspan fill="[^"]+">27 clocked in now</)
    assert.doesNotMatch(svg, />\+<\/text>/)
  })

  test('text widths count wide characters twice, so CJK and emoji names never overflow their plates', () => {
    // widths measured in headless Chrome with the drawing's font stack at 5.5 px: the estimate must not fall short
    for (const [s, rendered] of [['プロジェクト-alpha', 52.6], ['한국어 제목', 27.1], ['🎮-games', 26.9], ['island-tour-3d', 47.7]]) {
      assert.ok(textW(s, 5.5) >= rendered, `${s}: ${textW(s, 5.5)} < ${rendered}`)
    }
    assert.equal(fitMid('ultra-fast-rasters', textW('x', 5.5) * 11 + 0.1, 5.5), 'ultra…sters')
    assert.notEqual(fitMid('ultra-fast-rasters', 30, 5.5), fitMid('ultra-mesh-toolkit', 30, 5.5))
    assert.equal(fitMid('short', 100, 5.5), 'short')
  })

  test('broken lists in otherwise valid facts draw instead of throwing', () => {
    const f = clone(sample)
    f.live.desks[1].meetings = [null, 5]
    f.live.desks[2].interns = 'x'
    f.projects = 'nope'
    f.live.recently_left = [null]
    for (const view of ['live', 'week', 'all']) assert.equal(xmlProblem(renderSvg(f, { view })), '', view)
    assert.equal(officeCounts(f).meetings, 0)
  })

  test('a turn that is over keeps its desk: done, stopped and an error each with its screen and words, still; a break goes to the kitchen', () => {
    const f = idleFacts()
    const svg = renderSvg(f, { view: 'live', width: 960 })
    assert.match(svg, /aria-label="The Office: 12 desks, 5 working, 1 in a meeting, 1 hand up, 1 error, 1 stopped, 1 on break, 2 done, 2 interns · /)
    // a desk's markup: from its tooltip to the next desk's
    const desk = (title) => {
      const at = svg.indexOf(`<title>island-tour-3d · ${title}`)
      assert.ok(at > 0, title)
      return svg.slice(at, svg.indexOf('<title>', at + 7))
    }
    for (const [title, words, screen] of [['Lava Cavern camera positioning', 'done, your turn · idle 38m', 'done'], ['Shader warmup pass', 'stopped by you · idle 2h00', 'stop'],
      ['Volcano particles', 'error: You&#39;ve hit your session limit · idle 2h00', 'err']]) {
      const s = desk(title)
      assert.ok(s.includes(words), `${title}: ${words}`)
      assert.ok(s.includes(`href="#to-rm-m${screen}"`), `${title}: the ${screen} screen`)
      assert.ok(!s.includes('href="#to-rm-kb"') && !s.includes('href="#to-fl'), `${title}: no keyboard out, no flicker`)
    }
    assert.ok(svg.includes('>1 on break</text>'), 'the kitchen\'s tag')
    assert.deepEqual(officeCounts(f), { desks: 12, working: 5, waiting: 1, asking: 1, stopped: 1, errors: 1, onBreak: 1, done: 2, interns: 2, meetings: 1, meetingAgents: 3 })
    const html = renderHtml(f, { liveLines: [], rangeLines: [] })
    for (const s of ['r-warn"><b>1</b> error', 'r-accent"><b>1</b> stopped', 'r-idle"><b>1</b> on break', 'r-idle"><b>2</b> done']) assert.ok(html.includes(s), s)
  })

  test('officeCounts recomputes classes (an asking desk is not idle)', () => {
    assert.deepEqual(officeCounts(sample), { desks: 10, working: 5, waiting: 1, asking: 1, stopped: 0, errors: 0, onBreak: 2, done: 1, interns: 2, meetings: 1, meetingAgents: 3 })
    assert.equal(officeCounts(null).desks, 0)
  })
})

// ---------------------------------------------------------------- html

describe('renderHtml', () => {
  const lines = [[['THE OFFICE', 'accent'], [' · live', 'dim']], [['10 desks ', 'title'], ['█▒?░', 'busy'], [`${HOSTILE}${CTRL}`, 'bogus" onload="x']]]

  test('self-contained page: both drawings, live counts, no external requests', () => {
    const html = renderHtml(sample, { title: 'The Office', liveLines: lines, rangeLines: lines })
    assert.ok(html.startsWith('<!doctype html>'))
    assert.deepEqual(unsafe(html), [])
    assert.doesNotMatch(html, /https?:\/\//)
    assert.match(html, /Content-Security-Policy" content="default-src 'none'/)
    assert.equal((html.match(/<svg /g) ?? []).length, 2)
    assert.equal(new Set(ids(html)).size, ids(html).length, 'duplicate ids across the two drawings')
    assert.equal(xmlProblem(xmlOfHtml(html.replace('<!doctype html>\n', ''))), '')
    for (const s of ['10</b> desks', '5</b> working', '1</b> hand up', '2</b> on break', '1</b> done', '2</b> interns']) assert.ok(html.includes(s), s)
    assert.match(html, /prefers-color-scheme:light/)
    assert.match(html, /--busy:#9ab86a/)
    assert.match(html, /--busy:#4f7a1f/)
  })

  test('text lines become role-classed spans; text and roles are escaped', () => {
    const html = renderHtml(sample, { liveLines: lines })
    assert.match(html, /<pre aria-label="the floor, as text"><span class="r-accent">THE OFFICE<\/span><span class="r-dim"> · live<\/span>\n/)
    assert.ok(html.includes('<span class="r-busy">█▒?░</span>'))
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'))
    assert.doesNotMatch(html, /bogus|onload/)
    assert.doesNotMatch(html, /<script/i)
    assert.ok(!renderHtml(sample).includes('<pre'))
  })

  test('scenes: one drawing per scene, each over its own text, unique ids, the totals under the range', () => {
    const scenes = [{ view: 'live', lines }, { view: 'month', lines }, { view: 'work', lines }, { view: 'toString', lines }, null]
    const html = renderHtml(monthFacts(), { scenes })
    assert.deepEqual([...html.matchAll(/<svg |<pre /g)].map((m) => m[0].trim()), ['<svg', '<pre', '<svg', '<pre', '<svg', '<pre'])
    assert.deepEqual([...html.matchAll(/<pre aria-label="([^"]*)"/g)].map((m) => m[1]), ['the floor, as text', 'this month, as text', 'what they did, as text'])
    assert.match(html, /<h2>what they did · <b>share of the tool calls, by kind of work<\/b><\/h2>/)
    assert.equal(new Set(ids(html)).size, ids(html).length, 'duplicate ids across the drawings')
    for (const id of ['tl-', 'tm-', 'tk-']) assert.ok(html.includes(`id="${id}`), id)
    // the totals follow the range's picture, once
    assert.equal((html.match(/class="totals"/g) ?? []).length, 1)
    assert.ok(html.indexOf('class="totals"') > html.indexOf('id="tm-') && html.indexOf('class="totals"') < html.indexOf('id="tk-'))
    assert.equal(xmlProblem(xmlOfHtml(html.replace('<!doctype html>\n', ''))), '')
    assert.deepEqual(unsafe(html), [])
    // what they did alone keeps the totals under it
    const work = renderHtml(sample, { scenes: [{ view: 'work' }] })
    assert.equal((work.match(/<svg /g) ?? []).length, 1)
    assert.ok(work.includes('class="totals"') && !work.includes('<pre'))
  })

  test('hostile title option and empty facts', () => {
    const html = renderHtml(emptyFacts(true), { title: HOSTILE })
    assert.ok(html.includes('<title>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</title>'))
    assert.doesNotMatch(html, /<script/i)
    assert.ok(html.includes('lights off'))
    assert.deepEqual(unsafe(renderHtml(null)), [])
  })
})

/** The stress office with every agent of the cast at its desks, accounts on some, and every project's agent-time split. */
function castFacts() {
  const f = stressFacts()
  const cast = ['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok']
  f.live.desks.forEach((d, i) => {
    d.agent = cast[i % cast.length]
    d.account = i % 4 === 0 ? `${i % 3 ? 'work' : 'main'} ${NASTY}` : null
    for (const it of d.interns) it.agent = d.agent
  })
  f.projects.forEach((p, i) => { p.agents = Object.fromEntries(cast.map((a, k) => [a, (i + k) % 3 ? 30 * (k + 1) : 0])) })
  f.totals.agents = { claude: 900, codex: 400, gemini: 200, cursor: 60, kimi: 40, grok: 30, [NASTY]: 5 }
  f.live.recently_left.forEach((l, i) => { l.agent = cast[i] })
  return f
}

// ---------------------------------------------------------------- scenes

describe('scene registry', () => {
  const VIEWS = ['live', 'today', 'week', 'month', 'work', 'all']
  const sets = () => [['sample', sample], ['stress', stressFacts()], ['cast', castFacts()], ['empty night', emptyFacts(true)], ['empty day', emptyFacts(false)],
    ['month', monthFacts()], ['today', todayFacts()], ['garbage', { live: { desks: [null, 1, 'x', {}] }, projects: [null, {}, { name: 7 }] }], ['null', null]]

  test('the views and their scenes: all = the live building, the week tower only in week', () => {
    assert.deepEqual(Object.keys(SVG_VIEWS), VIEWS)
    assert.deepEqual(SVG_VIEWS.all, ['live'])
    for (const view of VIEWS) assert.equal(SVG_VIEWS[view].length, 1, `${view}: one building, one scene`)
    assert.deepEqual(SPRITE_CLASHES, [], 'two scenes defined the same sprite name')
    for (const name of Object.keys(SPRITES)) assert.match(name, /^[A-Za-z][\w-]*$/, `sprite id ${name}`)
  })

  test('every view renders: well-formed, no script / on* / foreignObject, under the budget, alt text', () => {
    for (const [label, f] of sets()) {
      for (const view of VIEWS) {
        for (const [width, animate] of [[240, true], [640, true], [960, false], [2400, true]]) {
          const at = `${label} ${view}@${width}${animate ? '' : ' static'}`
          const svg = renderSvg(f, { view, width, animate })
          assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), at)
          assert.equal(xmlProblem(svg), '', at)
          assert.deepEqual(unsafe(svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')), [], at)
          assert.doesNotMatch(svg, /<script|<foreignObject|\son[a-z]+\s*=/i, at)
          assert.ok(svg.length <= 120_000, `${at}: ${svg.length}`)
          assert.match(svg, new RegExp(`viewBox="0 0 ${Math.max(200, width / 2)} [1-9]\\d*"`), at)   // the 2-px grid, 200 wide at least
          assert.match(svg, /aria-label="The Office[^"]*"/, at)
          assert.equal(new Set(ids(svg)).size, ids(svg).length, `${at}: duplicate ids`)
          for (const ref of svg.matchAll(/href="#([^"]+)"/g)) assert.ok(ids(svg).includes(ref[1]), `${at}: dangling #${ref[1]}`)
          if (!animate) assert.doesNotMatch(svg, /<animate|<set\b|<animateMotion/, at)
        }
      }
    }
  })

  test('each view is deterministic, draws its own scene and names itself in the alt text', () => {
    const alts = new Set()
    for (const view of VIEWS) {
      const svg = renderSvg(sample, { view })
      assert.equal(svg, renderSvg(sample, { view }), view)
      alts.add(/aria-label="([^"]*)"/.exec(svg)[1])
    }
    // every view says what it draws: the headcount, the week, the day, the month, the departments; the Office (all) is
    // the live building, drawn exactly as live
    assert.equal(alts.size, VIEWS.length - 1)
    assert.equal(renderSvg(sample, { view: 'all' }), renderSvg(sample, { view: 'live' }))
    assert.notEqual(renderSvg(sample, { view: 'today' }), renderSvg(sample, { view: 'live' }))
    assert.equal(renderSvg(sample, { view: 'nonsense' }), renderSvg(sample, { view: 'live' }))
    assert.equal(renderSvg(sample, { view: 'toString' }), renderSvg(sample, { view: 'live' }))
  })
})

// ---------------------------------------------------------------- purity

// the entry (svg.mjs picks a view's scene), the kit, and one file per scene (each its own artist's)
const SCENE_FILES = ['svg-live.mjs', 'svg-week.mjs', 'svg-street.mjs', 'svg-work.mjs', 'svg-today.mjs', 'svg-month.mjs', 'svg-timelapse.mjs', 'svg-loading.mjs']
const SVG_FILES = ['svg.mjs', 'svg-beat.mjs', 'svg-kit.mjs', ...SCENE_FILES]

test('svg*.mjs and html.mjs are PURE (no node:* imports, html does not import ascii.mjs)', () => {
  for (const file of [...SVG_FILES, 'html.mjs', 'model.mjs', 'cast.mjs']) {
    const src = fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8')
    assert.doesNotMatch(src, /from ['"]node:|require\(|import\(/, file)
    for (const m of src.matchAll(/^(?:import|export)\b[^'"]*?\bfrom '([^']+)'/gm)) {
      assert.ok(['./format.mjs', './activity.mjs', './model.mjs', './cast.mjs', ...SVG_FILES.map((f) => `./${f}`)].includes(m[1]), `${file} imports ${m[1]}`)
    }
  }
})

test('a scene file imports only the kit and the facts helpers: never svg.mjs, never another scene', () => {
  for (const file of SCENE_FILES) {
    const src = fs.readFileSync(new URL(`../plugin/lib/${file}`, import.meta.url), 'utf8')
    for (const m of src.matchAll(/^(?:import|export)\b[^'"]*?\bfrom '([^']+)'/gm)) {
      assert.ok(['./format.mjs', './activity.mjs', './model.mjs', './svg-kit.mjs'].includes(m[1]), `${file} imports ${m[1]}`)
    }
  }
})

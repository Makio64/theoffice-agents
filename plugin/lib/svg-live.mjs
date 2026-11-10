// PURE: the LIVE scene of the SVG office, the floor plan: a cut-away building, one room per project with a nameplate,
// desks whose monitors show the activity, every agent's character (Clawd for Claude: cast.mjs) lit by its room (at night
// a ceiling light over each desk, the screen's glow on the wall and on the figure) and doing what its desk's state says
// on a timeline of its own (svg-kit castFigure), the office cat wandering through, mini-Clawd interns on a bench in
// front of their boss's desk, the walls papered and hung with what an office hangs where the desks leave them bare (a
// calendar, a poster, a kanban…), a MEETING ROOM for running workflows, a KITCHEN water cooler for agents on break, the
// street front on the ground floor (a grand entrance, shop windows, street lamps, and the agents going around on the
// sidewalk: who just left walking off, visitors walking in, passers-by), a night or day sky. Every floor has its number
// on a plaque on the left pier, as the week tower's (1F the street front, 2F, 3F… up), and under the sidewalk the
// building goes on underground: B1, what they did (svg-work.mjs workFloor, one room per kind of work, lent by the
// composer as ctx.floors.work: scene files never import each other), with the commits line running under it. It is
// the Office view too (the Office tab, a bare /office). Across the top of the building, under its roof, a bar says how
// the floors stand: the headcount strip, then who works, who needs you, who waits on helpers, who is on break, each a
// pixel icon and its count at the sign's size, the number in its state's color (statusBar); the sign on the roof keeps
// the fun of it, the desks and who sits at them, the interns, the longest shift, the meetings (glance). Under every desk
// a tag on the slab, as the promo's stat cards are, says whose session it is and what it is at in a few words and for how
// long ('coding · 1h30+', 'asks: Which cape anchor?'), framed in its state's color while it waits on you; a raised hand
// has a big ? over it.
// The meeting room's tables, the kitchen and the basement's departments have their tags; the rooms' headcount strips
// say their counts. Quiet (renderSvg `quiet`, ctx.quiet: the pane's Quiet key) keeps the names alone: the nameplates,
// the floor numbers, the meeting room's whiteboards and the basement's figures stay (its tags keep their first line, the
// share and the calls), the other tags and the bar go, a desk that needs you keeps its two lines, every other desk says
// them in a card while the pointer rests on it (svg-kit hoverCard), a row with none of them stands on a plain floor, and
// the sign keeps one line, the desks and what needs you.
// The same visual language as the block-glyph text office (lib/ascii.mjs). No node:* imports (the desktop mod loads
// lib/svg.mjs, which imports this file).
import { jobTitle } from './activity.mjs'
import { clip, fmtMinutes } from './format.mjs'
import { IDLE_CLASSES, KIND_VERB, TOOL_VERB, fnv1a, idleDoing, shortName } from './model.mjs'
import {
  AGENT_IDS, CAST, CLASS_COLOR, HEAD, INFO, K, MAX_SVG, ROLE, ROW, SCREENS, SCREEN_BG, SKY, SW, UNDER, aO, aT, agentId, agoText, backdrop, castFigure,
  cardsSvg, clamp, dateLabel, defineSprites, defsMarkup, esc, fit, floorPlate, handsUp, hoverCard, idleSpans, infoRoom, tagFits, tagsSvg, lineSpans, mix, ms, onPage, paint, phase, pixText,
  pixWidth, platesSvg, plural, pose, r1, rect, roomHeader, sceneHeader, sinceText, spans, sprite, stripOf, tally, textW, txt, use,
} from './svg-kit.mjs'

// ---------------------------------------------------------------- facts helpers

function doing(d) {
  const label = d.activity?.label ?? ''
  if (d.cls === 'thinking') return 'thinking…'
  if (d.cls === 'waiting') {
    if (d.meetings?.length) return `meeting ${d.meetings[0].name ?? ''}`
    const n = d.interns?.length ?? 0
    return n ? `${n} intern${n > 1 ? 's' : ''} at work` : 'waiting on helpers'
  }
  if (d.cls === 'asking') return `asks: ${label || 'a question'}`
  if (IDLE_CLASSES.has(d.cls)) return idleDoing(d, d.cls)
  const verb = TOOL_VERB[d.activity?.tool] ?? KIND_VERB[d.activity?.kind] ?? 'use'
  return label ? `${verb} ${label}` : verb
}

// What a desk at work is at, in a word, for its tag ('coding · 1h30+', as the promo's cards say it)
const KIND_WORD = Object.assign(Object.create(null), {
  coding: 'coding', terminal: 'terminal', testing: 'tests', web: 'web', reading: 'reading', planning: 'planning', delegating: 'delegating',
  talking: 'talking', design: 'design', tools: 'tools',
})

/**
 * A desk's tag's second row: what needs you in full (the question it asks, what stopped it), what it waits on, else
 * what it is at in a word and for how long ('coding · 1h30+', 'thinking · 20m+', 'dozing · 1h+'), a turn done how long
 * it has waited for you ('your turn · 10m+'): the file it edits is its card's and the text office's, not the floor's.
 * Short enough for a row of six desks (14 characters): its color and the monitor say the rest, so a waiting one says
 * '3 interns' or 'in a meeting' (the table's tag names the meeting). A desk at work tells its time to ten minutes
 * (deskTime): its tag moves with every tool call anyway. A desk at rest keeps the coarse steps (svg-kit sinceText), so a
 * calm office stays one drawing for long. Returns [words, time?]: the tag says the time when it has room for it whole
 * (deskTag), never a time cut short.
 */
function brief(ctx, d) {
  if (NEEDY.has(d.cls)) return [doing(d)]
  if (d.cls === 'thinking') return ['thinking', deskTime(ctx, ms(d.started_at))]
  if (d.cls === 'waiting') {
    const n = d.interns?.length ?? 0
    return [d.meetings?.length ? 'in a meeting' : n ? plural(n, 'intern') : 'helpers busy']
  }
  if (d.cls === 'done') return ['your turn', sinceText(ctx, ms(d.activity?.since ?? d.last_seen))]
  if (d.cls === 'dozing') return ['dozing', sinceText(ctx, ms(d.activity?.since ?? d.last_seen))]
  if (IDLE_CLASSES.has(d.cls)) return [idleDoing(d, d.cls)]
  return [KIND_WORD[d.activity?.kind] ?? 'at work', deskTime(ctx, ms(d.started_at))]
}

/**
 * How long a desk at work has been at it, for its tag, from the moment `t`: exact off a live clock (format.mjs
 * fmtMinutes), on a live drawing in ten-minute steps that stay true while it is on screen. A live drawing reads it at the
 * start of its ten-minute window (renderSvg `liveClock`) and the pane keeps it up while nothing else moves, so it says at
 * least that much: '<20m' in the first ten minutes, then '10m+' … '50m+', '1h+', '1h10+' … '9h50+', whole hours to a
 * day, then '1d+'. It moves at a window's turn, never inside one.
 */
export function deskTime(ctx, t) {
  if (!Number.isFinite(t)) return ''
  const m = (ctx.now - t) / 60e3
  if (!ctx.liveClock) return fmtMinutes(m)
  if (m < 10) return '<20m'
  if (m < 60) return `${Math.floor(m / 10) * 10}m+`
  if (m < 600) {
    const tens = Math.floor((m % 60) / 10) * 10
    return `${Math.floor(m / 60)}h${tens || ''}+`
  }
  if (m < 1440) return `${Math.floor(m / 60)}h+`
  return `${Math.floor(m / 1440)}d+`
}

/** The agents at desks, the cast's order (Clawd first): one agent means everyone is that character. */
const agentsOf = (desks) => AGENT_IDS.filter((a) => desks.some((d) => agentId(d.agent) === a))

/** Who sits at a desk, in a tooltip: its character and agent ('Dex · Codex'), and the account when there are several. */
function whoOf(ctx, d) {
  const ch = CAST[agentId(d.agent)]
  const who = ctx.cast.length > 1 || ch.id !== 'claude' ? `${ch.who} · ${ch.name}` : ''
  return [who, d.account ? `account ${d.account}` : ''].filter(Boolean).join(' · ')
}

// How long a desk has been as it is (svg-kit sinceText: exact, or in coarse steps on a liveClock drawing).
function since(ctx, d) {
  if (d.cls === 'asking') return `hand up ${sinceText(ctx, ms(d.activity?.since))}`
  if (IDLE_CLASSES.has(d.cls)) return `idle ${sinceText(ctx, ms(d.activity?.since ?? d.last_seen))}`
  return `shift ${sinceText(ctx, ms(d.started_at))}`
}

// A desk that needs you keeps its two lines under it (deskLabels); every other desk's words are in its tooltip, so the
// floors read as a picture, not a table of captions under it
const NEEDY = new Set(['asking', 'error', 'stopped'])
// The desks that wait on you: the needy ones and a turn done. Their tags carry a bar down the left edge and a frame
// round them in their color (svg-kit tagsSvg `mark`), so what is yours to do stands out down the whole building, the
// desks at work left plain; the building's bar counts them as 'need you'
const YOURS = new Set([...NEEDY, 'done'])
// The slab under a row of desks whose lines are drawn: the carpet's edge (CARPET), its two rows of tags (svg-kit
// tagH(2), 15) under it and a little slab under them, so each floor's tags sit on their own floor, clear of the
// nameplates of the floor below (the kit's SLAB, 18, left a unit)
export const DECK = 22
// The slab under a row of desks none of whose lines are drawn: a plain floor instead of DECK's label band
const THIN = 5
// The wall a room has over each row of desks besides the row itself: air over the agents, and room for a raised hand's
// big bubble (svg-kit 'bq'), which rises into it
const LIFT = 8

// The glance, the scene's lines on the sign, as the sign's groups (svg-kit infoLines). Who works and who needs you is
// the building's bar (statusBar), so the sign keeps the fun of it: N desks and, in a mixed office, who sits at them
// ('10 Clawd · 2 Dex'), then on a line of their own the interns (a mini Clawd), the longest shift on the floor (its cup)
// and the meetings. Quiet there is no bar: N desks, the headcount strip (a mark that stays with its count, one tick per
// desk, 20 at most, as many as leave room on the line) and only what needs you after it, the hands up, the errors, the
// turns stopped.
function glance(ctx) {
  const { desks, W } = ctx
  if (!desks.length && ctx.quiet) return [['0 desks', ROLE.title]]
  if (!desks.length) {
    const today = ctx.f.per_day?.[ctx.f.now?.local_date]?.minutes ?? 0
    const msg = ctx.night ? ['everyone clocked out', 'the office cat is in charge']
      : today > 0 ? ['everyone stepped out', 'the desks are tidy'] : ['nobody in yet', 'the desks are tidy']
    return [['0 desks', ROLE.title], [msg[0], ROLE.dim], [msg[1], ROLE.accent]]
  }
  const t = tally(desks)
  const lead = plural(desks.length, 'desk')
  if (!ctx.quiet) {
    // an icon is a mark of its own on the sign, its count after it with a space
    const icon = (name) => ['', ROLE.dim, { w: 7, at: (x, y) => use(ctx, name, Math.round(x), Math.round(y) - 6) }]
    // a mixed office says who is in, by character: '4 Clawd · 2 Dex · 1 Gem'
    const cast = ctx.cast.length > 1 ? ctx.cast.map((a) => [`${desks.filter((d) => agentId(d.agent) === a).length} ${CAST[a].who}`, CAST[a].hex.dark]) : []
    const shifts = desks.map((d) => (d.cls === 'break' ? NaN : ms(d.started_at))).filter(Number.isFinite)
    const meetings = desks.reduce((n, d) => n + (d.meetings?.length ?? 0), 0)
    const fun = [
      t.interns && [icon('ic-intern'), [plural(t.interns, 'intern'), ROLE.intern, { join: ' ' }]],
      shifts.length && [icon('ic-cup'), [`longest shift ${sinceText(ctx, Math.min(...shifts))}`, ROLE.accent, { join: ' ' }]],
      meetings && [[plural(meetings, 'meeting'), ROLE.meeting]],
    ].filter(Boolean)
    // the fun opens the sign's second line
    if (fun.length) fun[0][0] = [fun[0][0][0], fun[0][0][1], { ...fun[0][0][2], br: true }]
    return [[lead, ROLE.title], ...cast, ...fun.flat()]
  }
  const groups = [t.asking && [handsUp(t.asking), ROLE.ask], ...idleSpans(t).filter(([, c]) => c === ROLE.warn || c === ROLE.accent)].filter(Boolean)
  const room = infoRoom(W) - textW(`${lead} `, INFO.size) - (groups.length ? textW(` ${groups[0][0]}`, INFO.size) : 0)
  const strip = stripOf(desks).slice(0, clamp(Math.floor((room + 1) / 4), 0, 20))
  if (!strip.length) return [[lead, ROLE.title], ...groups]
  const tick = ['', ROLE.title, { join: ' ', w: strip.length * 4 - 1, at: (x, y) => paint(strip.map((d, i) => [Math.round(x) + i * 4, y - 5, 3, 6, CLASS_COLOR[d.cls]])) }]
  // the first class group follows the strip after a space, not a dot
  return [[lead, ROLE.title], tick, ...groups.map((g, i) => (i ? g : [g[0], g[1], { join: ' ' }]))]
}

// The icons of the building's bar and the sign, each 7 wide, sitting on the text's baseline: a screen at work, a gold
// bubble with a '!', an hourglass, a mug with its steam, an intern (a mini Clawd), the longest shift's cup
defineSprites({
  'ic-work': () => sprite(['ggggggg', 'g.....g', 'g.ll..g', 'g.....g', 'ggggggg', '..ggg..'], { g: ROLE.busy, l: '#d6f0b0' }, 0, 1),
  'ic-you': () => sprite(['.aaaaa.', 'aaa.aaa', 'aaa.aaa', 'aaaaaaa', 'aaa.aaa', '.aaaaa.', '.a.....'], { a: ROLE.accent }),
  'ic-wait': () => sprite(['ppppppp', '.p...p.', '..ppp..', '..ppp..', '.p.p.p.', 'ppppppp'], { p: ROLE.wait }, 0, 1),
  'ic-break': () => sprite(['.s.s...', '.......', 'ttttt..', 'tttttt.', 'ttttt.t', 'tttttt.', '.ttt...'], { t: ROLE.idle, s: '#9ad8cc' }),
  'ic-intern': () => sprite(['.ooooo.', '.oeoeo.', 'ooooooo', '.ooooo.', '.o...o.'], { o: CAST.claude.hex.dark, e: '#141414' }, 0, 2),
  'ic-cup': () => sprite(['yyyyyyy', 'y.yyy.y', '.yyyyy.', '..yyy..', '...y...', '..yyy..'], { y: ROLE.accent }, 0, 1),
})

// ---------------------------------------------------------------- live floor plan: layout

const SW_MAX = 86
const INTERN = 12 // intern (mini Clawd, 11 wide) pitch on the bench
const SEAT = 27 // meeting seat pitch (a Clawd box, arms included, and a gap)
const KP = 28 // kitchen pitch (a standing Clawd and its mug)

// A room of desks, `k` a row: under each row the label band, its desks' tags on it; quiet, only while a desk of the row
// needs you (`gaps`, between the rows; `hasLines`, the last row's, which the floor's slab is), else a plain floor.
function roomItem(name, desks, IW, color, quiet = false) {
  const n = desks.length
  const maxK = Math.max(1, Math.floor((IW - 6) / SW))
  let k = Math.min(n, maxK)
  const rows = Math.ceil(n / k)
  k = Math.ceil(n / rows)
  const minW = Math.max(k * SW + 6, Math.min(IW, 92, Math.round(textW(name, 5.5) + 40)))
  const lines = Array.from({ length: rows }, (_, r) => !quiet || desks.slice(r * k, r * k + k).some((d) => NEEDY.has(d.cls)))
  const gaps = lines.slice(0, -1).map((has) => (has ? DECK : THIN))
  return { kind: 'room', name, desks, k, rows, minW, h: HEAD + rows * (ROW + LIFT) + gaps.reduce((a, g) => a + g, 0), color, gaps, hasLines: lines.at(-1) }
}

function meetingItem(list, IW, cap, quiet = false) {
  const maxSeats = clamp(Math.floor((IW - 6 - 62) / SEAT), 1, 6) // a cell never outgrows the room
  const cells = list.slice(0, cap).map(({ m, d }) => {
    const running = Math.max(0, m.agents_running || 0)
    const seats = clamp(running, 1, maxSeats)
    return { m, d, running, seats, w: 56 + Math.max(2, seats) * SEAT + 6 }
  })
  const rows = []
  for (const c of cells) {
    const row = rows.at(-1)
    if (row && row.w + 4 + c.w <= IW - 6) {
      row.cells.push(c)
      row.w += 4 + c.w
    } else rows.push({ cells: [c], w: c.w })
  }
  const minW = Math.max(110, ...rows.map((r) => r.w + 6))
  // a tag under each table, but quiet: then what a meeting says is on its whiteboard and in its card, no lines under it
  const gap = quiet ? THIN : DECK
  return { kind: 'meeting', list, cells, rows, minW: Math.min(minW, IW), h: HEAD + rows.length * (ROW + LIFT) + (rows.length - 1) * gap, gap, hasLines: !quiet }
}

function kitchenItem(breaks, IW, empty, quiet = false) {
  let shown = Math.min(breaks.length, 6)
  const need = (s) => 6 + 14 + s * KP + (breaks.length > s ? 14 : 0) + 40
  while (shown > 0 && need(shown) > IW) shown--
  return { kind: 'kitchen', breaks, shown, empty, minW: Math.max(empty ? 96 : 92, need(shown)), h: HEAD + ROW + LIFT, hasLines: !quiet && !empty }
}

// Bands (floors): rooms next-fit so they keep their order, the commons first-fit into any floor, spare width to rooms.
function pack(items, IW, IX0) {
  const bands = []
  const need = (b, it) => b.used + (b.items.length ? 3 : 0) + it.minW
  for (const it of items) {
    let b = it.kind === 'room' || it.kind === 'dark' ? bands.at(-1) : bands.find((x) => need(x, it) <= IW)
    if (!b || need(b, it) > IW) bands.push((b = { items: [], used: 0 }))
    b.used = need(b, it)
    b.items.push(it)
  }
  for (const b of bands) {
    const spare = IW - b.used
    let grow = b.items.filter((it) => it.kind === 'room' || it.kind === 'dark')
    if (!grow.length) grow = b.items
    const total = grow.reduce((a, it) => a + it.minW, 0)
    let left = spare
    for (const it of b.items) it.w = it.minW
    grow.forEach((it, i) => {
      const add = i === grow.length - 1 ? left : Math.floor((spare * it.minW) / total)
      it.w += add
      left -= add
    })
    let x = IX0
    for (const it of b.items) {
      it.x = x
      x += it.w + 3
    }
    b.h = Math.max(...b.items.map((it) => it.h))
  }
  return bands
}

// ---------------------------------------------------------------- desk accessories

// Every accessory is a sprite drawn in DESK coordinates (the 48 × 36 desk box: the top at y 24, the monitor at x 4..21
// y 9..20 with its screen at x 5..20 y 10..19, Clawd's box from x 22), so a desk places it with a bare <use> and no x/y
// (the cheapest markup: 24 desks × 2 cost about 1 300 chars). TOPS sit on the monitor, SIDES stand on the desk corner
// left of it or hang on the monitor's left bezel. `box` [x0, y0, x1, y1] (inclusive) is what one covers, so the picker
// never pairs two that touch; test/svg-live.test.mjs keeps every pixel off the screen, off Clawd and on the desk.
const ACC = {
  // ---- on the monitor (its top edge is y 9)
  'lv-cactus': { box: [15, 1, 20, 8], draw: () => sprite(['..f...', '..gG..', 'g.gG..', 'g.gG.g', 'gggG.g', '..gGgg', '.tttt.', '.tTTt.'],
    { f: '#ff8fb1', g: '#4f8a3a', G: '#7fb85a', t: '#d98a5a', T: '#b0623c' }, 15, 1) },
  'lv-duck': { box: [6, 4, 12, 8], draw: () => sprite(['....yy.', '....yeo', 'y..yyy.', 'yyyyyy.', '.YYYYY.'],
    { y: '#f6d34a', Y: '#d9a92e', e: '#2a2a2a', o: '#f08a2c' }, 6, 4) },
  'lv-dino': { box: [5, 3, 12, 8], draw: () => sprite(['.....dd.', '....dedd', 'd...dd..', '.ddddDd.', '..dddd..', '..d..d..'],
    { d: '#7cc35a', D: '#5a9a3a', e: '#1a1a1a' }, 5, 3) },
  'lv-globe': { box: [15, 3, 19, 8], draw: (c) => sprite(['.ccc.', 'csssc', 'csssc', 'csgsc', '.bbb.', 'bbbbb'],
    { c: '#d8eef8', s: '#9fd0f2', g: '#4f8a3a', b: '#8a5a3a' }, 15, 3) +
    `<g fill="#ffffff">${rect(16, 4, 1, 1, 'inh')}${rect(18, 5, 1, 1, 'inh')}${aT(c, '0 0;0 1;0 -1', 1.8)}</g>` },
  'lv-neko': { box: [6, 3, 11, 8], draw: (c) => sprite(['w...w', 'wwwww', 'wewew', 'wwpww', 'rrYrr', 'wwwww'],
    { w: '#f4efe4', e: '#2a2a2a', p: '#ff9fc0', r: '#d04a3a', Y: '#f6d34a' }, 6, 3) + `<g>${rect(11, 4, 1, 2, '#f4efe4')}${aT(c, '0 0;0 1', 0.9)}</g>` },
  // the project's own pennant: currentColor, so the desk sets it (` color="${ctx.color(project)}"`)
  'lv-flag': { box: [5, 0, 10, 8], tinted: true, draw: (c) => paint([[6, 0, 1, 1, '#f6d34a'], [6, 1, 1, 7, '#c9ced8'], [5, 8, 3, 1, '#5d6168']]) +
    (c.animate
      ? `<g>${paint([[7, 1, 4, 3, 'cur']])}${aO(c, '1;0', 1.4)}</g><g opacity="0">${paint([[7, 1, 2, 3, 'cur'], [9, 2, 2, 3, 'cur']])}${aO(c, '0;1', 1.4)}</g>`
      : paint([[7, 1, 4, 3, 'cur']])) },
  'lv-ivy': { box: [2, 4, 9, 14], draw: () => sprite(['....l.l.', '...lLll.', '..ltttt.', '.l.tTTt.', '.l..tt..',
    '.Ll.....', '..l.....', '.lL.....', '.l......', 'lL......', '.l......'], { l: '#4f8a3a', L: '#9ab86a', t: '#e0b040', T: '#b8902a' }, 2, 4) },
  // the longest shift on the floor wins it (never picked at random)
  'lv-trophy': { box: [8, 3, 14, 8], draw: () => sprite(['yyyyyyy', 'y.ySy.y', '.yyyyy.', '..yyy..', '...y...', '..bbb..'],
    { y: '#f6c945', S: '#fff2b0', b: '#8a5a3a' }, 8, 3) },
  // ---- on the desk corner left of the monitor, or on its left bezel
  'lv-lamp': { box: [-1, 12, 3, 23], draw: () => lamp(false) },
  'lv-lampN': { box: [-1, 12, 3, 24], draw: () => lamp(true) },
  'lv-photo': { box: [0, 19, 4, 23], draw: () => sprite(['FFFFF', 'FhbhF', 'FhhhF', 'FbhbF', 'FFFFF'],
    { F: '#e8d9b5', b: '#9fd0f2', h: '#e85d75' }, 0, 19) },
  'lv-catpic': { box: [0, 19, 4, 23], draw: () => sprite(['FFFFF', 'FabaF', 'FeaeF', 'FaaaF', 'FFFFF'],
    { F: '#9a7b4f', b: '#cfe8f7', a: '#e0973a', e: '#2a2a2a' }, 0, 19) },
  'lv-books': { box: [0, 18, 7, 23], draw: () => sprite(['...k....', '..rr....', '..rr....', 'RRRRRRw.', '.BBBBBBw', 'GGGGGGw.'],
    { k: '#4f8a3a', r: '#d9473a', R: '#c0504a', B: '#3f7fb8', G: '#6f9a3a', w: '#f4efe4' }, 0, 18) },
  'lv-pens': { box: [0, 16, 3, 23], draw: () => sprite(['k.r.', 'y.r.', 'ybr.', 'ybr.', 'eeee', 'cecc', 'cecc', 'cccc'],
    { k: '#3a3a3a', y: '#f6d34a', r: '#d04a3a', b: '#3f7fb8', e: '#7fa3c8', c: '#5a7fa8' }, 0, 16) },
  'lv-coffee': { box: [1, 12, 4, 23], draw: (c) => sprite(['www.', 'wpww', 'www.'], { w: '#f4efe4', p: '#e85d75' }, 1, 21) +
    paint([[1, 21, 3, 1, '#000/.15']]) + use(c, 'steam', 2, 19) },
  'lv-succ': { box: [0, 17, 4, 23], draw: () => sprite(['..f..', 'g.G.g', '.gGg.', 'ggGgg', 'ttttt', '.TTT.', '.TTT.'],
    { f: '#ff9fc0', g: '#6fae7a', G: '#a8dcb0', t: '#d98a5a', T: '#b0623c' }, 0, 17) },
  'lv-notes': { box: [2, 11, 4, 17], draw: () => paint([[2, 11, 3, 3, '#f6e26a'], [2, 15, 3, 3, '#ff9fc0'],
    [2, 12, 2, 1, '#c9b440'], [2, 16, 2, 1, '#d0708e']]) },
  'lv-phones': { box: [1, 6, 7, 11], draw: () => sprite(['..bbbb.', '.b....b', '.b....b', 'cc.....', 'cC.....', 'cc.....'],
    { b: '#3a3a44', c: '#e05a7a', C: '#f08aa0' }, 1, 6) },
}

// An anglepoise lamp leaning out over the desk's edge, clear of the monitor; on (at night) its bulb glows, a cone of warm
// light falls on the corner and pools on the desk top.
function lamp(on) {
  const glow = on ? paint([[0, 15, 2, 2, '#ffd27a/.3'], [-1, 17, 4, 3, '#ffd27a/.22'], [-1, 20, 5, 4, '#ffd27a/.15'], [0, 24, 6, 1, '#ffe7b0/.6']]) : ''
  return glow + sprite(['.HHH.', 'HHHHa', '.LL.a', '....a', '...a.', '...a.', '..a..', '..a..', '..a..', '..a..', '.bbb.', '.BBBB'],
    { H: '#2f8f9d', a: '#9aa0a8', L: on ? '#ffe08a' : '#e9e1c8', b: '#5d6168', B: '#3a3f48' }, -1, 12)
}

defineSprites(Object.fromEntries(Object.entries(ACC).map(([name, a]) => [name, a.draw])))

// The draw tables, [name, weight]: the loud ones (the tall pennant, the trailing pothos, the lamp, the headphones) come
// half as often, so a room of six desks is not a row of six flags.
const deal = (pairs) => pairs.flatMap(([n, w]) => Array(w).fill(n))
const TOPS = deal([['lv-cactus', 2], ['lv-duck', 2], ['lv-dino', 2], ['lv-globe', 2], ['lv-neko', 2], ['lv-flag', 1], ['lv-ivy', 1]])
const SIDES = deal([['lv-lamp', 1], ['lv-photo', 2], ['lv-catpic', 2], ['lv-books', 2], ['lv-pens', 2], ['lv-coffee', 2], ['lv-succ', 2],
  ['lv-notes', 2], ['lv-phones', 1]])
const touch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

/**
 * The 1 or 2 accessories of a desk, picked from its key (the session id, fnv1a), so a desk keeps its look from one
 * refresh to the next and two desks rarely match: one on the monitor and/or one on the desk corner, never two that
 * touch. `trophy` puts the longest shift's cup on the monitor; `coffee: false` leaves the hot coffee out (a dozer has
 * its own mug, a dark room has nobody to drink it). Returns the sprite names ('lv-…', the lamp as 'lv-lamp': the desk
 * swaps in the lit 'lv-lampN' at night). Exported for the tests.
 */
export function deskAccessories(key, { trophy = false, coffee = true } = {}) {
  const h = fnv1a(`desk-acc:${key}`)
  const top = trophy ? 'lv-trophy' : TOPS[h % TOPS.length]
  const sides = coffee ? SIDES : SIDES.filter((n) => n !== 'lv-coffee')
  const start = (h >>> 8) % sides.length
  let side = null
  for (let i = 0; i < sides.length && !side; i++) {
    const s = sides[(start + i) % sides.length]
    if (!touch(ACC[top].box, ACC[s].box)) side = s
  }
  // about a third of the desks keep it to one: the monitor's (always the trophy) or the corner's
  if ((h >>> 16) % 3 === 0) return [trophy || (h >>> 20) & 1 || !side ? top : side]
  return side ? [top, side] : [top]
}

/**
 * A desk's accessories as bare <use>s for inside its <g transform>; a lamp is on at night unless the room is dark.
 * `lamp` names the sprite a lamp is drawn with instead (the timelapse's, which lights itself with the replayed night).
 */
function accessories(ctx, key, project, { trophy = false, coffee = true, lit = true, lamp } = {}) {
  const lampOf = (n) => lamp ?? (lit && ctx.night ? 'lv-lampN' : n)
  return deskAccessories(key, { trophy, coffee }).map((n) => use(ctx, n === 'lv-lamp' ? lampOf(n) : n, 0, 0, ACC[n].tinted ? ` color="${ctx.color(project)}"` : '')).join('')
}

/** A desk's accessories as bare <use>s (accessories), lent to the timelapse through the composer (lib/svg.mjs). */
export const deskProps = (ctx, key, project, opts) => accessories(ctx, key, project, opts)

// The kitchen's paper bunting: one 30-px swag of string sagging between two pins, four pennants on it, repeated across
// the room under its header.
const BUNT = ['#e85d75', '#f6d34a', '#7fbde8', '#9ab86a']
defineSprites({
  'lv-bunt': () => paint([[0, 0, 4, 1, '#d8d2c4'], [4, 1, 6, 1, '#d8d2c4'], [10, 2, 10, 1, '#d8d2c4'], [20, 1, 6, 1, '#d8d2c4'], [26, 0, 4, 1, '#d8d2c4'],
    ...[[3, 2], [9, 3], [16, 3], [22, 2]].flatMap(([px, py], i) => [[px, py, 5, 1, BUNT[i]], [px + 1, py + 1, 3, 1, BUNT[i]], [px + 2, py + 2, 1, 1, BUNT[i]]])]),
  // two party balloons tied to the meeting room's plant, bobbing
  'lv-balloons': (c) => `<g>${sprite(['.rr...yy.', 'rRrr.yYyy', 'rrrr.yyyy', 'rrrr.yyyy', '.rr...yy.', '..s...s..', '...s.s...', '...s.s...', '....s....', '....s....'],
    { r: '#e85d75', R: '#ff9fb1', y: '#f6d34a', Y: '#fff2b0', s: '#d8d2c4' })}${aT(c, '0 0;0 -1;0 -1;0 0', 2.4)}</g>`,
  // the kitchen's fridge (12 × 27): magnets, a note, its handles, a grille at the foot
  'lv-fridge': () => sprite(['.WWWWWWWWWW.', 'WWWWWWWWWWWS', 'WmmWWWWWWhWS', 'WmmWyyWWWhWS', 'WWWWyyWWWhWS', 'WWWWWWWWWhWS', 'WWWWWWWWWWWS', 'WWWWWWWWWWWS',
    'dddddddddddd', 'WWWWWWWWWWWS', 'WppppWWWWhWS', 'WpkkpWWWWhWS', 'WppppWWWWhWS', 'WpkkpWWWWhWS', 'WppppWWWWhWS', 'WWWWWWWWWhWS', 'WWWWWWbbWhWS',
    'WWWWWWbbWWWS', 'WWWWWWWWWWWS', 'WWgWWWWWWWWS', 'WWWWWWWWWWWS', 'WWWWWWWWWWWS', 'WWWWWWWWWWWS', 'WWWWWWWWWWWS', 'WWWWWWWWWWWS', 'dddddddddddd', '.ff......ff.'],
  { W: '#e6e1d6', S: '#c9c2b4', d: '#9c9689', h: '#9c9689', m: '#e85d75', y: '#f6d34a', p: '#f4efe4', k: '#9a9282', b: '#7fbde8', g: '#9ab86a', f: '#5d6168' }),
  // a wall shelf over the coffee counter (24 × 11) with the microwave (someone heats their lunch now and then) and a
  // bowl of fruit
  'lv-shelf': (c) => paint([[0, 8, 24, 1, '#9a7b4f'], [2, 9, 1, 2, '#7a5a3a'], [21, 9, 1, 2, '#7a5a3a'], [1, 1, 12, 7, '#5d6168'], [1, 1, 12, 1, '#7a7f87'],
    [2, 2, 7, 5, '#1b1e24'], [10, 2, 2, 1, ROLE.busy], [10, 4, 2, 1, '#3a3f48'], [10, 6, 2, 1, '#3a3f48'], [16, 4, 2, 2, '#e85d75'], [18, 4, 2, 2, '#f6d34a'],
    [20, 5, 2, 1, ROLE.busy], [15, 6, 7, 1, '#d4a94f'], [16, 7, 5, 1, '#b08850']]) + `<g opacity="0">${paint([[3, 3, 5, 3, '#f6d34a/.4']])}${aO(c, '0;0;0;1;1;0', 5)}</g>`,
  // a speech bubble over an agent on break: chatting
  'lv-chat': () => paint([[1, 0, 7, 5, '#f4efe4'], [0, 1, 9, 3, '#f4efe4'], [2, 5, 2, 1, '#f4efe4'], [2, 6, 1, 1, '#f4efe4'], [2, 2, 1, 1, '#7a6f5c'],
    [4, 2, 1, 1, '#7a6f5c'], [6, 2, 1, 1, '#7a6f5c']]),
})

// ---------------------------------------------------------------- the rooms' look

// The rooms are lit rather than flat: one palette in ramps for night and day. At night each desk sits in the pool of its
// own ceiling light, its screen glows on the wall, on the desk top and on the figure's near side. The walls are muted so
// the cast's colors stand out, and dark enough by day for the rooms' light header text. The figures are the kit's
// (castFigure): lit by the scene, each desk on a timeline of its own. These sprites are 'rm-' (the desk accessories are
// 'lv-').
const ROOM_NIGHT = {
  plankHi: '#6e4d3f', plank: '#4b3534', plankLo: '#2d2025', joint: '#24191d',
  deskHi: '#dcab72', desk: '#a87a52', deskEdge: '#45291f', face: '#6f4733', faceLo: '#543424', faceHi: '#85583c', drawer: '#7b5039',
  handle: '#f2ca7c', plinth: '#2f1d1b',
  bezel: '#171927', bezelHi: '#30354f', stand: '#21243a', standHi: '#3b405f', led: '#7fe08a',
  kb: '#c4bdb2', kbKey: '#857f75',
  g0: '#0a0f2e', g1: '#0f163b', g2: '#151f4a', city: '#070a1d', cityHi: '#10153a',
  lit: '#ffd27a', litDim: '#b9824a', red: '#ff5a4a', star: '#d9dcff', beam: '#9fbaff', beamOp: '.035',
  cool: '#8fd3ff', warm: '#ffefd2', ask: '#ffab8a', under: '#06040e/.5', contact: '#05040b/.45',
  pot: '#b5623e', potHi: '#d98a5a', potLo: '#7a3d29', leaf: '#2f6b47', leafHi: '#4f9b5c', leafLo: '#1c4535',
  cat: { a: '#e3b56a', A: '#ad7634', b: '#c4924f', e: '#2b1d12', t: '#d29d4e' },
}
const ROOM_DAY = {
  plankHi: '#b98a58', plank: '#8f6440', plankLo: '#63432c', joint: '#4d3322',
  deskHi: '#efc488', desk: '#cf9f66', deskEdge: '#6f4a2c', face: '#a5764a', faceLo: '#86603b', faceHi: '#bc8b58', drawer: '#b38352', plinth: '#4a3020',
  bezel: '#20232e', bezelHi: '#474d61', stand: '#2b2f3b', standHi: '#545b70',
  kb: '#e9e3d8', kbKey: '#a39c90',
  // the sky through the windows a little hazy, so a window is never brighter than the cast it frames
  g0: '#52799c', g1: '#5c83a5', g2: '#678dad', city: '#58718a', cityHi: '#647d96',
  lit: '#a9bfd4', litDim: '#93aac0', star: null, beam: '#fff0c0', beamOp: '.07',
  cool: '#cfeaff', warm: '#fff8e8', ask: '#ffc8b0', under: '#120c08/.4', contact: '#120c08/.35',
  cat: { a: '#efc276', A: '#b67d38', b: '#d6a25a', e: '#2b1d12', t: '#dca853' },
}
// The walls come in schemes, one set of ramps re-hued at the same lightness (so the header text stays legible and the
// cast still stands out on any of them): the wall, its wainscot and rails, the baseboard and the chairs, by day (its
// rail frames the windows), by night (with the window frames) and with nobody in at night, the lights off. Sage is the office's; the others are kept for
// when the walls become a setting (`blue` the first walls, `slate` the same blue gone grey).
const WALLS = {
  sage: {
    day: { wall: '#475b4a', ceil: '#324335', wains: '#394a3c', wainsHi: '#526756', wainsLo: '#303f32', rail: '#6a806d', railLo: '#27352a', base: '#243026', baseHi: '#566b5a', seat: '#324937', seatHi: '#4f6c54', metal: '#455a49', caster: '#172119' },
    night: { wall: '#17251a', ceil: '#0c170e', wains: '#121f14', wainsHi: '#1e2e21', wainsLo: '#0b170e', rail: '#2a422f', railLo: '#09120a', base: '#0c170e', baseHi: '#243928', seat: '#253a29', seatHi: '#38593f', metal: '#314335', caster: '#09130b', frame: '#2c4130', frameHi: '#45644b', sill: '#3b5440' },
    off: { wall: '#0d1a10', wains: '#0b160d', wainsHi: '#142417', wainsLo: '#08110a' },
  },
  blue: {
    day: { wall: '#4a5470', ceil: '#353d54', wains: '#3b445c', wainsHi: '#56607e', wainsLo: '#323a50', rail: '#6e7898', railLo: '#2a3044', base: '#262c3e', baseHi: '#5a6482', seat: '#3a4060', seatHi: '#59608a', metal: '#4c5270', caster: '#1a1d2b' },
    night: { wall: '#1e1f33', ceil: '#111222', wains: '#18192c', wainsHi: '#25273f', wainsLo: '#111223', rail: '#34385a', railLo: '#0d0e1c', base: '#111222', baseHi: '#2d304d', seat: '#2e3150', seatHi: '#464b7a', metal: '#383c56', caster: '#0e0f1d', frame: '#3a3654', frameHi: '#5a5480', sill: '#4c476b' },
    off: { wall: '#131426', wains: '#101121', wainsHi: '#1b1d33', wainsLo: '#0c0d1a' },
  },
  slate: {
    day: { wall: '#505561', ceil: '#3a3e48', wains: '#40454f', wainsHi: '#5c616e', wainsLo: '#373b44', rail: '#747987', railLo: '#2e313a', base: '#2a2d35', baseHi: '#606572', seat: '#3e4250', seatHi: '#5e6275', metal: '#505361', caster: '#1c1e24' },
    night: { wall: '#202029', ceil: '#12131a', wains: '#1a1a23', wainsHi: '#272933', wainsLo: '#12131b', rail: '#383a49', railLo: '#0e0f15', base: '#12131a', baseHi: '#30323f', seat: '#313341', seatHi: '#4b4e63', metal: '#3b3d49', caster: '#0f1016', frame: '#3a3946', frameHi: '#5a586c', sill: '#4c4a5b' },
    off: { wall: '#15151d', wains: '#111219', wainsHi: '#1d1f28', wainsLo: '#0d0e14' },
  },
  teal: {
    day: { wall: '#3b5c5d', ceil: '#284345', wains: '#2e4a4c', wainsHi: '#46686a', wainsLo: '#264041', rail: '#5d8183', railLo: '#1e3637', base: '#1c3132', baseHi: '#4a6c6e', seat: '#234a4c', seatHi: '#3b6d70', metal: '#395b5d', caster: '#112122' },
    night: { wall: '#0d2627', ceil: '#041718', wains: '#081f21', wainsHi: '#112f30', wainsLo: '#031819', rail: '#174345', railLo: '#031314', base: '#041718', baseHi: '#15393b', seat: '#133b3d', seatHi: '#1b5a5d', metal: '#264446', caster: '#041415', frame: '#1d4143', frameHi: '#306567', sill: '#2a5557' },
    off: { wall: '#041a1b', wains: '#031617', wainsHi: '#082426', wainsLo: '#031112' },
  },
  plum: {
    day: { wall: '#5e4f5d', ceil: '#463944', wains: '#4d404b', wainsHi: '#6b5b69', wainsLo: '#423641', rail: '#847382', railLo: '#382d36', base: '#332932', baseHi: '#6f5f6d', seat: '#4d3c4b', seatHi: '#715b6f', metal: '#5e4e5c', caster: '#231b22' },
    night: { wall: '#281d26', ceil: '#191118', wains: '#211720', wainsHi: '#312530', wainsLo: '#191118', rail: '#463544', railLo: '#140d13', base: '#191118', baseHi: '#3c2d3b', seat: '#3e2e3c', seatHi: '#5f475c', metal: '#473945', caster: '#150e14', frame: '#443542', frameHi: '#695266', sill: '#584656' },
    off: { wall: '#1c131b', wains: '#181017', wainsHi: '#261b25', wainsLo: '#130c12' },
  },
  greige: {
    day: { wall: '#5d5348', ceil: '#443c33', wains: '#4c433a', wainsHi: '#6a5f54', wainsLo: '#413931', rail: '#82776b', railLo: '#373028', base: '#322c25', baseHi: '#6e6358', seat: '#4b4034', seatHi: '#6f6151', metal: '#5c5247', caster: '#221d18' },
    night: { wall: '#272018', ceil: '#18130d', wains: '#201a13', wainsHi: '#30281f', wainsLo: '#19130c', rail: '#45392c', railLo: '#130f09', base: '#18130d', baseHi: '#3b3126', seat: '#3d3226', seatHi: '#5d4d3b', metal: '#453c33', caster: '#14100a', frame: '#43392e', frameHi: '#675848', sill: '#564a3d' },
    off: { wall: '#1b150e', wains: '#17120c', wainsHi: '#251e16', wainsLo: '#120e09' },
  },
}
const WALLS_DEFAULT = 'sage'
// By day the walls stand a quarter deeper than their schemes' ramps, so the cast stands out on them rather than the
// windows (Clawd's orange 3.2:1 on the sage, 2.3:1 before, while the near-white window frames were 6.6:1): the wall,
// its wainscot, its rails and its baseboard, each by the same step, so the ramp keeps its shape
const DAY_DEPTH = 0.25
const DAY_DEEP = ['wall', 'ceil', 'wains', 'wainsHi', 'wainsLo', 'rail', 'railLo', 'base', 'baseHi']
/** The rooms' night and day palettes, walled in `scheme` (a WALLS key; an unknown one gets the default). */
function roomsIn(scheme) {
  const w = WALLS[scheme] ?? WALLS[WALLS_DEFAULT]
  // nobody in at night: the lights off, the moonlight the only light
  const night = { ...ROOM_NIGHT, ...w.night, off: { ...w.off, beamOp: '.06' } }
  const deep = Object.fromEntries(DAY_DEEP.map((k) => [k, mix(w.day[k], '#000000', DAY_DEPTH)]))
  // the windows framed in the scheme's own rail by day, as by night: a frame, not a white outline
  const frames = { frame: w.day.rail, frameHi: mix(w.day.rail, '#ffffff', 0.2), sill: w.day.baseHi }
  return { night, day: { ...night, ...w.day, ...ROOM_DAY, ...deep, ...frames, off: {} } }
}
const ROOM = roomsIn(WALLS_DEFAULT)
const roomPal = (c) => ROOM[c.night ? 'night' : 'day']

// the desk, 48 wide from its top (y 24) to the floor (y 36): a drawer pedestal on the left, the apron, a leg on the right
const rep = (ch, n) => ch.repeat(n)
const DESK = [
  rep('H', 48), rep('T', 48), `.${rep('E', 46)}.`,
  `.g${rep('D', 11)}l${rep('F', 30)}gFl.`, `.g${rep('D', 4)}hh${rep('D', 5)}l${rep('F', 30)}gFl.`, `.g${rep('d', 11)}l${rep('f', 30)}gFl.`,
  `.g${rep('F', 11)}l${rep('.', 30)}gFl.`, `.g${rep('D', 11)}l${rep('.', 30)}gFl.`, `.g${rep('D', 4)}hh${rep('D', 5)}l${rep('.', 30)}gFl.`,
  `.g${rep('D', 11)}l${rep('.', 30)}gFl.`, `.g${rep('d', 11)}l${rep('.', 30)}gFl.`, `.${rep('B', 13)}${rep('.', 30)}BBB.`,
]
// a potted plant: broad leaves (the top three rows sway), a terracotta pot with its lit rim
const LEAVES = ['...h.......', '..hLl..h...', '.hLLl.hLl..', 'hLLl.hLLLl.', 'LLl.hLLl.Ll', '.l.hLLl..lL', '...LLl.h...', '..lLl.hLl..',
  '....s.LLl..', '....s.l....']
const POT = ['..QQQQQQQ..', '..pPPPPPp..', '...pPPPp...', '...pPPPp...', '....ppp....']
// what a screen casts on the wall and the desk: a page (reading, the web, a plan) warm white, a question warm, any other
// screen cool, a dozer's screen saver nothing
const LIGHT_SCREENS = new Set(['reading', 'web', 'planning'])
// A desk class's own script and screen (svg-kit SCRIPTS, SCREEN); a desk at work goes by its activity kind instead
const DESK_SCRIPT = { waiting: 'boss', asking: 'ask', thinking: 'think', done: 'done', break: 'done', stopped: 'stuck', error: 'stuck', dozing: 'doze' }
const DESK_SCREEN = { waiting: 'wait', asking: 'ask', thinking: 'think', done: 'done', break: 'done', stopped: 'stop', error: 'err', dozing: 'doze' }
const GLOWS = ['cool', 'warm', 'ask', 'none']
const deskArt = (c) => {
  const P = roomPal(c)
  return paint([[14, 30, 30, 6, P.under]]) + sprite(DESK, { H: P.deskHi, T: P.desk, E: P.deskEdge, D: P.drawer, d: P.faceLo, h: P.handle, F: P.face,
    f: P.faceLo, g: P.faceHi, l: P.deskEdge, B: P.plinth }, 0, 24) + paint([[0, 36, 15, 1, P.contact], [43, 36, 5, 1, P.contact], [28, 36, 14, 1, P.contact]])
}
// the ceiling light's pool on a desk top (night)
const pool = (c) => (c.night ? paint([[8, 24, 32, 1, '#ffe2b0/.16'], [4, 24, 40, 1, '#ffe2b0/.08']]) : '')

defineSprites({
  'rm-desk': (c) => deskArt(c) + paint([[29, 27, 10, 3, 'cur']]) + paint([[29, 27, 10, 1, '#ffffff/.22'], [29, 29, 10, 1, '#000/.3'], [31, 28, 6, 1, '#000/.22']]),
  'rm-chair': (c) => {
    const P = roomPal(c)
    return paint([[28, 30, 14, 1, P.seatHi], [28, 31, 14, 1, P.seat], [34, 32, 2, 2, P.metal], [30, 34, 10, 1, P.metal], [29, 35, 2, 1, P.caster],
      [34, 35, 2, 1, P.caster], [39, 35, 2, 1, P.caster]])
  },
  'rm-mon': (c) => {
    const P = roomPal(c)
    return paint([[4, 9, 18, 12, P.bezel], [4, 9, 18, 1, P.bezelHi], [4, 10, 1, 10, P.bezelHi], [11, 21, 4, 2, P.stand], [11, 21, 1, 2, P.standHi],
      [9, 23, 8, 1, P.standHi], [19, 20, 1, 1, P.led]]) + paint([[9, 24, 9, 1, '#000/.3']])
  },
  'rm-sheen': () => paint([[15, 10, 3, 1, '#ffffff/.1'], [14, 11, 2, 1, '#ffffff/.08'], [13, 12, 1, 1, '#ffffff/.06']]),
  'rm-kb': (c) => {
    const P = roomPal(c)
    return paint([[28, 23, 13, 1, P.kb], ...[29, 31, 33, 35, 37, 39].map((x) => [x, 23, 1, 1, P.kbKey]), [42, 23, 2, 1, P.kb]]) +
      paint([[28, 24, 13, 1, '#000/.25'], [42, 24, 2, 1, '#000/.25']])
  },
  // one <use> each, so a desk stays a handful of them: behind its figure the screen's glow on the wall (night) and the
  // chair (rm-k<glow>); in front of it the desk, its plaque (currentColor: the project), the glow and the pool on its
  // top (rm-d<glow>); the monitor, its screen and the sheen on the glass (rm-m<screen>)
  ...Object.fromEntries(GLOWS.flatMap((k) => [
    [`rm-k${k}`, (c) => (c.night && k !== 'none' ? paint([[3, 6, 20, 18, `${roomPal(c)[k]}/.025`], [1, 8, 24, 14, `${roomPal(c)[k]}/.025`],
      [4, 8, 18, 14, `${roomPal(c)[k]}/.035`]]) : '') + use(c, 'rm-chair')],
    [`rm-d${k}`, (c) => use(c, 'rm-desk') + (k === 'none' ? '' : paint([[4, 24, 18, 1, `${roomPal(c)[k]}/${c.night ? '.22' : '.1'}`],
      [2, 25, 22, 1, `${roomPal(c)[k]}/${c.night ? '.1' : '.05'}`]])) + pool(c)],
  ])),
  ...Object.fromEntries(Object.keys(SCREEN_BG).map((k) => [`rm-m${k}`, (c) => use(c, 'rm-mon') + use(c, `s-${k}`, 5, 10) + use(c, 'rm-sheen')])),
  'rm-pot': (c) => {
    const P = roomPal(c)
    return sprite(POT, { Q: P.potHi, P: P.pot, p: P.potLo }, 0, 10) + paint([[1, 15, 9, 1, P.contact]])
  },
  'rm-leaves': (c) => {
    const P = roomPal(c)
    const leg = { h: P.leafHi, L: P.leaf, l: P.leafLo, s: P.leafLo }
    return `<g>${sprite(LEAVES.slice(0, 3), leg)}${aT(c, '0 0;1 0;0 0;-1 0;0 0;0 0;0 0', 5.2)}</g>${sprite(LEAVES.slice(3), leg, 0, 3)}`
  },
  // the panelling under the chair rail and the planks' joints: one rect a row, however wide the room
  'rm-wains': (c) => {
    const P = roomPal(c)
    return `<pattern id="${c.id}rm-wainsp" width="12" height="1" patternUnits="userSpaceOnUse">${paint([[0, 0, 12, 1, P.wains], [6, 0, 1, 1, P.wainsLo], [7, 0, 1, 1, P.wainsHi]])}</pattern>`
  },
  'rm-wainsoff': (c) => {
    const P = { ...roomPal(c), ...roomPal(c).off }
    return `<pattern id="${c.id}rm-wainsoffp" width="12" height="1" patternUnits="userSpaceOnUse">${paint([[0, 0, 12, 1, P.wains], [6, 0, 1, 1, P.wainsLo], [7, 0, 1, 1, P.wainsHi]])}</pattern>`
  },
  'rm-planks': (c) => {
    const P = roomPal(c)
    return `<pattern id="${c.id}rm-planksp" width="17" height="1" patternUnits="userSpaceOnUse">${paint([[0, 0, 17, 1, P.plank], [9, 0, 1, 1, P.joint]])}</pattern>`
  },
  'rm-cat': (c) => catSheet(c),
})

// ---------------------------------------------------------------- the walls' dressing

// What makes a floor an office rather than a row of desks on a flat wall, in the full and the lighter art (the lightest
// keeps plain walls): wallpaper above the chair rail under a picture rail (a faint overlay, so day, night and a dark
// room share one pattern; each room has its own, the kitchen's wall is tiled), and what hangs where the desks leave the wall bare: a calendar,
// a poster in the project's color, a landscape, a cork board, a shelf of books, a kanban whiteboard. Each piece is a few
// rects, bases first (the cheapest markup: the walls are dressed only where the size budget has room for it), over its
// shadow on the wall a pixel down and to the right, dimmed by night.
const DUSK = '#0c0d1f/.38'
const SHADE = '#000/.24'
// the walls are dressed unless the size budget took it back (renderSvg tries every art dressed, then bare) or the art is
// the lightest
const dressed = (ctx) => ctx.caps?.dress !== false && ctx.caps?.art !== 2
// a piece w × h: its shadow, its rects, and by night its outline (`dusk`, rects that never overlap) dimmed
const hung = (c, w, h, rects, dusk = [[0, 0, w, h]], shade = [[1, h, w, 1], [w, 1, 1, h - 1]]) =>
  paint(shade.map((r) => [...r, SHADE])) + paint(rects) + (c.night ? paint(dusk.map((r) => [...r, DUSK])) : '')
// [sprite, width, height], narrowest first: a gap takes the widest pieces that leave it some wall either side
const HANG = [['rm-cal', 7, 9], ['rm-poster', 9, 12], ['rm-art', 13, 10], ['rm-cork', 19, 12], ['rm-wshelf', 22, 10], ['rm-kanban', 30, 15]]
// A wallpaper: one tile of white (and a touch of shade) at a few percent, so the wall's own color shows through, and
// quiet enough that it never competes with the cast in front of it.
const paperTile = (c, name, w, h, rects) => `<pattern id="${c.id}${name}p" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${paint(rects)}</pattern>`
defineSprites({
  // stripes and a small lozenge between them
  'rm-damask': (c) => paperTile(c, 'rm-damask', 8, 8, [[0, 0, 1, 8, '#ffffff/.035'], [4, 2, 1, 1, '#ffffff/.03'], [3, 3, 3, 1, '#ffffff/.03'],
    [4, 4, 1, 1, '#ffffff/.03'], [1, 0, 1, 8, '#000/.025']]),
  // broad stripes, each with a bright edge
  'rm-regency': (c) => paperTile(c, 'rm-regency', 8, 2, [[0, 0, 3, 2, '#ffffff/.025'], [3, 0, 1, 2, '#ffffff/.04']]),
  // polka dots, every other row shifted
  'rm-dots': (c) => paperTile(c, 'rm-dots', 8, 8, [[1, 1, 1, 1, '#ffffff/.05'], [5, 5, 1, 1, '#ffffff/.05']]),
  // a lattice of dotted diagonals
  'rm-lattice': (c) => paperTile(c, 'rm-lattice', 8, 8, [[0, 0, 1, 1, '#ffffff/.04'], [2, 2, 1, 1, '#ffffff/.04'], [4, 4, 1, 1, '#ffffff/.04'],
    [6, 6, 1, 1, '#ffffff/.04'], [6, 2, 1, 1, '#ffffff/.04'], [2, 6, 1, 1, '#ffffff/.04']]),
  // subway tiles, their grout a little lighter than the wall
  'rm-tiles': (c) => paperTile(c, 'rm-tiles', 8, 8, [[0, 3, 8, 1, '#ffffff/.09'], [0, 7, 8, 1, '#ffffff/.09'], [0, 0, 1, 3, '#ffffff/.09'],
    [4, 4, 1, 3, '#ffffff/.09'], [1, 0, 3, 1, '#ffffff/.05'], [5, 4, 3, 1, '#ffffff/.05']]),
  // a carpet's weave (carpet): a light stitch and a dark one in turn along its middle row, over its color
  'rm-weave': (c) => paperTile(c, 'rm-weave', 4, 1, [[0, 0, 1, 1, '#fff/.45'], [2, 0, 1, 1, '#000/.3']]),
  // the month on two rings, hung on a nail, today circled in red
  'rm-cal': (c) => hung(c, 7, 9, [[3, -1, 1, 1, '#9aa0a8'], [1, 0, 1, 1, '#5d6168'], [5, 0, 1, 1, '#5d6168'], [0, 1, 7, 2, '#d9473a'], [0, 3, 7, 6, '#f4efe4'], [5, 6, 1, 1, '#d9473a'],
    ...[[1, 4], [3, 4], [5, 4], [1, 6], [3, 6], [1, 8], [3, 8]].map(([x, y]) => [x, y, 1, 1, '#9a9282'])], [[0, 1, 7, 8]]),
  // the project's poster (currentColor: the room sets it): a diamond and two lines of a slogan on its color, taped up
  'rm-poster': (c) => hung(c, 9, 12, [[0, 0, 9, 12, '#2a2522'], [1, 1, 7, 10, 'cur'], [1, 1, 1, 1, '#ffffff/.3'],
    ...[[4, 2, 1], [3, 3, 3], [2, 4, 5], [3, 5, 3], [4, 6, 1]].map(([x, y, w]) => [x, y, w, 1, '#000/.38']), [2, 8, 4, 1, '#000/.26'], [3, 9, 3, 1, '#000/.26'],
    [0, 0, 2, 1, '#f4efe4/.75'], [7, 0, 2, 1, '#f4efe4/.75']]),
  // a landscape in a gilt frame under a brass picture light, on at night: a snowy peak, green hills, the sun
  'rm-art': (c) => hung(c, 13, 10, [[3, -2, 7, 1, '#b08850'], [6, -1, 1, 1, '#8a6a3a'], [0, 0, 13, 10, '#c9a26b'], [12, 1, 1, 9, '#8a6a3a'], [0, 9, 12, 1, '#8a6a3a'], [1, 1, 11, 6, '#9fd0f2'],
    [8, 2, 2, 2, '#f6d34a'], [4, 5, 3, 1, '#7f8fa8'], [3, 6, 5, 1, '#7f8fa8'], [5, 3, 1, 1, '#eef3f8'], [4, 4, 3, 1, '#eef3f8'], [3, 5, 1, 1, '#eef3f8'],
    [7, 5, 1, 1, '#eef3f8'], [2, 6, 1, 1, '#eef3f8'], [8, 6, 1, 1, '#eef3f8'], [10, 5, 1, 1, '#6fae7a'], [9, 6, 3, 1, '#6fae7a'], [1, 7, 11, 1, '#6fae7a'],
    [1, 8, 11, 1, '#4f8a3a']]) + (c.night ? paint([[4, -1, 5, 1, '#ffe9b8'], [1, 1, 11, 2, '#ffd27a/.28'], [1, 3, 11, 2, '#ffd27a/.14']]) : ''),
  // a cork board: notes and a photo pinned on it
  'rm-cork': (c) => hung(c, 19, 12, [[0, 0, 19, 12, '#8a6a44'], [0, 0, 19, 1, '#a8845a'], [0, 11, 19, 1, '#6a5034'], [1, 1, 17, 10, '#c49a62'], [2, 2, 4, 5, '#f6e26a'], [3, 3, 2, 1, '#c9b440'],
    [3, 5, 2, 1, '#c9b440'], [8, 2, 5, 4, '#f4efe4'], [9, 3, 3, 1, '#9fd0f2'], [9, 4, 3, 1, '#6fae7a'], [10, 4, 1, 1, '#f6d34a'], [15, 2, 3, 3, '#9fd0f2'],
    [12, 7, 4, 3, '#ff9fc0'], [13, 8, 2, 1, '#d0708e'], [2, 8, 4, 3, '#a8dcb0'], [3, 9, 2, 1, '#6fae7a'],
    ...[[3, 1], [12, 1], [17, 1], [13, 6], [8, 7]].map(([x, y]) => [x, y, 1, 1, '#d9473a'])]),
  // a shelf of books on two brackets (standing, and two lying on their side), a small plant at the end
  'rm-wshelf': (c) => {
    const rects = [[1, 1, 1, 5, '#c0504a'], [2, 2, 1, 4, '#6f9a3a'], [3, 3, 2, 3, '#3f7fb8'], [5, 2, 1, 4, '#e0b040'], [6, 3, 1, 3, '#5a4a7a'],
      [9, 4, 3, 1, '#e0b040'], [8, 5, 5, 1, '#3f7fb8'], [17, 1, 3, 3, '#4f8a3a'], [16, 2, 1, 1, '#4f8a3a'], [20, 1, 1, 1, '#4f8a3a'], [18, 0, 1, 1, '#4f8a3a'],
      [16, 4, 5, 1, '#d98a5a'], [17, 5, 3, 1, '#d98a5a'], [0, 6, 22, 1, '#b98a58'], [0, 7, 22, 1, '#7a5a3a'], [2, 8, 1, 2, '#5d6168'], [19, 8, 1, 2, '#5d6168']]
    return hung(c, 22, 10, rects, rects, [[1, 8, 1, 1], [3, 8, 16, 1], [20, 8, 2, 1], [22, 7, 1, 1], [3, 9, 1, 1], [20, 9, 1, 1]])
  },
  // the team's kanban: to do, doing, done, in sticky notes, two markers on the tray under it
  'rm-kanban': (c) => hung(c, 30, 15, [[0, 0, 30, 14, '#9aa0a8'], [0, 0, 30, 1, '#c9ced8'], [1, 1, 28, 12, '#eef0f2'], [2, 2, 4, 1, '#5d6168'], [11, 2, 5, 1, '#5d6168'],
    [21, 2, 3, 1, '#5d6168'], [9, 2, 1, 10, '#c9ced8'], [18, 2, 1, 10, '#c9ced8'], [4, 14, 22, 1, '#7a7f87'],
    ...[[2, 4], [6, 7], [11, 7]].map(([x, y]) => [x, y, 3, 2, '#f6e26a']), ...[[6, 4], [2, 7]].map(([x, y]) => [x, y, 3, 2, '#ff9fc0']),
    ...[[2, 10], [11, 4]].map(([x, y]) => [x, y, 3, 2, '#9fd0f2']), ...[[20, 4], [24, 4], [20, 7], [24, 7], [20, 10]].map(([x, y]) => [x, y, 3, 2, '#a8dcb0']),
    [7, 14, 3, 1, '#d9473a'], [11, 14, 3, 1, '#3f7fb8']],
  [[0, 0, 30, 14], [4, 14, 22, 1]], [[1, 14, 3, 1], [26, 14, 4, 1], [4, 15, 22, 1], [30, 1, 1, 13]]),
})

// The rooms' wallpapers: a room picks one from its name, so a project keeps its own from one refresh to the next; one the
// drawing has not hung yet while there are some (rooms drawn busiest first: the busiest keeps its own), then one other
// than the room's before it on the same floor.
const PAPERS = ['rm-damask', 'rm-regency', 'rm-dots', 'rm-lattice']
function paperOf(ctx, name) {
  const hung = (ctx.papers ??= new Set())
  const taken = (p) => (hung.size < PAPERS.length ? hung.has(p) : p === ctx.band.paper)
  let i = fnv1a(`paper:${name}`) % PAPERS.length
  for (let k = 1; k < PAPERS.length && taken(PAPERS[i]); k++) i = (i + 1) % PAPERS.length
  hung.add(PAPERS[i])
  ctx.band.paper = PAPERS[i]
  return PAPERS[i]
}

/**
 * What hangs on a stretch of wall from x `a` to `b` (between two desks, or a desk and the room's end), never enough to
 * make the wall busy: one piece, no wider than 60% of the stretch so the wall shows all around it, centered at eye level
 * over the desks (clear of the chair rail), and never within 40 px of the piece before it on the floor (the room next
 * door's, across the partition); a long stretch one piece per 140 px of it, each centered in its share. The piece is one
 * of the three widest that fit, of those one the room has not hung yet (`seen`, shared by its rows) and the drawing has
 * hung least, picked from `key` (the room, the row, the stretch) so a room keeps its walls from one refresh to the next.
 */
function hangIn(ctx, key, a, b, floor, color, seen) {
  const n = Math.max(1, Math.floor((b - a) / 140))
  if (n > 1) {
    let s = ''
    for (let i = 0; i < n; i++) s += hangIn(ctx, `${key}.${i}`, a + Math.floor(((b - a) * i) / n), a + Math.floor(((b - a) * (i + 1)) / n), floor, color, seen)
    return s
  }
  const room = Math.min(b - a - 8, Math.floor((b - a) * 0.6))
  const fit = HANG.filter(([, w]) => w <= room)
  if (!fit.length) return ''
  const fresh = fit.filter(([name]) => !seen.has(name))
  const pool = (fresh.length ? fresh : fit).slice(-3)
  const hung = (ctx.pieces ??= new Map())
  const least = Math.min(...pool.map(([name]) => hung.get(name) ?? 0))
  const from = pool.filter(([name]) => (hung.get(name) ?? 0) === least)
  const [name, w, h] = from[fnv1a(`wall:${key}`) % from.length]
  const x = a + Math.floor((b - a - w) / 2)
  if (x - (ctx.band.hung.get(floor) ?? -Infinity) < 40) return ''
  ctx.band.hung.set(floor, x + w + 1)
  seen.add(name)
  hung.set(name, (hung.get(name) ?? 0) + 1)
  return use(ctx, name, x, floor - 24 - Math.floor(h / 2), name === 'rm-poster' ? ` color="${color}"` : '')
}

/**
 * A row's wall decor: the free wall between the room's ends and its desks (`xs`, each desk's x), on dressed walls only.
 * The room's ends always hang something; between the desks every other stretch stays bare (which ones, from `key`), so a
 * row of desks reads as desks, not as a gallery. `seen` carries what the room's rows above already hang.
 */
function wallDecor(ctx, key, x, w, xs, floor, color, seen = new Set()) {
  if (!dressed(ctx)) return ''
  const edges = [x + 2, ...xs.flatMap((dx) => [dx - 2, dx + 50]), x + w - 2]
  const last = edges.length / 2 - 1
  const skip = fnv1a(`rhythm:${key}`) & 1
  let s = ''
  for (let g = 0; g <= last; g++) {
    if (g > 0 && g < last && (g + skip) % 2) continue
    s += hangIn(ctx, `${key}:${g}`, edges[2 * g], edges[2 * g + 1], floor, color, seen)
  }
  return s
}

// The parts every room of a band draws alike, merged by paintBands into a few paths whatever the number of rooms: the
// walls and their shading, the wallpaper and tiles (pattern paths), the rails and boards, the panelling and the planks
// (pattern rects), the ceiling lights; and the wallpaper of the room last drawn, so the next one picks another, and where
// the last piece hung on each floor ends (by its y).
const bandParts = () => ({ walls: [], papers: new Map(), rails: [], panels: new Map(), boards: [], planks: [], lights: [], paper: null, hung: new Map() })

// A room's top band (its nameplate, strip, counts and `aside` as svg-kit roomHeader draws them) and its walls for the
// band to paint: the ceiling's shadow, darker corners. No window in the band: a live room's header is its nameplate, its
// strip and its counts alone (what the windows cost pays for the building's bar and the big bubble); a room of another
// building may still open on the street (svg-kit roomHeader, HEAD_WINDOWS). Returns { head, P }: the header and the
// room's palette.
function roomShell(ctx, it, x, top, w, BH, groups, strip, aside = null, lit = true) {
  const P = lit ? roomPal(ctx) : { ...roomPal(ctx), ...roomPal(ctx).off }
  const head = roomHeader(ctx, it, x, top, w, groups, strip, aside, () => '')
  ctx.band.walls.push([x, top, w, BH, P.wall], [x, top, w, 1, P.ceil], [x, top + 1, w, 2, '#000/.14'], [x, top, 2, BH, '#000/.16'], [x + w - 2, top, 2, BH, '#000/.16'])
  // the picture rail under the header, over the wallpaper
  if (dressed(ctx)) ctx.band.rails.push([x, top + HEAD, w, 1, P.rail], [x, top + HEAD + 1, w, 1, P.railLo])
  return { head, P }
}

// one row of a room for the band to paint: its wallpaper (PAPERS, the kitchen's tiles) from `wall` down, the chair rail,
// the panelling, the baseboard; the floor's front edge, unless a carpet covers it (`edge` false: carpet)
function rowParts(ctx, P, x, floor, w, lit = true, wall = floor - ROW, paper = PAPERS[0], edge = true) {
  // the lightest drawing (art 2): the lower wall in one piece, the floor's edge plain
  if (ctx.caps?.art === 2) {
    ctx.band.rails.push([x, floor - 14, w, 12, P.wains], [x, floor - 14, w, 1, P.rail], [x, floor - 2, w, 2, P.base])
    if (edge) ctx.band.boards.push([x, floor, w, 1, P.plankHi], [x, floor + 1, w, 2, P.plank])
    return
  }
  const wains = lit ? 'rm-wains' : 'rm-wainsoff'
  use(ctx, wains)
  use(ctx, 'rm-planks')
  const B = ctx.band
  if (dressed(ctx)) {
    use(ctx, paper)
    B.papers.set(paper, (B.papers.get(paper) ?? '') + `M${x} ${wall}h${w}v${floor - 14 - wall}h${-w}z`)
  }
  B.rails.push([x, floor - 14, w, 1, P.rail], [x, floor - 13, w, 1, P.railLo], [x, floor - 3, w, 1, P.baseHi], [x, floor - 2, w, 2, P.base])
  B.panels.set(wains, (B.panels.get(wains) ?? '') + `<rect x="${x}" y="${floor - 12}" width="${w}" height="9"/>`)
  if (!edge) return
  B.boards.push([x, floor, w, 1, P.plankHi], [x, floor + 2, w, 1, P.plankLo])
  B.planks.push(`<rect x="${x}" y="${floor + 1}" width="${w}" height="1"/>`)
}

// A carpet's rows: its light top edge, its weave, its dark lower edge
const CARPET = 3
// How far under its floor's line a row's tags and labels hang: clear of the carpet
const TAG_Y = CARPET + 1

/**
 * The carpet along a row of desks, in its room's project color, so a room reads as its nameplate's from across the
 * building, two projects on one floor most of all: it is the floor's front edge in the room (rowParts leaves the wood
 * out: the desks and chairs stand on it), lit along its top and shaded along its bottom as the nameplates are, and by the
 * dressing's rung its weave (rm-weave, light and dark stitches in turn) running out into a cream tassel at either end.
 * It joins the nameplates' paint (ctx.plates, drawn last: one path per color for the whole drawing), so a row's carpet
 * costs a few rects, fewer than the planks it covers. By night it keeps its color, in the pool of the desks' lights.
 */
function carpet(ctx, x, w, floor, color) {
  const { rects, light } = ctx.plates
  const [cx, cw] = [x + 2, w - 4]
  rects.push([cx, floor, cw, CARPET, color])
  light.push([cx, floor, cw, 1, '#fff/.4'], [cx, floor + CARPET - 1, cw, 1, '#000/.22'])
  if (dressed(ctx)) {
    use(ctx, 'rm-weave')
    const tassel = ctx.night ? '#857c69' : '#efe3c4'
    // with the plates' rects (their light, the carpet's top and foot, is painted over them, last)
    rects.push([cx, floor + 1, cw, 1, `url(#${ctx.id}rm-weavep)`], [x, floor + 1, 2, 1, tassel], [cx + cw, floor + 1, 2, 1, tassel])
  }
}

// The ceiling lights (night, full art): each [cx, ceiling, top of what it lights] gets its fitting and a cone of warm
// light in three steps, every cone of a band merged into three paths.
function cones(ctx, list) {
  if (!ctx.night || ctx.caps?.art || !list.length) return ''
  const layer = (a, b, op) => `<path fill="#ffd59a" fill-opacity="${op}" d="${list.map(([cx, ceil, to]) => `M${cx - a} ${ceil + 2}h${2 * a}L${cx + b} ${to}h${-2 * b}z`).join('')}"/>`
  return layer(3, 24, '.03') + layer(2, 17, '.035') + layer(1, 10, '.04') +
    paint(list.flatMap(([cx, ceil]) => [[cx - 3, ceil, 7, 1, '#2b2a44'], [cx - 2, ceil + 1, 5, 1, '#ffe9b8']]))
}

// What paintBands paints for a band's rooms under everything they draw themselves (back), and under their furniture (fore).
function bandSvg(ctx, B, top) {
  let back = paint(B.walls)
  for (const [name, d] of B.papers) back += `<path fill="url(#${ctx.id}${name}p)" d="${d}"/>`
  for (const [name, rects] of B.panels) back += `<g fill="url(#${ctx.id}${name}p)">${rects}</g>`
  back += paint(B.rails) + cones(ctx, B.lights)
  const fore = paint(B.boards) + (B.planks.length ? `<g fill="url(#${ctx.id}rm-planksp)">${B.planks.join('')}</g>` : '')
  return { back, fore }
}

// a potted plant standing on the floor at x (its leaves sway; a lighter drawing has the small one)
const plantAt = (ctx, x, floor) => (ctx.caps?.art ? use(ctx, 'plant', x, floor - 12) : use(ctx, 'rm-pot', x, floor - 15) + use(ctx, 'rm-leaves', x, floor - 15))

// ---------------------------------------------------------------- the office cat

// It walks in through a wall, sits in front of a desk a while, walks out through the other; later it walks back the
// other way (full art only). Its sheet: walking right, sitting, walking left, gone, CAT_D apart.
const CAT_TOP = ['...........a.a', 't..........aaa', 't.........aeaa', '.taaaAaaAaaaa.', '..abbbbbbbbba.']
const CAT_LEGS = [['..a..a...a..a.', '..a..a...a..a.'], ['...aa.....aa..', '...aa.....aa..']]
const CAT_SIT = ['......a.a', '......aaa', '......aea', '.....aaa.', '....aaaa.', '...aaaaa.', '...abbbb.']
const CAT_TAIL = [['.........', '.........', '.........', '.........', '.........', 't........', 'tt.......'],
  ['.........', '.........', '.........', 't........', 't........', '.t.......', '.........']]
const CAT_D = 2000
function catSheet(c) {
  const P = roomPal(c)
  const flip = (rows) => rows.map((r) => [...r].reverse().join(''))
  const swap = (a, b, dur) => (c.animate ? `<g>${a}${aO(c, '1;0', dur)}</g><g opacity="0">${b}${aO(c, '0;1', dur)}</g>` : a)
  const walk = (f) => sprite(f(CAT_TOP), P.cat) + swap(sprite(f(CAT_LEGS[0]), P.cat, 0, 5), sprite(f(CAT_LEGS[1]), P.cat, 0, 5), 0.36) + paint([[2, 7, 10, 1, P.contact]])
  const sit = sprite(CAT_SIT, P.cat) + swap(sprite(CAT_TAIL[0], P.cat), sprite(CAT_TAIL[1], P.cat), 0.9) + paint([[2, 7, 7, 1, P.contact]])
  return `${walk((r) => r)}<g transform="translate(${CAT_D + 3})">${sit}</g><g transform="translate(${2 * CAT_D})">${walk(flip)}</g>`
}
function catWalk(ctx, x, w, floor, seed) {
  if (!ctx.animate || ctx.caps?.art) return ''
  const xs = x - 16
  const xe = x + w + 2
  const h = fnv1a(`cat:${seed}`)
  const xm = Math.round(x + w * (0.3 + (h % 40) / 100))
  const v = 26
  const seg = [(xm - xs) / v, 5 + (h >>> 8) % 3, (xe - xm) / v, 12 + (h >>> 12) % 10, (xe - xs) / (v * 1.25), 8 + (h >>> 16) % 10]
  const L = seg.reduce((a, b) => a + b, 0)
  const at = seg.reduce((a, d) => [...a, a.at(-1) + d / L], [0]).map((t) => String(Math.round(t * 1e3) / 1e3).replace(/^0\./, '.'))
  const begin = -((h >>> 20) % 100) / 100 * L
  const y = floor - 7
  const anim = (type, values, keys, extra = '') => `<animateTransform attributeName="transform" type="translate" values="${values}" keyTimes="${keys}" ` +
    `dur="${r1(L)}s" begin="${r1(begin)}s"${extra} repeatCount="indefinite"/>`
  const path = anim('translate', `${xs} ${y};${xm} ${y};${xm} ${y};${xe} ${y};${xe} ${y};${xs} ${y};${xs} ${y}`, `0;${at.slice(1, 6).join(';')};1`)
  const frames = anim('translate', `0;${-CAT_D};0;${-3 * CAT_D};${-2 * CAT_D};${-3 * CAT_D}`, `0;${at.slice(1, 6).join(';')}`, ' calcMode="discrete"')
  return `<g><title>the office cat</title>${path}${use(ctx, 'rm-cat', 0, 0, '', frames)}</g>`
}

// ---------------------------------------------------------------- live floor plan: drawing

// A desk at (x, y): its chair, character, desk, monitor, accessories, interns. `titled`: its words in a tooltip (a desk
// that needs you, whose lines are under it); any other desk says them in its card (deskCard), whose hit box covers it.
function deskSvg(ctx, d, x, y, trophy = false, titled = true) {
  const c = ctx
  const proj = c.color(d.project)
  const branch = d.branch && !/^(main|master)$/.test(d.branch) ? d.branch : ''
  const tip = [d.project, d.title, whoOf(c, d), doing(d), since(c, d), trophy ? 'longest shift on the floor' : '', branch, d.worktree ? `wt ${d.worktree}` : '']
    .filter(Boolean).map((t) => clip(t, 80)).join(' · ')
  const kind = d.activity?.kind
  const agent = agentId(d.agent)
  // the character's script (Clawd, or the agent's own: cast.mjs; svg-kit SCRIPTS): typing (coding, terminal, testing),
  // reading, pointing (delegating), eyes up (thinking), the boss (waiting on helpers), a hand up (asking), sitting back
  // (done), puzzled (stopped, an error), dozing; anything else reads its screen line by line
  const typing = kind === 'coding' || kind === 'terminal' || kind === 'testing'
  const script = DESK_SCRIPT[d.cls] ?? (kind === 'delegating' ? 'point' : typing ? 'type' : kind === 'reading' ? 'read' : 'look')
  const scr = DESK_SCREEN[d.cls] ?? (SCREENS.has(kind) ? kind : 'tools')
  const glow = scr === 'doze' || c.caps?.art ? 'none' : LIGHT_SCREENS.has(scr) ? 'warm' : scr === 'ask' || scr === 'err' ? 'ask' : 'cool'
  let s = `<g transform="translate(${x} ${y})">${titled ? `<title>${esc(tip)}</title>` : ''}`
  // the chair (and the screen's glow on the wall), the figure, the desk with its plaque in the project's color
  s += use(c, `rm-k${glow}`) + castFigure(c, agent, script, d.id ?? d.title ?? '', 22, 12) + use(c, `rm-d${glow}`, 0, 0, ` color="${proj}"`)
  if (d.cls === 'working' || d.cls === 'thinking' || d.cls === 'asking') s += use(c, 'rm-kb')
  s += use(c, `rm-m${scr}`)
  if (d.cls === 'waiting') {
    const m = d.meetings?.[0]
    const n = d.interns?.length ?? 0
    let t = m ? `${m.agents_done ?? 0}/${m.agents_total ?? 0}` : n ? `ix${Math.min(n, 9)}` : 'i'
    if (t.length > 3) t = `>${Math.min(99, m?.agents_running ?? 0)}`
    s += pixText(t, 5 + Math.floor((16 - pixWidth(t)) / 2), 12, ROLE.wait)
  }
  // a screen at work flickers; a turn that is over leaves a still sign on it
  if (!IDLE_CLASSES.has(d.cls) && c.animate) s += use(c, `fl${fnv1a(d.id) % 3}`, 5, 10)
  // what makes the desk its own: a duck on the monitor, a lamp on the corner… (kept when the desk dozes)
  s += accessories(c, d.id ?? d.title ?? '', d.project, { trophy, coffee: d.cls !== 'dozing' })
  // bubbles and props: thought dots, the big '?' over a raised hand (up into the wall LIFT leaves over the row), the
  // boss's waiting dots, z's and a mug for a dozer
  if (d.cls === 'thinking') s += use(c, 'bt', 41, 1)
  else if (d.cls === 'asking') s += use(c, 'bq', 30, -7)
  else if (d.cls === 'waiting') s += use(c, 'bw', 42, 4)
  else if (d.cls === 'dozing') s += use(c, 'mug', 18, 20, ` color="${proj}"`) + use(c, 'zz', 41, 6)
  // interns: mini Clawds on a bench in front of the desk
  const interns = (d.interns ?? []).filter((i) => i && i.type !== 'workflow-subagent')
  if (interns.length) {
    const shown = interns.length > 4 ? 3 : interns.length
    const bw = INTERN * Math.min(4, interns.length) + 1
    s += paint([[0, 26, bw, 6, '#000/.35']]) + paint([[0, 32, bw, 1, '#d9b27a'], [0, 33, bw, 1, '#a07a48'], [1, 34, 2, 2, '#3a2a1c'], [bw - 3, 34, 2, 2, '#3a2a1c']])
    interns.slice(0, shown).forEach((it, i) => {
      const tipI = `${jobTitle(it.type)} · ${clip(it.description ?? '', 40)}`
      const mini = use(c, pose(it.agent ?? agent, `I${i % 2}`), 1 + i * INTERN, 26)
      s += titled ? `<g><title>${esc(tipI)}</title>${mini}</g>` : mini
    })
    if (interns.length > 4) s += pixText(`+${Math.min(99, interns.length - 3)}`, 3 + 3 * INTERN, 27, ROLE.intern)
  }
  return s + '</g>'
}

// What a desk's interns are, in a few words: '2 interns: 1 researcher, 1 generalist', or the one's job and task.
function internWords(interns) {
  if (interns.length === 1) return `${jobTitle(interns[0].type)} · ${interns[0].description ?? ''}`
  const jobs = new Map()
  for (const i of interns) jobs.set(jobTitle(i.type), (jobs.get(jobTitle(i.type)) ?? 0) + 1)
  return `${interns.length} interns: ${[...jobs].map(([j, n]) => `${n} ${j}${n > 1 ? 's' : ''}`).join(', ')}`
}

// A desk's tag on the slab under it, `w` wide from (x, y): its title over what it is at (brief), in its state's color.
function deskTag(ctx, d, x, y, w) {
  const name = d.title || d.project || d.id || 'desk'
  const mark = YOURS.has(d.cls) ? CLASS_COLOR[d.cls] : null
  // its time after its words where the tag has room for it whole (a row of five or six desks may not), else its words
  const [words, time] = brief(ctx, d)
  const said = time && tagFits(`${words} · ${time}`, w, mark) ? `${words} · ${time}` : words
  ctx.tags.push({ x, y, w, mark, rows: [[...(d.account ? [[`@${d.account}`, accountColor(d.account)]] : []), [name, d.cls === 'dozing' ? ROLE.dim : ROLE.title]],
    [[said, CLASS_COLOR[d.cls]]]] })
}

// The card a desk shows while the pointer rests on it (the lines a desk that needs you writes under it): its title, what
// it is doing and on what branch, its interns, the trophy's reason.
function deskCard(ctx, d, x, y, trophy = false) {
  const interns = (d.interns ?? []).filter((i) => i && i.type !== 'workflow-subagent')
  const branch = d.branch && !/^(main|master)$/.test(d.branch) ? d.branch : ''
  hoverCard(ctx, [x, y, 48, ROW], [
    [...(d.account ? [[`@${d.account}`, accountColor(d.account)]] : []), [d.title || d.project || d.id || 'desk', ROLE.title]],
    [[doing(d), CLASS_COLOR[d.cls]], ...(branch ? [[branch, ROLE.dim]] : [])],
    interns.length ? [[internWords(interns), ROLE.intern]] : [],
    trophy ? [['longest shift on the floor', ROLE.accent]] : [],
  ])
}

// Two label lines on the slab under a desk that needs you (NEEDY), for paintBands' groups (which set the font and the
// usual color): { title, act }. With interns (and animation) line 2 alternates activity ↔ interns.
function deskLabels(ctx, d, x, y, w) {
  const dim = d.cls === 'dozing'
  const name = d.title || d.project || d.id || 'desk'
  // an account's desks carry its name before their title ('@work Final arcade…'), in the account's color
  const title = d.account
    ? spans(x, y + 7, 5.5, [[`@${d.account}`, accountColor(d.account)], [fit(name, w - textW(`@${d.account} `, 5.5), 5.5), dim ? ROLE.dim : ROLE.title]], '', ' ')
    : `<text x="${r1(x)}" y="${r1(y + 7)}"${dim ? ` fill="${ROLE.dim}"` : ''}>${esc(fit(name, w, 5.5))}</text>`
  const line = (s, fill) => `<text x="${r1(x)}" y="${r1(y + 14)}" fill="${fill}">${esc(fit(s, w, 5))}</text>`
  const act = line(doing(d), CLASS_COLOR[d.cls])
  const interns = (d.interns ?? []).filter((i) => i && i.type !== 'workflow-subagent')
  if (!interns.length || !ctx.animate) return { title, act }
  const who = internWords(interns)
  const p = phase(d.id, 8)
  return { title, act: `<g>${act}${aO(ctx, '1;0', 8, p)}</g><g opacity="0">${line(who, ROLE.intern)}${aO(ctx, '0;1', 8, p)}</g>` }
}

function drawRoom(ctx, it, top, BH) {
  const { x, w } = it
  let fore = ''
  let labels = ''
  let acts = ''
  const desks = it.desks
  // the nameplate and the headcount strip, which says the counts (each desk's tag says the rest): how the room stands
  // now, not the lines its commits moved over the range
  const q = ctx.quiet
  const shell = roomShell(ctx, it, x, top, w, BH, [], stripOf(it.all ?? desks))
  const P = shell.P
  let back = ''
  const sw = clamp(Math.floor((w - 6) / it.k), SW, SW_MAX)
  const x0 = x + Math.floor((w - it.k * sw) / 2)
  let floor = top + BH
  const hangs = new Set()
  const paper = paperOf(ctx, it.name)
  for (let r = 0; r < it.rows; r++) {
    // each row the desks' height and LIFT's wall over them; the rows under it and the slabs between, from the bottom
    floor = top + BH - it.gaps.slice(r).reduce((a, g) => a + ROW + LIFT + g, 0)
    rowParts(ctx, P, x, floor, w, true, r ? floor - ROW - LIFT : top + HEAD, paper, false)
    if (r < it.rows - 1) back += paint([[x, floor + 3, w, it.gaps[r] - 3, K.slab]])
    const seats = desks.slice(r * it.k, r * it.k + it.k)
    const xs = []
    for (let i = 0; i < it.k; i++) {
      const sx = x0 + i * sw
      const d = seats[i]
      if (!d) {
        fore += plantAt(ctx, sx + Math.floor(sw / 2) - 5, floor)
        continue
      }
      const dx = sx + Math.floor((sw - 48) / 2)
      xs.push(dx)
      ctx.band.lights.push([dx + 24, r === 0 ? top : floor - ROW - LIFT, floor - 12])
      fore += deskSvg(ctx, d, dx, floor - ROW, d === it.trophy, !q || NEEDY.has(d.cls))
      if (!q) {
        deskTag(ctx, d, sx + 3, floor + TAG_Y, sw - 6)
        continue
      }
      if (!NEEDY.has(d.cls)) {
        deskCard(ctx, d, dx, floor - ROW, d === it.trophy)
        continue
      }
      const label = deskLabels(ctx, d, sx + 3, floor + TAG_Y, sw - 5)
      labels += label.title
      acts += label.act
    }
    back += wallDecor(ctx, `${it.name}:${r}`, x, w, xs, floor, it.color, hangs)
    carpet(ctx, x, w, floor, it.color)
  }
  back += shell.head
  if (w - it.k * sw >= 28) fore += plantAt(ctx, x + w - 13, floor)
  // the office cat walks through the first room drawn (in through one wall, out through the other: clipped to the room)
  if (!ctx.catWalks && !ctx.caps?.art && ctx.animate) {
    ctx.catWalks = true
    fore += `<clipPath id="${ctx.id}rm-catp"><rect x="${x + 2}" y="${top}" width="${w - 4}" height="${BH}"/></clipPath>` +
      `<g clip-path="url(#${ctx.id}rm-catp)">${catWalk(ctx, x, w, floor, it.name)}</g>`
  }
  return { back, fore, labels, acts }
}

// The meeting room: a cell a running workflow, its whiteboard (the phase, a mark an agent, `5/9 done`, quiet too) and its
// attendees around the table; its name and how far it is in the tag under it (quiet, in the card over it).
function drawMeeting(ctx, it, top, BH) {
  const { x, w } = it
  let fore = ''
  const more = it.list.length - it.cells.length
  const q = ctx.quiet
  // its counts are its tables' tags (quiet, their cards); the tables it has no room for, counted
  const shell = roomShell(ctx, { name: 'MEETING ROOM', color: ROLE.meeting }, x, top, w, BH, more > 0 && !q ? [[`+${more} more`, ROLE.dim]] : [])
  let back = ''
  // room to spare: a plant in each corner, party balloons tied to the left one
  if (w - Math.max(...it.rows.map((r) => r.w)) >= 40) {
    fore += plantAt(ctx, x + 3, top + BH) + plantAt(ctx, x + w - 14, top + BH) + use(ctx, 'lv-balloons', x + 4, top + BH - 25)
  }
  const paper = paperOf(ctx, 'MEETING ROOM')
  it.rows.forEach((row, r) => {
    const floor = top + BH - (it.rows.length - 1 - r) * (ROW + LIFT + it.gap)
    rowParts(ctx, shell.P, x, floor, w, true, r ? floor - ROW - LIFT : top + HEAD, paper)
    if (r < it.rows.length - 1) back += paint([[x, floor + 3, w, it.gap - 3, K.slab]])
    let cx = x + 3 + Math.floor((w - 6 - row.w) / 2)
    for (const cell of row.cells) {
      const { m, running, seats } = cell
      const y = floor - ROW
      const done = m.agents_done || 0
      const failed = m.agents_failed || 0
      const total = Math.max(m.agents_total || 0, done + failed + running)
      // what it is: in its tooltip and its tag; quiet, in the card its table shows (below), whose hit box covers it
      const tip = `${clip(m.name ?? 'workflow', 60)} · ${clip(m.phase ?? '', 30)} · ${running} running · ${done}/${total} done` +
        (failed ? ` · ${failed} failed` : '')
      let g = `<g transform="translate(${cx} ${y})">${q ? '' : `<title>${esc(tip)}</title>`}` + use(ctx, 'board', 2, 4)
      g += txt(5, 11, fit(m.phase || 'meeting', 40, 5), 5, '#8a3fa8')
      if (total <= 12) {
        const marks = []
        const put = (n, col, size) => {
          for (let i = 0; i < n; i++) {
            const mx = 5 + marks.length * 3
            marks.push([mx, 14 + (size === 1 ? 1 : 0), size, size, col])
          }
        }
        put(done, '#3d6e12', 2)
        put(failed, '#c0392b', 2)
        put(running, '#9a3fb5', 2)
        put(Math.max(0, total - done - failed - running), '#9a917f', 1)
        g += paint(marks)
      } else {
        g += spans(5, 17, 4.5, [[`✓${done}`, '#3d6e12'], [`o${running}`, '#9a3fb5'], failed && [`×${failed}`, '#c0392b'],
          [`·${Math.max(0, total - done - failed - running)}`, '#7a6f5c']].filter(Boolean), '', ' ')
      }
      g += txt(5, 22, `${done}/${total} done`, 5, '#3d6e12')
      // the table, attendees behind it
      const tx = 54
      const tw = Math.max(2, seats) * SEAT + 4
      const sx0 = tx + 2 + Math.floor((tw - 4 - seats * SEAT) / 2)
      const extra = running > seats
      ctx.band.lights.push([cx + tx + Math.floor(tw / 2), r === 0 ? top : floor - ROW - LIFT, floor - 13])
      for (let i = 0; i < seats; i++) {
        if (extra && i === seats - 1) continue
        // the desk's own characters around the table, watching the whiteboard, nodding along (three timelines a room)
        g += castFigure(ctx, cell.d?.agent, 'meet', `${m.id ?? m.name}:${i}`, sx0 + i * SEAT, 11, { shared: i })
      }
      if (!running && !q) g += txt(tx + tw / 2, 18, 'wrapping up', 4.5, ROLE.dim, ' text-anchor="middle"')
      g += paint([[tx, 23, tw, 1, '#c9a26b'], [tx, 24, tw, 1, '#8f6d43'], [tx + 1, 25, tw - 2, 3, '#6e5233'], [tx + 1, 28, 2, 8, '#6e5233'],
        [tx + tw - 3, 28, 2, 8, '#6e5233']])
      if (extra) g += pixText(`+${Math.min(99, running - seats + 1)}`, sx0 + (seats - 1) * SEAT + 7, 14, ROLE.meeting)
      fore += g + '</g>'
      const toGo = Math.max(0, total - done - failed - running)
      const said = [[[m.name ?? 'workflow', ROLE.title]],
        [[`${running} running`, ROLE.meeting], failed && [`${failed} failed`, ROLE.warn], [`${toGo} to go`, ROLE.dim]].filter(Boolean)]
      if (q) hoverCard(ctx, [cx, y, cell.w, ROW], said)
      else ctx.tags.push({ x: cx + 2, y: floor + TAG_Y, w: cell.w - 4, rows: said })
      cx += cell.w + 4
    }
  })
  return { back: back + shell.head, fore, labels: '' }
}

// The kitchen: the water cooler, who is on break chatting by it with a mug of their project's color (each said in its
// card), the coffee counter; empty, the office cat or the robot vacuum.
function drawKitchen(ctx, it, top, BH) {
  const { x, w } = it
  const floor = top + BH
  const lit = !(it.empty && ctx.night)
  // who is on a break is its tag's (quiet, each one's card)
  const shell = roomShell(ctx, { name: 'KITCHEN', color: ROLE.idle }, x, top, w, BH, [], null, null, lit)
  rowParts(ctx, shell.P, x, floor, w, lit, top + HEAD, 'rm-tiles')
  if (lit) ctx.band.lights.push([x + Math.floor(w / 2), top, floor - 14])
  const back = shell.head
  let fore = use(ctx, 'cooler', x + 4, floor - 24)
  // paper bunting under the header, across the room
  const swags = Math.floor((w - 6) / 30)
  for (let i = 0, bx = x + Math.floor((w - swags * 30) / 2); i < swags; i++, bx += 30) fore += use(ctx, 'lv-bunt', bx, top + HEAD + 1)
  it.breaks.slice(0, it.shown).forEach((d, i) => {
    const fx = x + 18 + i * KP
    // a standing character, chatting (neighbours face each other, a speech bubble over each in turn), a mug of the
    // project's color in its right hand; who it is in its tooltip, or quiet, in the card over it
    const tip = ctx.quiet ? '' : [clip(d.project, 40), clip(d.title, 60), whoOf(ctx, d), `on break (${since(ctx, d)})`].filter(Boolean).join(' · ')
    const chat = ctx.animate ? `<g opacity="0">${use(ctx, 'lv-chat', fx + (i % 2 ? 3 : 13), floor - 23)}${aO(ctx, '0;1;1;0;0;0;0;0', 6, -i * 2.3)}</g>` : ''
    fore += `<g>${tip ? `<title>${esc(tip)}</title>` : ''}${castFigure(ctx, d.agent, i % 2 ? 'chat1' : 'chat0', d.id ?? `kitchen:${i}`, fx, floor - 15, { shared: i })}` +
      `${use(ctx, 'mug', fx + 23, floor - 13, ` color="${ctx.color(d.project)}"`)}${chat}</g>`
    if (ctx.quiet) {
      hoverCard(ctx, [fx, floor - 16, KP, 16], [[[d.title || d.project || 'on break', ROLE.title]],
        [[shortName(d.project ?? ''), ctx.color(d.project)], ['on break', ROLE.idle]].filter((g) => g[0])])
    }
  })
  if (it.breaks.length > it.shown) fore += pixText(`+${Math.min(99, it.breaks.length - it.shown)}`, x + 18 + it.shown * KP, floor - 16, ROLE.idle)
  const coffee = x + Math.min(w - 27, 18 + Math.max(it.shown, 2) * KP + (it.breaks.length > it.shown ? 14 : 0) + 12)
  // the coffee counter, the shelf over it with the microwave and the fruit, and the fridge beside it where the room has
  // the width (clear of the plant in the corner and of the office cat's spot)
  fore += use(ctx, 'coffee', coffee, floor - 18) + use(ctx, 'lv-shelf', coffee, floor - 30)
  if (coffee + 27 + 12 <= x + w - (w >= 150 ? 16 : 3) - (it.cat ? 30 : 0)) fore += use(ctx, 'lv-fridge', coffee + 27, floor - 27)
  if (w >= 150) fore += plantAt(ctx, x + w - 13, floor)
  if (it.empty) {
    // with no dark room upstairs the office cat keeps the kitchen (the glance line promises it), clear of the vacuum
    const top = it.cat ? `<g><title>the office cat</title>${use(ctx, 'cat', x + w - 30, floor - 6)}</g>` : ''
    if (ctx.night) {
      const step = Math.max(2, Math.floor((w - 60) / 4))
      const laps = Array.from({ length: 8 }, (_, i) => `${(i < 5 ? i : 8 - i) * step} 0`).join(';')
      fore += use(ctx, 'vac', x + 18, floor - 4, '', aT(ctx, laps, 6.4))
    }
    return { back, fore, top, labels: '' }
  }
  // its tag: how many on a break, and from which projects
  if (!ctx.quiet) {
    const counts = new Map()
    for (const d of it.breaks) counts.set(d.project, (counts.get(d.project) ?? 0) + 1)
    ctx.tags.push({ x: x + 3, y: floor + TAG_Y, w: w - 6, rows: [[[`${it.breaks.length} on break`, ROLE.idle]],
      [...counts].map(([p, n]) => [`${shortName(p)}${n > 1 ? ` ×${n}` : ''}`, ctx.color(p)])] })
  }
  return { back, fore, labels: '' }
}

// Empty office: dark rooms with tidy desks, the cat on the first one at night.
function drawDark(ctx, it, top, BH, first) {
  const { x, w } = it
  const floor = top + BH
  const q = ctx.quiet
  const shell = roomShell(ctx, it, x, top, w, BH, [], null, null, !ctx.night)
  rowParts(ctx, shell.P, x, floor, w, !ctx.night, top + HEAD, paperOf(ctx, it.name))
  let fore = ''
  let cat = ''
  const x0 = x + Math.floor((w - it.g * SW) / 2)
  for (let i = 0; i < it.g; i++) {
    const sx = x0 + i * SW + 3
    fore += `<g transform="translate(${sx} ${floor - ROW})">${use(ctx, 'rm-chair')}${use(ctx, 'rm-desk', 0, 0, ` color="${it.color}"`)}${use(ctx, 'rm-moff')}` +
      `${accessories(ctx, `${it.name}#${i}`, it.name, { coffee: false, lit: false })}</g>`
    if (first && i === 0 && ctx.night) cat = `<g><title>the office cat</title>${use(ctx, 'cat', sx + 26, floor - 17)}</g>`
  }
  if (w - it.g * SW >= 24) fore += plantAt(ctx, x + w - 13, floor)
  const decor = wallDecor(ctx, `${it.name}:0`, x, w, Array.from({ length: it.g }, (_, i) => x0 + i * SW + 3), floor, it.color)
  const today = it.minutes ? ` · ${fmtMinutes(it.minutes)} agent-time today` : ''
  const lbl = it.left ? `last out ${agoText(ctx, it.left)}${today}` : `lights left on${today}`
  if (!q) ctx.tags.push({ x: x + 3, y: floor + TAG_Y, w: w - 6, rows: [[[lbl, ROLE.dim]]] })
  return { back: decor + shell.head, fore, top: cat, labels: '' }
}

// ---------------------------------------------------------------- 1F: the street front

// The ground floor is the building's front on the street, seen from the sidewalk: the brick shell with shop windows, a
// grand entrance under a canopy that says THE OFFICE, street lamps, potted plants, a bench, a hydrant, trees; and on
// the sidewalk the agents going around (passersBy). The door is drawn at the building's scale, not Clawd's: it is the
// way into five floors. Its sprites are 'fr-' (the desk accessories are the 'lv-' ones).
const DOOR_W = 40
const DOOR_H = 40
const WIN_W = 36
const FR = { stone: '#8a8072', stoneHi: '#a39886', frame: '#2b2520', awning: '#7a2e2a', awningHi: '#a54a3c', awningD: '#5a201d', brass: '#c9a26b' }
// The glass of the door and the windows: sky by day, warm with someone in at night, dark when the office is empty.
const GLASS = { day: '#a9d3ee', lit: '#f3dca0', dark: '#1c2742' }

// The street's light by night in flat bands on the pixel grid, each a thin warm wash over the ones outside it, so it
// steps down in a few clean rings, brightest at its heart (no dither: its dots read as glitter): `bands` [[reach,
// opacity], …] ellipses round (cx, cy), reach along x and `squash` of it down y, as row runs for paint() (rows that
// repeat one rect); `rows` [y0, y1) clips them.
function glowRects(cx, cy, bands, { squash = 1, rows = null, color = '#ffd27a' } = {}) {
  const r = []
  for (const [reach, op] of bands) {
    const [y0, y1] = rows ?? [Math.floor(cy - reach * squash), Math.ceil(cy + reach * squash)]
    for (let y = y0; y < y1; y++) {
      const dy = (y + 0.5 - cy) / squash
      if (Math.abs(dy) > reach) continue
      const half = Math.sqrt(reach * reach - dy * dy)
      const x0 = Math.ceil(cx - half - 0.5)
      const w = Math.floor(cx + half - 0.5) - x0 + 1
      if (w > 0) r.push([x0, y, w, 1, light(color, op)])
    }
  }
  return stacked(r)
}
// A lit window's bloom on the brick round it (w × h): each band the window grown by its reach, its corners round.
function bloomRects(w, h, bands, color = '#ffd98a') {
  const r = []
  for (const [reach, op] of bands) {
    for (let y = -Math.ceil(reach); y < h + Math.ceil(reach); y++) {
      const out = Math.max(0, -(y + 0.5), y + 0.5 - h)
      if (out > reach) continue
      const grow = Math.floor(Math.sqrt(reach * reach - out * out))
      r.push([-grow, y, w + 2 * grow, 1, light(color, op)])
    }
  }
  return stacked(r)
}
// a fill of light, its opacity written short ('#ffd27a/.05')
const light = (color, op) => `${color}/${String(op).replace(/^0\./, '.')}`
// row runs one under another, as wide and of one fill, as one rect
function stacked(rects) {
  const out = []
  for (const r of rects) {
    const p = out.at(-1)
    if (p && p[4] === r[4] && p[0] === r[0] && p[2] === r[2] && p[1] + p[3] === r[1]) p[3] += r[3]
    else out.push([...r])
  }
  return out
}
// Light out of an opening at x, w wide, on the sidewalk's 3 rows under it: `bands` [[rows, inset, opacity], …], each
// from the wall toward the curb `rows` deep, `inset` in from the opening's sides, a pixel wider each side each row.
const spillRects = (x, w, groundY, bands, color) => bands.flatMap(([deep, inset, op]) =>
  Array.from({ length: deep }, (_, y) => [x + inset - y, groundY + y, w - 2 * inset + 2 * y, 1, light(color, op)]))
const HALO = [[11, 0.045], [7, 0.09], [3.5, 0.22]]
const BLOOM = [[5, 0.03], [2, 0.07]]
// A reflection streak climbing a pane from (x, y), by day.
const streak = (x, y) => [0, 1, 2, 3].map((i) => [x + i, y - 2 * i, 1, 2, '#ffffff/.35'])

// A shop window (36 × 29): a stone lintel, a dark frame round a transom and two panes, a stone sill and its shadow.
function shopWindow(state) {
  const g = GLASS[state]
  const rects = [[0, 0, WIN_W, 2, FR.stone], [0, 0, WIN_W, 1, FR.stoneHi], [1, 2, WIN_W - 2, 24, FR.frame], [2, 3, WIN_W - 4, 5, g], [2, 9, 15, 16, g],
    [19, 9, 15, 16, g], [0, 26, WIN_W, 2, FR.stone], [0, 26, WIN_W, 1, FR.stoneHi], [1, 28, WIN_W - 2, 1, '#000/.3']]
  if (state === 'day') rects.push(...streak(4, 21), ...streak(21, 21), ...streak(26, 6))
  // lit: a pendant lamp in each pane; dark: the stars in the glass
  else if (state === 'lit') rects.push(...[9, 26].flatMap((x) => [[x, 9, 1, 2, FR.frame], [x - 2, 11, 5, 2, '#5d4630'], [x - 1, 13, 3, 1, '#fff2c4']]), [2, 21, WIN_W - 4, 4, '#c9a26b/.35'])
  else rects.push([5, 12, 1, 1, '#6f91dc'], [27, 15, 1, 1, '#6f91dc'], [12, 4, 1, 1, K.star])
  // lit, its light blooms faintly on the brick round it, under the window
  return (state === 'lit' ? paint(bloomRects(WIN_W, 29, BLOOM)) : '') + paint(rects)
}

// A street lamp (7 × 44): a lantern on a post; lit at night, a halo round the lantern in flat bands, brightest at the
// glass, over it, and a pool of light on the sidewalk round its foot (its 3 rows under the sprite).
function streetLamp(on) {
  const lamp = sprite(['..ccc..', '.ccccc.', '.cgggc.', '.cgggc.', '.cgggc.', '..ccc..', ...Array(35).fill('...p...'), '..ppp..', '.ppppp.', '.ppppp.'],
    { c: '#2b2f36', g: on ? '#ffe08a' : '#d8dce4', p: '#4a4f58' })
  if (!on) return lamp
  return paint(glowRects(3.5, 44, [[14, 0.06], [7, 0.12]], { squash: 0.25, rows: [44, 47] })) + lamp + paint(glowRects(3.5, 3.5, HALO))
}

defineSprites({
  'fr-shop': () => shopWindow('day'),
  'fr-shopN': () => shopWindow('lit'),
  'fr-shopD': () => shopWindow('dark'),
  'fr-lamp': () => streetLamp(false),
  'fr-lampN': () => streetLamp(true),
  // a park bench (22 × 9): two back rails, a seat, iron legs
  'fr-bench': () => sprite(['wwwwwwwwwwwwwwwwwwwwww', 'WWWWWWWWWWWWWWWWWWWWWW', '.k..................k.', 'wwwwwwwwwwwwwwwwwwwwww', '.k..................k.',
    'ssssssssssssssssssssss', 'SSSSSSSSSSSSSSSSSSSSSS', '.k..................k.', 'kk..................kk'],
  { w: '#9a7b4f', W: '#7a5a3a', s: '#b08a58', S: '#6e5233', k: '#3a3f48' }),
  // a fire hydrant (7 × 10)
  'fr-hydrant': () => sprite(['..rrr..', '.rRRRr.', '.rrrrr.', 'rrrrrrr', '.rDrDr.', '.rrrrr.', '.rrrrr.', '.rrrrr.', '.rrrrr.', 'rrrrrrr'],
    { r: '#c0392b', R: '#e05a4a', D: '#8a2a20' }),
  // a sidewalk tree (19 × 28): a full crown lit from the upper left, a trunk, an iron grate round its foot
  'fr-tree': () => sprite(['........LLl........', '.....LLLLllll......', '.....LLLllllllL....', '...LLLLdLlllllll...', '..LLLllllllllllLl..', '..LLlldllLlllllll..',
    '..LLlllllllllldlL..', '..llldllllLlllllld.', '.lllLlllllllldllddd', '.llldllllllLlllddd.', 'lllllLlllllldlddddd', '.lldllllllllddddddd', '.lllllLlllldddddddd',
    '..dllllllldddddddd.', '...lll.LtT.dddddd..', ...Array(10).fill('........tT.........'), '.......ttTT........', '....ggggggggggg....', '....g.g.g.g.g.g....'],
  { L: '#7fae4a', l: '#4f7f34', d: '#3b6528', t: '#6e4a2e', T: '#4f3420', g: '#3a3f48' }),
})

// The entrance at the middle of the street front, its foot on the sidewalk at groundY: stone pilasters, a glass double
// door under a transom, brass push bars, a red canopy over it with THE OFFICE on its valance, a lamp under each end
// at night; 'closed' hangs on the door when the office is empty at night.
function entrance(ctx, cx, groundY, state) {
  const dx = cx - DOOR_W / 2
  const top = groundY - DOOR_H
  const g = GLASS[state]
  const cw = DOOR_W + 20
  const rects = [
    [dx - 6, top - 1, 5, DOOR_H + 1, FR.stone], [dx - 6, top - 1, 1, DOOR_H + 1, FR.stoneHi], [dx + DOOR_W + 1, top - 1, 5, DOOR_H + 1, FR.stone],
    [dx + DOOR_W + 1, top - 1, 1, DOOR_H + 1, FR.stoneHi], [dx - 1, top, DOOR_W + 2, DOOR_H, FR.frame], [dx + 1, top + 2, DOOR_W - 2, 6, g],
    [dx + 1, top + 10, 18, DOOR_H - 10, g], [dx + 21, top + 10, 18, DOOR_H - 10, g], [dx + 13, top + 2, 1, 6, FR.frame], [dx + 26, top + 2, 1, 6, FR.frame],
    [dx + 16, top + 22, 1, 8, FR.brass], [dx + 23, top + 22, 1, 8, FR.brass], [dx + 1, groundY - 4, 18, 4, '#6e5233'], [dx + 21, groundY - 4, 18, 4, '#6e5233'],
    [dx - 10, top - 11, cw, 9, FR.awning], [dx - 10, top - 11, cw, 1, FR.awningHi], [dx - 10, top - 3, cw, 1, FR.awningD],
    ...Array.from({ length: cw / 4 }, (_, i) => [dx - 10 + i * 4, top - 2, 2, 1, FR.awningD]),
  ]
  if (state !== 'dark') rects.push([dx + 3, top + 12, 2, DOOR_H - 18, '#ffffff/.25'], [dx + 23, top + 12, 2, DOOR_H - 18, '#ffffff/.25'])
  if (state !== 'day') rects.push([dx - 8, top - 2, 2, 1, '#ffe08a'], [dx + DOOR_W + 6, top - 2, 2, 1, '#ffe08a'], [dx - 9, top - 1, 4, 3, '#ffd27a/.25'],
    [dx + DOOR_W + 5, top - 1, 4, 3, '#ffd27a/.25'])
  let s = paint(rects) + txt(cx, top - 4, 'THE OFFICE', 5, ROLE.accent, ' text-anchor="middle" font-weight="bold" letter-spacing=".4"')
  if (state === 'dark') s += paint([[cx - 11, top + 14, 22, 7, FR.frame], [cx - 11, top + 21, 22, 1, '#000/.35']]) + txt(cx, top + 19, 'closed', 4.5, ROLE.night, ' text-anchor="middle"')
  return s
}

// How many windows of WIN_W fit in [x0, x1], 14 apart at least.
const windowsFit = (x0, x1) => Math.max(0, Math.floor((x1 - x0 + 14) / (WIN_W + 14)))

// `n` windows spread over [x0, x1], as far apart as the room leaves (40 at most): their x, left to right.
function windowsIn(x0, x1, n) {
  if (!n) return []
  const gap = n > 1 ? Math.min(40, Math.floor((x1 - x0 - n * WIN_W) / (n - 1))) : 0
  const start = x0 + Math.floor((x1 - x0 - (n * WIN_W + (n - 1) * gap)) / 2)
  return Array.from({ length: n }, (_, i) => start + i * (WIN_W + gap))
}

/**
 * The street front between the piers (IX0…IX1), from `top` down to the sidewalk at top + h: the shop windows and the
 * entrance on the brick (`facade`), and what stands on the sidewalk in front of them (`street`: the lamps, the plants
 * either side of the door, a hydrant, a bench, a tree at each end of a wide front); lit, the light of its windows and
 * its door on the sidewalk (`glow`). Returns { facade, street, glow }.
 * Exported so the composer can lend it (the timelapse's ground floor, lit as the replay goes).
 */
export function frontage(ctx, top, h, IX0, IX1) {
  const { W, desks, night } = ctx
  const groundY = top + h
  const state = night ? (desks.length ? 'lit' : 'dark') : 'day'
  const cx = Math.floor(W / 2)
  const dx = cx - DOOR_W / 2
  // a lamp each side of the canopy, the windows beyond them: as many each side, mirrored about the door
  const lamps = [dx - 19, dx + DOOR_W + 12]
  const left = windowsIn(IX0 + 6, lamps[0] - 6, Math.min(windowsFit(IX0 + 6, lamps[0] - 6), windowsFit(lamps[1] + 13, IX1 - 6)))
  const right = left.map((x) => 2 * cx - x - WIN_W).reverse()
  const win = `fr-shop${{ day: '', lit: 'N', dark: 'D' }[state]}`
  const facade = [...left, ...right].map((x) => use(ctx, win, x, groundY - 39)).join('') + entrance(ctx, cx, groundY, state)
  let street = lamps.map((x) => use(ctx, night ? 'fr-lampN' : 'fr-lamp', x, groundY - 44)).join('')
  street += use(ctx, 'plant', dx - 13, groundY - 12) + use(ctx, 'plant', dx + DOOR_W + 3, groundY - 12)
  if (lamps[0] - 12 >= IX0 + 2) street += use(ctx, 'fr-hydrant', lamps[0] - 12, groundY - 10)
  if (lamps[1] + 36 <= IX1 - 2) street += use(ctx, 'fr-bench', lamps[1] + 14, groundY - 9)
  if (left.length > 1) street += use(ctx, 'fr-tree', IX0 + 2, groundY - 28)
  if (right.length > 1) street += use(ctx, 'fr-tree', IX1 - 21, groundY - 28)
  // lit, the light out of its shop windows and its door on the sidewalk (apart: the timelapse lights its front by night
  // whoever is in, so it leaves this out)
  const glow = state === 'lit' ? paint([...[...left, ...right].flatMap((x) => spillRects(x, WIN_W, groundY, [[3, -1, 0.05], [2, 3, 0.06]], '#ffd98a')),
    ...spillRects(dx, DOOR_W, groundY, [[3, -2, 0.06], [2, 3, 0.08]], '#ffe2a0')]) : ''
  return { facade, street, glow }
}

// Walking pace on the sidewalk, viewBox units a second.
const PACE = 11

/**
 * The agents going around on the sidewalk, their feet at groundY, in front of the street front: who just left walks
 * out of the door and off down the street (up to 3; a tooltip says who and when), live visitors (other agents, via
 * novi: the robots, up to 2) walk up to the door and go in, and passers-by of the office's cast (ctx.pick) stroll from
 * one end to the other until the street holds as many as its width (2 to 5), so it is never empty. Each on a loop of
 * its own, phased by its key; drawn still, spread along the street, when not animating.
 */
function passersBy(ctx, groundY) {
  const { W, f } = ctx
  const door = Math.floor(W / 2) - 12
  const people = []
  ;(f.live?.recently_left ?? []).filter(Boolean).slice(0, 3).forEach((l, i) => {
    const who = agentId(l.agent) === 'claude' ? '' : ` (${CAST[agentId(l.agent)].who})`
    people.push({ kind: 'out', agent: l.agent, right: i % 2 === 0, key: `out:${l.project}:${l.title}:${i}`,
      tip: `${clip(l.project, 40)} "${clip(l.title, 60)}"${who} left ${agoText(ctx, l.left_at)}` })
  })
  ;(f.contractors ?? []).filter((c) => c?.live).slice(0, 2).forEach((v, i) => {
    people.push({ kind: 'in', right: i % 2 === 1, key: `in:${v.tool}:${v.project}:${i}`, tip: `visitor: ${clip(v.tool, 20)} @ ${clip(v.project, 40)}` })
  })
  const most = clamp(Math.floor(W / 110), 2, 5)
  for (let i = 0; people.length < most; i++) people.push({ kind: 'pass', agent: ctx.pick?.(i) ?? 'claude', right: i % 2 === 1, key: `pass:${i}`, tip: '' })
  return people.map((p, i) => {
    const robot = p.kind === 'in'
    const tip = p.tip ? `<title>${esc(p.tip)}</title>` : ''
    // still: spread along the street, each where its sprite is placed
    const at = ctx.animate ? 0 : Math.round(((i + 0.5) / people.length) * W) - 12
    const body = robot ? use(ctx, 'robot', at, groundY - 13, '', aT(ctx, '0 0;0 -1', 0.5)) : use(ctx, pose(p.agent, p.right ? 'Wr' : 'Wl'), at, groundY - 15)
    if (!ctx.animate) return `<g>${tip}${body}</g>`
    // out: from the door off the street; in: from off the street to the door, then gone in; pass: end to end
    const off = p.right ? W + 2 : -27
    const [from, to] = p.kind === 'out' ? [door, off] : p.kind === 'in' ? [p.right ? -27 : W + 2, door + 8] : [p.right ? -27 : W + 2, p.right ? W + 2 : -27]
    const walk = Math.abs(to - from) / PACE
    const dur = r1(walk + 3 + (fnv1a(p.key) % 7))
    const k = Math.round((walk / dur) * 1000) / 1000
    const begin = ` begin="${r1(phase(p.key, dur))}s"`
    const gone = robot ? `<animate attributeName="opacity" values="1;0" keyTimes="0;${k}" dur="${dur}s"${begin} calcMode="discrete" repeatCount="indefinite"/>` : ''
    return `<g>${tip}<animateTransform attributeName="transform" type="translate" values="${from} 0;${to} 0;${to} 0" keyTimes="0;${k};1" dur="${dur}s"${begin} ` +
      `repeatCount="indefinite"/>${gone}${body}</g>`
  }).join('')
}

/**
 * The street front as a ground floor any building can stand on (the Office's 1F; the composer lends it to the week
 * tower as ctx.floors.front): `(ctx, top, h, IX0, IX1) → { facade, street }`. `facade` is the shop windows and the
 * entrance from `top` down to the sidewalk at top + h (56 fits the entrance under its canopy); `street` goes over the
 * sidewalk once the building has painted it: its paving joints, the lamps, the plants, the hydrant, the bench and the
 * trees, and the agents going around (passersBy).
 */
export function streetFront(ctx, top, h, IX0, IX1) {
  const groundY = top + h
  const front = frontage(ctx, top, h, IX0, IX1)
  const joints = `<path stroke="${K.walkD}" stroke-width="3" stroke-dasharray="1 11" d="M5 ${groundY + 1.5}H${ctx.W}"/>`
  return { facade: front.facade, street: joints + front.glow + front.street + passersBy(ctx, groundY) }
}

// Who of each room is drawn when the floor has more desks than the drawing holds (`budget`): room → its desks drawn, in
// their own order. Seated first, the sessions somebody opened that are at work or need them; then a script's workers
// (`worker`) at work; then the rest. Each time a desk goes to each room in turn, so no room takes the floor: a factory's
// fifty workers leave every project its desks, and theirs is the room the "+N more" is of.
function seatsOf(rooms, budget) {
  const rank = (d) => (IDLE_CLASSES.has(d.cls) && !NEEDY.has(d.cls) ? 2 : d.worker ? 1 : 0)
  const want = rooms.map((r) => ({ r, n: 0 }))
  let left = Math.max(0, budget)
  for (const k of [0, 1, 2]) {
    for (const w of want) w.most = w.r.seated.filter((d) => rank(d) <= k).length
    for (let gave = true; gave && left > 0;) {
      gave = false
      for (const w of want) {
        if (left > 0 && w.n < w.most) {
          w.n++
          left--
          gave = true
        }
      }
    }
  }
  return new Map(want.map(({ r, n }) => {
    if (n >= r.seated.length) return [r, r.seated]
    const first = new Set([...r.seated].sort((a, b) => rank(a) - rank(b)).slice(0, n))
    return [r, r.seated.filter((d) => first.has(d))]
  }))
}

// Live floor items: one room per project with seated desks (desks capped), the MEETING ROOM and the KITCHEN; with
// nobody in, the dark rooms of today's busiest projects and the night kitchen, in one band.
function liveItems(ctx, IW) {
  const { f, desks } = ctx
  const items = []
  let hidden = 0
  if (desks.length) {
    const byProject = new Map()
    for (const d of desks) {
      const p = d.project ?? '?'
      if (!byProject.has(p)) byProject.set(p, [])
      byProject.get(p).push(d)
    }
    const rooms = [...byProject].map(([name, all]) => ({ name, all, seated: all.filter((d) => d.cls !== 'break') })).filter((r) => r.seated.length)
    const busy = (r) => r.all.filter((d) => d.cls === 'working' || d.cls === 'thinking' || d.cls === 'waiting').length
    rooms.sort((a, b) => b.all.length - a.all.length || busy(b) - busy(a) || String(a.name).localeCompare(String(b.name)))
    // the longest shift on the floor (2 desks or more) gets the trophy on its monitor
    let trophy = null
    const seated = desks.filter((d) => d.cls !== 'break' && Number.isFinite(ms(d.started_at)))
    if (seated.length > 1) trophy = seated.reduce((a, d) => (ms(d.started_at) < ms(a.started_at) ? d : a))
    const seats = seatsOf(rooms, ctx.caps.desks)
    for (const r of rooms) {
      const take = seats.get(r)
      hidden += r.seated.length - take.length
      if (!take.length) continue
      items.push({ ...roomItem(r.name, take, IW, ctx.color(r.name), ctx.quiet), all: r.all, trophy })
    }
    const meetings = desks.flatMap((d) => d.meetings.map((m) => ({ m, d })))
    if (meetings.length) items.push(meetingItem(meetings, IW, ctx.caps.meetings, ctx.quiet))
    const breaks = desks.filter((d) => d.cls === 'break')
    if (breaks.length) items.push(kitchenItem(breaks, IW, false, ctx.quiet))
    return { items, hidden }
  }
  // dark rooms: projects with minutes today (by today's minutes), else the top 3 of the range; one band with the kitchen
  const today = f.now?.local_date
  let pick = f.projects.filter((p) => (p.per_day?.[today]?.minutes ?? 0) > 0).sort((a, b) => (b.per_day[today].minutes - a.per_day[today].minutes))
  if (!pick.length) pick = f.projects.slice(0, 3)
  const kitchen = kitchenItem([], IW, true, ctx.quiet)
  let used = kitchen.minW
  const leftBy = new Map(f.live.recently_left.map((l) => [l.project, l.left_at]))
  for (const p of pick) {
    const g = clamp(p.per_day?.[today]?.sessions ?? 1, 1, 3)
    const minW = Math.max(g * SW + 6, Math.round(textW(p.name, 5.5) + 16), 96)
    if (used + 3 + minW > IW) continue
    used += 3 + minW
    const minutes = p.per_day?.[today]?.minutes ?? 0
    items.push({ kind: 'dark', name: p.name, color: ctx.color(p.name), g, minW, h: HEAD + ROW + LIFT, minutes, left: leftBy.get(p.name), hasLines: !ctx.quiet })
  }
  kitchen.cat = ctx.night && !items.length
  items.push(kitchen)
  return { items, hidden }
}

// The lines under the building: only what the drawing cannot show, the desks the size budget left out. Who just left
// and the visitors walk the street, the rest is in the tooltips.
function groundLines(hidden) {
  return hidden ? [[[`+${hidden} more desk${hidden > 1 ? 's' : ''} upstairs`, ROLE.dim]]] : []
}

// The floor slabs (each band's `slab` tall), then the bands of rooms over them: the partitions, each room's walls and
// furniture and people; on top their nameplates and the labels, in one paint and a group each: the size budget's
// cheapest place to lay them.
function paintBands(ctx, bands, { IX0, IW }) {
  const empty = !ctx.desks.length
  const lit = !empty || !ctx.night
  // the floor slabs (and the label band on them) stop at the inner walls: the brick shell runs unbroken from the parapet
  // down to the street, as on a real facade, instead of being cut at every floor
  let s = paint(bands.flatMap(({ top, h, slab }) => [[IX0, top + h, IW, slab, K.slab], [IX0, top + h, IW, 2, K.wood], [IX0, top + h + 2, IW, 1, K.woodD]]))
  let labS = ''
  let actS = ''
  ctx.plates = { rects: [], light: [], text: '' }
  for (const b of bands) {
    const top = b.top
    let backS = ''
    let foreS = ''
    ctx.band = bandParts()
    b.items.forEach((it, i) => {
      if (i) ctx.band.walls.push([it.x - 3, top, 3, b.h, K.part], [it.x - 3, top, 1, b.h, K.partHi])
      const r = it.kind === 'room' ? drawRoom(ctx, it, top, b.h) : it.kind === 'meeting' ? drawMeeting(ctx, it, top, b.h)
        : it.kind === 'kitchen' ? drawKitchen(ctx, it, top, b.h) : drawDark(ctx, it, top, b.h, i === 0 && b === bands[0])
      backS += r.back
      foreS += r.fore
      // lights off at night: moonlight tint over the dark rooms, the cat stays bright on top
      if (!lit) foreS += paint([[it.x, top + HEAD, it.w, b.h - HEAD, '#0b1233/.45']]) + (r.top ?? '')
      labS += r.labels
      actS += r.acts ?? ''
    })
    const merged = bandSvg(ctx, ctx.band, top)
    s += merged.back + backS + merged.fore + foreS
  }
  // the tags under the plates: their bars join the plates' paint (the strips' ticks of their colors), drawn over them
  const tags = tagsSvg(ctx.tags, ctx.plates.rects)
  return `${s}${tags}${platesSvg(ctx)}${labS ? `<g font-size="5.5" fill="${ROLE.title}">${labS}</g>` : ''}${actS ? `<g font-size="5">${actS}</g>` : ''}`
}

// ---------------------------------------------------------------- floor numbers and the floor plan

// The building's outer wall, x BX0 to W − BX0 as in every scene (svg-kit sceneHeader's shell), and the plaque a floor
// number sits on: 4.5 px in a dark plate, as the week tower's, as wide as '9F' (or '99F' from the tenth floor up).
const BX0 = 6
const plaqueW = (s) => Math.round(textW(s, 4.5) + 4)

/**
 * The rooms packed into bands (the floors) between the piers. The left pier carries the floor numbers, so it is as
 * wide as the widest of them with a brick either side (12, or 14 in a building of ten floors and more); the right one
 * is the shell's 4. Returns { IX0, IX1, IW, numW, items, hidden, bands }.
 */
function floorPlan(ctx) {
  const at = (widest) => {
    const numW = plaqueW(widest)
    const IX0 = BX0 + numW + 2
    const IX1 = ctx.W - BX0 - 4
    const { items, hidden } = liveItems(ctx, IX1 - IX0)
    return { IX0, IX1, IW: IX1 - IX0, numW, items, hidden, bands: pack(items, IX1 - IX0, IX0) }
  }
  const plan = at('9F')
  // the top band is floor bands + 1 (the lobby is 1F); a narrower plan only ever has more bands
  return plan.bands.length + 1 >= 10 ? at('99F') : plan
}

/**
 * The floor numbers, `[label, y]` (the plate's top), on the left pier as the week tower's: a dark plate with its
 * shadow, the number centered in dim 4.5 px. On the brick or the basement's stone, so they read on any page.
 */
function plaques(ctx, list, x, w) {
  const nums = list.map(([s, y]) => `<text x="${r1(x + w / 2)}" y="${r1(y + 6.5)}">${esc(s)}</text>`).join('')
  return list.map(([, y]) => floorPlate(ctx, x, y, w)).join('') + `<g font-size="4.5" fill="${ROLE.dim}" text-anchor="middle">${nums}</g>`
}

// ---------------------------------------------------------------- B1: what they did, in the basement

// The basement's own paint: the dressed stone of its walls (the b1-stone pattern) and the concrete of its slabs.
const STONE = { face: '#4a463f', joint: '#37342f', hi: '#5a554c', slab: '#45413b', slabHi: '#5f5a51', slabD: '#2a2724' }
defineSprites({
  // stone blocks in courses of four, the joints staggered: the basement walls that carry the brick piers down
  'b1-stone': (c) => `<pattern id="${c.id}b1-stonep" width="12" height="8" patternUnits="userSpaceOnUse"><rect width="12" height="8" fill="${STONE.face}"/>` +
    `<path fill="${STONE.joint}" d="M0 3h12v1H0zM0 7h12v1H0zM5 0h1v3H5zM11 4h1v3h-1z"/><path fill="${STONE.hi}" d="M0 0h5v1H0zM6 4h5v1H6z"/></pattern>`,
})

/**
 * B1 from `top` (right under the sidewalk) down, a cross-section: what they did (ctx.floors.work, svg-work.mjs
 * workFloor: one compact room per kind of work) between stone walls under the brick piers, under a concrete ceiling
 * and over a floor slab, and the ground beside the building cut through (the road's asphalt on soil, in the margins).
 * `level` is workFloor's. Returns { svg, h, gist }; `h` is the same at every level.
 */
function basement(ctx, top, { IX0, IX1 }, level) {
  const { W } = ctx
  const BX1 = W - BX0
  // the floor the composer lends (lib/svg.mjs FLOORS); a scene drawn without one keeps an empty slab
  const floor = ctx.floors?.work
  const inner = floor ? floor(ctx, top + 2, { x0: IX0, width: IX1 - IX0, level }) : { svg: '', h: 0, gist: '' }
  const h = inner.h + 6
  const low = top + 2 + inner.h
  const side = (x, w) => [[x, top, w, 1, UNDER.gutter], [x, top + 1, w, 3, UNDER.road], [x, top + 4, w, 1, UNDER.roadEdge], [x, top + 5, w, h - 5, UNDER.soil],
    ...Array.from({ length: Math.max(0, Math.floor((h - 9) / 9)) }, (_, i) => [x + 1 + ((i * 3) % Math.max(1, w - 3)), top + 9 + i * 9, 2, 1, UNDER.pebble])]
  use(ctx, 'b1-stone') // registers the pattern in <defs>; the <use> of its empty group is never drawn
  const stone = (x, w) => `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="url(#${ctx.id}b1-stonep)"/>`
  const slabs = [[IX0, top, IX1 - IX0, 2, STONE.slab], [IX0, top + 1, IX1 - IX0, 1, STONE.slabD], [IX0, low, IX1 - IX0, 4, STONE.slab],
    [IX0, low, IX1 - IX0, 1, STONE.slabHi], [IX0, low + 3, IX1 - IX0, 1, STONE.slabD]]
  return { svg: paint([...side(0, BX0), ...side(BX1, W - BX1), ...slabs]) + stone(BX0, IX0 - BX0) + stone(IX1, BX1 - IX1) + inner.svg, h, gist: inner.gist }
}

/**
 * The basement at the richest level whose markup and the sprites it adds to <defs> keep the drawing under MAX_SVG,
 * with `used` chars already spoken for: furnished, then its Clawds as tiny figures, then captions only. So a heavy
 * office sheds the basement's furniture before renderSvg's tighter caps take a single desk away.
 */
function basementAt(ctx, top, plan, used) {
  for (let level = 0; ; level++) {
    const c = { ...ctx, defs: new Map(ctx.defs) }
    const out = basement(c, top, plan, level)
    let size = out.svg.length
    for (const [k, v] of c.defs) if (!ctx.defs.has(k)) size += v.length + k.length + 24
    if (used + size <= MAX_SVG || level >= 2) {
      for (const [k, v] of c.defs) if (!ctx.defs.has(k)) ctx.defs.set(k, v)
      // the composer keeps the rooms' full art only when the basement stays furnished (lib/svg.mjs)
      ctx.b1 = level
      return out
    }
  }
}

// ---------------------------------------------------------------- the building's bar

// The bar across the top of the building: its height, its plate, its light along the top, its shade along the foot and
// the rules between its counts
const BAR = Object.freeze({ h: 15, plate: '#14100c', hi: '#4a4038', lo: '#0b0907', rule: '#3a322b' })
/** How far the building's bar sets the floors down, when it is drawn: its plate and the slab under it. */
export const BAR_SPAN = BAR.h + THIN

/**
 * The building's bar from (x, top), `w` wide: how the floors stand, read at a glance from across the pane. On a dark
 * plate under the roof, the headcount strip (a tick a desk, 20 at most, in its state's color), then who works, who needs
 * you (the desks that wait on you: a hand up, an error, a turn stopped or done), who waits on helpers (or is in a
 * meeting) and who is on break, each its pixel icon and its count at the sign's size (5.5), between rules; a count at
 * zero is left out. Only the number and the icon wear the state's color, the words are dim: the bar reads with the
 * building's other labels, not over them, and what needs you still shows by its gold. Too narrow for all of it, who
 * waits on helpers goes first (the strip's purple still says it), then the type comes down to the tags' size, then the
 * strip goes.
 */
function statusBar(ctx, x, top, w) {
  const { desks } = ctx
  const t = tally(desks)
  const yours = desks.filter((d) => YOURS.has(d.cls)).length
  const all = [[t.working, 'working', ROLE.busy, 'ic-work'], [yours, 'need you', ROLE.accent, 'ic-you'],
    [t.waiting, t.meetingWait === t.waiting ? 'in a meeting' : 'with helpers', ROLE.wait, 'ic-wait'], [t.onBreak, 'on break', ROLE.idle, 'ic-break']]
    .filter(([n]) => n)
  const strip = stripOf(desks).slice(0, 20)
  const lean = all.filter((c) => c[3] !== 'ic-wait')
  // how wide a try comes out: the margin, the strip, then each count's rule (none before the first without the strip),
  // its icon and its words
  const need = (size, cs, withStrip) => 5 + (withStrip ? strip.length * 4 + 3 : 0) + 5 * Math.max(0, cs.length - (withStrip ? 0 : 1)) +
    cs.reduce((a, [n, word]) => a + 10 + Math.ceil(textW(`${n} ${word}`, size)) + 4, 0)
  const [size, counts, withStrip] = [[5.5, all, true], [5.5, lean, true], [5, lean, true]].find((tr) => need(...tr) <= w) ?? [5, lean, false]
  const rects = [[x, top, w, BAR.h, BAR.plate], [x, top, w, 1, BAR.hi], [x, top + BAR.h - 1, w, 1, BAR.lo]]
  let cx = x + 5
  if (withStrip) {
    rects.push(...strip.map((d, i) => [cx + i * 4, top + 4, 3, 7, CLASS_COLOR[d.cls]]))
    cx += strip.length * 4 + 3
  }
  let icons = ''
  let words = ''
  counts.forEach(([n, word, color, icon], i) => {
    if (withStrip || i) {
      rects.push([cx, top + 3, 1, BAR.h - 6, BAR.rule])
      cx += 5
    }
    icons += use(ctx, icon, cx, top + 4)
    cx += 10
    // on the plate's middle line: the type's cap height centred on it, as the icon is
    words += `<text x="${cx}" y="${r1(top + 7.5 + size * 0.45)}"><tspan fill="${color}">${n}</tspan> ${esc(word)}</text>`
    cx += Math.ceil(textW(`${n} ${word}`, size)) + 4
  })
  return paint(rects) + icons + (words ? `<g font-size="${size}" fill="${ROLE.dim}">${words}</g>` : '')
}

// ---------------------------------------------------------------- scene

/**
 * The live floor plan from y0 down: `(ctx, y0) → { svg, h, alt, gist, top, under }`, the contract of every scene
 * (lib/svg.mjs SCENES); `top` is `svg` down to the basement floor and `under` ({ y, svg }) the lines under it, so the
 * composer can run the commits line between them. Under the shared header (svg-kit sceneHeader: the sign on the roof,
 * the neon THE OFFICE over the glance, the sky and the skyline), the building's bar while anyone is in (not quiet:
 * statusBar), the rooms in bands over their floor slabs, the
 * street front at street level (1F: the entrance, shop windows, lamps, the agents going around on its sidewalk), and
 * under the sidewalk the basement (B1, what they did); every floor numbered on the left pier, bottom up (B1, 1F, 2F,
 * 3F…); then a line only when desks were left out, and who is who when more than Clawd works. Desks and meetings are
 * capped by ctx.caps (renderSvg's size budget); the basement sheds its furniture first (basementAt).
 */
export function sceneLive(ctx, y0) {
  const { W, f, desks } = ctx
  ctx.cast = agentsOf(desks)
  // the tags the floors lay on their slabs (paintBands draws them)
  ctx.tags = []
  const plan = floorPlan(ctx)
  const { IX0, IX1, IW, hidden, bands } = plan
  const lines = groundLines(hidden)
  const castRow = ctx.cast.length > 1 || (ctx.cast.length === 1 && ctx.cast[0] !== 'claude') || accountsOn(desks).length > 0
  // ---- vertical plan: the building's bar, the floors, the street front and its sidewalk, the basement under it, then
  // the lines
  let y = y0 + SKY + 5
  const barTop = desks.length && !ctx.quiet ? y : null
  if (barTop !== null) y += BAR_SPAN
  for (const b of bands) {
    b.top = y
    // the label band under the floor while a room on it has lines on its last row, else a plain floor
    b.slab = b.items.some((it) => it.hasLines) ? DECK : THIN
    y += b.h + b.slab
  }
  const STREET = 56
  const lobbyTop = y
  const groundY = lobbyTop + STREET
  const baseTop = groundY + 4
  // the basement is as tall at every level of detail: its plainest drawing (into a <defs> of its own) says how tall
  const floorY = baseTop + basement({ ...ctx, defs: new Map() }, baseTop, plan, 2).h
  const panelTop = floorY + 1
  const nLines = lines.length + (castRow ? 2 : 0)
  const H = panelTop + (nLines ? nLines * 9 + 5 : 2) - y0
  // ---- paint: the shared header (sky, sign, skyline, brick shell), the bands, the street front on its sidewalk and
  // the agents going around on it
  const when = `${f.now?.weekday ?? ''} ${dateLabel(f)}`.trim()
  let s = sceneHeader(ctx, y0, { view: 'live', when, info: glance(ctx), groundY }).svg
  // the bar on a slab of its own, as a floor's
  if (barTop !== null) {
    const slab = barTop + BAR.h
    s += statusBar(ctx, IX0, barTop, IW) + paint([[IX0, slab, IW, THIN, K.slab], [IX0, slab, IW, 2, K.wood], [IX0, slab + 2, IW, 1, K.woodD]])
  }
  s += paintBands(ctx, bands, { IX0, IW })
  const front = streetFront(ctx, lobbyTop, STREET, IX0, IX1)
  s += front.facade + paint([[0, groundY, W, 3, K.walk], [0, groundY + 3, W, 1, K.walkD]]) + front.street
  // ---- under the basement floor, where the composer runs the commits line (from floorY): the ground behind the lines
  // (backdrop) and the lines, on the page with a halo when transparent
  let marks = ''
  let ly = panelTop + 8
  for (const g of lines) {
    marks += lineSpans(6, ly, 5, g, W - 10)
    ly += 9
  }
  if (castRow) marks += castLegend(ctx, 6, ly)
  const band = y0 + H > panelTop ? backdrop(ctx, [[0, panelTop, W, y0 + H - panelTop, K.ground]]) : ''
  const under = { y: floorY, svg: band + onPage(ctx, marks) }
  // ---- the floor numbers, bottom up: B1 the basement (beside its nameplate), 1F the street front, 2F… the bands
  const nums = plaques(ctx, [['B1', baseTop + 4], ['1F', lobbyTop + 2], ...bands.map((b, i) => [`${bands.length - i + 1}F`, b.top + 2])], BX0 + 1, plan.numW)
  // ---- the cards the floors show on hover, drawn last so nothing covers them
  const cards = cardsSvg(ctx)
  const gist = headcountGist(desks)
  // ---- the basement at the richest detail the size budget leaves room for (the commits line, the root and both
  // copies of the alt text counted, the header's clock at its longest), its walls under the plaques
  const used = s.length + (ctx.clockSlack?.chars ?? 0) + nums.length + cards.length + under.svg.length + defsMarkup(ctx).length + (ctx.lineChars ?? 7000) +
    2 * gist.length + 1200
  const base = basementAt(ctx, baseTop, plan, used)
  s += base.svg + nums + cards
  return { svg: s + under.svg, top: s, under, h: H, alt: `The Office: ${gist}${base.gist ? ` · B1 ${base.gist}` : ''}`, gist }
}

// Who is who, under a floor where more than Clawd works: each character on the floor, standing, with its name and
// agent ('Dex · Codex'), as many as fit; then each account's color and name when desks carry one. Two lines tall.
function castLegend(ctx, x, y) {
  let s = ''
  let cx = x
  for (const a of ctx.cast) {
    const label = `${CAST[a].who} · ${CAST[a].name}`
    const w = Math.round(9 + textW(label, 5) + 8)
    if (cx + w > ctx.W - 4) break
    s += use(ctx, pose(a, 'M'), cx, y - 5) + txt(cx + 9, y, label, 5, CAST[a].hex.dark)
    cx += w
  }
  const accounts = accountsOn(ctx.desks)
  if (accounts.length) {
    let ax = x
    const ay = y + 9
    s += txt(ax, ay, 'accounts:', 5, ROLE.dim)
    ax += textW('accounts: ', 5)
    for (const a of accounts) {
      const w = textW(`@${a} `, 5) + 6
      if (ax + w > ctx.W - 4) break
      s += txt(ax, ay, `@${a}`, 5, accountColor(a))
      ax += w
    }
  }
  return s
}

/** The accounts the desks carry, in the order they first sit (none when every agent has one account). */
const accountsOn = (desks) => [...new Set(desks.map((d) => d.account).filter(Boolean))]

// An account's color: a stable pick by name from the brighter project colors, so '@work' is the same color everywhere.
const ACCOUNT_COLORS = ['#eec96f', '#7fd6e8', '#e08fc0', '#9ab86a', '#c58fd8', '#55c5b1']
const accountColor = (label) => ACCOUNT_COLORS[fnv1a(`account:${label}`) % ACCOUNT_COLORS.length]

// The live headcount in the glance's words, groups at zero left out: '19 desks, 3 working, 1 in a meeting, 15 on break'.
function headcountGist(desks) {
  if (!desks.length) return 'lights off, nobody at a desk'
  const t = tally(desks)
  const wait = t.waiting && (t.meetingWait === t.waiting ? `${t.waiting} in a meeting` : `${t.waiting} waiting on helpers`)
  return [plural(desks.length, 'desk'), t.working && `${t.working} working`, wait, t.asking && handsUp(t.asking), ...idleSpans(t).map(([s]) => s),
    t.interns && plural(t.interns, 'intern')].filter(Boolean).join(', ')
}

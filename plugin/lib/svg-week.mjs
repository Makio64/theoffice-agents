// PURE: the WEEK scene of the SVG office, the tower: one floor per tenant project (busiest on top, twelve at most),
// each one row of the facade. On the left its sign in two lines: the floor's number on a soft dark tab fused to its
// nameplate in the project's color (the name in dark bold type, on two lines when long), then a recessed plate holding
// a lit tube as long as its share of the busiest floor's agent-time, the floor's agent-time and its commits, each in
// its own column down the tower. On the right its seven day windows under the day cards, each under the floor's own
// awning (stripes, a band, a hood or the street front's lintel): a room lit by that day's agent-time (lit by its
// screens alone, the lamp on, the room lit, the room ablaze) with the day's agents at their monitors, the day's
// agent-time printed on its transom in dark letters against the lit glass (crisp in a bright room, quiet in a dim one,
// pale blue in the dimmest), the floor's best day on a gold tag instead; a day nobody worked there is shut, its awning
// rolled up. The brick behind the floors is quieted under a warm wash so the signs and the lit windows carry the
// contrast. Over the floors, on a picture rail, the week's card (THIS WEEK or WEEK nn, its agent-time in bold pixel
// figures, its dates and commits) and a tear-off card over each day (weekday, the date in bold pixel figures, the day's
// agent-time; Saturday blue, Sunday red, today edged in gold, the busiest starred). The busiest floor wears a crown and
// a gilt ledge. Under the floors the key (each light with its hours, the live lamp, the gold tag), then the Office's
// street front. Life: a window cleaner by day, a light going off now and then at night. No node:* imports (the desktop
// mod loads lib/svg.mjs, which imports this file).
import { clip, fmtAgentTime, fmtHours, fmtInt } from './format.mjs'
import { fnv1a, rangeWord } from './model.mjs'
import {
  AGENT_IDS, CAST, K, ROLE, SKY, SPRITES, WEEKDAY, aO, aT, agentId, castPicker, clamp, darkPlate, dayOf,
  defineSprites, defsMarkup, esc, fillAttr, fit, footing, hitArea, mapRects, miniLegend, mix, paint, plural, r1, sceneHeader,
  sprite, stripOf, textW, txt, use,
} from './svg-kit.mjs'

const fmtH = fmtHours

// ---------------------------------------------------------------- metrics and paint

/** A tenant floor's height in viewBox units: its awning, its window, the sill, the wall under it, the ledge. */
export const FLOOR_H = 30
/**
 * What a floor adds on a pane too narrow for the sign column beside the days (its windows would come out under 14
 * wide): its sign as a line over its windows (the plate, the crown, the agent-time and the commits at its end).
 */
const STACK = 13
/** The head: the picture rail and the cards hung on it. */
const BAND = 37
/** The wall between the cards and the top floor. */
const UNDER_BAND = 2
/** Where a card hangs (from the head's top): the binding (3), the page (25), the pad, its shadow. */
const CARD_Y = 5
/** The fascia over the street front: the key. */
const FASCIA = 24
/** The tower's ground floor: the Office's street front (ctx.floors.front), its entrance under the canopy. */
const LOBBY = 56
/** A project under this many minutes of agent-time in the range is quiet: it waits in storage, not on a floor. */
const QUIET = 10
// Rows inside a floor (y from its window row's origin): the awning 0–4, the window frame 3–23: its transom 4–8 (a lit
// window's day's agent-time printed on it) under a bar at 9, its pane 10–22 (two either side of a mullion in a window
// wide enough for two agents); the stone sill 24–25 and its shadow at 26, the ledge 27–29. In a lit room a pendant
// hangs from the bar (10–12), a seated agent's top row is 13, its monitor 14–17, the desk top 18 (its front 19–20), the
// floor 21–22. The sign column: line 1, the floor's tab and nameplate (11 tall at 3, or 15 at 1 for a name on two
// lines); line 2, the recessed plate of its tube, its agent-time and its commits (9 tall at 17).
const WY = 3
const WH = 21
const GLASS = WY + 1
const TRANSOM = 5
const BAR = GLASS + TRANSOM
const PANE = BAR + 1
const GLASS_B = WY + WH - 2
const GH = GLASS_B - GLASS + 1
const SEAT_Y = PANE + 3
const DESK = SEAT_Y + 5
const SILL = WY + WH
const LEDGE = FLOOR_H - 3
/** The sign column's second line (from the floor's window origin): the recessed plate of its tube, its agent-time, its commits. */
const TALLY = 17
const TALLY_H = 9
/** The floors' agent-time on it, in bold type. */
const TOTAL = 7
/** The narrowest a window may come out beside the sign column before the floors stack their signs over their windows. */
const MIN_WW = 14
/** A seat at a desk: a monitor (3), a pixel, the agent (11). */
const SEAT = 15
/** From this width a window has two panes, an agent in each. */
const WIN = 32

// A lit room by its light: [wall, the upper wall the lamps light, the floor]. Lit by its screens alone (a cool room, so
// a quiet day never reads as a shut window or as the brick), the lamp on, the room lit, the room ablaze.
const ROOM = [null, ['#2d5070', '#365e83', '#1b3046'], ['#8a5532', '#9e663b', '#4a2f20'], ['#c97f42', '#dc9852', '#6e4426'],
  ['#f2c062', '#ffdb8c', '#a8743c']]
/** A window's light by level: the dark glass (by night), then the four lit rooms (the key's swatches). */
export const GLOW = ['#141a2c', ...ROOM.slice(1).map((r) => r[0])]
// the building's own paint: window frames, stone, the lamps, the desks, brass and gilt, the rail
const P = {
  frame: '#2a211b', lamp: '#2e2620', bulb: '#fff1c4', desk: '#c9a26b', deskD: '#3e2c1f', leaf: '#4f7f34', store: '#1c1611', cream: '#f4efe4',
  stone: '#b29d7d', stoneF: '#8a765c', stoneD: '#5c4c3b', iron: '#2b2622', brass: '#c9a26b', brassD: '#8f6d43', brassH: '#e6c48c',
  gold: '#f6d860', goldF: '#d9a640', goldD: '#a8792a', goldH: '#fff3b0',
  // the street front's window stone and its glass by day (svg-live FR, GLASS)
  lintel: '#8a8072', lintelHi: '#a39886', sky: '#a9d3ee',
  rail: '#2a211b', railHi: '#4a3a2c',
}
// the brick behind the floors, quieted: a warm dark wash over it, so it stays brick but steps back
const CALM = '#160f0b/.45'
// the night over the facade, and the warm light of a lit room
const NIGHT = '#0a0e1f'
const LIGHT = '#ffd98a'
// The month's calendar stationery (svg-month.mjs) for the cards: the paper (the weekend's tinted cool), the ink,
// Saturday's blue and Sunday's red, the faded ink of the hours, the pad, today's soft gold edge, the commits' ink on
// paper, the month's own color on a day card's binding.
const PAPER = '#f8f3e7'
const PAPER_WE = mix(PAPER, '#6f91dc', 0.13)
const INK = '#3a2a20'
const INK_SA = '#3a63b0'
const INK_SU = '#c23b2c'
const INK_HOURS = '#6f5e47'
const INK_SHIP = '#3d6e12'
const PAD = '#d8cdb6'
const HONEY = '#dcaa4e'
const MONTH_BAND = ['#3c68ae', '#ad4570', '#3b8656', '#4b945c', '#a94f86', '#c4861f', '#2a80ba', '#cc6a2c', '#ad6c33', '#c0512a', '#894530', '#a52f39']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WD3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
// the live lamp on the corner of today's window
const LAMP = '#7fd6e8'
// the commits, quiet beside the agent-time
const SHIP_Q = '#8fae66'
// A lit window's hours printed on its transom, by its light (glowLevel 1–4): dark letters against the lit glass, so the
// brighter the room the crisper they read; the dimmest room, lit by its screens alone, takes pale blue letters. The
// floor's best day wears the gold tag instead.
const PRINT = [null, '#8db0d2', '#3a2214', '#5c3a1f', '#674427']
// The soft paint of the sign column and the key: the floor's tab, the tally's plate and the key's board a warm dark a
// few steps under the wall (recessed, never black), the tube's empty groove a shade under that, the floors' agent-time
// in parchment rather than the bright title cream; the cards' big figures a softened ink.
const SOFT = { plate: '#2b2019', seam: '#000/.3', groove: '#1f1712', fig: '#d8c9ac', ink: '#4a3a2d' }

// ---------------------------------------------------------------- sprites ('tw-')

// The crown on the busiest floor (7 × 5), gold with two gems.
const CROWN = ['Y..Y..Y', 'YY.Y.YY', 'YYYYYYY', 'YrYYYbY', 'yyyyyyy']
const CROWN_LEG = { Y: '#f6d860', y: '#c9a23a', r: '#e07a61', b: '#6f91dc' }
// The busiest day's star on its card (5 × 5).
const STAR = ['..Y..', '.YYY.', 'YYYYY', '.YyY.', '.y.y.']
// Ivy climbing the brick (3 × 20).
const IVY = ['.l.', 'lL.', '.ll', '..l', '.Ll', 'll.', '.l.', 'lLl', '..l', '.l.', 'Ll.', '.ll', 'l..', '.lL', '.l.', 'll.', '.lL', 'l..', '.l.', 'll.']
// The commits glyph (7 × 3): a commit on its line.
const COMMIT = ['..###..', '###.###', '..###..']
// A floor's monitors (3 × 3 on a stand), by the kind of work it did most: the screen, what is on it, the light it
// casts.
const SCREEN = {
  terminal: ['#0b100b', [[0, 0, 2, 1, '#4d5a4d'], [0, 2, 1, 1, '#9ab86a']], '#9ab86a'],
  coding: ['#1b2030', [[0, 0, 1, 1, '#c678dd'], [1, 1, 2, 1, '#9ab86a'], [0, 2, 2, 1, '#eec96f']], '#8fb0ff'],
  reading: ['#e9e4d6', [[0, 0, 3, 1, '#9a9282'], [0, 2, 2, 1, '#9a9282']], '#fff6e0'],
  testing: ['#0f1716', [[0, 1, 1, 1, '#9ab86a'], [1, 2, 1, 1, '#9ab86a'], [2, 0, 1, 2, '#9ab86a']], '#9ab86a'],
  web: ['#eef0f3', [[0, 0, 3, 1, '#c9ced8'], [0, 1, 2, 2, '#6f91dc']], '#e8f0ff'],
  design: ['#24202a', [[0, 0, 1, 3, '#e07a61'], [1, 0, 1, 3, '#eec96f'], [2, 0, 1, 3, '#6f91dc']], '#f0c8ff'],
}

const tw = (c) => c.tw ?? { ww: 20 }

// A window's panes, [x, w] each: two either side of a 2-pixel mullion in a window wide enough for two agents, else one.
const panesOf = (ww) => (ww >= WIN ? [[1, Math.floor((ww - 4) / 2)], [ww - 1 - Math.floor((ww - 4) / 2), Math.floor((ww - 4) / 2)]] : [[1, ww - 2]])
const mullionX = (ww) => 1 + Math.floor((ww - 4) / 2)

// A streak of light climbing the glass from (x, y), as on the street front's windows, clipped to the glass.
const climb = (ww, x, y, fill) => [0, 1, 2, 3].map((i) => [x + i, y - 2 * i, 1, 2, fill]).filter(([rx, ry]) => ry >= GLASS && rx < ww - 1)

// The lamps of a lit room, by its light: none (its screens light it), one pendant over a pane and the pool of light it
// throws down to the desk, then the ceiling lit along the transom and a pendant over every pane.
function roomLights(ww, lv) {
  const panes = panesOf(ww)
  const r = []
  const mid = ([x, w]) => x + Math.floor(w / 2)
  const pendant = (x) => r.push([x, PANE, 1, 1, P.lamp], [x - 1, PANE + 1, 3, 1, P.lamp], [x, PANE + 2, 1, 1, P.bulb])
  if (lv === 2) {
    const [x0, w] = panes[0]
    const cx = mid(panes[0])
    pendant(cx)
    for (let k = 0; k < 6; k++) {
      const a = Math.max(x0, cx - 1 - k)
      r.push([a, PANE + 3 + k, Math.min(x0 + w, cx + 2 + k) - a, 1, `${LIGHT}/.09`])
    }
  }
  if (lv >= 3) {
    r.push([1, PANE, ww - 2, 1, lv === 4 ? '#fff6d8' : '#ffe7b0/.6'])
    for (const p of panes) pendant(mid(p))
  }
  return r
}

// A shut window's roller shutter, down inside its frame: metal slats from the box under the lintel to the bottom bar
// and its handle, pale metal by day and slate at night. [slat, groove, box, bar] by day and by night.
const SHUT = { day: ['#8f8b84', '#6f6b65', '#55524d', '#4a4743'], night: ['#363a46', '#272a33', '#1c1e25', '#18191e'] }
function shutter(c, ww) {
  const [slat, groove, box, bar] = SHUT[c.night ? 'night' : 'day']
  const gw = ww - 2
  const r = [[1, GLASS, gw, GH, groove]]
  for (let y = GLASS + 2; y < GLASS_B - 1; y += 2) r.push([1, y, gw, 1, slat])
  r.push([1, GLASS, gw, 2, box], [1, GLASS + 2, gw, 1, '#000/.25'], [1, GLASS_B - 1, gw, 2, bar], [Math.floor(ww / 2) - 1, GLASS_B - 1, 3, 1, P.brass])
  return r
}

// A window's body, in floor coordinates (x from the window's left edge, y from the floor's window origin), `ww` wide:
// its frame and what is behind it. Shut ('0' by night, 'd' by day): its shutter down. Lit (1–4): the room, its lamps
// by its light, the screens' glow in a room they alone light, faint streaks on the glass by day, and at night the wall
// around the window catches the light of the two brightest. 'x': the room's lights off for a moment at night.
function windowBody(c, ww, lv) {
  const gw = ww - 2
  const r = []
  const streaks = (op) => panesOf(ww).flatMap(([x]) => climb(ww, x + 2, GLASS_B - 1, `#ffffff/${op}`)).filter(([, ry]) => ry > BAR)
  if (c.night && Number(lv) >= 3) r.push([-3, WY - 2, ww + 6, WH + 4, `${LIGHT}/.05`], [-2, WY - 1, ww + 4, WH + 2, `${LIGHT}/.08`])
  r.push([0, WY, ww, WH, P.frame])
  if (lv === 'x') r.push([1, GLASS, gw, GH, GLOW[0]], [3, PANE + 3, 1, 1, '#6f91dc'], [ww - 7, PANE + 7, 1, 1, '#6f91dc'], [Math.floor(ww / 3), GLASS + 1, 1, 1, K.star])
  else if (!Number(lv)) r.push(...shutter(c, ww))
  else {
    const [wall, upper, floor] = ROOM[lv]
    r.push([1, GLASS, gw, GH, wall], [1, GLASS, gw, TRANSOM, upper], [1, PANE, gw, lv >= 3 ? 4 : 3, upper], [1, GLASS_B - 1, gw, 2, floor], ...roomLights(ww, lv))
    if (lv === 1) r.push([1, SEAT_Y, gw, DESK - SEAT_Y, '#8fd8ff/.09'])
    if (!c.night) r.push(...streaks('.14'))
  }
  r.push([1, GLASS, gw, 1, '#000/.3'], [1, GLASS + 1, 1, GH - 1, '#000/.18'])
  return paint(r)
}

// The glazing bars, drawn over what is behind the glass: the transom bar under the day's hours, and the mullion between
// two panes in a window wide enough for two agents.
function glazing(ww) {
  const r = [[1, BAR, ww - 2, 1, P.frame]]
  if (ww >= WIN) r.push([mullionX(ww), PANE, 2, GLASS_B - PANE + 1, P.frame])
  return paint(r)
}

// The dressing round a window, in the project's color (currentColor): the floor's awning (stripes with a scalloped hem,
// a band, a hood, or the street front's stone lintel), rolled up on its bar over a shut window as a shop's is when it
// closes; the street front's stone sill under it. At night the street has no light for it but the room's (tw-sp).
function windowDress(c, ww, awning, shut) {
  const aw = []
  if (shut && (awning === 'stripes' || awning === 'band')) {
    const x0 = awning === 'stripes' ? -2 : -1
    aw.push([x0, WY - 2, ww - 2 * x0, 2, 'cur'])
    if (awning === 'stripes') for (let x = -1; x < ww + 2; x += 4) aw.push([x, WY - 2, 2, 2, P.cream])
    aw.push([x0, WY - 2, ww - 2 * x0, 1, '#ffffff/.25'], [x0, WY - 1, ww - 2 * x0, 1, '#000/.3'], [x0, WY - 2, 1, 2, '#000/.35'], [ww - x0 - 1, WY - 2, 1, 2, '#000/.35'])
  } else if (awning === 'stripes') {
    aw.push([-2, WY - 2, ww + 4, 3, 'cur'])
    for (let x = -1; x < ww + 2; x += 4) aw.push([x, WY - 2, 2, 3, P.cream])
    for (let x = -2; x < ww + 2; x += 4) aw.push([x, WY + 1, 2, 1, 'cur'])
    aw.push([-2, WY - 2, ww + 4, 1, '#000/.2'])
  } else if (awning === 'band') {
    aw.push([-1, WY - 2, ww + 2, 3, 'cur'], [-1, WY - 2, ww + 2, 1, '#ffffff/.4'], [-1, WY, ww + 2, 1, '#000/.3'])
  } else if (awning === 'hood') {
    aw.push([1, WY - 3, ww - 2, 1, 'cur'], [0, WY - 2, ww, 2, 'cur'], [-1, WY, ww + 2, 1, 'cur'], [1, WY - 3, ww - 2, 1, '#000/.3'], [-1, WY, ww + 2, 1, '#000/.3'])
  } else {
    aw.push([-1, WY - 2, ww + 2, 2, P.lintel], [-1, WY - 2, ww + 2, 1, P.lintelHi])
  }
  if (shut && awning === 'hood') aw.push([0, WY - 3, ww, 4, '#000/.3'])
  const r = [...aw, [-1, SILL, ww + 2, 2, P.lintel], [-1, SILL, ww + 2, 1, P.lintelHi], [0, SILL + 2, ww, 1, '#000/.3']]
  if (c.night) r.push(...aw.map(([x, y, w, h]) => [x, y, w, h, `${NIGHT}/.35`]), [-1, SILL, ww + 2, 2, `${NIGHT}/.35`])
  return paint(r)
}

// A mini figure of the cast (11 × 6) at its desk: still, or typing (the arms, its fourth row's two ends, tapping in
// turn; two phases so two agents side by side are not in step).
function typingMini(c, mini, leg, ph) {
  if (!c.animate) return sprite(mini, leg)
  const body = mini.map((row, y) => (y === 3 ? `.${row.slice(1, -1)}.` : row))
  const arm = (x, v) => `<g>${paint(mapRects([mini[3][x]], leg, x, 3))}${aT(c, v, 0.5, -ph * 0.2)}</g>`
  return sprite(body, leg) + arm(0, '0 0;0 1') + arm(mini[3].length - 1, '0 1;0 0')
}

// The window cleaner's platform (20 wide, its rail at 0): the cleaner standing behind the rail, the squeegee going up
// and down the pane, a bucket on the plank. Its ropes are drawn apart, to grow as it goes down.
function gondola(c, tag) {
  const wipe = c.animate ? aT(c, '0 0;0 -1;0 -2;0 -1', 1.6) : ''
  return use(c, `tw-m-${tag}`, 5, -4) +
    `<g>${paint([[4, -2, 1, 1, P.desk], [3, -3, 1, 1, P.desk], [2, -4, 1, 1, P.desk], [1, -7, 1, 4, '#3a3d44'], [0, -7, 1, 4, '#1a1a1e']])}${wipe}</g>` +
    paint([[13, 1, 3, 3, '#7d858f'], [13, 1, 3, 1, '#7fbde8'], [0, 0, 20, 1, '#9aa0a8'], [0, 2, 20, 1, '#6d7279'], [0, 1, 1, 3, '#6d7279'],
      [19, 1, 1, 3, '#6d7279'], [0, 4, 20, 1, P.desk], [0, 5, 20, 1, P.deskD], [2, 6, 1, 1, '#454950'], [17, 6, 1, 1, '#454950']])
}

// How many agents a window `ww` wide seats (one a pane), and where they sit (x from the window's left: a seat's
// monitor, its agent beside it). A pane narrower than a seat holds the agent alone, centered.
const seatsIn = (ww) => (ww >= WIN ? 2 : 1)
const narrowPane = (ww) => ww - 2 < SEAT
function seatsAt(ww, k) {
  return panesOf(ww).slice(0, k).map(([x, w]) => x + Math.max(0, Math.floor((w - SEAT) / 2)))
}
const agentDx = (ww) => (panesOf(ww)[0][1] >= SEAT ? 4 : 3)
const loneX = (ww) => 1 + Math.floor((ww - 2 - 11) / 2)

// A row of seats behind a lit window's desk (floor coordinates, x from the window's left): `tags` the agents' cast
// tags, each at a monitor of the floor's `kind` of work (the agent alone in a narrow pane), then the desk in front of
// them.
function seatRow(c, k, kind, tags) {
  const ww = tw(c).ww
  const s = narrowPane(ww) && ww < WIN ? use(c, `tw-m-${tags[0]}`, loneX(ww), SEAT_Y)
    : seatsAt(ww, k).map((x, q) => use(c, `tw-k-${kind}`, x, SEAT_Y + 1) + use(c, `tw-m-${tags[q]}`, x + agentDx(ww), SEAT_Y)).join('')
  return s + use(c, 'tw-desk')
}
// A sprite whose name says all it draws (a row of seats): registered on its first use.
function lazy(name, draw) {
  if (!Object.hasOwn(SPRITES, name)) defineSprites({ [name]: draw })
  return name
}
const KIND_CODE = { terminal: 't', coding: 'c', reading: 'r', testing: 'q', web: 'w', design: 'd' }
const seatSprite = (k, kind, tags) => lazy(`tw-r${k}${KIND_CODE[kind]}-${tags.join('_')}`, (c) => seatRow(c, k, kind, tags))

/**
 * Awning styles by code: a floor's dressing sprite is `tw-a<awning>` (`tw-ac…` over a shut window), its windows
 * `tw-w<light><awning>`, every lit one over the same glazing (`tw-glz`).
 */
const AWNINGS = ['stripes', 'band', 'hood', 'lintel']
const LEVELS = ['0', '1', '2', '3', '4', 'd']
// the light a lit window throws on its sill at night, by its level
const SPILL = { 2: 1, 3: 1, 4: 2 }
const COMBOS = {}
for (let a = 0; a < 4; a++) {
  const code = `${a}`
  COMBOS[`tw-a${code}`] = (c) => windowDress(c, tw(c).ww, AWNINGS[a], false)
  COMBOS[`tw-ac${code}`] = (c) => windowDress(c, tw(c).ww, AWNINGS[a], true)
  for (const lv of LEVELS) {
    COMBOS[`tw-w${lv}${code}`] = !Number(lv) ? (c) => use(c, `tw-b${lv}`) + use(c, `tw-ac${code}`)
      : (c) => use(c, `tw-b${lv}`) + use(c, 'tw-glz') + use(c, `tw-a${code}`) + (c.night && SPILL[lv] ? use(c, `tw-sp${SPILL[lv]}`) : '')
  }
}
const CAST_SPRITES = {}
for (const a of AGENT_IDS) {
  const { tag, mini } = CAST[a]
  const leg = miniLegend(a)
  CAST_SPRITES[`tw-m-${tag}`] = () => sprite(mini, leg)
  for (const ph of [0, 1]) CAST_SPRITES[`tw-m-${tag}t${ph}`] = (c) => typingMini(c, mini, leg, ph)
  CAST_SPRITES[`tw-gondola-${tag}`] = (c) => gondola(c, tag)
}

defineSprites({
  ...Object.fromEntries(LEVELS.map((lv) => [`tw-b${lv}`, (c) => windowBody(c, tw(c).ww, lv === 'd' || lv === '0' ? lv : Number(lv))])),
  // a lit room's lights off for a moment at night: the night in its glass
  'tw-bx': (c) => windowBody(c, tw(c).ww, 'x'),
  'tw-glz': (c) => glazing(tw(c).ww),
  ...COMBOS,
  ...CAST_SPRITES,
  ...Object.fromEntries(Object.entries(SCREEN).map(([kind, [bg, px, glow]]) => [`tw-k-${kind}`, (c) =>
    paint([...(c.night ? [[-1, -1, 5, 5, `${glow}/.16`]] : []), [0, 0, 3, 3, bg], ...px, [1, 3, 1, 1, '#2b2f36']])])),
  // a lit window's light on its sill at night, as its room is lit
  'tw-sp1': (c) => paint([[-1, SILL, tw(c).ww + 2, 1, `${LIGHT}/.22`]]),
  'tw-sp2': (c) => paint([[-1, SILL, tw(c).ww + 2, 1, `${LIGHT}/.4`], [0, SILL + 1, tw(c).ww, 1, `${LIGHT}/.15`]]),
  // the desk in front of the agents, pane by pane (the mullion stays in front of the room)
  'tw-desk': (c) => paint(panesOf(tw(c).ww).flatMap(([x, w]) => [[x, DESK, w, 1, P.desk], [x, DESK + 1, w, 2, P.deskD], [x, DESK + 1, w, 1, '#000/.3']])),
  'tw-crown': (c) => sprite(CROWN, CROWN_LEG) + `<g opacity="0">${paint([[7, -1, 1, 1, '#ffffff'], [6, 0, 3, 1, '#ffffff/.4']])}${aO(c, '0;0;1;0', 2.4)}</g>`,
  'tw-star': () => sprite(STAR, { Y: P.gold, y: P.goldF }),
  'tw-ivy': () => sprite(IVY, { l: P.leaf, L: '#9ab86a' }),
  'tw-commit': () => sprite(COMMIT, { '#': ROLE.ship }),
  // the commits glyph in the ink a green takes on the cards' paper
  'tw-commit-ink': () => sprite(COMMIT, { '#': INK_SHIP }),
})

// ---------------------------------------------------------------- the pixel figures

// The tower's big numbers (the week's and each floor's agent-time, the cards' dates) in bold pixel figures, 7 rows tall
// with 2-pixel stems, each glyph a sprite (one <use> a figure, its paths filled by the group around it). A glyph is
// followed by a blank column; a char it lacks is a space, three wide.
const FIG = {
  0: ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  1: ['..##..', '.###..', '..##..', '..##..', '..##..', '..##..', '.####.'],
  2: ['.####.', '##..##', '....##', '..###.', '.##...', '##....', '######'],
  3: ['.####.', '##..##', '....##', '..###.', '....##', '##..##', '.####.'],
  4: ['...##.', '..###.', '.####.', '##.##.', '######', '...##.', '...##.'],
  5: ['######', '##....', '#####.', '....##', '....##', '##..##', '.####.'],
  6: ['..###.', '.##...', '##....', '#####.', '##..##', '##..##', '.####.'],
  7: ['######', '....##', '...##.', '..##..', '..##..', '..##..', '..##..'],
  8: ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '.####.'],
  9: ['.####.', '##..##', '##..##', '.#####', '....##', '...##.', '.###..'],
  h: ['##....', '##....', '#####.', '##..##', '##..##', '##..##', '##..##'],
  m: ['.......', '.......', '######.', '##.#.##', '##.#.##', '##.#.##', '##.#.##'],
  k: ['##....', '##....', '##..##', '##.##.', '####..', '##.##.', '##..##'],
  '.': ['..', '..', '..', '..', '..', '##', '##'], '·': ['..', '..', '..', '##', '##', '..', '..'],
}
const FIG_ID = { '.': 'dt', '·': 'md' }
/** Width in units of `str` in the bold pixel figures. */
export function figW(str) {
  let w = 0
  for (const ch of String(str)) w += (FIG[ch]?.[0].length ?? 3) + 1
  return Math.max(0, w - 1)
}
/** `str` in bold pixel figures, its top-left at (x, y) (rounded to the pixel): a <use> a figure. */
function fig(ctx, str, x, y) {
  let out = ''
  let cx = Math.round(x)
  const gy = Math.round(y)
  for (const ch of String(str)) {
    const rows = FIG[ch]
    if (rows) out += use(ctx, lazy(`tw-fig${FIG_ID[ch] ?? ch}`, () => paint(mapRects(rows, { '#': 'inh' }))), cx, gy)
    cx += (rows?.[0].length ?? 3) + 1
  }
  return out
}
// figures kept by fill, then drawn as one group a fill
const inkTo = (map, fill, uses) => {
  if (uses) map.set(fill, (map.get(fill) ?? '') + uses)
}
const inkSvg = (map) => [...map].map(([fill, uses]) => `<g${fillAttr(fill)}>${uses}</g>`).join('')

// ---------------------------------------------------------------- facts

// The range's seven days (the last seven of range.days, padded backwards from the first one or from today).
function weekDays(f) {
  const ok = (d) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
  const days = (Array.isArray(f.range?.days) ? f.range.days : []).filter(ok).slice(-7)
  if (!days.length) days.push(ok(f.now?.local_date) ? f.now.local_date : '2000-01-01')
  let first = days[0]
  while (days.length < 7) {
    const t = dayOf(first)
    t.setUTCDate(t.getUTCDate() - 1)
    first = t.toISOString().slice(0, 10)
    days.unshift(first)
  }
  return days
}

// The ISO week a day falls in (its Thursday's year).
function isoWeek(ymd) {
  const t = dayOf(ymd)
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7))
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((t - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)
}

const n0 = (v) => Math.max(0, Number(v) || 0)
// A <text> for a group that sets the font (and maybe the fill and the anchor).
const bare = (x, y, s, fill) => `<text x="${r1(x)}" y="${r1(y)}"${fill ? ` fill="${fill}"` : ''}>${esc(s)}</text>`
// A plate on the tower: the one paint, then the light over all of them (svg-kit litPlate).
const mount = (L, { rects, light }) => {
  L.rects.push(...rects)
  L.light.push(...light)
}
const dayOfP = (p, d) => (p.per_day && typeof p.per_day === 'object' && p.per_day[d] && typeof p.per_day[d] === 'object' ? p.per_day[d] : {})

/**
 * A floor's look, from its project's name alone (fnv1a), so a project keeps its floor from one render or week to the
 * next: `awning` (stripes, band, hood, or the street front's stone lintel) and `code`, its window sprites' suffix.
 */
export function floorStyle(name) {
  const a = fnv1a(`tw:${String(name ?? '')}`) % 4
  return { awning: AWNINGS[a], code: `${a}` }
}

/** A day's window light, 0 (dark) to 4: the square root of its minutes over the busiest window's, in quarters. */
export const glowLevel = (m, max) => (m > 0 ? clamp(Math.ceil(Math.sqrt(m / Math.max(1, max)) * 4), 1, 4) : 0)

// The kind of work a floor's screens show: its project's busiest kind with a screen of its own (coding otherwise).
function screenOf(p) {
  const a = p.activity && typeof p.activity === 'object' ? p.activity : {}
  let best = 'coding'
  for (const k of Object.keys(SCREEN)) if (n0(a[k]) > n0(a[best])) best = k
  return best
}

// A name on one line, or wrapped onto two where it breaks best (after a '-', '_', '.' or ' ', or before a capital that
// follows a small letter or a digit), the longer line as short as can be; each line fitted with '…' to `maxW` at
// `size`.
function nameLines(name, maxW, size) {
  const s = String(name)
  if (textW(s, size) <= maxW) return [s]
  const chars = [...s]
  let best = null
  for (let k = 1; k < chars.length; k++) {
    const a = chars[k - 1]
    const b = chars[k]
    if (!(/[-_. ]/.test(a) || (/[A-Z]/.test(b) && /[a-z0-9]/.test(a)))) continue
    const l1 = chars.slice(0, k).join('').trimEnd()
    const l2 = chars.slice(k).join('').trimStart()
    const w = Math.max(textW(l1, size), textW(l2, size))
    if (l1 && l2 && (!best || w < best.w)) best = { w, lines: [l1, l2] }
  }
  return best ? best.lines.map((l) => fit(l, maxW, size)) : [fit(s, maxW, size)]
}

// The floor's sign as ONE plate: the floor number's dark tab fused to the nameplate in the project's color (rounded at
// its two outer ends only, a seam between them), lit along its top as every plate is, its shadow on the wall. The tab
// and the color never overlap, so the tower's one paint may lay them in any order.
function signPlate(L, x, y, w, h, tabW, col) {
  L.rects.push([x + 1, y, tabW - 1, h, SOFT.plate], [x, y + 1, 1, h - 2, SOFT.plate], [x + tabW, y, w - tabW - 1, h, col], [x + w - 1, y + 1, 1, h - 2, col],
    [x + 1, y + h, w, 1, '#000/.35'])
  L.light.push([x + 1, y, tabW - 1, 1, '#fff/.12'], [x + 1, y + h - 1, tabW - 1, 1, '#000/.4'], [x + tabW, y, w - tabW - 1, 1, '#fff/.4'],
    [x + tabW, y + h - 1, w - tabW - 1, 1, '#000/.22'], [x + tabW, y, 1, h, '#000/.3'])
}

// ---------------------------------------------------------------- geometry

// The tower spans the building every scene stands in (BX0 6, BX1 W − 6, 4-unit brick piers; the roof at y0 + SKY). Its
// interior is split in two: the sign column on the left (about three tenths of it, 60 to 128 units, from x0 to nx1: the
// nameplate across it; under it the tally, the tube from its left edge, the agent-time right-aligned at hx, the
// commits' glyph at gx and their count at its end), a stone pier, then the seven day bays (the pitch what is left over
// seven, a window about six sevenths of it, two panes from WIN up). A pane too narrow for both (`side` false: the
// windows would come out under MIN_WW) stacks each floor's sign over its windows (STACK more rows, `wy` the window
// row's offset), the bays across the whole facade. Top down: the head (the rail and its cards), a strip of brick, the
// floors (`fh` each), the fascia with the key, the street front, then the storage's 18 under the street.
function geometry(W, y0, floors, storage, sizes) {
  const BX0 = 6
  const BX1 = W - 6
  const IX0 = BX0 + 4
  const IX1 = BX1 - 4
  const IW = IX1 - IX0
  const x0 = IX0 + 3
  const bays = (A0, A1) => {
    const pitch = clamp(Math.floor((A1 - A0 + 5) / 7), 8, 64)
    const gap = clamp(Math.round(pitch * 0.14), 3, 9)
    return { pitch, gap, ww: pitch - gap, GX: A0 + Math.floor((A1 - A0 - (7 * pitch - gap)) / 2) }
  }
  // the sign column about three tenths of the facade, and the units the seven bays cannot use (their pitch is whole)
  let nameW = clamp(Math.round(IW * 0.3), 60, 120)
  const spare = IX1 - 3 - (x0 + nameW + 8) + 5
  nameW += Math.min(8, spare - 7 * clamp(Math.floor(spare / 7), 8, 64))
  const nx1 = x0 + nameW
  const tabW = Math.round(textW(`${Math.max(1, floors)}F`, 4.5) + 5)
  // the commits' block: the glyph, a pixel, the widest count (none when no floor has commits)
  const cbw = sizes.countW ? Math.ceil(7 + 1 + sizes.countW) : 0
  let b = bays(nx1 + 8, IX1 - 3)
  const side = b.ww >= MIN_WW
  let sign
  if (side) {
    // line 2's columns from the column's right edge: the commits' count right-aligned at nx1 - 3, their glyph before
    // it, the agent-time right-aligned at hx before that, the tube from the plate's left edge to before the widest
    const gx = nx1 - 3 - cbw
    const hx = gx - (cbw ? 4 : 0)
    const t1 = hx - sizes.totW - 4
    sign = { x0, nx1, pr: nx1, nameW, tabW, cbw, name: nameW >= 80 ? 6 : 5.5, gx, hx, tube: [x0 + 3, Math.max(x0 + 11, t1)], pier: Math.round((nx1 + b.GX) / 2) - 2 }
  } else {
    // stacked: the sign over the windows, the agent-time and the commits at the line's end, the bays across the facade
    b = bays(IX0 + 2, IX1 - 2)
    const end = IX1 - 3
    sign = { x0, nx1: end, pr: end, nameW: end - x0, tabW, cbw, name: 5.5, gx: end - cbw, hx: end - cbw - (cbw ? 4 : 0), pier: null }
  }
  const fh = side ? FLOOR_H : FLOOR_H + STACK
  const roof = y0 + SKY
  const band = roof + 5
  const fy0 = band + BAND + UNDER_BAND
  const fyEnd = fy0 + Math.max(1, floors) * fh
  const groundY = fyEnd + FASCIA + LOBBY
  const cellar = storage > 0 ? 18 : 0
  return {
    BX0, BX1, IX0, IX1, IW, ...b, side, fh, wy: side ? 0 : STACK, roof, band, fy0, fyEnd, groundY, cellar, H: groundY + 4 + cellar + 4 - y0, sign,
  }
}

// ---------------------------------------------------------------- the head

// The head under the cornice: a picture rail across the facade, and on it a cream tear-off card on a brass nail over
// each day's column (its binding in the month's color, the weekday, the date in bold pixel figures, the day's
// agent-time for all floors; Saturday in blue, Sunday in red; the weekend's pages tinted cool; today's page edged in
// soft gold; the busiest day's card starred, its hours in bold), and over the sign column the week's own card on two
// nails, as tall as the days': the range (the ISO week on a Monday-to-Sunday page), its agent-time in the dates'
// figures, its dates and its commits. A tooltip says the days in words.
function head(ctx, g, days, best) {
  const { f } = ctx
  const { IX0, IX1, band, GX, pitch, ww, sign } = g
  const today = f.now?.local_date
  const ct = band + CARD_Y
  const r = [[IX0, band + 3, IX1 - IX0, 2, P.rail], [IX0, band + 3, IX1 - IX0, 1, P.railHi], [IX0, band + 5, IX1 - IX0, 1, '#000/.45']]
  const light = []
  const tips = []
  let small = ''
  let bold = ''
  const figs = new Map()
  let marks = ''
  let s = ''
  const wide = ww >= 16
  // a card: its binding, its page, the pad of pages under it, its shadow on the wall, its nails
  const card = (x, w, bind, page, nails) => {
    r.push([x, ct, w, 3, bind], [x, ct + 3, w, 25, page], [x, ct + 28, w, 1, PAD], [x + 1, ct + 29, w, 1, '#000/.4'], [x + w, ct + 1, 1, 28, '#000/.35'])
    light.push([x, ct, w, 1, '#ffffff/.3'], [x, ct + 2, w, 1, '#000/.22'])
    for (const nx of nails) light.push([nx, ct - 1, 2, 1, P.brassH], [nx, ct, 2, 1, P.brassD])
  }
  days.forEach((d, j) => {
    const x = GX + j * pitch
    const dt = dayOf(d)
    const wdI = dt.getUTCDay()
    const weekend = wdI === 6 || wdI === 0
    const ink = wdI === 6 ? INK_SA : wdI === 0 ? INK_SU : INK
    const m = n0(f.per_day?.[d]?.minutes)
    card(x, ww, MONTH_BAND[dt.getUTCMonth()], weekend ? PAPER_WE : PAPER, [x + Math.floor(ww / 2) - 1])
    if (d === today) light.push([x, ct + 3, ww, 1, HONEY], [x, ct + 27, ww, 1, HONEY], [x, ct + 4, 1, 23, HONEY], [x + ww - 1, ct + 4, 1, 23, HONEY])
    const mid = x + ww / 2
    bold += bare(mid, ct + 9.6, wide ? WD3[wdI] : WD3[wdI].slice(0, 2), ink)
    const dn = String(Number(d.slice(8)))
    inkTo(figs, ink === INK ? SOFT.ink : ink, fig(ctx, dn, Math.round(mid - figW(dn) / 2), ct + 13))
    const hv = m ? fmtH(m) : '·'
    const hs = textW(hv, 5) <= ww - 1 ? hv : hv.replace(/h$/, '')
    if (d === best) {
      bold += bare(mid, ct + 26.1, hs, INK)
      marks += use(ctx, 'tw-star', x + ww - 4, ct - 2)
    } else small += bare(mid, ct + 26.1, hs, INK_HOURS)
    tips.push(`${WEEKDAY[wdI]} ${Number(d.slice(8))} ${m ? fmtH(m) : '·'}`)
  })
  if (g.side) {
    // the week's card over the sign column: the range, its agent-time big, its dates and commits
    const x = sign.x0
    const w = sign.nameW
    card(x, w, P.brass, PAPER, [x + 6, x + w - 8])
    const first = days[0]
    const last = days[6]
    const word = dayOf(first).getUTCDay() === 1 ? `WEEK ${isoWeek(first)}` : rangeWord(f).toUpperCase()
    const mid = x + w / 2
    bold += bare(mid, ct + 9.6, fit(word, w - 6, 5), INK)
    const am = n0(f.totals?.agent_minutes)
    const tv = am ? fmtH(am) : '·'
    inkTo(figs, am ? SOFT.ink : INK_HOURS, fig(ctx, tv, Math.round(mid - figW(tv) / 2), ct + 13))
    const span = `${Number(first.slice(8))} ${MONTHS[Number(first.slice(5, 7)) - 1]} → ${Number(last.slice(8))} ${MONTHS[Number(last.slice(5, 7)) - 1]}`
    const cm = n0(f.totals?.commits)
    const cw = cm ? 7 + 2 + textW(fmtInt(cm), 5) : 0
    const both = textW(span, 5) + (cw ? 6 + cw : 0)
    if (both <= w - 6) {
      const sx = Math.round(mid - both / 2)
      s += txt(sx, ct + 26.1, span, 5, INK_HOURS)
      if (cm) {
        const gx = Math.round(sx + textW(span, 5) + 6)
        marks += use(ctx, 'tw-commit-ink', gx, ct + 23)
        s += txt(gx + 9, ct + 26.1, fmtInt(cm), 5, INK_SHIP)
      }
    } else small += bare(mid, ct + 26.1, fit(span, w - 6, 5), INK_HOURS)
  }
  s = paint(r) + paint(light) + s + marks + `<g font-size="5" text-anchor="middle">${small}</g>` +
    `<g font-size="5" font-weight="bold" text-anchor="middle">${bold}</g>${inkSvg(figs)}`
  return `<g><title>${esc(`agent-time per day, all floors: ${tips.join(' · ')}`)}</title>${s}</g>`
}

// ---------------------------------------------------------------- a tenant floor

// One floor per project, from its top (L.y), as one row (the busiest on top is a floor like the others, its crown and
// its gilt ledge mark it). The sign, two lines across the sign column: the floor number's tab fused to the nameplate
// (the name on two lines when it must), the crown over the busiest's; under it the tally (the tube as long as the
// floor's agent-time over the busiest floor's, the agent-time, the commits), each in its column down the tower
// (stacked: one sign line, the plate as long as its name, the crown, the agent-time and the commits at its end). Then
// the seven bays, one group per floor translated to its window row and tinted with the project's color (the awnings are
// currentColor): a window is one <use>, a lit one adds one more (its seats and the desk); each worked day's hours on
// its transom (the floor's best day on a gold tag); the live lamp on the corner of today's awning.
function tenantFloor(ctx, g, p, i, n, days, L, crown) {
  const { f, night } = ctx
  const { GX, pitch, ww, sign } = g
  const top = L.y
  const y = top
  const col = ctx.color(p.name)
  const today = f.now?.local_date
  const live = ctx.desks.filter((d) => d.project === p.name)
  const st = floorStyle(p.name)
  const am = n0(p.agent_minutes)
  const cm = n0(p.commits)
  const crownTip = `<title>${esc(`busiest floor: ${clip(p.name, 50)}`)}</title>`

  // ---- the sign
  const tube = (t0, t1, ty, th) => {
    L.grooves.push([t0, ty, t1 - t0, th, SOFT.groove], [t0, ty + th - 1, t1 - t0, 1, '#ffffff/.05'])
    const k = am ? clamp(Math.round(((t1 - t0) * am) / L.top), 2, t1 - t0) : 0
    if (!k) return
    L.tubes.push([t0, ty, k, th, col])
    L.tubeLight.push([t0, ty, k, 1, '#ffffff/.45'])
    if (th >= 3) L.tubeLight.push([t0, ty + th - 1, k, 1, '#000/.25'])
    if (k >= 3) L.tubeLight.push([t0 + k - 1, ty, 1, th, '#ffffff/.35'])
    if (night) L.tubeLight.push([t0 - 1, ty - 1, k + 2, 1, `${col}/.35`], [t0 - 1, ty + th, k + 2, 1, `${col}/.35`])
  }
  const tv = am ? fmtH(am) : '·'
  if (g.side) {
    // line 1, one plate: the floor's number on a dark tab fused to the nameplate in the project's color (its parts side
    // by side, never over each other: the tower paints color by color), the name in dark bold type on two lines when
    // it must; the crown over the busiest's plate
    const size = sign.name
    const x0 = sign.x0
    const pw = sign.nameW
    const tagW = sign.tabW
    const lines = nameLines(p.name, pw - tagW - 7, size)
    const ph = lines.length > 1 ? 15 : 11
    const py = y + (lines.length > 1 ? 1 : 3)
    L.rects.push([x0 + 1, py, tagW - 1, ph, SOFT.plate], [x0, py + 1, 1, ph - 2, SOFT.plate], [x0 + tagW, py, 1, ph, SOFT.seam],
      [x0 + tagW + 1, py, pw - tagW - 2, ph, col], [x0 + pw - 1, py + 1, 1, ph - 2, col], [x0 + 1, py + ph, pw, 1, '#000/.35'])
    L.light.push([x0 + tagW + 1, py, pw - tagW - 2, 1, '#fff/.4'], [x0 + tagW + 1, py + ph - 1, pw - tagW - 2, 1, '#000/.22'], [x0 + 1, py, tagW - 1, 1, '#fff/.08'])
    L.tags += bare(x0 + tagW / 2, py + ph / 2 + 1.6, `${n - i}F`)
    lines.forEach((l, k) => { L.names += bare(x0 + tagW + 4, py + (lines.length > 1 ? 6.3 + 6.5 * k : 7.7), l) })
    if (crown) L.fx += `<g>${crownTip}${use(ctx, 'tw-crown', Math.round(x0 + tagW + (pw - tagW) / 2 - 3.5), Math.max(py - 6, top - 4))}</g>`
    // line 2, one recessed plate: the tube from its left edge, the agent-time in bold type (TOTAL) right-aligned at hx,
    // the commits in their column at its end (nothing when there are none)
    const ly = y + TALLY
    L.rects.push([x0, ly, pw, TALLY_H, SOFT.plate], [x0, ly, pw, 1, '#000/.25'], [x0, ly + 1, 1, TALLY_H - 1, '#000/.15'])
    L.light.push([x0 + 1, ly + TALLY_H - 1, pw - 1, 1, '#fff/.06'])
    tube(sign.tube[0], sign.tube[1], ly + 3, 3)
    L.big += bare(sign.hx, ly + 7.3, tv, am ? undefined : ROLE.dim)
    if (cm) {
      L.fx += use(ctx, 'tw-commit', sign.gx, ly + 3)
      L.small += bare(sign.nx1 - 3, ly + 6.4, fmtInt(cm))
    }
  } else {
    // stacked: the sign line over the windows, the plate as long as its name, the agent-time and the commits at its end
    const sy = top + 2
    const label = fit(p.name, sign.hx - textW(tv, TOTAL) - 8 - sign.x0 - sign.tabW - 8 - (crown ? 10 : 0), sign.name)
    const pw = Math.round(sign.tabW + 4 + textW(label, sign.name) + 4)
    signPlate(L, sign.x0, sy - 1, pw, 11, sign.tabW, col)
    L.tags += bare(sign.x0 + sign.tabW / 2, sy + 6.2, `${n - i}F`)
    L.names += bare(sign.x0 + sign.tabW + 4, sy + 6.5, label)
    if (crown) L.fx += `<g>${crownTip}${use(ctx, 'tw-crown', sign.x0 + pw + 3, sy + 2)}</g>`
    L.big += bare(sign.hx, sy + 7.3, tv, am ? undefined : ROLE.dim)
    if (cm) {
      L.fx += use(ctx, 'tw-commit', sign.gx, sy + 3)
      L.small += bare(sign.pr, sy + 6.4, fmtInt(cm))
    }
  }

  // ---- the seven bays, in the floor's group (y from its window row): first how each day is lit (today's window,
  // while someone is in, at least by its screens)
  const ti = days.indexOf(today)
  const seats = seatsIn(ww)
  // who sits behind a floor's desks: its project's own agents by agent-time (Clawds for a Claude floor)
  const who = castPicker({ totals: { agents: p.agents } })
  const kind = screenOf(p)
  const wy = y + g.wy
  const bays = days.map((d, j) => {
    const pd = dayOfP(p, d)
    const m = n0(pd.minutes)
    const isLive = j === ti && live.length > 0
    return { d, j, wx: GX + j * pitch, pd, m, isLive, lv: isLive ? Math.max(1, glowLevel(m, L.max)) : glowLevel(m, L.max) }
  })
  const peak = Math.max(...bays.map((b) => b.m))

  let out = ''
  const tips = []
  for (const b of bays) {
    const { d, j, wx, pd, m, isLive, lv } = b
    // a day nobody worked there: the window shut, its shutter down under its rolled-up awning
    if (!lv) out += use(ctx, `tw-w${night ? 0 : 'd'}${st.code}`, wx)
    else {
      out += use(ctx, `tw-w${lv}${st.code}`, wx)
      // the day's agents behind the desk (today: whoever is in now)
      const nn = isLive ? live.length : clamp(n0(pd.sessions), 1, 99)
      const k = Math.min(seats, nn)
      if (!isLive) out += use(ctx, seatSprite(k, kind, Array.from({ length: k }, (_, q) => CAST[who(j * seats + q)].tag)), wx)
      else {
        // today's window while someone is in: the working ones type, the live lamp on its corner
        const people = stripOf(live)
        const tag = (q) => `tw-m-${CAST[agentId(people[q].agent)].tag}${people[q].cls === 'working' || people[q].cls === 'thinking' ? `t${q % 2}` : ''}`
        if (narrowPane(ww) && ww < WIN) out += use(ctx, tag(0), wx + loneX(ww), SEAT_Y)
        else seatsAt(ww, k).forEach((x, q) => { out += use(ctx, `tw-k-${kind}`, wx + x, SEAT_Y + 1) + use(ctx, tag(q), wx + x + agentDx(ww), SEAT_Y) })
        out += use(ctx, 'tw-desk', wx)
        // the live lamp on the awning's corner, clear of the transom's hours
        L.lamps.push([wx + ww - 3, wy + WY - 3, `${plural(live.length, 'desk')} open now on ${clip(p.name, 40)}`])
      }
      if (!isLive && lv <= 3) L.lit.push({ x: wx, y: wy, code: st.code, key: `${p.name}:${j}` })
      // the floor's best day: its hours on a gold tag hung in the transom; any other worked day's printed on the glass
      if (m === peak) L.best.push([wx, wy, fmtH(m)])
      else if (m > 0) L.printed.push([wx, wy, fmtH(m), glowLevel(m, L.max)])
    }
    if (j === ti) L.today.push([wx - 1, wy + SILL, ww + 2, 1, ROLE.accent])
    tips.push(`${WEEKDAY[dayOf(d).getUTCDay()]} ${m ? fmtH(m) : '·'}`)
  }
  L.floors += `<g transform="translate(0 ${wy})" color="${col}">${out}</g>`

  // ---- the ledge under the floor from pier to pier (gilt under the busiest on top): the row's clear edge
  const [hi, face] = crown && i === 0 ? [P.gold, P.goldF] : [P.stone, P.stoneF]
  L.arch.push(...ledge(g, wy, hi, face))
  L.ledges.push(wy + LEDGE)

  const t0s = p.titles?.[0] ? ` · ${clip(p.titles[0], 50)}` : ''
  const tip = `${clip(p.name, 50)} · ${fmtH(am)} agent-time · ${plural(n0(p.sessions), 'session')} · ${plural(cm, 'commit')}` +
    (L.detail > 1 ? '' : ` · ${tips.join(' ')}${t0s}`)
  L.hits += hitArea(g.IX0, top, g.IX1 - g.IX0, wy + FLOOR_H - top, tip)
  L.y = wy + FLOOR_H
}

// A floor's ledge (its window row's top y): its lit top, its face, its shadow on the brick, between the corner piers.
const ledge = (g, y, hi = P.stone, face = P.stoneF) => [[g.IX0, y + LEDGE, g.IX1 - g.IX0, 1, hi], [g.IX0, y + LEDGE + 1, g.IX1 - g.IX0, 1, face],
  [g.IX0, y + LEDGE + 2, g.IX1 - g.IX0, 1, '#000/.3']]

// The floor's best day: a gold tag hung in its window's transom, its hours in dark bold type (without the 'h' when the
// window is too narrow for it).
function goldTags(best, ww) {
  const r = []
  const light = []
  let text = ''
  for (const [wx, wy, v] of best) {
    const label = textW(v, 4.5) + 4 <= ww - 2 ? v : v.replace(/h$/, '')
    const w = Math.ceil(textW(label, 4.5) + 4)
    const x = wx + Math.floor((ww - w) / 2)
    const y = wy + WY
    r.push([x, y, w, 6, P.gold], [x + 1, y + 6, w, 1, '#000/.35'])
    light.push([x, y, w, 1, P.goldH], [x, y + 5, w, 1, P.goldD])
    text += bare(x + w / 2, y + 4.4, label)
  }
  return paint(r) + paint(light) + (text ? `<g font-size="4.5" font-weight="bold" fill="${INK}" text-anchor="middle">${text}</g>` : '')
}

// The other worked days' hours, printed on their transoms (centered, bold, in PRINT by the window's light; without the
// 'h' when the window is too narrow for it).
function printedHours(printed, ww) {
  const by = [null, '', '', '', '']
  for (const [wx, wy, v, lv] of printed) {
    const label = textW(v, 4.5) <= ww - 3 ? v : v.replace(/h$/, '')
    by[lv] += bare(wx + ww / 2, wy + GLASS + 4, label)
  }
  return by.map((t, lv) => (t ? `<g fill="${PRINT[lv]}">${t}</g>` : '')).join('')
}

// ---------------------------------------------------------------- the empty week, the key, the storage

// An empty range: one vacant floor, its windows shut, a sign across the sign column saying so.
function vacantFloor(ctx, g, L, word) {
  const { GX, pitch, fy0: y, sign } = g
  let bays = ''
  for (let j = 0; j < 7; j++) bays += use(ctx, `tw-w${ctx.night ? 0 : 'd'}3`, GX + j * pitch)
  L.floors += `<g transform="translate(0 ${y + g.wy})" color="#4a3d33">${bays}</g>`
  L.arch.push(...ledge(g, y + g.wy))
  const label = fit(`no tenants ${word}`, (g.side ? sign.pr : g.IX1 - 3) - sign.x0 - 8, 5)
  const pw = Math.round(textW(label, 5) + 8)
  mount(L, darkPlate(sign.x0, g.side ? y + 8 : y + 1, pw, 10))
  L.text += txt(sign.x0 + 4, g.side ? y + 15 : y + 8, label, 5, ROLE.dim)
  L.y = y + g.fh
}

// The fascia over the street front, a soft dark board between brass trims holding the key: a cream plate with brass
// ends naming it, then each of the four lit rooms as a little window with its hours under it (up to a sixteenth, a
// quarter, nine sixteenths of the busiest window, then the busiest window's own label, as glowLevel has them), a
// divider, the live lamp (on a range that has today) and the gold tag of a floor's best day: the fullest form that
// fits.
function key(ctx, g, max, live) {
  const { IX0, IX1, fyEnd } = g
  const y = fyEnd
  const w = IX1 - IX0
  const base = paint([[IX0, y, w, FASCIA, SOFT.plate], [IX0, y, w, 1, P.brass], [IX0, y + 1, w, 1, P.brassD], [IX0, y + FASCIA - 2, w, 1, P.brassD],
    [IX0, y + FASCIA - 1, w, 1, '#000/.45']])
  const in0 = IX0 + 5
  const in1 = IX1 - 5
  const up = (m) => (m < 60 ? `${Math.ceil(m)}m` : m < 597 ? `${(Math.ceil(m / 6) / 10).toFixed(1)}h` : `${Math.ceil(m / 60)}h`)
  const steps = [...[1, 2, 3].map((k) => `≤${up((max * k * k) / 16)}`), `≤${fmtH(max)}`]
  const sw = 9
  const slotW = Math.ceil(Math.max(sw, ...steps.map((l) => textW(l, 5)))) + 4
  const variants = [['WORKLOAD (AGENT-TIME)', 'LIVE NOW', 'BEST DAY'], ['WORKLOAD', 'LIVE NOW', 'BEST DAY'], ['WORKLOAD', 'LIVE', 'BEST'], ['', 'LIVE', 'BEST'], ['', '', 'BEST'], ['', '', '']]
  for (const [a, b0, c] of variants) {
    const b = live ? b0 : ''
    const plateW = a ? textW(a, 5) + 14 : 0
    const lead = a ? plateW + 6 : 0
    const tail = (b || c ? 9 : 0) + (b ? 8 + textW(b, 5) + 6 : 0) + (c ? 14 + textW(c, 5) : 0)
    if (lead + 4 * slotW + tail > in1 - in0) continue
    const r = []
    const light = []
    let s = ''
    let cx = in0
    if (a) {
      // the key's name on a cream plate with brass ends, centred on the band
      const px = in0
      const ph = 10
      const py = y + 7
      r.push([px + 3, py, plateW - 6, ph, PAPER], [px, py, 3, ph, P.brass], [px + plateW - 3, py, 3, ph, P.brass], [px + 2, py, 1, ph, P.brassD],
        [px + plateW - 1, py, 1, ph, P.brassD], [px + 1, py + ph, plateW, 1, '#000/.4'])
      light.push([px + 3, py, plateW - 6, 1, '#ffffff/.6'], [px, py, 3, 1, P.brassH], [px + plateW - 3, py, 3, 1, P.brassH])
      s += txt(px + plateW / 2, py + 7, a, 5, INK, ' font-weight="bold" text-anchor="middle"')
      cx += lead
    }
    steps.forEach((label, k) => {
      // a little window lit as a room at that level: its frame, its wall, its lit upper wall
      const x = Math.round(cx + (slotW - sw) / 2)
      const [wall, upper] = ROOM[k + 1]
      r.push([x, y + 3, sw, sw, P.frame], [x + 1, y + 4, sw - 2, sw - 2, wall], [x + 1, y + 4, sw - 2, 2, upper])
      if (k === 0) r.push([x + 3, y + 8, 3, 2, '#8fd8ff/.5'])
      s += txt(cx + slotW / 2, y + 19, label, 5, ROLE.title, ' text-anchor="middle"')
      cx += slotW
    })
    if (b || c) {
      r.push([Math.round(cx + 3), y + 4, 1, 16, '#4a4038'])
      cx += 9
    }
    if (b) {
      const lx = Math.round(cx)
      r.push([lx, y + 9, 5, 5, K.plate], [lx + 1, y + 10, 3, 3, LAMP])
      light.push([lx + 1, y + 10, 1, 1, '#ffffff'])
      s += txt(lx + 8, y + 13.6, b, 5, ROLE.title)
      cx = lx + 8 + textW(b, 5) + 6
    }
    if (c) {
      // a small gold tag, then what it means
      const gx = Math.round(cx)
      r.push([gx, y + 9, 11, 6, P.gold], [gx + 1, y + 15, 11, 1, '#000/.35'])
      light.push([gx, y + 9, 11, 1, P.goldH], [gx, y + 14, 11, 1, P.goldD])
      s += txt(gx + 5.5, y + 13.4, '9h', 4.5, INK, ' font-weight="bold" text-anchor="middle"')
      s += txt(gx + 14, y + 13.6, c, 5, ROLE.title)
    }
    return base + paint(r) + paint(light) + s
  }
  return base
}

// The floors that did not fit, and the quiet ones: how many, and the agent-time they hold.
function storageNote(storage, hrs, width) {
  const forms = [`+${storage} more in storage${hrs ? ` · ${fmtH(hrs)}` : ''}`, `+${storage} more${hrs ? ` · ${fmtH(hrs)}` : ''}`, `+${storage} more`]
  return forms.find((x) => textW(x, 5) <= width) ?? fit(forms.at(-1), width, 5)
}

// ---------------------------------------------------------------- life

// The window cleaner, by day: his platform hangs on two ropes from the rail in front of the quietest column (never
// today's), and stops at every floor on its way down, then goes back up; the ropes run out as it goes.
function cleaner(ctx, g, ledges, col) {
  const x = Math.round(g.GX + col * g.pitch + g.ww / 2 - 10)
  const ys = ledges.map((ly) => ly - 9)
  const ropeTop = g.band + 5
  const vals = []
  const times = []
  let t = 0
  ys.forEach((y, i) => {
    if (i) t += 1.4
    vals.push(y)
    times.push(t)
    t += 2.6
    vals.push(y)
    times.push(t)
  })
  t += Math.max(3, ys.length * 0.6)
  vals.push(ys[0])
  times.push(t)
  const kt = times.map((v) => Math.round((v / t) * 1e4) / 1e4).join(';')
  const anim = (attr, vs) => `<animate attributeName="${attr}" values="${vs.join(';')}" keyTimes="${kt}" dur="${r1(t)}s" repeatCount="indefinite"/>`
  const rope = (rx) => `<rect x="${rx}" y="${ropeTop}" width="1" height="${ys[0] - ropeTop}" fill="#c9c2b0">${anim('height', vals.map((v) => v - ropeTop))}</rect>`
  const who = CAST[agentId(ctx.pick?.(3) ?? 'claude')].tag
  return `<g><title>the window cleaner</title>${paint([[x, ropeTop - 1, 3, 1, P.iron], [x + 17, ropeTop - 1, 3, 1, P.iron]])}${rope(x + 1)}${rope(x + 18)}<g><animateTransform attributeName="transform" type="translate" ` +
    `values="${vals.map((v) => `${x} ${v}`).join(';')}" keyTimes="${kt}" dur="${r1(t)}s" repeatCount="indefinite"/>${use(ctx, `tw-gondola-${who}`)}</g></g>`
}

// ---------------------------------------------------------------- scene

/**
 * The week tower from y0 down: `(ctx, y0, opts?) → { svg, h, alt, gist, top, under }`, the contract of every scene
 * (lib/svg.mjs SCENES). One compact floor per project of the range with agent-time (busiest on top; the rest and the
 * quiet ones go to storage), each a row: its nameplate, under it the tube of its share, its agent-time and its commits,
 * its seven day windows with each worked day's hours (the best day's on a gold tag). `opts`: `floorsCap` (default
 * ctx.caps.floors), `budget` (default no limit): over it, the floors shed their life, then their tooltips' days, before
 * any floor goes.
 */
export function sceneWeek(ctx, y0, opts = {}, floorsCapArg) {
  const o = opts && typeof opts === 'object' ? opts : {}
  const floorsCap = Math.max(1, Math.floor(Number(o.floorsCap ?? floorsCapArg ?? ctx.caps.floors)) || 12)
  const budget = Number.isFinite(Number(o.budget)) && o.budget !== null ? Number(o.budget) : Infinity
  const had = new Set(ctx.defs.keys())
  const defs0 = defsMarkup(ctx).length
  for (let detail = 0; ; detail++) {
    const r = tower(ctx, y0, floorsCap, detail)
    if (detail >= 2 || r.svg.length + defsMarkup(ctx).length - defs0 <= budget) return r
    // the sprites only the richer drawing used must not stay in <defs>
    for (const k of [...ctx.defs.keys()]) if (!had.has(k)) ctx.defs.delete(k)
  }
}

// The tower at a level of detail: 0 everything, 1 without the life, 2 shorter tooltips.
function tower(ctx, y0, floorsCap, detail) {
  const { W, f, night } = ctx
  const projects = f.projects.filter((p) => p.name != null && p.name !== '')
  // a quiet project (a few minutes, or sessions with no project) waits in storage, unless the whole week was quiet
  const busy = projects.filter((p) => n0(p.agent_minutes) >= QUIET && p.name !== '(unknown)')
  const shown = (busy.length ? busy : projects).slice(0, floorsCap)
  const storage = projects.length - shown.length + n0(f.projects_more)
  const listed = projects.reduce((a, p) => a + n0(p.agent_minutes), 0)
  const beyond = n0(f.projects_more) ? n0(f.totals?.agent_minutes) - listed : 0
  const stored = listed - shown.reduce((a, p) => a + n0(p.agent_minutes), 0) + (beyond > 5 ? beyond : 0)
  const days = weekDays(f)
  const t = f.totals && typeof f.totals === 'object' ? f.totals : {}
  const busiest = shown.reduce((b, p, i) => (n0(p.agent_minutes) > n0(shown[b]?.agent_minutes) ? i : b), 0)
  const crowned = shown.length && n0(shown[busiest].agent_minutes) > 0 ? busiest : -1
  // the sign column's numbers, measured once so they stand in columns
  const hours = shown.map((p) => (n0(p.agent_minutes) ? fmtH(p.agent_minutes) : '·'))
  const totW = Math.max(textW('9.9h', TOTAL), ...hours.map((h) => textW(h, TOTAL)))
  const countW = Math.max(0, ...shown.map((p) => (n0(p.commits) ? textW(fmtInt(n0(p.commits)), 4.5) : 0)))
  const g = geometry(W, y0, shown.length, storage, { totW, countW })
  ctx.tw = { ww: g.ww }
  const kind = f.range?.kind
  const unit = kind === 'month' ? 'month' : kind === 'live' || kind === 'today' ? 'day' : 'week'
  const heading = rangeWord(f)

  // ---- the shared header (sky, the sign with the neon and the range's totals, skyline, brick shell)
  const lines = n0(t.additions) ? [[`+${fmtInt(t.additions)}/−${fmtInt(n0(t.deletions))} lines`, ROLE.dim]] : []
  const tot = [
    [`${fmtAgentTime(n0(t.agent_minutes))} agent-time`, ROLE.title], [plural(n0(t.sessions), 'session'), ROLE.title],
    [plural(n0(t.subagents), 'intern'), ROLE.intern], [plural(n0(t.workflows), 'meeting'), ROLE.meeting],
    [plural(n0(t.commits), 'commit'), ROLE.ship], ...lines,
  ]
  const hd = sceneHeader(ctx, y0, { view: 'week', when: f.range?.label ?? '', info: tot, groundY: g.groundY })

  // ---- the floors, layer by layer for the whole tower: windows, seats, dressing, plates, tubes, tags, text
  const L = {
    rects: [], light: [], glow: [], grooves: [], tubes: [], tubeLight: [], arch: [], today: [], lit: [], ledges: [], lamps: [], best: [], printed: [], ivy: [],
    floors: '', fx: '', tags: '', names: '', big: '', mid: '', small: '', text: '', hits: '', detail, y: g.fy0,
  }
  L.max = Math.max(1, ...shown.flatMap((p) => days.map((d) => n0(dayOfP(p, d).minutes))))
  L.top = Math.max(1, ...shown.map((p) => n0(p.agent_minutes)))
  if (shown.length) shown.forEach((p, i) => tenantFloor(ctx, g, p, i, shown.length, days, L, i === crowned))
  else vacantFloor(ctx, g, L, heading)

  // ---- the facade: the brick quieted behind the head and the floors, the pier between the sign column and the days,
  // the ledges (one paint)
  const top = g.fy0 - UNDER_BAND
  const pier = (px, w) => [[px, top, w, g.fyEnd - top, P.stoneF], [px, top, 1, g.fyEnd - top, P.stone], [px + w - 1, top, 1, g.fyEnd - top, P.stoneD]]
  if (g.side) L.arch.unshift(...pier(g.sign.pier, 4))
  let s = hd.svg + paint([[g.IX0, g.band, g.IX1 - g.IX0, g.fyEnd - g.band, CALM]]) + paint(L.arch)
  // ivy climbing the corner piers, clear of the signs and the windows: two runs on the left, one on the right
  if (!detail && shown.length >= 3) {
    const h = fnv1a(`ivy:${f.range?.days?.[0] ?? ''}`)
    const span = Math.max(1, g.fyEnd - g.fy0 - 40)
    s += use(ctx, 'tw-ivy', g.BX0 + 1, g.fy0 + 4 + (h % span)) + use(ctx, 'tw-ivy', g.BX0 + 1, g.fy0 + 24 + ((h >>> 8) % span)) +
      use(ctx, 'tw-ivy', g.IX1, g.fy0 + 10 + ((h >>> 16) % span))
  }
  // the night over the cornice and the brick between the corner piers (their quoins catch the street's light)
  if (night) s += paint([[g.BX0 - 3, g.roof, g.BX1 - g.BX0 + 6, 5, `${NIGHT}/.42`], [g.IX0, g.roof + 5, g.IX1 - g.IX0, g.groundY - g.roof - 5, `${NIGHT}/.42`]])
  // today's column, picked out in gold from the cards to the fascia
  const ti = days.indexOf(f.now?.local_date)
  if (ti >= 0 && shown.length) s += paint([[g.GX + ti * g.pitch - 2, top, g.ww + 4, g.fyEnd - top, `${ROLE.accent}/${night ? '.1' : '.08'}`]])
  // the busiest day of the week, all floors
  let best = null
  let bestM = 0
  for (const d of days) if (n0(f.per_day?.[d]?.minutes) > bestM) [best, bestM] = [d, n0(f.per_day[d].minutes)]
  s += head(ctx, g, days, best)
  s += L.floors
  // by day the window cleaner, in front of the column with the fewest lit windows (never today's)
  if (!night && ctx.animate && !detail && shown.length >= 2) {
    const lit = days.map((d, j) => (j === ti ? Infinity : shown.reduce((a, p) => a + (n0(dayOfP(p, d).minutes) > 0), 0)))
    s += cleaner(ctx, g, L.ledges, lit.indexOf(Math.min(...lit)))
  }
  s += paint([...L.rects, ...L.today]) + paint(L.light) + paint(L.grooves) + paint(L.tubes) + paint(L.tubeLight)
  if (L.printed.length) s += `<g font-size="4.5" font-weight="bold" text-anchor="middle">${printedHours(L.printed, g.ww)}</g>`
  s += (L.glow.length ? paint(L.glow) : '') + L.fx + goldTags(L.best, g.ww)
  if (L.tags) s += `<g font-size="4.5" fill="${ROLE.dim}" text-anchor="middle">${L.tags}</g>`
  if (L.names) s += `<g font-size="${g.sign.name}" font-weight="bold" fill="${K.plate}">${L.names}</g>`
  if (L.big) s += `<g font-size="${TOTAL}" font-weight="bold" fill="${SOFT.fig}" text-anchor="end">${L.big}</g>`
  if (L.small) s += `<g font-size="4.5" fill="${SHIP_Q}" text-anchor="end">${L.small}</g>`
  // the live lamps on the corners of today's windows, a soft halo round them at night
  for (const [lx, ly, tip] of L.lamps) {
    s += `<g><title>${esc(tip)}</title>${paint([...(night ? [[lx - 2, ly - 2, 6, 6, `${LAMP}/.22`]] : []), [lx - 1, ly - 1, 4, 4, K.plate], [lx, ly, 2, 2, LAMP], [lx, ly, 1, 1, '#ffffff']])}</g>`
  }
  s += L.text + L.hits
  // at night now and then a light goes off for a moment (two windows the date picks)
  if (night && ctx.animate && !detail) {
    const off = L.lit.map((w) => ({ ...w, h: fnv1a(`off:${f.now?.local_date ?? ''}:${w.key}`) })).sort((a, b) => a.h - b.h).slice(0, 2)
    off.forEach((w, k) => {
      s += `<g opacity="0" transform="translate(${w.x} ${w.y})">${use(ctx, 'tw-bx')}${use(ctx, 'tw-glz')}${use(ctx, `tw-a${w.code}`)}` +
        `<animate attributeName="opacity" values="0;1;0" keyTimes="0;.84;.93" dur="${[19, 27][k]}s" calcMode="discrete" repeatCount="indefinite"/></g>`
    })
  }

  // ---- the fascia with the key over the ground floor, the Office's own street front (lent by the composer as
  // ctx.floors.front), on the sidewalk; under it (footing) the storage
  s += key(ctx, g, L.max, ti >= 0)
  const front = ctx.floors?.front ? ctx.floors.front(ctx, g.fyEnd + FASCIA, LOBBY, g.IX0, g.IX1) : { facade: '', street: '' }
  s += front.facade
  let foot = ''
  if (storage > 0 && ctx.transparent) {
    foot += txt(8, g.groundY + 12, storageNote(storage, stored, W - 16), 5, ROLE.dim)
  } else if (storage > 0) {
    const ct = g.groundY + 4
    foot += paint([[g.IX0, ct, g.IX1 - g.IX0, g.cellar, P.store], [g.IX0, ct, g.IX1 - g.IX0, 1, '#000/.4']])
    const cy = ct + g.cellar
    foot += use(ctx, 'crate', g.IX0 + 4, cy - 9) + use(ctx, 'crate', g.IX0 + 15, cy - 9) + use(ctx, 'crate', g.IX0 + 9, cy - 17)
    foot += txt(g.IX0 + 30, ct + 11, storageNote(storage, stored, g.IX1 - g.IX0 - 34), 5, ROLE.dim)
  }
  const ft = footing(ctx, g.groundY, y0 + g.H, foot)
  s += ft.walk + front.street

  // ---- the alt text: the range in numbers and its busiest floor
  const am = n0(t.agent_minutes)
  const topP = projects.reduce((b, p) => (n0(p.agent_minutes) > n0(b?.agent_minutes) ? p : b), null)
  const gist = `${heading}: ${am ? `${fmtAgentTime(am)} agent-time` : 'no agent-time yet'}, ${plural(n0(t.sessions), 'session')}, ${plural(n0(t.commits), 'commit')}` +
    (topP ? `, busiest floor ${clip(topP.name, 40)} ${fmtAgentTime(n0(topP.agent_minutes))}` : '')
  return { svg: s + ft.under.svg, top: s, under: ft.under, h: g.H, alt: `The Office ${gist}`, gist }
}

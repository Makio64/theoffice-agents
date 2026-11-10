// PURE: the pixel-art office as one SVG string, for the desktop app's live pane and the HTML page.
// No node:* imports: the desktop mod hooks module (no Node, no DOM) imports this file.
// Each view is a building drawn by a scene in its own file: the live floor plan (svg-live.mjs), the week tower
// (svg-week.mjs), the day (svg-today.mjs), the month (svg-month.mjs) and what they did (svg-work.mjs). The Office view
// (`all`, the pane's Office tab) is the live building, floor by floor, with what they did in its basement (B1); the
// week tower is the Week view's. Every scene opens with the same header (svg-kit sceneHeader: the sign on the roof,
// its neon THE OFFICE over the scene's lines, the sky, the skyline), so the roof line sits at the same height in every view. Under every building runs the COMMITS LINE
// (svg-street.mjs): the commits on a Clawd train, faster the more commits a day, right under the sidewalk (under the
// basement for the live building). The timelapse (svg-timelapse.mjs, renderTimelapse) stands apart from the views: a
// range replayed slot by slot as one looping drawing of the same building, the reel of the range under its sidewalk.
// This file is only the registry and the composer: which scene a view draws, the size budget, the root <svg>. The shared primitives (palette, sprites, font, text, SMIL, the header) live in
// lib/svg-kit.mjs; scene files import from there, never from here or from each other: a floor one scene lends another
// (the live basement is svg-work.mjs workFloor, the week tower's ground floor the Office's street front; the
// timelapse's street front and desk accessories are svg-live.mjs's) goes through the composer, as ctx.floors.
import { deskClass } from './model.mjs'
import { K, MAX_SVG, castPicker, clamp, clockFor, defsMarkup, esc, ms, palette, sane, steadyFacts, tally } from './svg-kit.mjs'
import { deskProps, frontage, sceneLive, streetFront } from './svg-live.mjs'
import { sceneLoading } from './svg-loading.mjs'
import { directoryBoard, sceneMonth } from './svg-month.mjs'
import { street, subway } from './svg-street.mjs'
import { HOLD_SECONDS, LAPSE_LADDER, SLOT_SECONDS, lapseTimeline, sceneTimelapse } from './svg-timelapse.mjs'
// the roof's props, registered with the kit for every scene's skyline
import './svg-roof.mjs'
import { sceneToday } from './svg-today.mjs'
import { sceneWeek } from './svg-week.mjs'
import { sceneWork, workFloor } from './svg-work.mjs'

/** XML escape (lib/svg-kit.mjs), re-exported for html.mjs and the type sidecar. */
export { esc } from './svg-kit.mjs'
/** The last pass over a drawing a browser holds on screen for hours (lib/svg-beat.mjs): the pane's. */
export { onBeat } from './svg-beat.mjs'

// Desk class (model.mjs): counts are always recomputed from classes, never read from live.counts.
const classOf = deskClass

// Caps tried in order until the SVG fits MAX_SVG (the desktop Svg element refuses sources over 131 072 chars). `level`
// is for the other scenes: 0 = full detail, 1 and 2 = tighter (the very last try also turns animation off). The live
// building tries each rung in its full art and then lighter ones (`art: 1`: its figures in still frames that blink by
// themselves, no ceiling lights, no cat, plain windows; `art: 2`: no blinks, plain walls), each with its walls dressed
// first (`dress`: wallpaper, the picture rail, what hangs on the walls) and then bare, so the dressing gives way before
// any art does; it keeps the fuller art only when its basement keeps as much furniture with it.
const CAPS = [{ level: 0, desks: 24, meetings: 3, floors: 12 }, { level: 1, desks: 14, meetings: 2, floors: 8 }, { level: 2, desks: 6, meetings: 1, floors: 4 }]
// The roof's ornament and the sky's art as a drawing near its budget sheds them, each in the finer art and then in the
// plain one, [ctx.roof, ctx.sky, ctx.fine]: the full roof under the full sky (its haloed sun and moon, its clouds in every
// light), then under the lean sky, then the roof without its lesser props, then the lean roof. The finer art (svg-kit
// fine: the street front and the rooms' furniture shaded and on their shadows, every figure made of the cast's shared lit
// parts) weighs more than the plain one in a small drawing and less in a crowded one, so each rung tries it first and
// the art the drawings had before it right after: no drawing is poorer for it, and a crowded one keeps more of its sky.
const ROOFS = [[0, 1], [0, 0], [1, 0], [2, 0]].flatMap(([roof, sky]) => [[roof, sky, 1], [roof, sky, 0]])
// The step a liveClock drawing's durations hold for (renderSvg `liveClock`).
const WINDOW_MS = 600_000
// CSS px per art pixel (renderSvg and renderTimelapse `scale`): 2 unless asked, never past 4
const pixelOf = (scale) => clamp(Number(scale) || 2, 2, 4)

// ---------------------------------------------------------------- scene registry

/**
 * Scene name → `(ctx, y0) → { svg, h, alt, gist?, top?, under? }`: the whole drawing but the commits line, painted from
 * y0 down, h tall, under the header every scene shares (svg-kit sceneHeader). `alt` describes the scene ('The Office
 * this week: …'); `gist` is the same without the lead ('this week: …'). `top` and `under` (svg-kit footing) split
 * `svg` at the sidewalk: `top` the building down to it, `under` `{ y, svg }` the lines written below it, so the commits
 * line can run right under the street. Scenes never throw on partial facts: they read numbers with `Number(x) || 0`
 * and objects with `?.`.
 */
const SCENES = {
  live: sceneLive,
  week: sceneWeek,
  today: sceneToday,
  month: sceneMonth,
  work: sceneWork,
}

/**
 * Scenes whose building goes on underground: the live building's basement (B1, what they did) sits right under its
 * sidewalk, so the commits line runs under the basement, without a road of its own (svg-street `road: false`).
 */
const DEEP = new Set(['live'])

/**
 * Floors one scene lends another, handed to every scene as ctx.floors (scene files never import each other, so the
 * composer wires them): `work`, what they did as one compact floor (svg-work.mjs workFloor), the live basement;
 * `front`, the Office's street front (svg-live.mjs streetFront), the week tower's ground floor; `directory`, the
 * month's board of tenants (svg-month.mjs directoryBoard), the week's under its street.
 */
const FLOORS = Object.freeze({ work: workFloor, front: streetFront, directory: directoryBoard })

/**
 * Views renderSvg draws, each the scene of its one building: `all` (the Office tab, and the skill's default) is the live
 * building with what they did in its basement, drawn exactly as `live` (its commits line hauls today's commits); the
 * week tower is the `week` view's alone. Every view has the commits line under its street. Any other view name draws
 * `live`.
 */
export const SVG_VIEWS = Object.freeze({
  live: ['live'], today: ['today'], week: ['week'], month: ['month'], work: ['work'], all: ['live'],
})

// ---------------------------------------------------------------- entry

/**
 * Live headcount recomputed from desk classes (model.mjs deskClass), shared with the HTML header so the page and
 * the drawing never disagree (raw `live.counts` calls an asking desk idle).
 */
export function officeCounts(facts) {
  const f = sane(facts)
  const parsed = ms(f.now?.iso ?? f.generated_at)
  const now = Number.isFinite(parsed) ? parsed : Date.now()
  const desks = f.live.desks.map((d) => ({ ...d, cls: classOf(d, now) }))
  const t = tally(desks)
  const meetings = desks.flatMap((d) => d.meetings)
  return {
    desks: desks.length, working: t.working, waiting: t.waiting, asking: t.asking, stopped: t.stopped, errors: t.errors, onBreak: t.onBreak,
    done: t.done, interns: t.interns,
    meetings: meetings.length, meetingAgents: meetings.reduce((a, m) => a + (m.agents_running || 0), 0),
  }
}

/**
 * Render the office as one self-contained SVG string (the text office's visual language, in pixel art).
 * Why a separate renderer: the desktop pane draws `<Svg isInteractive>` in a script-less sandboxed frame, where
 * SMIL and `<title>` tooltips work — so the office can breathe (typing hands, flickering monitors, z's, steam)
 * without a frame clock round-tripping through `$`.
 * - `view`: 'live' (floor plan, its floors numbered, what they did in the basement), 'today' (the day), 'week' (the
 *   tower), 'month' (the month), 'work' (what they did), 'all' (the Office: the live building, as 'live'); see
 *   SVG_VIEWS. Anything else draws 'live'. Every view has the
 *   commits line under its street (today's commits for live, all and today, the range's for the others), unless only
 *   dropping it keeps the view in the size budget.
 * - `width`: CSS px; the art is drawn on a 2-px pixel grid (viewBox = width / 2), so text stays legible.
 * - `animate`: false emits no SMIL at all (static snapshots, tests, thumbnails).
 * - `idPrefix`: prefix for `<defs>` ids, so two SVGs can live in one HTML document.
 * - `minHeight`: CSS px the drawing should at least fill: a shorter drawing grows bedrock under the commits line, so a
 *   box is covered top to bottom (backdrop: nothing when transparent).
 * - `transparent`: true paints no backdrop (ctx.transparent): no sky, no title bar, no ground behind the lines under a
 *   building, no root background, so the buildings, their rooftops, the moon or the sun and the street sit on the page
 *   behind the drawing (the desktop pane) instead of in a box of their own. Stars stay, at half opacity; the text
 *   and the moon on the page get a dark halo, so they read on a light page too.
 * - `card`: true draws it as a card (rootSvg): clipped to rounded corners on its ground, a hairline edge of light just
 *   inside them, no root background. The desktop pane keeps a gutter around what a plugin draws, where a transparent
 *   drawing's street, commits line and tunnel stopped as a hard cut; with its own sky and ground (`transparent` false),
 *   the card ends there by design, in any theme.
 * - `liveClock`: true for a drawing that stays on screen (the desktop pane, which keeps one source until the drawing
 *   changes: a new one reloads its frame, a blink). Its clocks (the title's HH:MM, the LED and punch clocks, today's now
 *   label) run by themselves (svg-kit clockFor), phased from `clockAt` (epoch ms, the moment the source goes on screen;
 *   the facts' now when not given). Everything else that moves with the wall clock moves in steps: durations hold for a
 *   10-minute window (now is floored to it) and say only what they are at least, in steps a desk seldom crosses
 *   ('10m+', '1h+', '3h+': format.mjs fmtAtLeast), a desk turns dozing at a window's start, today's now line sits
 *   mid-hour, the sky follows the facts' hour and night. Running totals (agent-time, tool calls) are drawn in steps too
 *   (svg-kit steadyFacts; what they did's shares are the exact counts', ctx.exact, whole percents a share crosses
 *   only now and then). So two drawings of the same facts inside one 10-minute window, with the same `clockAt`, are
 *   the same string. Off by default: the CLI, the page and the snapshots draw the facts' exact minute and totals.
 * - `rooms`: true writes the boxes of the rooms a scene names on the root, `data-rooms="calendar x y w h;…"` in art
 *   units (the month's wall calendar, building directory and crew), for an export to crop one (cropRoom).
 * - `scale`: CSS px per art pixel, 2 (the default) to 4: the pane's Zoom key draws at 2.5. The same `width` holds fewer
 *   art pixels, each bigger (its words and figures with it), so fewer desks fit a row and the building grows taller;
 *   the root's box is still `width` wide. A drawing that would be narrower than its 200 art pixels keeps them and scales
 *   less.
 * - `quiet`: true draws the live building (`live`, `all`) with its names alone (svg-live.mjs, the pane's Quiet key): the
 *   nameplates, the headcount strips and the floor numbers stay, the sign keeps one line (the desks, their strip, what
 *   needs you), a desk that needs you its two lines and every other one a card under the pointer, the meeting room's
 *   whiteboards their words, the basement's tags their first line (the share and the calls); the other tags, the
 *   scoreboards and the basement's header words go, and the commits line keeps its name. Any other view ignores it.
 * Never emits script, event attributes, external references or foreignObject; every facts string is escaped;
 * output stays ≤ 120 000 chars (desks capped at 24, meetings at 3, facade floors at 12; tighter caps if ever needed).
 */
export function renderSvg(facts, { width = 640, animate = true, view = 'live', idPrefix = 'to', minHeight = 0, transparent = false, card = false, liveClock = false, clockAt, rooms = false, quiet = false, scale = 2 } = {}) {
  const live = liveClock === true
  // a live drawing shows its running totals in steps (svg-kit steadyFacts), so they hold while agents work; the exact
  // counts stay at hand (ctx.exact) for what they did's shares, which floored counts would skew
  const exact = sane(facts)
  const f = live ? steadyFacts(exact) : exact
  const px = clamp(Math.round(Number(width) || 640), 240, 2400)
  const W = Math.max(200, Math.round(px / pixelOf(scale)))
  const parsed = ms(f.now?.iso ?? f.generated_at)
  // a live drawing reads durations and classes from the start of the 10-minute window, so it holds for the window
  const now = Number.isFinite(parsed) ? (live ? Math.floor(parsed / WINDOW_MS) * WINDOW_MS : parsed) : Date.now()
  const desks = f.live.desks.map((d) => ({ ...d, cls: classOf(d, now) }))
    .sort((a, b) => String(a.started_at ?? '').localeCompare(String(b.started_at ?? '')) || String(a.id ?? '').localeCompare(String(b.id ?? '')))
  // the scene the view draws: `all` is the live building, drawn as `live` in every respect (ctx.view included)
  const v = SVG_VIEWS[typeof view === 'string' && Object.hasOwn(SVG_VIEWS, view) ? view : 'live'][0]
  const id = `${String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '') || 'to'}-`
  // tighter caps until it fits; the commits line goes before any detail, the live rooms' full art before either. At
  // each level of the rooms' art the sky's art (ctx.sky) and then the roof (ctx.roof: 0 full, 1 without its lesser
  // props, 2 the lean roof) come down (ROOFS), each tried in the finer art (ctx.fine) and then in the plain one, as far as
  // the drawing needs to fit at all, and to keep the basement furnished only by the sky's art and the roof's lesser props
  // (the bulkhead, the chimney, the vents, the pigeons), never to the lean roof; then the level that keeps the basement
  // furnished wins
  const ladder = [...CAPS.map((caps) => [caps, animate !== false]), [CAPS.at(-1), false]]
  let out = ''
  for (const [caps, anim, line] of ladder.flatMap((t) => [[...t, true], [...t, false]])) {
    let best = null
    const arts = v !== 'live' ? [[0, true]] : anim ? [[0, true], [0, false], [1, true], [1, false], [2, false]] : [[0, true], [0, false]]
    for (const [art, dress] of arts) {
      let last = false
      for (const [roof, sky, fine] of ROOFS) {
        // a roof without its lesser props was drawn and fitted, its plain twin tried after it: no leaner roof for the
        // basement's sake
        if (last && fine) break
        const ctx = {
          f, exact, W, px, animate: anim, id, now, night: Boolean(f.now?.is_night), color: palette(f), desks, view: v, caps: { ...caps, art, dress }, roof, sky, fine,
          defs: new Map(), brick: false, minHeight: clamp(Math.round(Number(minHeight) || 0), 0, 8000), transparent: transparent === true,
          card: card === true, liveClock: live, clock: clockFor(f, live && anim, clockAt == null ? NaN : Number(clockAt)), floors: FLOORS,
          // who sits in the drawings' generic seats (what they did's rooms…): the cast mixed by agent-time
          pick: castPicker(exact),
          // what the live clocks drawn are short of their longest moment (svg-kit clockSlack)
          clockSlack: { chars: 0 },
          rooms: rooms === true,
          // the live building with its names alone (renderSvg `quiet`): read by its scene, its basement and its line
          quiet: quiet === true && v === 'live',
        }
        out = draw(ctx, v, line)
        // measured at the clocks' longest, so a redraw of the same office phased from another moment keeps its rung
        if (out.length + ctx.clockSlack.chars > MAX_SVG) continue
        // ctx.b1: the detail the live basement had to come down to (0: furnished)
        if (!best || (ctx.b1 ?? 0) < best.b1) best = { svg: out, b1: ctx.b1 ?? 0 }
        // the full roof fits but leaves the basement short: one more try with a lean sky, one without the roof's lesser
        // props, never the lean roof (each in the finer art, then in the plain one: the plain twin of the last try is
        // always drawn, so the basement is never left shorter than the plain art would furnish it)
        if (!best.b1 || (roof && !fine)) break
        last = roof > 0
      }
      if (best && !best.b1) break
    }
    if (best) return best.svg
  }
  return out
}

// ---------------------------------------------------------------- the timelapse

/**
 * The replay's pace, shared by every renderer of the timelapse (this drawing, the text version, the export page and
 * the pane): seconds of replay per slot, seconds the last slot holds before the loop starts over. A loop of `slots`
 * slots lasts slots × SLOT_SECONDS + HOLD_SECONDS.
 */
export const TIMELAPSE = Object.freeze({ SLOT_SECONDS, HOLD_SECONDS })

/**
 * What the timelapse borrows from the live floor (scene files never import each other, so the composer wires them):
 * `front`, the street front of the ground floor (svg-live frontage), and `props`, a desk's accessories (svg-live
 * deskProps), so a desk in the replay looks as it does on the live floor.
 */
const LAPSE_FLOORS = Object.freeze({ front: frontage, props: deskProps })

/**
 * Render the timelapse (facts.timeline: yesterday, this week or this month, slot by slot) as one self-animating, looping
 * SVG of the office (svg-timelapse.mjs). Why a loop: the desktop pane's `<Svg isInteractive>` is a script-less sandboxed
 * frame that reloads on every new source, so the replay plays by itself (SMIL), each slot TIMELAPSE.SLOT_SECONDS on
 * screen, the last one held TIMELAPSE.HOLD_SECONDS, then again.
 * - `width`: CSS px (240…2400); the art is on the 2-px pixel grid (viewBox = width / 2), as renderSvg's.
 * - `animate`: false draws a still of the busiest slot (the most desks at work, the earliest of a tie), no SMIL at all.
 *   Animated, every base attribute shows that same slot, so a surface without SMIL shows the still.
 * - `idPrefix`: prefix for `<defs>` ids, so two SVGs can live in one HTML document.
 * - `transparent`: true paints no backdrop (no sky bands, no ground behind the reel, no root background), as renderSvg's.
 * - `card`: true draws it as a card (rounded corners on its ground, a hairline edge, no root background), as renderSvg's.
 * - `scale`: CSS px per art pixel (2 to 4), as renderSvg's: the pane's Zoom key.
 * The root <svg> says how the replay runs, for the export page's player: `data-timelapse` (the range), `data-loop`
 * (seconds), `data-slots`, `data-slot-seconds`, `data-hold`. Pure and deterministic: the same facts and options give
 * the same string. Never throws on partial facts (no timeline draws the building closed: nothing to replay) and stays
 * ≤ MAX_SVG: the scene's ladder (LAPSE_LADDER) sheds walkers, dozing, interns, desks and the meeting room, and at last
 * replays coarser slots, but never stops the replay.
 */
export function renderTimelapse(facts, { width = 960, animate = true, idPrefix = 'tl', transparent = false, card = false, scale = 2 } = {}) {
  const f = sane(facts)
  const px = clamp(Math.round(Number(width) || 960), 240, 2400)
  const W = Math.max(200, Math.round(px / pixelOf(scale)))
  const parsed = ms(f.now?.iso ?? f.generated_at)
  const id = `${String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '') || 'tl'}-`
  // the projects the timeline names but the facts' list does not (capped at 40) still get a color of their own
  const named = new Set(f.projects.map((p) => p.name))
  const extra = [...new Set((lapseTimeline(f)?.desks ?? []).map((d) => d.project))].filter((n) => !named.has(n)).map((name) => ({ name }))
  const color = palette({ ...f, projects: [...f.projects, ...extra] })
  let out = ''
  // each rung with the full roof under the full sky, then under the lean one, then the roof's lesser props left out,
  // then the lean roof, each in the finer art and then in the plain one (ROOFS): the sky's art and the roof's ornament
  // go before the replay's detail
  for (const [level, roof, sky, fine] of LAPSE_LADDER.flatMap((l) => ROOFS.map(([roof, sky, fine]) => [l, roof, sky, fine]))) {
    const ctx = {
      f, exact: f, W, px, animate: animate !== false, id, now: Number.isFinite(parsed) ? parsed : 0, night: Boolean(f.now?.is_night), color, desks: [],
      view: 'timelapse', caps: level, roof, sky, fine, defs: new Map(), brick: false, minHeight: 0, transparent: transparent === true, card: card === true,
      liveClock: false, clock: { hm: '', live: false }, floors: LAPSE_FLOORS, pick: castPicker(f),
    }
    const scene = sceneTimelapse(ctx, 0, level)
    const h = Math.round(scene.h * (px / W))
    const data = ` data-timelapse="${scene.kind}" data-loop="${scene.loop}" data-slots="${scene.slots}" data-slot-seconds="${SLOT_SECONDS}" data-hold="${HOLD_SECONDS}"`
    out = rootSvg(ctx, { px, h, H: scene.h, alt: scene.alt, data }, scene.svg)
    if (out.length <= MAX_SVG) break
  }
  return out
}

/**
 * The room a tab shows while its facts are read for the first time (svg-loading.mjs): Clawd reading at the archive,
 * the calendar's days lighting up one by one. `kind` is what is read ('month', 'week', 'today' or 'past'); the drawing
 * is the same for the whole wait (how far it is, the pane says in text under it), so its frame never reloads.
 * - `width`, `animate`, `idPrefix`, `card` as renderSvg's; `night` lights the windows by night.
 */
export function renderLoading(kind, { width = 640, animate = true, idPrefix = 'ld', card = false, night = false } = {}) {
  const px = clamp(Math.round(Number(width) || 640), 240, 2400)
  const W = Math.max(200, Math.round(px / 2))
  const id = `${String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '') || 'ld'}-`
  const ctx = {
    f: {}, W, px, animate: animate !== false, id, now: 0, night: night === true, desks: [], view: 'loading', caps: { art: 0 }, roof: 0, sky: 1,
    defs: new Map(), brick: false, minHeight: 0, transparent: false, card: card === true, liveClock: false, clock: { hm: '', live: false },
  }
  const scene = sceneLoading(ctx, kind)
  return rootSvg(ctx, { px, h: Math.round(scene.h * (px / W)), H: scene.h, alt: scene.alt, data: ` data-loading="${esc(String(kind))}"` }, scene.svg)
}

function draw(ctx, v, withLine) {
  const { px, W } = ctx
  // the commits line is drawn first, at y 0 (its sprites lead <defs>); it moves under the street once the scene's
  // height is known. Under a building that goes on underground (DEEP: the live building's basement) the street is up at
  // the lobby, so its line has no road of its own.
  const line = withLine ? subway(ctx, 0, undefined, { road: !DEEP.has(v) }) : null
  // a drawing that had to leave the line out does not get it back from the filler under it: bedrock only
  ctx.subway = true
  // what the line weighs, for a scene that sizes its own detail to the budget (the live basement)
  ctx.lineChars = line ? line.svg.length : 0
  const scene = SCENES[v](ctx, 0)
  // the commits line right under the sidewalk (or the basement), the lines the scene writes there moved under it; a
  // scene that does not say where its sidewalk is gets the line under all it drew
  let body = scene.svg
  let H = scene.h
  if (line && scene.under) {
    body = scene.top + `<g transform="translate(0 ${scene.under.y})">${line.svg}</g>` +
      `<g transform="translate(0 ${line.h - 1})">${scene.under.svg}</g>`
    H += line.h - 1
  } else if (line) {
    body += `<g transform="translate(0 ${H})">${line.svg}</g>`
    H += line.h
  }
  // the pane is taller than the drawing: bedrock carries on below it
  const fillTo = Math.ceil(ctx.minHeight * (W / px))
  if (fillTo > H) {
    body += street(ctx, H, fillTo - H)
    H = fillTo
  }
  const h = Math.round(H * (px / W))
  return rootSvg(ctx, { px, h, H, alt: scene.alt, data: ctx.rooms ? roomsData(scene.rooms) : '' }, body)
}

/** The rooms' boxes as a root attribute (renderSvg `rooms`): `data-rooms="calendar 6 56 249 182;…"`, whole art units. */
function roomsData(rooms) {
  const list = Object.entries(rooms && typeof rooms === 'object' ? rooms : {})
    .filter(([name, box]) => /^[a-z]{1,16}$/.test(name) && Array.isArray(box) && box.length === 4 && box.every(Number.isFinite))
  return list.length ? ` data-rooms="${list.map(([name, box]) => `${name} ${box.map((n) => Math.round(n)).join(' ')}`).join(';')}"` : ''
}

/**
 * The boxes a drawing made with renderSvg `rooms` names: `{ calendar: [x, y, w, h], … }` in art units, {} for none.
 * Read back from its root, so a drawing's own markup is all an export needs.
 */
export function roomsOf(svg) {
  const attr = /^<svg\b[^>]*?\sdata-rooms="([^"]*)"/.exec(String(svg ?? ''))?.[1] ?? ''
  const out = {}
  for (const part of attr.split(';')) {
    const [name, ...nums] = part.trim().split(/\s+/)
    const box = nums.map(Number)
    if (/^[a-z]{1,16}$/.test(name ?? '') && box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0) out[name] = box
  }
  return out
}

/**
 * One room of a drawing made with renderSvg `rooms`, as a drawing of its own: the same markup with its root's viewBox on
 * the room's box and its size at the drawing's scale, its title and label `alt` (else the drawing's own). null when the
 * drawing names no such room. Everything outside the box is still in the markup, only out of view.
 */
export function cropRoom(svg, room, alt) {
  const source = String(svg ?? '')
  const box = roomsOf(source)[room]
  const root = /^<svg\b[^>]*>/.exec(source)?.[0]
  const vb = root && /\sviewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(root)
  const px = root && /\swidth="([\d.]+)"/.exec(root)
  if (!box || !vb || !px) return null
  const k = Number(px[1]) / Number(vb[1])
  const [x, y, w, h] = box
  let tag = root.replace(/\swidth="[^"]*"/, ` width="${Math.round(w * k)}"`).replace(/\sheight="[^"]*"/, ` height="${Math.round(h * k)}"`)
    .replace(/\sviewBox="[^"]*"/, ` viewBox="${x} ${y} ${w} ${h}"`).replace(/\sdata-rooms="[^"]*"/, '')
  let rest = source.slice(root.length)
  if (typeof alt === 'string' && alt) {
    tag = tag.replace(/\saria-label="[^"]*"/, ` aria-label="${esc(alt)}"`)
    rest = rest.replace(/^<title>[^<]*<\/title>/, `<title>${esc(alt)}</title>`)
  }
  return tag + rest
}

// The card's corners and edge, in art units (2 CSS px): rounded about as the desktop app rounds its own cards, the edge
// a hairline of light (1 CSS px) just inside the corners, so it lies on the scene, never on the page.
const CARD = Object.freeze({ radius: 7, edge: 0.5, light: 0.2 })

/**
 * The root <svg> around a finished drawing, ctx.W × `H` art units drawn `px` × `h` CSS px: its title, its <defs>, then
 * `body`. Opaque, the ground color is behind it all: if a surface fits the drawing into a box of another shape, the
 * margin is ground, never a bare strip of page; transparent, the page itself is the backdrop. A card (ctx.card) has no
 * root background either: `body` is clipped to rounded corners over the ground (none under a transparent body), the
 * hairline edge drawn over it, so the corners and any margin are the page's. Either way the drawing hangs from the top
 * of the box (xMidYMin), so a box a little taller than the drawing never pushes its header down. `data`: more root
 * attributes, each with its leading space.
 */
function rootSvg(ctx, { px, h, H, alt, data = '' }, body) {
  const { W } = ctx
  const bg = ctx.transparent || ctx.card ? '' : `style="background:${K.ground}" `
  let defs = defsMarkup(ctx)
  if (ctx.card) {
    const round = 'shape-rendering="geometricPrecision"'
    const e = CARD.edge
    defs += `<clipPath id="${ctx.id}card"><rect width="${W}" height="${H}" rx="${CARD.radius}" ${round}/></clipPath>`
    body = `<g clip-path="url(#${ctx.id}card)">${ctx.transparent ? '' : `<rect width="${W}" height="${H}" fill="${K.ground}"/>`}${body}</g>` +
      `<rect x="${e / 2}" y="${e / 2}" width="${W - e}" height="${H - e}" rx="${CARD.radius - e / 2}" fill="none" stroke="#fff" ` +
      `stroke-opacity="${CARD.light}" stroke-width="${e}" ${round}/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${h}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" ` +
    `shape-rendering="crispEdges" ${bg}font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,monospace" role="img" aria-label="${esc(alt)}"${data}>` +
    `<title>${esc(alt)}</title><defs>${defs}</defs>${body}</svg>`
}

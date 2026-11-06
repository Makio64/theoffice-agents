// `claude plugin test .` suite for the desktop mod (hooks/register.tsx). Node's `npm test` never sees this folder: it
// runs test/*.test.mjs only. Nothing sits beneath the plugin here, so the hooks registered on `on` stand for the
// engine: the collector run, the pane list, open/close, the status line and the debug log. The test's `$` has no
// `state` noun and cannot raise `ui.close`, so a small inline plugin (PEEK) reads theoffice's state and closes the pane.
// The kit cannot stamp a close as the person's (the engine pins `origin`), so the person's close is covered by the
// same path a close from elsewhere takes; its only extra is one debug line. Pixel art is the look: the animated SVG
// of the selected tab in the desktop app, VS Code and mobile, under a pixel menu on the desktop; a terminal, which has
// no Svg, always draws the block-glyph text.
// The store is answered from a Map the checks read; the collector answers by the view it is asked for (a timelapse by
// its range, a page of the past by its view and page, an export with the page and SVG it saved), and a toast is kept
// like the status line.
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'
import type { JsonValue, On } from 'claude-code'

import SAMPLE from './fixtures/facts-sample'
import { lapseFacts } from './fixtures/timelapse-sample'
import type { OfficeBacks, OfficeDesk, OfficeFacts, OfficeTab, OfficeTimeline, OfficeUnit } from '../plugin/types'
import type { Line } from '../plugin/lib/ascii.mjs'
import { ROLE_HEX, ROLE_TERM, renderOffice, renderStatus } from '../plugin/lib/ascii.mjs'
import { renderTimelapseText, timelapseFrames } from '../plugin/lib/ascii-timelapse.mjs'
import { pageDays, pageLabel } from '../plugin/lib/period.mjs'
import type { MenuKey } from '../plugin/lib/svg-menu.mjs'
import { renderMenu, zoneAt as menuZoneAt } from '../plugin/lib/svg-menu.mjs'
import { renderPeriod, zoneAt } from '../plugin/lib/svg-period.mjs'
import { renderTimelapse } from '../plugin/lib/svg.mjs'

// ---------------------------------------------------------------- engine stand-in


type Run = { argv: readonly string[]; timeoutMs: number | undefined; stdin?: string | undefined }
type Answer = { exitCode?: number; stdout?: string; error?: string }

const STDOUT = JSON.stringify(SAMPLE)

/** The sample as the collector's `today` answer: one day, per_hour up to now (test/helpers/facts.mjs todayFacts). */
const TODAY: OfficeFacts = {
  ...SAMPLE,
  range: { ...SAMPLE.range, kind: 'today', from: '2026-10-25T23:00:00.000Z', days: ['2026-10-26'], label: 'Mon 26 Oct' },
  per_day: { '2026-10-26': SAMPLE.per_day['2026-10-26']! },
  per_hour: [307, 372, ...new Array<number>(22).fill(0)],
}
const MONTH_DAYS = Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 9, i - 3)).toISOString().slice(0, 10))
/** The sample as the collector's `month` answer: 30 days, the early ones empty (test/helpers/facts.mjs monthFacts). */
const MONTH: OfficeFacts = {
  ...SAMPLE,
  range: { ...SAMPLE.range, kind: 'month', days: MONTH_DAYS, label: 'Sun 27 Sep → Mon 26 Oct' },
  per_day: {
    ...Object.fromEntries(MONTH_DAYS.map(d => [d, { minutes: d === '2026-10-01' ? 600 : 0, desk_minutes: 0, sessions: 0, subagents: 0, workflows: 0, prompts: 0, commits: 0 }])),
    ...SAMPLE.per_day,
  },
}
/** A first light (`all --json --first-light`): the sample's live floor, nothing counted. */
const LIGHT: OfficeFacts = {
  ...SAMPLE, first_light: true, projects: [], projects_more: 0, per_day: {}, per_hour: new Array<number>(24).fill(0),
  totals: {
    ...SAMPLE.totals, projects: 0, sessions: 0, subagents: 0, workflows: 0, desk_minutes: 0, agent_minutes: 0, prompts: 0, tool_calls: 0,
    files_edited: 0, commits: 0, additions: 0, deletions: 0, activity: {},
  },
}
/** The day the sample's facts were read on: the calendar the pages of the past count from. */
const TODAY_DATE = '2026-10-26'
const UNIT_VIEW: Record<OfficeUnit, string> = { day: 'today', week: 'week', month: 'month' }
/**
 * The collector's `<view> --back N` answer: the sample as that view's facts (TODAY, the week's, MONTH) over the page's
 * days (lib/period.mjs, as the collector reads it), with its own label and `back`, its first day worked for 7 hours.
 */
function pastFacts(unit: OfficeUnit, back: number): OfficeFacts {
  const base = unit === 'day' ? TODAY : unit === 'month' ? MONTH : SAMPLE
  const days = pageDays(unit, back, TODAY_DATE)
  const day = (d: string) => ({ minutes: d === days[0] ? 420 : 0, desk_minutes: 0, sessions: 0, subagents: 0, workflows: 0, prompts: 0, commits: 0 })
  return {
    ...base,
    range: { ...base.range, kind: UNIT_VIEW[unit], days, label: pageLabel(unit, back, TODAY_DATE), back },
    per_day: Object.fromEntries(days.map(d => [d, day(d)])),
  }
}
type Lapse = OfficeTimeline['kind']
/** The collector's `timelapse <range> --json` answers: the sample with a timeline (test/helpers/facts.mjs timelapseFacts). */
const LAPSE: Record<Lapse, OfficeFacts> = { yesterday: lapseFacts('yesterday'), week: lapseFacts('week'), month: lapseFacts('month') }
/** Where an export saves the page of `range`, as `timelapse <range> --export` prints it on its first line. */
const PAGE = (range: string) => `/Users/clawd/.cache/theoffice/pixel/timelapse-${range}.html`
/**
 * What a Month export saves, as `month --export <part> --as <format>` prints it on its first line: the page for a PNG, a
 * GIF or a video (the browser makes them), else the file itself; `key` the month's name (`month-2026-09`).
 */
const SAVED = (part: string, as: string, key = 'month-2026-09-27-to-2026-10-26') =>
  `/Users/clawd/.cache/theoffice/pixel/${key}-${part}.${['png', 'gif', 'video'].includes(as) ? 'html' : as}`
const TABS = [
  ['tab-all', '1', 'Live'], ['tab-today', '2', 'Today'], ['tab-week', '3', 'Week'], ['tab-month', '4', 'Month'], ['tab-work', '5', 'What they did'],
  ['tab-timelapse', '6', 'Timelapse'],
] as const
const ICON: Record<string, string> = { 'tab-all': '◉', 'tab-today': '◷', 'tab-week': '▥', 'tab-month': '▤', 'tab-work': '▨', 'tab-timelapse': '▶' }
/** The Timelapse's own row under the tabs: each range, then Export, as [key, hotkey, text]. */
const LAPSE_ROW = [['lapse-yesterday', 'y', 'Yesterday'], ['lapse-week', 'w', 'Week'], ['lapse-month', 'm', 'Month'], ['lapse-export', 'e', '⤓ Export']] as const
/** The strip's keys as Buttons (its row off the pixel art, its hidden hotkeys on the desktop), as [key, hotkey, text]. */
const STEP_ROW = [['period-older', 'p', '◀'], ['period-newer', 'n', '▶'], ['period-now', 'c', 'Now']] as const
/** A tab's label off the terminal: its pixel icon, then its name (the surface adds the hotkey badge itself). */
const tabText = (key: string, label: string) => `${ICON[key]} ${label}`
const PRESENTATION = { isFullscreen: true, columns: 200 }
const PANE_PROPS = (bodyColumns: number) => ({
  title: 'The Office',
  isFocused: false,
  bodyColumns,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}) as const

/** What mounting the office pane on `surface` at `bodyColumns` takes. */
function pane<S extends 'terminal' | 'desktop' | 'vscode' | 'mobile'>(surface: S, bodyColumns: number) {
  return { plugin: 'theoffice', surface, component: 'Pane', requestId: 'office', props: PANE_PROPS(bodyColumns) } as const
}

/** A clip the pane played: when it started and ended on the mock clock (`end` unset while it plays). */
type Play = { asset: string; loop: boolean; gain: number | undefined; at: number; end: number | undefined }

/** One path of the file system the watcher looks at: a file (its text, if it is read) or a folder. */
type Node = { kind: 'file' | 'dir'; mtimeMs: number; size: number; text?: string }

/**
 * The engine beneath the plugin, with what it was asked kept for the checks; `store` is what $.store holds at the
 * start. The collector answers `answer` for the week (`all`) and `ranges.today` / `ranges.month` for those views,
 * `pasts['<view> <N>']` for a page of the past (left unset: pastFacts), `light` for a first light (left unset: it
 * fails, so a test that is not about it runs as before; kept in `lights`, not `runs`),
 * `lapses[range]` for a timelapse and `exported` for an export (left unset: the range's page and SVG), each `delay` ms
 * late on the mock clock (so a press returns while its run is under way), and `monthExported` for a Month export (left
 * unset: SAVED, the month of now's or the page's), `delay.month` late. The
 * file system is `files` (absolute path → Node) and $HOME is `home`: left unset (the default), the watcher has nothing
 * to look at, so only the heartbeat and the pane's own moves run the collector. The clock starts at `now` (0: far from
 * the facts' now, so the drawing's clocks are phased from the facts').
 */
function engine(on: On, store: Record<string, unknown> = {}, now = 0) {
  const clock = mock.clock(on, { now })
  const world = {
    home: undefined as string | undefined,
    files: new Map<string, Node>(),
    fsCalls: [] as { op: 'list' | 'stat' | 'read'; path: string }[],
    clock,
    isUp: false,
    isShown: true,
    runs: [] as Run[],
    opens: 0,
    closes: 0,
    statuses: [] as (string | undefined)[],
    logs: [] as string[],
    answer: { exitCode: 0, stdout: STDOUT } as Answer,
    ranges: {
      today: { exitCode: 0, stdout: JSON.stringify(TODAY) } as Answer, month: { exitCode: 0, stdout: JSON.stringify(MONTH) } as Answer,
    },
    pasts: new Map<string, Answer>(),
    light: { exitCode: 1 } as Answer,
    lights: [] as Run[],
    lapses: Object.fromEntries((['yesterday', 'week', 'month'] as const).map(r => [r, { exitCode: 0, stdout: JSON.stringify(LAPSE[r]) }])) as Record<Lapse, Answer>,
    exported: undefined as Answer | undefined,
    monthExported: undefined as Answer | undefined,
    delay: { lapse: 0, export: 0, month: 0 },
    toasts: [] as { text: string; timeoutMs?: number }[],
    plays: [] as Play[],
    cueMs: 300,
    gate: undefined as Promise<void> | undefined,
    paneAsks: 0,
    focus: [] as boolean[],
    commands: [] as { name: string; description?: string; argumentHint?: string }[],
    /** The names the engine refuses to register, as it does a name another command already answers to. */
    refuses: new Set<string>(),
    store: new Map<string, unknown>(Object.entries(store)),
  }
  on('store.get', (_, e) => ({ value: world.store.get(e.key) }))
  on('store.set', (_, e) => {
    world.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', (_, e) => {
    if (world.refuses.has(e.name)) return { deny: `"/${e.name}" refused: it is the plugin's /${e.name}:${e.name}` }
    world.commands.push({ name: e.name, description: e.description, argumentHint: e.argumentHint })
    return { value: { command: e.name } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.attach', (_, e) => ({ clientId: e.clientId }))
  on('ui.panes', () => {
    world.paneAsks++
    return { value: world.isUp ? [{ id: 'office', title: 'The Office', isShown: world.isShown, isFocused: false, isPlaced: true }] : [] }
  })
  on('ui.open', (_, e) => {
    world.opens++
    world.isUp = true
    world.isShown = true
    world.focus.push(e.focus === true)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => {
    world.closes++
    world.isUp = false
    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    world.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', (_, e) => {
    world.toasts.push({ text: e.text, timeoutMs: e.timeoutMs })
    return { value: undefined }
  })
  // the speaker: every clip is kept, and lasts `cueMs` on the mock clock unless it is stopped
  on('audio.play', async (_, e, next) => {
    const play: Play = { asset: String(e.clip.asset), loop: e.shouldLoop, gain: e.gain, at: clock.now(), end: undefined }
    world.plays.push(play)
    const stopped = new Promise<void>(resolve => next.signal.addEventListener('abort', () => resolve(), { once: true }))
    await Promise.race([stopped, clock.sleep(world.cueMs)])
    play.end = clock.now()
    return { value: undefined }
  })
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? world.home : undefined }))
  const missing = (path: string) => new Error(`ENOENT: no such file or directory, '${path}'`)
  on('fs.list', (_, e) => {
    world.fsCalls.push({ op: 'list', path: e.path })
    if (world.files.get(e.path)?.kind !== 'dir') throw missing(e.path)
    const entries = [...world.files].filter(([path]) => path.slice(0, path.lastIndexOf('/')) === e.path)
      .map(([path, n]) => ({ name: path.slice(path.lastIndexOf('/') + 1), kind: n.kind, size: n.kind === 'file' ? n.size : 0, mtimeMs: n.kind === 'file' ? n.mtimeMs : 0, isLink: false }))
    return { value: entries }
  })
  on('fs.stat', (_, e) => {
    world.fsCalls.push({ op: 'stat', path: e.path })
    const n = world.files.get(e.path)
    if (!n) throw missing(e.path)
    return { value: { kind: n.kind, size: n.size, mtimeMs: n.mtimeMs, isLink: false } }
  })
  on('fs.read', (_, e) => {
    world.fsCalls.push({ op: 'read', path: e.path })
    const n = world.files.get(e.path)
    if (n?.text === undefined) throw missing(e.path)
    return { value: n.text }
  })
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('process.run', async (_, e) => {
    if (e.argv.includes('--first-light')) {
      world.lights.push({ argv: e.argv, timeoutMs: e.init?.timeoutMs })
      return { value: { exitCode: world.light.exitCode ?? 0, stdout: world.light.stdout ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    world.runs.push({ argv: e.argv, timeoutMs: e.init?.timeoutMs, stdin: e.init?.stdin })
    if (world.gate) await world.gate
    const [, , view, range, flag] = e.argv
    if (view === 'month' && e.argv.includes('--export')) {
      if (world.delay.month) await clock.sleep(world.delay.month)
      const arg = (name: string) => String(e.argv[e.argv.indexOf(name) + 1])
      const back = e.argv.includes('--back') ? Number(arg('--back')) : 0
      const key = back ? `month-${pageDays('month', back, TODAY_DATE)[0]!.slice(0, 7)}` : undefined
      const a = world.monthExported ?? { exitCode: 0, stdout: `${SAVED(arg('--export'), arg('--as'), key)}\n` }
      if (a.error) throw new Error(a.error)
      return { value: { exitCode: a.exitCode ?? 0, stdout: a.stdout ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }
    const isLapse = view === 'timelapse' && (range === 'yesterday' || range === 'week' || range === 'month')
    const late = !isLapse ? 0 : flag === '--export' ? world.delay.export : world.delay.lapse
    if (late) await clock.sleep(late)
    const saved: Answer = { exitCode: 0, stdout: `${PAGE(String(range))}\n${PAGE(String(range)).replace(/\.html$/, '.svg')}\n` }
    const unit = (Object.keys(UNIT_VIEW) as OfficeUnit[]).find(u => UNIT_VIEW[u] === view)
    const past = (): Answer => world.pasts.get(`${view} ${flag}`) ?? { exitCode: 0, stdout: JSON.stringify(pastFacts(unit!, Number(flag))) }
    const ranged = range === '--back' && unit ? past() : view === 'today' || view === 'month' ? world.ranges[view] : world.answer
    const a = !isLapse ? ranged : flag === '--export' ? world.exported ?? saved : world.lapses[range]
    if (a.error) throw new Error(a.error)
    return { value: { exitCode: a.exitCode ?? 0, stdout: a.stdout ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return world
}

function command(args: string, name = 'theoffice') {
  return { command: name, args, origin: { kind: 'composer' }, presentation: PRESENTATION } as const
}

type Peeked = {
  version: number
  spec: string | null
  generatedAt: string | null
  desks: number | null
  frame: number
  trouble: string | null
  tab: OfficeTab | null
  today: string | null
  month: string | null
  /** The timelapse facts' range, and how many times they were written. */
  timelapse: string | null
  lapseVersion: number
  lapse: Lapse | null
  lapseTrouble: string | null
  lapseSaved: string | null
  lapseExporting: boolean | null
  /** The Month's export row: what it asks, whether an export runs, and the file it saved last. */
  monthAsk: string | null
  monthExporting: boolean | null
  monthSaved: { file: string; page: string } | null
  /** The pages of the past picked, the label of the page's facts on screen, and whether one is being read. */
  backs: OfficeBacks | null
  past: string | null
  pastReading: boolean | null
}

/**
 * Another plugin, loaded above theoffice: `/peek` answers theoffice's state (any plugin reads any value), and
 * `/close-by-hand` closes the pane from outside theoffice's own command, as the person's close mark does.
 */
const PEEK: Plugin = {
  name: 'peek',
  tier: 'prepend',
  register: on => {
    on('session.start', async ($, e, next) => {
      await $.command.register({ name: 'peek', description: 'test: read theoffice state' })
      await $.command.register({ name: 'close-by-hand', description: 'test: close the pane as the person' })
      return next(e)
    })
    on('command.run', { command: 'peek' }, async $ => {
      const snapshot = await $.state.get({ plugin: 'theoffice', key: 'snapshot' })
      const frame = await $.state.get({ plugin: 'theoffice', key: 'frame' })
      const trouble = await $.state.get({ plugin: 'theoffice', key: 'trouble' })
      const tab = await $.state.get({ plugin: 'theoffice', key: 'tab' })
      const today = await $.state.get({ plugin: 'theoffice', key: 'today' })
      const month = await $.state.get({ plugin: 'theoffice', key: 'month' })
      const timelapse = await $.state.get({ plugin: 'theoffice', key: 'timelapse' })
      const lapse = await $.state.get({ plugin: 'theoffice', key: 'lapse' })
      const lapseTrouble = await $.state.get({ plugin: 'theoffice', key: 'lapseTrouble' })
      const lapseSaved = await $.state.get({ plugin: 'theoffice', key: 'lapseSaved' })
      const lapseExporting = await $.state.get({ plugin: 'theoffice', key: 'lapseExporting' })
      const monthAsk = await $.state.get({ plugin: 'theoffice', key: 'monthAsk' })
      const monthExporting = await $.state.get({ plugin: 'theoffice', key: 'monthExporting' })
      const monthSaved = await $.state.get({ plugin: 'theoffice', key: 'monthSaved' })
      const backs = await $.state.get({ plugin: 'theoffice', key: 'backs' })
      const past = await $.state.get({ plugin: 'theoffice', key: 'past' })
      const pastReading = await $.state.get({ plugin: 'theoffice', key: 'pastReading' })
      const facts = snapshot.value ?? null
      const peeked: Peeked = {
        version: snapshot.version,
        spec: facts?.spec ?? null,
        generatedAt: facts?.generated_at ?? null,
        desks: facts ? facts.live.desks.length : null,
        frame: frame.value ?? 0,
        trouble: trouble.value ?? null,
        tab: tab.value ?? null,
        today: today.value?.range.kind ?? null,
        month: month.value?.range.kind ?? null,
        timelapse: timelapse.value?.timeline?.kind ?? null,
        lapseVersion: timelapse.version,
        lapse: lapse.value ?? null,
        lapseTrouble: lapseTrouble.value ?? null,
        lapseSaved: lapseSaved.value ?? null,
        lapseExporting: lapseExporting.value ?? null,
        monthAsk: monthAsk.value ?? null,
        monthExporting: monthExporting.value ?? null,
        monthSaved: monthSaved.value ?? null,
        backs: backs.value ?? null,
        past: past.value?.range.label ?? null,
        pastReading: pastReading.value ?? null,
      }
      return { text: JSON.stringify(peeked) }
    })
    on('command.run', { command: 'close-by-hand' }, async $ => {
      await $.ui.close({ id: 'office' })
      return { text: 'closed' }
    })
  },
}

const WITH_PEEK = { plugins: [PEEK] } as const

async function peek($: Engine): Promise<Peeked> {
  const ran = await $.command.run(command('', 'peek'))
  return JSON.parse(ran.text ?? 'null')
}

// ---------------------------------------------------------------- refresh

test('session start registers the command and stores the collector facts as the snapshot', WITH_PEEK, async ($, on) => {
  const w = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  expect(w.runs).toHaveLength(1)
  const [run] = w.runs
  expect(run?.argv.slice(0, 1)).toEqual(['node'])
  expect(String(run?.argv[1]).endsWith('/scripts/office.mjs')).toBe(true)
  expect(run?.argv.slice(2, 5)).toEqual(['all', '--json', '--since'])
  // no snapshot yet: the collector may be building its cache, so the first run may take up to the engine's 10 min
  expect(run?.timeoutMs).toBe(600_000)

  const held = await peek($)
  expect(held.spec).toBe('theoffice/1')
  expect(held.desks).toBe(SAMPLE.live.desks.length)
  expect(held.trouble).toBe(null)
  expect(w.opens).toBe(0)

  await w.clock.advance(60_000)
  expect(w.runs[1]?.timeoutMs).toBe(20_000)
})

test('with nothing drawing them the snapshot follows the facts: run bookkeeping and seconds are ignored', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  const first = await peek($)

  // what every real run changes: generated_at, now.iso and range.to by the millisecond, sources and notes
  const again = {
    ...SAMPLE,
    generated_at: '2026-10-26T00:40:05.138Z',
    now: { ...SAMPLE.now, iso: '2026-10-26T00:40:05.138Z' },
    range: { ...SAMPLE.range, to: '2026-10-26T00:40:05.138Z' },
    sources: { ...SAMPLE.sources, files_from_cache: 1, ms: { total: 99, live: 1, history: 2, git: 3 } },
    notes: ['git skipped'],
  }
  w.answer = { exitCode: 0, stdout: JSON.stringify(again) }
  await w.clock.advance(60_000)
  expect(w.runs).toHaveLength(2)
  expect((await peek($)).version).toBe(first.version)

  // a new minute is a new drawing
  const later = { ...again, now: { ...again.now, iso: '2026-10-26T00:41:00.000Z', local_time: '01:41' } }
  w.answer = { exitCode: 0, stdout: JSON.stringify(later) }
  await w.clock.advance(60_000)
  expect((await peek($)).version).toBeGreaterThan(first.version)
})

test('with no snapshot yet, failed runs back off instead of restarting the build every tick', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  w.answer = { error: 'process.run timed out' }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.runs).toHaveLength(1)

  // skips 1, then 2, then 4 ticks of 60 s between attempts
  await w.clock.advance(7 * 60_000)
  expect(w.runs).toHaveLength(3)
  await w.clock.advance(5 * 60_000)
  expect(w.runs).toHaveLength(4)

  // then 8 ticks; once a run works, the normal cadence is back
  w.answer = { exitCode: 0, stdout: STDOUT }
  await w.clock.advance(8 * 60_000)
  expect(w.runs).toHaveLength(6)
  const runs = w.runs.length
  expect((await peek($)).spec).toBe('theoffice/1')
  await w.clock.advance(3 * 60_000)
  expect(w.runs.length - runs).toBe(3)
})

test('the status line is the renderer status of the facts, sent once per change', WITH_PEEK, async ($, on) => {
  const w = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.statuses).toEqual([renderStatus(SAMPLE, { width: 80 })])
  expect(w.statuses[0]).toContain('working')

  // same facts on the next tick: nothing new to say
  await w.clock.advance(60_000)
  expect(w.runs).toHaveLength(2)
  expect(w.statuses).toHaveLength(1)
})

test('a failed run keeps the last snapshot and logs to debug only', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  const good = await peek($)

  const failures: Answer[] = [
    { exitCode: 1, stdout: '' },
    { exitCode: 0, stdout: 'not json {' },
    { exitCode: 0, stdout: '{"spec":"x"}' },
    { error: 'spawn node ENOENT' },
  ]
  for (const answer of failures) {
    w.answer = answer
    await w.clock.advance(60_000)
    const held = await peek($)
    expect(held.version).toBe(good.version)
    expect(held.generatedAt).toBe(SAMPLE.generated_at)
    expect(held.trouble).toBeTruthy()
  }
  expect(w.runs).toHaveLength(5)
  expect(w.logs).toHaveLength(4)
  for (const line of w.logs) expect(line).toContain('theoffice: refresh failed')
  // the status line still shows the last good facts
  expect(w.statuses).toEqual([renderStatus(SAMPLE, { width: 80 })])

  // a good run clears the trouble again
  w.answer = { exitCode: 0, stdout: STDOUT }
  await w.clock.advance(60_000)
  expect((await peek($)).trouble).toBe(null)
})

test('with no data yet a failure leaves the status line empty and the pane says why', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  w.answer = { exitCode: 2, stdout: '' }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  expect(w.statuses).toEqual([])
  expect((await peek($)).spec).toBe(null)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface, 80))
    expect((await ui.find({ type: 'Text', text: /could not be read yet/ }))?.text).toContain('exited with code 2')
    await ui.unmount()
  }
})

test('runs never overlap: a slow collector makes the next ticks skip', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.advance(180_000)
  expect(w.runs).toHaveLength(1)

  w.gate = undefined
  release()
  await w.clock.settle()
  expect((await peek($)).spec).toBe('theoffice/1')
  await w.clock.advance(60_000)
  expect(w.runs).toHaveLength(2)
})

// ---------------------------------------------------------------- the watcher

const HOME = '/Users/clawd'
const SESSIONS = `${HOME}/.claude/sessions`
const SID = '0b5c1a2e-7d4f-4c1b-9a8e-2f3c4d5e6f70'
const PROJECT_DIR = `${HOME}/.claude/projects/-Users-clawd-git-the-office`
const RECORD = `${SESSIONS}/4242.json`
const TRANSCRIPT = `${PROJECT_DIR}/${SID}.jsonl`

/** A ~/.claude with one live session: its record, the key file beside it, its transcript; and $HOME set. */
function claudeDir(w: ReturnType<typeof engine>) {
  w.home = HOME
  for (const dir of [`${HOME}/.claude`, SESSIONS, `${HOME}/.claude/projects`, PROJECT_DIR]) w.files.set(dir, { kind: 'dir', mtimeMs: 0, size: 0 })
  const record = { pid: 4242, sessionId: SID, cwd: '/Users/clawd/git/the.office', status: 'busy' }
  w.files.set(RECORD, { kind: 'file', mtimeMs: 1_000, size: 120, text: JSON.stringify(record) })
  w.files.set(`${SESSIONS}/4242.9f8e7d6c.key`, { kind: 'file', mtimeMs: 1_000, size: 32, text: 'not for anyone' })
  w.files.set(TRANSCRIPT, { kind: 'file', mtimeMs: 1_000, size: 5_000 })
}

/** Something moved on disk: `path`'s mtime a second on, its size `grow` bytes more. */
function touch(w: ReturnType<typeof engine>, path: string, grow = 0) {
  const n = w.files.get(path)!
  w.files.set(path, { ...n, mtimeMs: n.mtimeMs + 1_000, size: n.size + grow })
}

test('a session record that moves runs the collector once, within 1.5 s, and so does a transcript 15 s after the last facts; nothing moving runs nothing until the heartbeat', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const runs = w.runs.length // the start and the open

  await w.clock.advance(20_000) // a dozen looks, nothing moved
  expect(w.runs).toHaveLength(runs)

  touch(w, RECORD)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 1)
  expect(w.runs.at(-1)?.argv.slice(2, 5)).toEqual(['all', '--json', '--since'])
  await w.clock.advance(30_000)
  expect(w.runs).toHaveLength(runs + 1)

  // a turn or a tool call grows the transcript; an intern's folder appearing is a change too
  touch(w, TRANSCRIPT, 400)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 2)
  w.files.set(`${PROJECT_DIR}/${SID}/subagents`, { kind: 'dir', mtimeMs: 0, size: 0 })
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 3)

  // 60 s in, the facts just made do for the heartbeat; the next one runs it whatever moved (commits, visitors)
  await w.clock.advance(6_000)
  expect(w.runs).toHaveLength(runs + 3)
  await w.clock.advance(60_000)
  expect(w.runs).toHaveLength(runs + 4)

  // the watcher only lists the sessions, stats the paths and reads a record whose mtime moved; never a key file
  expect(w.fsCalls.filter(c => c.path.endsWith('.key'))).toEqual([])
  expect(w.fsCalls.filter(c => c.op === 'read').map(c => c.path)).toEqual([RECORD, RECORD])
  expect([...new Set(w.fsCalls.map(c => c.op))].sort()).toEqual(['list', 'read', 'stat'])
})

test('changes that land while a run is in flight make one more run after it, never one each or two at once', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const runs = w.runs.length

  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  touch(w, RECORD)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 1) // under way, held
  for (let i = 0; i < 3; i++) {
    touch(w, RECORD)
    await w.clock.advance(1_500)
  }
  expect(w.runs).toHaveLength(runs + 1)

  w.gate = undefined
  release()
  await w.clock.settle()
  expect(w.runs).toHaveLength(runs + 2) // the three changes, one run
  await w.clock.advance(10_000)
  expect(w.runs).toHaveLength(runs + 2)
})

test('with the pane closed a prompt sent or a turn ended here brings the facts within 10 s, and passes the prompt and the answer through untouched', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  const runs = w.runs.length // the pane is closed: the next look is 30 s off

  // facts this recent do: a burst of prompts runs nothing
  const sent = await $.prompt.submit({ text: 'make the office live', wait: false, origin: { kind: 'composer' } })
  expect(sent.text).toBe('make the office live')
  expect(sent.drop).toBeUndefined()
  await w.clock.advance(300)
  expect(w.runs).toHaveLength(runs)

  await w.clock.advance(10_000)
  const done = await $.turn.complete({ answer: 'It is live now.', durationMs: 4_200, isAborted: false, turnId: 'turn-1', reason: 'answer' })
  expect(done.text).toBe('It is live now.')
  await w.clock.advance(300)
  expect(w.runs).toHaveLength(runs + 1)
})

test('a meeting moving on is seen within 1.5 s (an agent of it starting, its journal growing); one that ended is no longer looked into', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  const sub = `${PROJECT_DIR}/${SID}/subagents`
  const ended = `${PROJECT_DIR}/${SID}/workflows`
  const run = `${sub}/workflows/wf_1234abcd-123`
  for (const dir of [`${PROJECT_DIR}/${SID}`, sub, `${sub}/workflows`, run, ended]) w.files.set(dir, { kind: 'dir', mtimeMs: 500, size: 0 })
  w.files.set(`${run}/journal.jsonl`, { kind: 'file', mtimeMs: 500, size: 100 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const runs = w.runs.length
  await w.clock.advance(15_000)
  expect(w.runs).toHaveLength(runs) // nothing moved

  // an agent of the meeting starts: a file in the run's folder, which moves that folder alone
  w.files.set(`${run}/agent-a0123456789abcdef.jsonl`, { kind: 'file', mtimeMs: 2_000, size: 10 })
  touch(w, run)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 1)
  // it is done: a line in the journal, which moves no folder
  touch(w, `${run}/journal.jsonl`, 120)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 2)

  // the meeting ends: its json lands beside the session's other runs; from then on its folder is not looked into
  w.files.set(`${ended}/wf_1234abcd-123.json`, { kind: 'file', mtimeMs: 3_000, size: 50 })
  touch(w, ended)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 3)
  const looked = w.fsCalls.length
  touch(w, `${run}/journal.jsonl`, 10)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 3)
  expect(w.fsCalls.slice(looked).filter(c => c.path.startsWith(run))).toEqual([])
  // lists and stats only: a meeting's files are never read
  expect(w.fsCalls.filter(c => c.op === 'read').map(c => c.path)).toEqual([RECORD])
})

test('with no snapshot yet, a change seen during a failing run waits for the backoff like the heartbeat does', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  w.answer = { exitCode: 1, stdout: '' }
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.advance(100)
  expect(w.runs).toHaveLength(1) // the start's run, held: a cold build

  touch(w, TRANSCRIPT, 100) // an agent works meanwhile, and the closed pane's look sees it
  await w.clock.advance(30_000)
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(w.runs).toHaveLength(1) // failed: one heartbeat sat out, the change with it

  touch(w, TRANSCRIPT, 100) // more work, seen at once after a prompt here: still backing off
  await $.prompt.submit({ text: 'keep going', wait: false, origin: { kind: 'composer' } })
  await w.clock.advance(300)
  expect(w.runs).toHaveLength(1)
  await w.clock.advance(90_000) // the heartbeat at 60 s is the one sat out, the one at 120 s runs
  expect(w.runs).toHaveLength(2)
})

test('the looks follow the pane: every 1.5 s on screen, none off screen; the text stops with it', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const looks = () => w.fsCalls.filter(c => c.op === 'list').length

  let n = looks()
  await w.clock.advance(6_000)
  expect(looks() - n).toBe(4)

  w.isShown = false
  await w.clock.advance(1_500) // the look that sees it
  n = looks()
  await w.clock.advance(12_000)
  expect(looks()).toBe(n)

  await $.command.run(command('close'))
  n = looks()
  const frame = (await peek($)).frame
  await w.clock.advance(120_000)
  expect(looks()).toBe(n)
  expect((await peek($)).frame).toBe(frame)
})

// ---------------------------------------------------------------- facts shared between sessions

const SHARED = '/Users/clawd/.cache/theoffice/shared/all.json'

/** Another session's run left `facts` in the shared file, begun at `at`. */
function share(w: ReturnType<typeof engine>, facts: OfficeFacts, at: number) {
  w.files.set(SHARED, { kind: 'file', mtimeMs: at, size: 1, text: JSON.stringify(facts) })
}

test('a session takes facts another session\'s run left, for a stat and a read, and runs nothing; it knows where from a run, and from the last session', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.store.has('shared')).toBe(false) // a sample with no such path
  const named = { ...SAMPLE, sources: { ...SAMPLE.sources, shared: SHARED } }
  w.answer = { exitCode: 0, stdout: JSON.stringify(named) }
  await w.clock.advance(60_000)
  expect(w.runs).toHaveLength(2)
  expect(w.store.get('shared')).toBe(SHARED)

  // a minute on, a run of another session a moment ago: its facts, no process
  const theirs = withDesk(laterSample(2), 'c41d7a06', { state: 'asking' })
  share(w, theirs, 118_000)
  await w.clock.advance(60_000)
  expect(w.runs).toHaveLength(2)
  expect((await peek($)).generatedAt).toBe(theirs.generated_at)
  expect(w.fsCalls.filter(c => c.path === SHARED).map(c => c.op)).toEqual(['stat', 'read'])
})

test('the next session\'s first facts may need no run at all', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  share(w, laterSample(1), -5_000)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.runs).toHaveLength(0)
  expect((await peek($)).generatedAt).toBe(laterSample(1).generated_at)
})

test('shared facts too old for what the session draws are left for a run, which is told how old will do', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  share(w, laterSample(1), -61_000) // closed, a minute at most
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.runs).toHaveLength(1)
  expect(w.runs[0]?.argv.slice(2)).toEqual(['all', '--json', '--since', '-60000'])
})

test('a path the facts name that is no shared answer is never read or kept', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  w.answer = { exitCode: 0, stdout: JSON.stringify({ ...SAMPLE, sources: { ...SAMPLE.sources, shared: '/Users/clawd/.ssh/id_rsa' } }) }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  await w.clock.advance(120_000)
  expect(w.store.has('shared')).toBe(false)
  expect(w.fsCalls.filter(c => c.path.endsWith('id_rsa'))).toEqual([])
})

test('a kept path that is no shared answer is dropped, and a shared file that cannot be read costs only a run', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: '/etc/passwd' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.fsCalls.filter(c => c.path === '/etc/passwd')).toEqual([])
  expect(w.runs).toHaveLength(1)
})

test('half a shared file is only a run', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  w.files.set(SHARED, { kind: 'file', mtimeMs: 0, size: 1, text: '{"spec":"theoffice/1","now' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.runs).toHaveLength(1)
  expect((await peek($)).spec).toBe('theoffice/1')
})

test('on screen a session and a meeting moving run at once, a growing transcript at most every 15 s; a closed pane watches nothing', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  // closed: a transcript moving is not looked at, whoever writes it
  w.fsCalls.length = 0
  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(50_000)
  expect(w.fsCalls.filter(c => c.path.includes('.claude'))).toEqual([])

  await $.command.run(command('open'))
  await w.clock.settle()
  await w.clock.advance(15_000)
  const runs = w.runs.length

  // an agent at it: a run within the 1.5 s look, then none until 15 s after it, whatever keeps moving
  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 1)
  for (let i = 0; i < 8; i++) {
    touch(w, TRANSCRIPT, 100)
    await w.clock.advance(1_500)
  }
  expect(w.runs).toHaveLength(runs + 1)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 1)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 2) // what grew meanwhile is not lost: it runs as soon as the gap allows

  // a session's own record moving does not wait for any gap
  touch(w, RECORD)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 3)
})

test('another agent\'s session file, all there is to see of it, runs the collector 5 s after the last facts, where a transcript waits 15', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  const CODEX = `${HOME}/.codex/sessions/2026/11/01/rollout.jsonl`
  w.files.set(CODEX, { kind: 'file', mtimeMs: 1_000, size: 100 })
  w.answer = { exitCode: 0, stdout: JSON.stringify({ ...SAMPLE, sources: { ...SAMPLE.sources, watch: [CODEX] } }) }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  await w.clock.advance(20_000)
  const runs = w.runs.length

  touch(w, CODEX, 100)
  await w.clock.advance(1_500)
  expect(w.runs).toHaveLength(runs + 1)
  touch(w, CODEX, 100)
  await w.clock.advance(3_000)
  expect(w.runs).toHaveLength(runs + 1)
  await w.clock.advance(3_000)
  expect(w.runs).toHaveLength(runs + 2)

  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(6_000)
  expect(w.runs).toHaveLength(runs + 2)
})

test('behind another tab no transcript runs the collector, and the first look back does', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  await w.clock.advance(6_000)
  w.isShown = false
  await w.clock.advance(1_500) // the look that sees it
  const runs = w.runs.length

  for (let i = 0; i < 20; i++) {
    touch(w, TRANSCRIPT, 100)
    await w.clock.advance(1_500)
  }
  expect(w.runs).toHaveLength(runs)

  w.isShown = true
  await w.clock.advance(6_000) // the look that sees it back
  expect(w.runs).toHaveLength(runs + 1)
})

test('the runs of the Today tab keep the status line, with no run of the week for it', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const asking = withDesk(laterSample(1), '4e2f8a10', { state: 'asking', status: 'waiting' })
  w.ranges.today = { exitCode: 0, stdout: JSON.stringify(asking) }
  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  expect(w.statuses.at(-1)).toBe(renderStatus(asking, { width: 80 }))
  await ui.unmount()
})

test('a status moving reaches the status line at once from any tab on screen, however recent the last facts', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open timelapse'))
  await w.clock.settle()
  await w.clock.advance(1_500)
  const weeks = () => w.runs.filter(r => r.argv[2] === 'all').length
  const runs = weeks()

  touch(w, RECORD)
  await w.clock.advance(1_500)
  expect(weeks()).toBe(runs + 1)
})

test('a tab that draws other facts runs the week for the status line alone: no sooner than a minute after the last', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open timelapse'))
  await w.clock.settle()
  await w.clock.advance(1_500)
  const weeks = () => w.runs.filter(r => r.argv[2] === 'all').length
  const runs = weeks()

  for (let i = 0; i < 20; i++) {
    touch(w, TRANSCRIPT, 100)
    await w.clock.advance(1_500)
  }
  expect(weeks()).toBe(runs)
})

// ---------------------------------------------------------------- redraws

/** The sample `min` minutes later, as a real run writes it: now, the bookkeeping and the range's end move. */
function laterSample(min: number): OfficeFacts {
  const iso = new Date(Date.parse(SAMPLE.now.iso) + min * 60_000 + 7_250).toISOString()
  const local = `01:${String(40 + min).padStart(2, '0')}`
  return {
    ...SAMPLE, generated_at: iso, now: { ...SAMPLE.now, iso, local_time: local }, range: { ...SAMPLE.range, to: iso },
    sources: { ...SAMPLE.sources, files_from_cache: 3 }, notes: ['git skipped'],
  }
}

test('on screen, facts that draw the same are not written (no redraw); a desk turning busy is one redraw', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const first = await peek($)
  const source = await sourceOf(ui)

  // the same office 3 and 8 minutes later: the clocks run in the drawing itself, the durations hold for the window
  for (const min of [3, 8]) {
    w.answer = { exitCode: 0, stdout: JSON.stringify(laterSample(min)) }
    await w.clock.advance(60_000)
    expect((await peek($)).version).toBe(first.version)
    expect(await sourceOf(ui)).toBe(source)
  }
  expect(w.runs).toHaveLength(4)

  // a desk that was idle turns busy: one write, one new drawing
  const busy = laterSample(9)
  const desk = { ...busy.live.desks[0]!, state: 'working' as const, status: 'busy', activity: { kind: 'coding', tool: 'Edit', label: 'svg-kit.mjs', since: busy.now.iso } }
  busy.live = { ...busy.live, desks: [desk, ...busy.live.desks.slice(1)] }
  w.answer = { exitCode: 0, stdout: JSON.stringify(busy) }
  await w.clock.advance(60_000)
  const redrawn = await peek($)
  expect(redrawn.version).toBeGreaterThan(first.version)
  const next = await sourceOf(ui)
  expect(next).not.toBe(source)
  expect(next).toContain('svg-kit.mjs')
  // and the same busy office again: nothing
  await w.clock.advance(60_000)
  expect((await peek($)).version).toBe(redrawn.version)
  expect(await sourceOf(ui)).toBe(next)
  await ui.unmount()
})

test('a window boundary where a duration steps on redraws once', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const first = await peek($)
  // the coat rack's last one left 9 minutes ago; the raised hand has been up 25
  expect(await sourceOf(ui)).toContain('left &lt;20m ago')
  expect(await sourceOf(ui)).toContain('hand up 10m+')

  w.answer = { exitCode: 0, stdout: JSON.stringify(laterSample(11)) }
  await w.clock.advance(60_000)
  const next = await peek($)
  expect(next.version).toBeGreaterThan(first.version)
  expect(await sourceOf(ui)).toContain('left 10m+ ago')
  expect(await sourceOf(ui)).toContain('hand up 10m+')
  // and the same step a few minutes on: nothing
  w.answer = { exitCode: 0, stdout: JSON.stringify(laterSample(17)) }
  await w.clock.advance(60_000)
  expect((await peek($)).version).toBe(next.version)
  await ui.unmount()
})

/** `facts` with desk `id` changed by `patch`: its next tool call, a hand going up. */
function withDesk(facts: OfficeFacts, id: string, patch: Partial<OfficeDesk>): OfficeFacts {
  return { ...facts, live: { ...facts.live, desks: facts.live.desks.map(d => (d.id === id ? { ...d, ...patch } : d)) } }
}

test('a busy desk\'s next tool calls are drawn at most once a minute; a hand going up is drawn at once', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const first = await peek($)
  const source = await sourceOf(ui)
  expect(source).toContain('rhythm-drums.js')
  const runs = w.runs.length
  // desk c41d7a06 edits rhythm-drums.js; its next calls are in the terminal (another tool, another pose, a new label)
  const next = (label: string) => withDesk(laterSample(0), 'c41d7a06', { activity: { kind: 'terminal', tool: 'Bash', label, since: laterSample(0).now.iso } })
  const answer = (facts: OfficeFacts) => (w.answer = { exitCode: 0, stdout: JSON.stringify(facts) })

  // three tool calls 16 s apart: each runs the collector, none reloads the frame
  for (const [i, label] of ['npm test', 'git status', 'git diff'].entries()) {
    answer(next(label))
    touch(w, TRANSCRIPT, 100)
    await w.clock.advance(16_000)
    expect(w.runs).toHaveLength(runs + i + 1)
    expect((await peek($)).version).toBe(first.version)
    expect(await sourceOf(ui)).toBe(source)
  }
  await ui.redraw() // a redraw the engine makes for its own reasons keeps the frame too
  expect(await sourceOf(ui)).toBe(source)

  // another desk raises its hand, which moves its record: news, drawn at once, with the busy desk's latest call
  const asking = withDesk(next('git diff'), '4e2f8a10', { state: 'asking', status: 'idle', activity: { kind: 'talking', tool: 'AskUserQuestion', label: 'Ship the drums?', since: laterSample(0).now.iso } })
  answer(asking)
  touch(w, RECORD)
  await w.clock.advance(1_500)
  const raised = await peek($)
  expect(raised.version).toBeGreaterThan(first.version)
  const drawn = await sourceOf(ui)
  expect(drawn).toContain('Ship the drums?')
  expect(drawn).toContain('$ git diff')

  // the busy desk's next call waits for that drawing to be a minute old, then shows
  answer(withDesk(asking, 'c41d7a06', { activity: { kind: 'reading', tool: 'Read', label: 'drums.md', since: laterSample(0).now.iso } }))
  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(10_000)
  expect((await peek($)).version).toBe(raised.version)
  expect(await sourceOf(ui)).toBe(drawn)
  await w.clock.advance(50_000)
  touch(w, TRANSCRIPT, 100) // past the minute: the next run draws it
  await w.clock.advance(1_500)
  expect((await peek($)).version).toBeGreaterThan(raised.version)
  expect(await sourceOf(ui)).toContain('read drums.md')
  await ui.unmount()
})

/** `facts` with `n` more tool calls of `kind` made in project `name`: its counts and the totals', by kind and in all. */
function withCalls(facts: OfficeFacts, name: string, kind: string, n: number): OfficeFacts {
  const add = <T extends { tool_calls: number; activity?: Record<string, number> }>(o: T): T =>
    ({ ...o, tool_calls: o.tool_calls + n, activity: { ...o.activity, [kind]: (o.activity?.[kind] ?? 0) + n } })
  return { ...facts, totals: add(facts.totals), projects: facts.projects.map(p => (p.name === name ? add(p) : p)) }
}

test('a tool call that only moves what they did\'s counts (B1) is drawn at most once a minute too', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const first = await peek($)
  const source = await sourceOf(ui)
  // glyph-atlas-webgpu browsed the web 215 times: the internet café's tooltip says 210 (a count moves in tens there)
  expect(source).toContain('glyph-atlas-webgpu 210')
  const answer = (facts: OfficeFacts) => (w.answer = { exitCode: 0, stdout: JSON.stringify(facts) })
  const calls = (n: number) => withCalls(laterSample(0), 'glyph-atlas-webgpu', 'web', n)

  // four calls more stay inside that step: nothing new to draw
  answer(calls(4))
  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(10_000)
  expect((await peek($)).version).toBe(first.version)
  // the next one crosses it: the drawing would say 220, but only what they did's counts moved, so the frame keeps its
  // source for now
  answer(calls(5))
  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(10_000)
  expect((await peek($)).version).toBe(first.version)
  expect(await sourceOf(ui)).toBe(source)
  // past the minute: the next run draws it
  await w.clock.advance(40_000)
  touch(w, TRANSCRIPT, 100)
  await w.clock.advance(1_500)
  expect((await peek($)).version).toBeGreaterThan(first.version)
  expect(await sourceOf(ui)).toContain('glyph-atlas-webgpu 220')
  await ui.unmount()
})

test('two surfaces drawing the pane keep a drawing each: a redraw of one never hands it a new source', WITH_PEEK, async ($, on) => {
  const w = engine(on, {}, Date.parse(SAMPLE.now.iso))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const desk = await $.ui.mount(pane('desktop', 100))
  const onDesk = await sourceOf(desk)
  await w.clock.advance(2_000)
  const phone = await $.ui.mount(pane('mobile', 40))
  const onPhone = await sourceOf(phone)
  expect(onPhone).not.toBe(onDesk) // its own width

  await desk.redraw() // the engine draws the desktop again for its own reasons (a focus, a scroll)
  expect(await sourceOf(desk)).toBe(onDesk)
  await phone.redraw()
  expect(await sourceOf(phone)).toBe(onPhone)
  // the same office on the heartbeat: compared with both drawings, nothing to write
  const held = await peek($)
  await w.clock.advance(60_000)
  expect((await peek($)).version).toBe(held.version)
  await phone.unmount()
  await desk.unmount()
})

test('on a terminal the runs compare the text: a new minute that changes it is drawn, the same text is not', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.press({ key: 'tab-week' }) // the week's text does not move with the frame clock
  await w.clock.settle()
  const first = await peek($)

  w.answer = { exitCode: 0, stdout: JSON.stringify(laterSample(0)) } // seconds later: the same text
  await w.clock.advance(60_000)
  expect((await peek($)).version).toBe(first.version)
  await ui.unmount()
})

test('a pane back on screen after more than a minute away is drawn again, its clocks from now; a quick look away is not, however old the drawing', WITH_PEEK, async ($, on) => {
  const w = engine(on, {}, Date.parse(SAMPLE.now.iso))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-today' }) // the punch clock runs; the Office's roof carries no clock
  await w.clock.settle()
  const first = await peek($)
  const source = await sourceOf(ui)

  // behind another tab for a few seconds: kept
  w.isShown = false
  await w.clock.advance(3_000)
  w.isShown = true
  await w.clock.advance(6_000)
  expect((await peek($)).version).toBe(first.version)
  expect(await sourceOf(ui)).toBe(source)

  // five minutes on (the heartbeats find the same office), the drawing on screen is old: a quick look away keeps it
  await w.clock.advance(5 * 60_000)
  w.isShown = false
  await w.clock.advance(1_500)
  w.isShown = true
  await w.clock.advance(6_000)
  expect((await peek($)).version).toBe(first.version)
  expect(await sourceOf(ui)).toBe(source)

  // behind it for two minutes (the heartbeats find the same office): drawn again when it is back, the same drawing
  // but for its clocks, phased from the moment it is back
  w.isShown = false
  await w.clock.advance(120_000)
  expect((await peek($)).version).toBe(first.version)
  w.isShown = true
  await w.clock.advance(6_000)
  // the Today tab's facts are written again (not the Office's snapshot): the frame gets a new source
  const again = await sourceOf(ui)
  expect(again).not.toBe(source)
  // what a clock's phase changes: which glyph each digit shows and rests at, and when its <set>s begin
  const unphase = (svg: string) => svg.replace(/<tspan display="(?:inline|none)">/g, '<tspan>')
    .replace(/(<path fill="[^"]+" d=")[^"]+(">)(?:<set [^>]*attributeName="d"[^>]*\/>)+/g, '$1$2')
  expect(unphase(again)).toBe(unphase(source))
  await ui.unmount()
})

// ---------------------------------------------------------------- the pane

test('the command toggles the pane, and open and close say so', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  expect((await $.command.run(command(''))).text).toBe('The Office is open.')
  expect(w.opens).toBe(1)
  expect(w.isUp).toBe(true)

  expect((await $.command.run(command(''))).text).toBe('The Office is closed.')
  expect(w.closes).toBe(1)
  expect(w.isUp).toBe(false)

  expect((await $.command.run(command('close'))).text).toBe('The Office was not open.')
  expect(w.closes).toBe(1)

  expect((await $.command.run(command('open'))).text).toBe('The Office is open.')
  expect((await $.command.run(command('OPEN'))).text).toBe('The Office is open.')
  expect(w.opens).toBe(3)
  expect((await $.command.run(command('close'))).text).toBe('The Office is closed.')
  expect(w.isUp).toBe(false)
})

/** What mounting the band above the prompt on `surface` takes; `hasSurvey` while a survey holds it. */
function band<S extends 'terminal' | 'desktop'>(surface: S, hasSurvey = false) {
  const props = { hasSurvey, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 11 }, view: {} } as const
  return { plugin: 'theoffice', surface, component: 'AbovePrompt', props } as const
}

test('the band above the prompt holds Open The Office while the pane is not on screen; a press opens it as /theoffice does', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  // the engine's own band, drawn when the plugin passes
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  const ui = await $.ui.mount(band('desktop'))
  const button = await ui.find({ key: 'open-office' })
  expect(button?.text).toBe('🏢 Open The Office')
  expect(w.opens).toBe(0) // a load never opens it

  await ui.press({ key: 'open-office' })
  await w.clock.settle()
  expect(w.opens).toBe(1)
  expect(w.isUp).toBe(true)
  expect(await ui.find({ key: 'open-office' })).toBeUndefined() // on screen: the band gives way

  // behind another tab: the Button comes back, and a press raises the pane rather than closing it
  w.isShown = false
  await w.clock.advance(1_500)
  await w.clock.settle()
  expect(await ui.find({ key: 'open-office' })).toBeDefined()
  await ui.press({ key: 'open-office' })
  await w.clock.settle()
  expect(w.opens).toBe(2)
  expect(w.focus).toEqual([false, true])
  expect(w.closes).toBe(0)
  expect(await ui.find({ key: 'open-office' })).toBeUndefined()

  // closed by the command: back again
  await $.command.run(command('close'))
  await w.clock.settle()
  expect(await ui.find({ key: 'open-office' })).toBeDefined()
  await ui.unmount()

  // a survey holds the band: the Button gives way
  const asking = await $.ui.mount(band('terminal', true))
  expect(await asking.find({ key: 'open-office' })).toBeUndefined()
  await asking.unmount()
})

test('a refused /theoffice costs the command alone: the debug log says why, the start goes on, and the band still opens the pane', WITH_PEEK, async ($, on) => {
  const w = engine(on, { tab: 'month' })
  w.refuses.add('theoffice')
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  expect(w.commands.map(c => c.name)).not.toContain('theoffice')
  const told = w.logs.filter(l => l.startsWith('theoffice: /theoffice is not registered ('))
  expect(told).toHaveLength(1)
  expect(told[0]).toContain('/theoffice:theoffice')
  // the rest of the start ran: the kept tab is back, and the collector ran for the snapshot
  const held = await peek($)
  expect(held.tab).toBe('month')
  expect(held.spec).toBe('theoffice/1')

  const ui = await $.ui.mount(band('desktop'))
  await ui.press({ key: 'open-office' })
  await w.clock.settle()
  expect(w.opens).toBe(1)
  await ui.unmount()
})

test('with no word, a pane open behind another tab comes forward instead of closing', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  expect((await $.command.run(command(''))).text).toBe('The Office is open.')
  expect(w.focus).toEqual([false])
  w.isShown = false // another pane is on top
  expect((await $.command.run(command(''))).text).toBe('The Office is open.')
  expect(w.opens).toBe(2)
  expect(w.closes).toBe(0)
  expect(w.focus).toEqual([false, true]) // raised
  expect((await $.command.run(command(''))).text).toBe('The Office is closed.')

  // an explicit close still closes a hidden pane
  await $.command.run(command('open'))
  w.isShown = false
  expect((await $.command.run(command('close'))).text).toBe('The Office is closed.')
  expect(w.isUp).toBe(false)
})

test('/theoffice takes open, close or a tab; any other word only gets the usage line and changes nothing', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  // its one command (PEEK's two test commands are registered beside it)
  expect(w.commands.map(c => c.name).filter(name => name !== 'peek' && name !== 'close-by-hand')).toEqual(['theoffice'])
  const registered = w.commands.find(c => c.name === 'theoffice')
  expect(registered?.argumentHint).toBe('[live|today|week|month|work|timelapse|close]')
  expect(registered?.description).toContain('pixel-art')

  expect((await $.command.run(command(''))).text).toBe('The Office is open.')
  // the old style words (and their flags) are words it does not know: on a pane that is on screen none of them closes it
  for (const word of ['pixel', 'ascii', 'PIXEL', '--style pixel', '--style=ascii', '/pixel', 'banana', 'open banana', 'close pixel', 'week banana', 'constructor', 'what they did']) {
    expect((await $.command.run(command(word))).text).toBe("Usage: /theoffice [live|today|week|month|work|timelapse] [open|close]. With no word it opens or closes The Office; a tab's name opens it on that tab.")
  }
  expect((await peek($)).tab).toBe(null)
  expect(w.opens).toBe(1)
  expect(w.closes).toBe(0)
  expect(w.isUp).toBe(true)

  // nor does one open a closed pane; `/open` and `close open` read like the bare words
  expect((await $.command.run(command('close'))).text).toBe('The Office is closed.')
  expect((await $.command.run(command('pixel'))).text).toMatch(/^Usage:/)
  expect(w.isUp).toBe(false)
  expect((await $.command.run(command('/open'))).text).toBe('The Office is open.')
  expect((await $.command.run(command('close open'))).text).toBe('The Office is closed.')
  expect(w.isUp).toBe(false)
  await w.clock.settle() // the refresh the open started
})

test("a tab's name after /theoffice opens the pane on that tab, raises a hidden one, never closes it, and keeps the pick", WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  expect((await $.command.run(command('week'))).text).toBe('The Office is open.')
  await w.clock.settle()
  expect((await peek($)).tab).toBe('week')
  expect(w.store.get('tab')).toBe('week')
  const ui = await $.ui.mount(pane('desktop', 100))
  expect((await ui.find({ key: 'tab-week' }))?.props.variant).toBe('primary')
  expect(await sourceOf(ui)).toContain('agent-time per day, all floors')

  // on screen, a tab's name switches the tab and fetches its own facts; it never toggles the pane closed
  expect((await $.command.run(command('Today'))).text).toBe('The Office is open.')
  await w.clock.settle()
  expect(w.isUp).toBe(true)
  expect(w.closes).toBe(0)
  expect((await peek($)).tab).toBe('today')
  expect(runsOf(w, 'today')).toHaveLength(1)
  expect(await sourceOf(ui)).toContain('aria-label="The Office today: ')

  // behind another tab it comes forward; `live` and `office` name the Live tab, the last name wins, and close wins
  // over every name and picks no tab
  w.isShown = false
  expect((await $.command.run(command('month office'))).text).toBe('The Office is open.')
  expect(w.focus.at(-1)).toBe(true)
  expect((await peek($)).tab).toBe('all')
  expect(runsOf(w, 'month')).toHaveLength(0)
  await $.command.run(command('/work live'))
  expect((await peek($)).tab).toBe('all')
  expect((await $.command.run(command('close work'))).text).toBe('The Office is closed.')
  expect(w.isUp).toBe(false)
  expect((await peek($)).tab).toBe('all')
  expect(w.store.get('tab')).toBe('all')
  await w.clock.settle()
  await ui.unmount()
})

test('the frame clock stops while the pane is behind another tab and starts again once it is back', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()

  const start = (await peek($)).frame
  await w.clock.advance(7_000)
  expect((await peek($)).frame - start).toBe(10)

  w.isShown = false // another pane is on top: the next look (1.5 s while on screen) sees it
  await w.clock.advance(5_000)
  const hidden = (await peek($)).frame
  await w.clock.advance(14_000)
  expect((await peek($)).frame).toBe(hidden)

  w.isShown = true
  await w.clock.advance(6_000) // behind another tab the pane is looked at every 6 s
  const back = (await peek($)).frame
  await w.clock.advance(7_000)
  expect((await peek($)).frame - back).toBe(10)
})

for (const surface of ['desktop', 'vscode', 'mobile'] as const) test(`on ${surface} the frame clock stays still (the SVG animates itself) until a terminal attaches`, WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface, isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()

  const before = (await peek($)).frame
  await w.clock.advance(10_000)
  expect((await peek($)).frame).toBe(before)
  expect(w.runs.length).toBeGreaterThan(1) // the facts still refresh

  // a terminal joins: its pane draws the block-glyph office, which follows the frame
  await $.session.attach({ surface: 'terminal', clientId: 'terminal:default' })
  await w.clock.advance(7_000)
  const ticked = (await peek($)).frame
  expect(ticked - before).toBe(10) // 7 s / 700 ms

  // closed: no clock
  await $.command.run(command('close'))
  await w.clock.advance(7_000)
  expect((await peek($)).frame).toBe(ticked)
})

/** What a pane draws for one Line: its runs joined, a blank line kept as one space. */
const plain = (line: Line) => line.map(([text]) => text).join('') || ' '

test('every surface draws the pixel office: block glyphs on a terminal, the SVG of the tab elsewhere', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.settle()

  const cases = [['terminal', 100], ['terminal', 72], ['desktop', 100], ['desktop', 80], ['vscode', 120], ['mobile', 64]] as const
  for (const [surface, columns] of cases) {
    const ui = await $.ui.mount(pane(surface, columns))
    const term = surface === 'terminal'
    const svg = await ui.find({ type: 'Svg' })
    if (term) {
      // a terminal: the live floor alone at the pane's width, never the week's tower (that is the Week tab)
      expect(await artLines(ui)).toEqual(renderOffice(SAMPLE, { view: 'live', width: columns, frame: 0 }).map(plain))
      expect(svg).toBeUndefined()
      const colors = new Set((await ui.findAll({ type: 'Text' })).map(t => t.props.color).filter(Boolean))
      // theme keys and basic color names (they follow a light theme), never the dark hexes
      expect(colors.has(ROLE_TERM.busy.color)).toBe(true)
      expect(colors.has(ROLE_TERM.clawd.color)).toBe(true) // every agent is Clawd, in Claude orange
      for (const role of ['title', 'accent', 'clawd'] as const) expect(colors.has(ROLE_HEX[role].dark)).toBe(false)
    } else {
      // off the terminal the Office tab is the live building (the week tower is the Week tab's), its floors numbered,
      // what they did in its basement (B1) and the commits line under it; a card, with its own sky and ground inside
      // rounded corners (no root background, so the corners are the pane's)
      expect(await artLines(ui)).toEqual([])
      const source = String(svg?.props.source)
      expect(source).toMatch(/<clipPath id="[a-zA-Z]+">/)
      expect(source).not.toMatch(/<animate\b|<animateTransform\b/) // on the beat: nothing keeps a frame loop running
      expect(source.startsWith('<svg')).toBe(true)
      expect(source).not.toContain('agent-time per day, all floors')
      expect(source).toContain('COMMITS LINE')
      expect(source).toContain('>WHAT THEY DID<')
      expect(source).toMatch(/>B1<\/text><text [^>]*>1F<\/text>/)
      // what they did in the basement, its rooms alone: the how-to-read lines are the What they did tab's own, as is…
      expect(source).not.toContain('how to read:')
      expect(source).not.toContain('· what they did ·') // …its building
      expect(source).not.toMatch(/^<svg [^>]*style=/)
      expect(source).toMatch(/^<svg [^>]*preserveAspectRatio="xMidYMin meet"/) // hangs from the top of its box
      // both sides given, as the drawing's own: the desktop frame ignores the markup's height and shrank a tall
      // drawing into a thumbnail
      const [, w, h] = /^<svg\b[^>]*?\swidth="(\d+)"[^>]*?\sheight="(\d+)"/.exec(source) ?? []
      expect(svg?.props.width).toBe(Number(w))
      expect(svg?.props.height).toBe(Number(h))
      // one column, one gap: the tabs, then the drawing, no caption between them (a sliver the surface leaves under a
      // capped drawing falls below it)
      const root = (await ui.findAll({ type: 'Box' }))[0]
      expect(root?.props.gap).toBe(1)
      expect(root?.children.map(c => (c as { type?: string }).type)).toEqual(['Box', 'Svg'])
      expect((await ui.findAll({ type: 'Text' })).filter(t => t.props.dimColor === true && !t.props.mono)).toEqual([])
    }
    for (const t of await ui.findAll({ type: 'Text' })) expect(/\u001b/.test(t.text)).toBe(false)
    await ui.unmount()
  }
})

test('the collector runs on a change or the minute\'s heartbeat, never on a timer of the pane; the text moves only while open', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.settle()
  expect(w.runs).toHaveLength(1)

  await w.clock.advance(30_000)
  expect(w.runs).toHaveLength(1)

  await $.command.run(command('open'))
  await w.clock.settle()
  expect(w.runs).toHaveLength(2) // opening refreshes at once
  const before = (await peek($)).frame
  await w.clock.advance(10_000) // 40 s in: nothing changed and no heartbeat yet, so no run
  expect(w.runs).toHaveLength(2)
  const after = (await peek($)).frame
  expect(after - before).toBe(14) // 10 s / 700 ms
  await w.clock.advance(20_000) // 60 s: the heartbeat
  expect(w.runs).toHaveLength(3)

  await $.command.run(command('close'))
  const closed = (await peek($)).frame
  await w.clock.advance(50_000)
  expect(w.runs).toHaveLength(3)
  expect((await peek($)).frame).toBe(closed)
  await w.clock.advance(10_000) // 120 s: the next heartbeat
  expect(w.runs).toHaveLength(4)
})

test('a closed pane lets go of what only it reads, the week staying for the status line, and a tab opened again fetches its own', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  await ui.press({ key: 'tab-timelapse' })
  await w.clock.settle()
  const open = await peek($)
  expect(open.month).toBe('month')
  expect(open.timelapse).toBe('week')
  w.lapses.yesterday = { exitCode: 4, stdout: '' }
  await ui.press({ key: 'lapse-yesterday' })
  await w.clock.settle()
  expect((await peek($)).lapseTrouble).not.toBeNull()
  await ui.unmount()

  await $.command.run(command('close'))
  await w.clock.settle()
  const closed = await peek($)
  expect(closed.month).toBeNull()
  expect(closed.timelapse).toBeNull()
  expect(closed.lapseTrouble).toBeNull() // a failure of then says nothing about the next open
  expect(closed.spec).toBe('theoffice/1')

  const months = runsOf(w, 'month').length
  await $.command.run(command('month'))
  await w.clock.settle()
  expect(runsOf(w, 'month')).toHaveLength(months + 1)
  expect((await peek($)).month).toBe('month')
})

test('a run that lands after the pane closed is dropped: nothing draws it', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  w.delay.lapse = 3_000
  await $.command.run(command('timelapse'))
  await w.clock.advance(1_000)
  await $.command.run(command('close'))
  await w.clock.advance(5_000)
  expect((await peek($)).timelapse).toBeNull()
})

test('timers never open the pane, and a pane closed from outside stays closed', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.advance(15 * 60_000)
  expect(w.opens).toBe(0)

  await $.command.run(command(''))
  expect(w.opens).toBe(1)
  await w.clock.advance(20_000)
  const runs = w.runs.length

  // closed outside theoffice's command: its ui.close hook hears it and slows down at once
  await $.command.run(command('', 'close-by-hand'))
  expect(w.isUp).toBe(false)
  await w.clock.advance(5_000)
  expect(w.runs.length).toBe(runs)

  await w.clock.advance(30 * 60_000 - 5_000)
  expect(w.opens).toBe(1)
  expect(w.runs.length - runs).toBe(30) // back to one run a minute, and still no open
})

test('a pane dropped without a close event is noticed by the next look', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const runs = w.runs.length

  w.isUp = false // an unload: our hooks are not told
  await w.clock.advance(1_500)
  // closed for the watcher: it no longer asks for the pane, and looks every 30 s; the collector runs on the heartbeat
  const asks = w.paneAsks
  await w.clock.advance(58_500)
  expect(w.paneAsks).toBe(asks)
  expect(w.runs.length - runs).toBe(1)
  expect(w.opens).toBe(1)
})


test('a machine\'s first open draws its live floor at once, counting nothing yet, while its first run reads the week; the tabs that are all counts wait', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  w.light = { exitCode: 0, stdout: JSON.stringify(LIGHT) }
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.advance(100)
  expect(w.lights.map(r => [r.argv.slice(2), r.timeoutMs])).toEqual([[['all', '--json', '--first-light'], 20_000]])
  expect(w.runs.map(r => r.argv[2])).toEqual(['all']) // the week, under way
  expect(w.statuses.at(-1)).toBe(renderStatus(LIGHT, { width: 80 }))
  const ui = await $.ui.mount(pane('desktop', 100))
  const source = await sourceOf(ui)
  expect(source).toContain('counting this week…')
  expect(source).toContain('counting commits today…')
  expect(source).not.toContain('no tool calls')
  await ui.press({ key: 'tab-week' })
  await w.clock.advance(100)
  // the week's tower waits: its waiting room, which says the first read of a machine takes a while
  expect(await sourceOf(ui)).toContain('data-loading="week"')
  expect((await ui.find({ key: 'waiting' }))?.text).toMatch(/^Reading this week's sessions for the first time/)
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(await sourceOf(ui)).toContain('agent-time per day, all floors') // the week's tower
  await ui.press({ key: 'tab-all' })
  await w.clock.settle()
  expect(await sourceOf(ui)).not.toContain('counting this week…')
  expect(w.lights).toHaveLength(1) // once
  await ui.unmount()
})

test('the Month tab waits in a room that says how far its first read is, under a drawing that never reloads; a run that stopped says nothing', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const PROGRESS = SHARED.replace(/all\.json$/, 'month.progress.json')
  const report = (p: Record<string, number>) => w.files.set(PROGRESS, { kind: 'file', mtimeMs: w.clock.now(), size: 1, text: JSON.stringify({ v: 1, ...p }) })
  const texts = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text)
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-month' })
  await w.clock.advance(100)
  const room = await sourceOf(ui)
  expect(room).toContain('data-loading="month"')
  expect(room).not.toMatch(/<animate\b/) // on the beat, like every drawing of the pane
  expect(await texts()).toEqual(expect.arrayContaining(['Reading last month and this one', expect.stringMatching(/^The first time, every session of the month is read once/)]))

  report({ began: w.clock.now() - 42_000, at: w.clock.now(), step: 1, steps: 3, done: 8.2e9, total: 21.1e9 })
  await w.clock.advance(1_600) // a look
  // how long it has gone: from when it began to the look (42 s before the report, the look a moment after)
  expect(await texts()).toEqual(expect.arrayContaining(['███░░░░░░░░░░░░░░░░░░░░░ 13%', expect.stringMatching(/^Step 1 of 3, Claude's sessions: 8\.2 GB of 21\.1 GB · 0:4[2-4]$/)]))
  report({ began: w.clock.now() - 75_000, at: w.clock.now(), step: 3, steps: 3, done: 12, total: 60 })
  await w.clock.advance(1_600)
  expect(await texts()).toEqual(expect.arrayContaining(['██████████████████░░░░░░ 73%', expect.stringMatching(/^Step 3 of 3, git: 12 of 60 repos · 1:1[5-7]$/)]))
  expect(await sourceOf(ui)).toBe(room) // the same drawing all along: its frame never reloads
  report({ began: w.clock.now() - 90_000, at: w.clock.now() - 20_000, step: 3, steps: 3, done: 40, total: 60 })
  await w.clock.advance(1_600)
  expect((await texts()).some(t => t.startsWith('Step '))).toBe(false)

  w.gate = undefined
  release()
  await w.clock.settle()
  expect(await sourceOf(ui)).toContain('SEPTEMBER – OCTOBER 2026')
  expect(await ui.find({ key: 'waiting' })).toBeUndefined()
  await ui.unmount()
})

test('a machine whose collector has answered before asks for no first light', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  w.light = { exitCode: 0, stdout: JSON.stringify(LIGHT) }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(w.lights).toEqual([])
  expect((await peek($)).spec).toBe('theoffice/1')
})

test('on a machine where a run has answered before, a session waiting for its first facts only counts desks', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount(pane('desktop', 100))
  expect((await ui.find({ key: 'waiting' }))?.text).toBe('Counting desks')
  await ui.unmount()
  w.gate = undefined
  release()
  await w.clock.settle()
})

test('the terminal pane draws the colored block-glyph office sized to the pane', WITH_PEEK, async ($, on) => {
  const w = engine(on)

  const early = await $.ui.mount(pane('terminal', 100))
  // a waiting room before any facts: on a terminal its words alone
  expect((await early.find({ key: 'waiting' }))?.text).toBe('Counting desks')
  expect(await early.find({ type: 'Svg' })).toBeUndefined()
  await early.unmount()

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.settle()

  const sizes = [[100, /^THE OFFICE · live · /], [72, /^THE OFFICE · live · /], [40, /^THE OFFICE · live · /]] as const
  for (const [columns, view] of sizes) {
    const ui = await $.ui.mount(pane('terminal', columns))
    const title = await ui.find({ type: 'Text', text: /^THE OFFICE/ })
    expect(title?.text).toMatch(view)
    expect(title?.props.wrap).toBe('truncate-end')
    // colors travel as props on nested Text runs, never as escape sequences
    const busy = await ui.findAll({ type: 'Text', text: /working/ })
    expect(busy.length).toBeGreaterThan(0)
    const colors = new Set((await ui.findAll({ type: 'Text' })).map(t => t.props.color).filter(Boolean))
    expect(colors.has(ROLE_TERM.busy.color)).toBe(true)
    expect(colors.has(ROLE_TERM.wall.color)).toBe(true)
    expect([...colors].some(c => /^#/.test(String(c)))).toBe(false) // no dark-background hex on a terminal of any theme
    expect((await ui.findAll({ type: 'Text' })).some(t => t.props.dimColor === true)).toBe(true) // dim is the theme's dim
    for (const t of await ui.findAll({ type: 'Text' })) expect(/\u001b/.test(t.text)).toBe(false)
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    await ui.unmount()
  }
})

/** The art lines a pane drew (one mono Text each). Every art char is one column wide, so code points count columns. */
async function artLines(ui: { findAll: (q: { type: string }) => Promise<readonly { text: string; props: Record<string, unknown> }[]> }) {
  // art lines truncate at the pane's edge; the chips' mono runs (inside the tab Buttons) never do
  return (await ui.findAll({ type: 'Text' })).filter(t => t.props.mono === true && t.props.wrap === 'truncate-end').map(t => t.text)
}

test('a narrow dock gets lines that fit: none wider than the pane', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.settle()

  for (const columns of [20, 40, 54, 59, 60, 61, 89]) {
    const ui = await $.ui.mount(pane('terminal', columns))
    const lines = await artLines(ui)
    expect(lines.length).toBeGreaterThan(5)
    expect(lines[0]).toMatch(/^THE OFFICE/)
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(columns)
    await ui.unmount()
  }
  // off the terminal: no text art, the SVG sized to the pane (about 8 px a cell, 320 px at least), and the tabs, the
  // Live tab's Quiet and the Zoom (the desktop's hidden behind its pixel menu, for their hotkeys)
  for (const surface of ['desktop', 'mobile'] as const) {
    for (const columns of [50, 62, 90]) {
      const ui = await $.ui.mount(pane(surface, columns))
      expect(await artLines(ui)).toEqual([])
      const source = String((await ui.find({ type: 'Svg' }))?.props.source)
      expect(source).toMatch(new RegExp(`^<svg [^>]*width="${Math.max(320, Math.ceil(columns * 9))}"`))
      expect(await ui.findAll({ type: 'Button' })).toHaveLength(8)
      await ui.unmount()
    }
  }
})

test('the terminal pane follows the animation frame', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()

  const ui = await $.ui.mount(pane('terminal', 72))
  const drawn = async () => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
  const first = await drawn()
  const seen = new Set([first])
  for (let i = 0; i < 4; i++) {
    await w.clock.advance(700)
    seen.add(await drawn())
  }
  expect(seen.size).toBeGreaterThan(1)
  await ui.unmount()
})

test('desktop, vscode and mobile draw the animated pixel-art SVG of the tab, right under the tabs with no caption', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(pane(surface, 80))
    const svg = await ui.find({ type: 'Svg' })
    const source = String(svg?.props.source)
    expect(source.startsWith('<svg')).toBe(true)
    expect(source).toContain('<animate')
    expect(source.length).toBeLessThan(131_072)
    expect(svg?.props.isInteractive).toBe(true)
    expect(String(svg?.props.alt)).toContain('The Office')
    expect(String(svg?.props.alt)).toContain('working')
    expect(await ui.find({ type: 'Text', text: /^THE OFFICE/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^the live office/ })).toBeUndefined() // no caption under the tabs
    await ui.unmount()
  }
})

// ---------------------------------------------------------------- tabs

/** The collector runs asked for one view (`all`, `today`, `month`). */
const runsOf = (w: { runs: Run[] }, view: string) => w.runs.filter(r => r.argv[2] === view)

/** The source of the Svg a mounted pane drew. */
async function sourceOf(ui: { find: (q: { type: string }) => Promise<{ props: Record<string, unknown> } | undefined> }): Promise<string> {
  return String((await ui.find({ type: 'Svg' }))?.props.source)
}

test('the tab row: Office, Today, Week, Month, What they did, Timelapse, each with its own key and hotkey digit, the pick primary, and no Text switch; on the desktop the Buttons hide behind the pixel menu', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(pane(surface, 100))
    const buttons = await ui.findAll({ type: 'Button' })
    // the terminal's Buttons say their names; VS Code's and mobile's carry their icons; the desktop's are hidden. Where
    // the Live tab is pixel art, its Quiet and the Zoom come after them (a terminal draws text: neither there)
    const icons = surface === 'vscode' || surface === 'mobile'
    const row = icons ? TABS.map(([k, h, l]) => [k, h, tabText(k, l)]) : TABS.map(t => [...t])
    const quiet = surface === 'terminal' ? [] : [['live-quiet', 'q', icons ? '⊘ Quiet' : 'Quiet'], ['zoom', 'z', icons ? '⊕ Zoom' : 'Zoom']]
    expect(buttons.map(b => [b.key, b.props.hotkey, b.text])).toEqual([...row, ...quiet])
    expect(buttons.map(b => b.props.variant)).toEqual(['primary', 'secondary', 'secondary', 'secondary', 'secondary', 'secondary', ...quiet.map(() => 'secondary')])
    expect(await ui.find({ key: 'mode' })).toBeUndefined()
    if (surface === 'desktop') {
      expect((await ui.find({ key: 'menu-keys' }))?.props.display).toBe('none')
      const menu = await ui.find({ key: 'tabs' })
      expect([menu?.type, menu?.props.module, menu?.props.width]).toEqual(['Client', 'hooks/menu.tsx', '100%'])
    } else {
      expect(await ui.find({ key: 'tabs' })).toBeUndefined()
    }
    await ui.unmount()
  }
})

test('a tab press switches the drawing at once and keeps the pick in the store', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  expect(w.store.has('tab')).toBe(false) // nothing kept until the person picks
  expect((await peek($)).tab).toBe(null)

  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-work' })
  await w.clock.settle()
  expect((await peek($)).tab).toBe('work')
  expect(w.store.get('tab')).toBe('work')
  expect(await sourceOf(ui)).toContain('aria-label="The Office, what they did')
  expect(await ui.find({ type: 'Text', text: 'share of tool calls by kind of work' })).toBeUndefined() // no caption
  expect((await ui.find({ key: 'tab-work' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'tab-all' }))?.props.variant).toBe('secondary')

  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  const week = await sourceOf(ui)
  expect(week).toContain('agent-time per day, all floors')
  expect(w.store.get('tab')).toBe('week')
  // the week tabs draw the week's facts: no other collector run
  expect(runsOf(w, 'today').length + runsOf(w, 'month').length).toBe(0)
  await ui.unmount()
})

test('the next session starts on the kept tab; a kept word that is no tab is ignored', WITH_PEEK, async ($, on) => {
  const w = engine(on, { tab: 'month' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect((await peek($)).tab).toBe('month')
  expect(runsOf(w, 'month')).toHaveLength(0) // the pane is closed: no month yet

  await $.command.run(command('open'))
  await w.clock.settle()
  expect(runsOf(w, 'month')).toHaveLength(1) // opening fetches the tab's own facts
  const ui = await $.ui.mount(pane('desktop', 100))
  const source = await sourceOf(ui)
  expect(source).toContain('aria-label="The Office, the month on the wall calendar')
  expect(source).toContain('SEPTEMBER') // the month facts' 30 days, not the week's
  await ui.unmount()
})

test('a kept tab that is not one of the six leaves the Office tab', WITH_PEEK, async ($, on) => {
  const w = engine(on, { tab: 'banana' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect((await peek($)).tab).toBe(null)
  const ui = await $.ui.mount(pane('desktop', 100))
  expect((await ui.find({ key: 'tab-all' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('Today and Month fetch their own facts: at once on a press, then on a change or the heartbeat while selected and open, never otherwise', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))

  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  const today = runsOf(w, 'today')
  expect(today).toHaveLength(1)
  expect(today[0]?.argv.slice(2, 4)).toEqual(['today', '--json'])
  expect(today[0]?.timeoutMs).toBe(600_000) // no today facts yet: the first run may build the cache
  expect((await peek($)).today).toBe('today')
  expect(await sourceOf(ui)).toContain('aria-label="The Office today: ')

  await w.clock.advance(10_000)
  expect(runsOf(w, 'today')).toHaveLength(1) // nothing changed: no run
  await w.clock.advance(50_000)
  expect(runsOf(w, 'today')).toHaveLength(2) // the heartbeat
  expect(runsOf(w, 'today')[1]?.timeoutMs).toBe(20_000)

  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  expect(runsOf(w, 'month')).toHaveLength(1)
  expect((await peek($)).month).toBe('month')
  await w.clock.advance(60_000)
  expect(runsOf(w, 'month')).toHaveLength(2)
  expect(runsOf(w, 'today')).toHaveLength(2) // not on screen: not fetched

  // closed: no range runs at all, the week still refreshes once a minute for the status line
  await $.command.run(command('close'))
  const month = runsOf(w, 'month').length
  const all = runsOf(w, 'all').length
  await w.clock.advance(120_000)
  expect(runsOf(w, 'month')).toHaveLength(month)
  expect(runsOf(w, 'all').length - all).toBe(2)
  await ui.unmount()
})

test('while agents work, the Month tab runs its collector at most every 30 s, Today every 10 s, and the week, which they do not draw, for the status line alone', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  expect(runsOf(w, 'month')).toHaveLength(1) // the press, at once
  const weeks = runsOf(w, 'all').length

  // an agent writes to its transcript at every look for 58 s: the press's run, then one at 30 s (no heartbeat yet)
  for (let i = 0; i < 38; i++) {
    touch(w, TRANSCRIPT, 50)
    await w.clock.advance(1_500)
  }
  expect(runsOf(w, 'month')).toHaveLength(2)
  expect(runsOf(w, 'all').length - weeks).toBeLessThanOrEqual(1)

  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  const days = runsOf(w, 'today').length
  for (let i = 0; i < 20; i++) {
    touch(w, TRANSCRIPT, 50)
    await w.clock.advance(1_500)
  }
  // 30 s of changes: one run every 10 s at most (the heartbeat at 60 s may add one)
  expect(runsOf(w, 'today').length - days).toBeLessThanOrEqual(4)
  expect(runsOf(w, 'today').length - days).toBeGreaterThanOrEqual(2)
  await ui.unmount()
})

test('a Today or Month tab behind another pane fetches nothing, and catches up as soon as it is back on screen', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  expect(runsOf(w, 'month')).toHaveLength(1)

  // another pane on top: the next tick sees it, then a minute passes without a month run (the week still refreshes)
  w.isShown = false
  await w.clock.advance(5_000)
  const month = runsOf(w, 'month').length
  const all = runsOf(w, 'all').length
  await w.clock.advance(60_000)
  expect(runsOf(w, 'month')).toHaveLength(month)
  expect(runsOf(w, 'all').length).toBeGreaterThan(all)

  // back on screen: the tick that sees it fetches the month at once
  w.isShown = true
  await w.clock.advance(5_000)
  expect(runsOf(w, 'month').length).toBeGreaterThan(month)
  await ui.unmount()
})

/** The runs of the pages of the past (`<view> --back N`), as [view, N], and of this month alone. */
const pastRuns = (w: { runs: Run[] }) => w.runs.filter(r => r.argv[3] === '--back').map(r => [r.argv[2], r.argv[4]])
const thisRuns = (w: { runs: Run[] }) => w.runs.filter(r => r.argv[2] === 'month' && !r.argv.includes('--back'))

/** What the pane hands its strip (hooks/period.tsx), as the Client's props carry it. */
type Strip = { unit: OfficeUnit; back: number; today: string; width: number; busy: boolean; joined?: boolean; exporter?: 'idle' | 'open' | 'busy'; hangs?: boolean }
type Finder = { find: (q: { type?: string; key?: string; in?: string }) => Promise<{ props: Record<string, unknown>; text: string } | undefined> }
async function stripOf(ui: Finder): Promise<Strip | undefined> {
  return (await ui.find({ key: 'period' }))?.props.props as Strip | undefined
}
/** The page's name in the strip's text row, between its Buttons. */
async function labelOf(ui: { find: (q: { key: string }) => Promise<{ text: string } | undefined> }): Promise<string | undefined> {
  return (await ui.find({ key: 'period-label' }))?.text
}
/** The cell under the middle of the strip's zone `id`, in a region `columns` cells and a part wide, as the module reads a click. */
function cellOf(strip: Strip, id: string, columns: number): number {
  const drawn = renderPeriod(strip)
  const zone = drawn.zones.find(z => z.id === id)
  if (!zone) throw new Error(`no zone ${id}`)
  const x = Math.floor(((zone.x + zone.w / 2) / drawn.W) * (columns + 0.5))
  expect(zoneAt(drawn, x / (columns + 0.5), (x + 1) / (columns + 0.5))?.id).toBe(id)
  return x
}

test('Today, Week, Month and What they did page through the past: on the desktop a pixel strip under the tabs, its keys hidden Buttons; the Office and the Timelapse do not page', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  expect(await ui.find({ key: 'period' })).toBeUndefined()

  for (const [key, unit] of [['tab-today', 'day'], ['tab-week', 'week'], ['tab-month', 'month'], ['tab-work', 'week']] as const) {
    await ui.press({ key })
    await w.clock.settle()
    const client = await ui.find({ key: 'period' })
    expect([client?.type, client?.props.module, client?.props.width]).toEqual(['Client', 'hooks/period.tsx', '100%'])
    // the Month's strip ends in its Export key
    const exp = key === 'tab-month' ? { exporter: 'idle' as const } : {}
    expect(await stripOf(ui)).toEqual({ unit, back: 0, today: TODAY_DATE, width: 900, busy: false, joined: true, ...exp })
    // flush under the tabs (one console, the pixel menu), then the drawing a gap apart
    const root = (await ui.findAll({ type: 'Box' }))[0]
    expect(root?.children.map(c => (c as { type?: string }).type)).toEqual(['Box', 'Svg'])
    const menu = await ui.find({ key: 'menu' })
    expect(menu?.props.gap).toBe(0)
    expect(menu?.children.map(c => (c as { type?: string }).type)).toEqual(['Client', 'Client', 'Box']) // the tabs, the strip, the hidden keys
    // it draws itself, an image (no frame, so the pointer reaches it), the strip of its page as lib/svg-period.mjs draws it
    const art = await ui.find({ type: 'Svg', in: 'period' })
    expect(art?.props.isInteractive).toBeUndefined()
    expect(art?.props.source).toBe(renderPeriod({ unit, back: 0, today: TODAY_DATE, width: 900, joined: true, ...exp }).source)
    // its keys as Buttons nobody sees, for their hotkeys; on now ▶ and Now go nowhere
    expect((await ui.find({ key: 'menu-keys' }))?.props.display).toBe('none')
    const steps = (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('period-'))
    expect(steps.map(b => [b.key, b.props.hotkey, b.text, b.props.dimColor])).toEqual(STEP_ROW.map((r, i) => [...r, i > 0]))
  }
  for (const key of ['tab-timelapse', 'tab-all']) {
    await ui.press({ key })
    await w.clock.settle()
    expect(await ui.find({ key: 'period' })).toBeUndefined()
    expect(await ui.find({ key: 'period-older' })).toBeUndefined()
  }
  expect(pastRuns(w)).toEqual([]) // nothing of the past is read until asked
  await ui.unmount()
})

test('a click on the strip turns the page: the key is drawn pressed while held, the page read with the engine\'s longest wait and drawn, for this session only', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.resize({ columns: 100, rows: 2, in: 'period' })
  const strip = (await stripOf(ui))!
  const older = cellOf(strip, 'older', 100)

  await ui.pointer({ type: 'down', x: older, y: 0, button: 'left', in: 'period' })
  expect((await ui.find({ type: 'Svg', in: 'period' }))?.props.source).toBe(renderPeriod({ ...strip, pressed: 'older' }).source)
  expect(pastRuns(w)).toEqual([]) // nothing until the button comes up
  const clicks = played(w, /\/page\.mp3$/).length
  const at = w.clock.now()
  await ui.pointer({ type: 'up', x: older, y: 0, button: 'left', in: 'period' })
  await w.clock.settle()
  expect(played(w, /\/page\.mp3$/)).toHaveLength(clicks + 1) // a page turns, as on a tab press
  // the engine's longest wait, and another run's answer of the last hour will do: its days are over
  expect(w.runs.filter(r => r.argv[3] === '--back').map(r => [r.argv.slice(2, 7), r.timeoutMs])).toEqual([[['month', '--back', '1', '--json', '--since'], 600_000]])
  expect(Number(w.runs.find(r => r.argv[3] === '--back')?.argv[7])).toBe(at - 3_600_000)
  expect(await stripOf(ui)).toEqual({ ...strip, back: 1 })
  expect((await ui.find({ type: 'Svg', in: 'period' }))?.props.source).toBe(renderPeriod({ ...strip, back: 1 }).source)
  const source = await sourceOf(ui)
  expect(source).toContain('SEPTEMBER 2026')
  expect(source).toContain('commits that month')
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/^The Office, September 2026 in pixel art, the wall calendar and the building directory\. Right now: /)
  expect(await peek($)).toMatchObject({ tab: 'month', backs: { day: 0, week: 0, month: 1 }, past: 'September 2026', pastReading: false })
  expect(w.store.has('backs')).toBe(false) // never kept: a new session opens on now

  // a click let go off its key, or off the strip, goes nowhere; a window of the ruler goes straight to its page
  const now = (await stripOf(ui))!
  const turns = played(w, /\/page\.mp3$/).length
  await ui.pointer({ type: 'down', x: cellOf(now, 'tick-0', 100), y: 0, button: 'left', in: 'period' }) // January
  await ui.pointer({ type: 'up', x: cellOf(now, 'older', 100), y: 0, button: 'left', in: 'period' })
  await ui.pointer({ type: 'down', x: cellOf(now, 'older', 100), y: 0, button: 'left', in: 'period' })
  // row 2: below the strip's 40 px at the desktop's 19 or 20 px a row (the pointer held, an up off it still comes)
  await ui.pointer({ type: 'up', x: cellOf(now, 'older', 100), y: 2, button: 'left', in: 'period' })
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1']])
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns)
  expect((await peek($)).backs?.month).toBe(1)
  await ui.pointer({ type: 'down', x: cellOf(now, 'tick-0', 100), y: 0, button: 'left', in: 'period' })
  await ui.pointer({ type: 'up', x: cellOf(now, 'tick-0', 100), y: 0, button: 'left', in: 'period' })
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1'], ['month', '9']])
  expect((await peek($)).past).toBe('January 2026')

  // the desktop tells only the cell: ◀'s last one, astride its edge and the plate, presses it (the cell's middle over
  // the columns, 4.5 % of the strip, fell just past it)
  await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'period' })
  await ui.pointer({ type: 'up', x: 4, y: 0, button: 'left', in: 'period' })
  await w.clock.settle()
  expect((await peek($)).past).toBe('December 2025')
  // rows taller than 20 px make the strip 1 row and a part, the part holding the keys' lower half
  await ui.resize({ columns: 100, rows: 1, in: 'period' })
  await ui.pointer({ type: 'down', x: cellOf(now, 'older', 100), y: 1, button: 'left', in: 'period' })
  await ui.pointer({ type: 'up', x: cellOf(now, 'older', 100), y: 1, button: 'left', in: 'period' })
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1'], ['month', '9'], ['month', '10'], ['month', '11']])
  expect((await peek($)).past).toBe('November 2025')
  await ui.unmount()
})

test('a pane wider than the desktop draws an image pages with the text row: a strip held to 4096 px would not span it', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const wide = await $.ui.mount(pane('desktop', 460))
  expect(await wide.find({ key: 'period' })).toBeUndefined()
  expect(await labelOf(wide)).toBe('Sep → now')
  expect((await wide.find({ key: 'period-older' }))?.props.hotkey).toBe('p')
  // and so does the menu: its tabs are Buttons, with their icons and badges
  expect(await wide.find({ key: 'tabs' })).toBeUndefined()
  expect((await wide.find({ key: 'tab-month' }))?.text).toBe(tabText('tab-month', 'Month'))
  await wide.unmount()
  // 455 columns still take the pixel strip, and the pixel menu on it
  const ui = await $.ui.mount(pane('desktop', 455))
  expect((await stripOf(ui))?.width).toBe(4095)
  expect((await menuOf(ui, 'tabs'))?.width).toBe(4095)
  await ui.unmount()
})

test('the newest press wins: a page asked while another is read waits for it, the pages passed by are never read, and the tab keeps its drawing meanwhile', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const before = await sourceOf(ui)

  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await ui.post({ unit: 'month', back: 1 }, { in: 'period' })
  await w.clock.advance(100)
  expect(pastRuns(w)).toEqual([['month', '1']])
  expect((await peek($)).pastReading).toBe(true)
  expect((await stripOf(ui))?.busy).toBe(true) // its LED blinks
  expect(await sourceOf(ui)).toBe(before) // the drawing stays, the same source: no reload
  await ui.post({ unit: 'month', back: 2 }, { in: 'period' })
  await ui.post({ unit: 'month', back: 3 }, { in: 'period' })
  await w.clock.advance(100)
  expect(pastRuns(w)).toEqual([['month', '1']]) // one at a time
  expect(await stripOf(ui)).toMatchObject({ back: 3, busy: true })
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1'], ['month', '3']]) // then the page on screen: August was passed by
  expect(await peek($)).toMatchObject({ past: 'July 2026', pastReading: false })
  expect(await sourceOf(ui)).toContain('JULY 2026')

  // a page read before is drawn at once, read no more
  await ui.post({ unit: 'month', back: 1 }, { in: 'period' })
  await w.clock.settle()
  expect(pastRuns(w)).toHaveLength(2)
  expect((await peek($)).past).toBe('September 2026')
  expect(await sourceOf(ui)).toContain('SEPTEMBER 2026')
  await ui.unmount()
})

test('a page read while the tab keeps its drawing says so over it once its run says how far it is, and the drawing never reloads for it', WITH_PEEK, async ($, on) => {
  const w = engine(on, { shared: SHARED })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const before = await sourceOf(ui)
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await ui.post({ unit: 'month', step: 1 }, { in: 'period' })
  await w.clock.advance(1_600)
  expect(await ui.find({ key: 'waiting' })).toBeUndefined() // a quick turn says nothing more than the LED blinking
  w.files.set(SHARED.replace(/all\.json$/, 'month-2026-09-01.progress.json'), {
    kind: 'file', mtimeMs: w.clock.now(), size: 1,
    text: JSON.stringify({ v: 1, began: w.clock.now() - 3_000, at: w.clock.now(), step: 1, steps: 3, done: 2e9, total: 4e9 }),
  })
  await w.clock.advance(1_600)
  const said = (await ui.find({ key: 'waiting' }))?.text ?? ''
  expect(said).toContain('Reading September 2026')
  expect(said).toMatch(/Step 1 of 3, Claude's sessions: 2\.0 GB of 4\.0 GB · 0:0[3-5]/)
  expect(await sourceOf(ui)).toBe(before) // the drawing kept, the same source
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(await ui.find({ key: 'waiting' })).toBeUndefined()
  expect(await sourceOf(ui)).toContain('SEPTEMBER 2026')
  await ui.unmount()
})

test('a post is input, never a fact: only a whole page or step of the tab\'s own unit, a hundred years back at most, turns it', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const clicks = w.plays.length
  const junk: JsonValue[] = [
    { unit: 'week', back: 1 }, { unit: 'month', back: -1 }, { unit: 'month', back: 1.5 }, { unit: 'month', back: '2' }, { unit: 'month', back: 1_201 },
    { unit: 'month', step: 0.5 }, { unit: 'month', step: '1' }, { unit: 'month', step: 1, back: 3 }, { unit: 'month', step: -1 }, { back: 1 }, 'older', null, [1],
  ]
  for (const data of junk) await ui.post(data, { in: 'period' })
  await ui.post({ unit: 'month', back: 0 }, { in: 'period' }) // the page on screen: no press
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([])
  expect(w.plays).toHaveLength(clicks)
  expect((await peek($)).backs).toBeNull() // never written
  // the furthest page there is: a hundred years of months, drawn like any other
  await ui.post({ unit: 'month', back: 1_200 }, { in: 'period' })
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1200']])
  expect(await stripOf(ui)).toMatchObject({ back: 1_200, busy: false })
  expect(await sourceOf(ui)).toContain('OCTOBER 1926')
  // a step stops there too
  await ui.post({ unit: 'month', step: 12 }, { in: 'period' })
  await w.clock.settle()
  expect(pastRuns(w)).toHaveLength(1)
  await ui.unmount()
})

test('quick clicks each turn a page: a step counts from the page on screen when it lands, and the strip gets its next page at once', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const strip = (await stripOf(ui))!
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await ui.post({ unit: 'month', step: 1 }, { in: 'period' })
  // the strip shows it at once, its LED blinking while it is read
  expect((await ui.find({ type: 'Svg', in: 'period' }))?.props.source).toBe(renderPeriod({ ...strip, back: 1, busy: true }).source)
  await ui.post({ unit: 'month', step: 1 }, { in: 'period' })
  await ui.post({ unit: 'month', step: 12 }, { in: 'period' })
  await ui.post({ unit: 'month', step: -1 }, { in: 'period' })
  await w.clock.advance(100)
  expect((await peek($)).backs?.month).toBe(13)
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1'], ['month', '13']])
  expect((await peek($)).past).toBe('September 2025')
  await ui.unmount()
})

test('p turns a page back, n forward and c to now, which is drawn at once from its own facts while they run again', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  expect((await peek($)).past).toBe('August 2026')
  await ui.press({ key: 'period-newer' })
  await w.clock.settle()
  expect((await peek($)).past).toBe('September 2026')
  expect(pastRuns(w)).toEqual([['month', '1'], ['month', '2']]) // September was kept

  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  const runs = thisRuns(w).length
  await ui.press({ key: 'period-now' })
  await w.clock.advance(100)
  expect(await sourceOf(ui)).toContain('SEPTEMBER – OCTOBER 2026') // last month and this one, at once
  expect(await stripOf(ui)).toMatchObject({ back: 0, busy: false })
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(thisRuns(w)).toHaveLength(runs + 1)
  await ui.unmount()
})

test('Week and What they did share their page of the past, Today pages by days of its own, and a past page names its days to a reader', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('week'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const alt = async () => String((await ui.find({ type: 'Svg' }))?.props.alt)
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['week', '1']])
  expect(await alt()).toMatch(/^The Office, Mon 19 Oct → Sun 25 Oct in pixel art, the office tower\. /)

  await ui.press({ key: 'tab-work' })
  await w.clock.settle()
  expect(await stripOf(ui)).toMatchObject({ unit: 'week', back: 1 })
  expect(pastRuns(w)).toHaveLength(1) // the same page, kept
  expect(await alt()).toMatch(/^The Office, Mon 19 Oct → Sun 25 Oct in pixel art, what they did, one room per kind of work\. /)

  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  expect(await stripOf(ui)).toMatchObject({ unit: 'day', back: 0 })
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['week', '1'], ['today', '1']])
  expect(await alt()).toMatch(/^The Office, Sun 25 Oct in pixel art, the time clock and the timesheets\. /)
  expect((await peek($)).backs).toEqual({ day: 1, week: 1, month: 0 })
  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  expect(await stripOf(ui)).toMatchObject({ unit: 'month', back: 0 })
  await ui.unmount()
})

test('a page of the past is drawn with the floor of now: who is at a desk, and what its alt says is going on, follow the week\'s facts', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  const alt = async () => String((await ui.find({ type: 'Svg' }))?.props.alt)
  const status = (facts: OfficeFacts) => `Right now: ${renderStatus(facts, { width: 400 }).replace(/^\S+ /u, '')}`
  expect(await alt()).toContain(status(SAMPLE))
  const later = withDesk(laterSample(5), 'c41d7a06', { state: 'asking' })
  w.answer = { exitCode: 0, stdout: JSON.stringify(later) }
  await w.clock.advance(60_000)
  expect(pastRuns(w)).toHaveLength(1) // its days are not read again
  expect(await alt()).toContain(status(later))
  expect(await alt()).toMatch(/^The Office, September 2026 in pixel art/)
  await ui.unmount()
})

test('a page of the past is its own unit\'s: a month that begins on the same day is never drawn on Today', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'period-older' }) // September 2026: Tue 1 Sep → Wed 30 Sep
  await w.clock.settle()
  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  let release = () => {}
  w.gate = new Promise<void>(resolve => (release = resolve))
  await ui.post({ unit: 'day', back: 55 }, { in: 'period' }) // Tue 1 Sep
  await w.clock.advance(100)
  expect(await sourceOf(ui)).not.toContain('SEPTEMBER 2026')
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/^The Office, today in pixel art/) // its last drawing stays
  w.gate = undefined
  release()
  await w.clock.settle()
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/^The Office, Tue 1 Sep in pixel art, the time clock and the timesheets/)
  await ui.unmount()
})

test('an answer of the last hour read before midnight never moves the calendar back: the page it read is drawn, and read once', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('today'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const page = pastFacts('day', 2) // Sat 24 Oct, as another session read it yesterday at 23:30
  w.pasts.set('today 2', { exitCode: 0, stdout: JSON.stringify({ ...page, now: { ...page.now, local_date: '2026-10-25', local_time: '23:30' } }) })
  await ui.post({ unit: 'day', back: 2 }, { in: 'period' })
  await w.clock.settle()
  await w.clock.advance(120_000)
  expect(pastRuns(w)).toEqual([['today', '2']])
  expect(await stripOf(ui)).toMatchObject({ today: TODAY_DATE, back: 2, busy: false })
  expect(String((await ui.find({ type: 'Svg' }))?.props.alt)).toMatch(/^The Office, Sat 24 Oct in pixel art/)
  await ui.unmount()
})

test('a page of the past is never read again by itself: no change, look or heartbeat runs it, while the week runs on for the status line', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  const all = runsOf(w, 'all').length
  const month = thisRuns(w).length
  await w.clock.advance(15 * 60_000)
  expect(pastRuns(w)).toHaveLength(1)
  expect(thisRuns(w)).toHaveLength(month) // last month and this one are not on screen
  expect(runsOf(w, 'all').length).toBeGreaterThan(all)
  await ui.unmount()
})

test('a page of the past that fails says why under the strip, and the heartbeat tries again, backing off, until it reads', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  w.pasts.set('month 1', { exitCode: 3 })
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  expect(await ui.find({ type: 'Text', text: 'The Office could not read September 2026 yet: the collector exited with code 3. Trying again shortly.' })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeUndefined() // not last month and this one under the name of September
  expect(await stripOf(ui)).toMatchObject({ back: 1, busy: false })
  await w.clock.advance(60_000) // the first heartbeat sits out
  expect(pastRuns(w)).toHaveLength(1)
  await w.clock.advance(60_000)
  expect(pastRuns(w)).toHaveLength(2)
  w.pasts.delete('month 1')
  await w.clock.advance(3 * 60_000)
  expect(pastRuns(w)).toHaveLength(3)
  expect((await peek($)).past).toBe('September 2026')
  expect(await sourceOf(ui)).toContain('SEPTEMBER 2026')
  await ui.unmount()
})

test('off the desktop the strip is its Buttons around the page\'s name: a terminal, VS Code and mobile', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const rowOf = async (ui: { findAll: (q: { type: string }) => Promise<readonly { key?: string | null; text: string; props: Record<string, unknown> }[]> }) =>
    (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('period-'))
  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(pane(surface, 100))
    expect(await ui.find({ key: 'period' })).toBeUndefined()
    const row = await rowOf(ui)
    expect(row.map(b => [b.key, b.props.hotkey, b.text])).toEqual(STEP_ROW.map(r => [...r]))
    expect((await labelOf(ui))).toBe('Sep → now')
    await ui.unmount()
  }
  const term = await $.ui.mount(pane('terminal', 100))
  await term.press({ key: 'period-older' })
  await w.clock.settle()
  expect((await labelOf(term))).toBe('September 2026')
  expect((await artLines(term))[0]).toContain('September 2026')
  await term.unmount()

  const ui = await $.ui.mount(pane('desktop', 100))
  expect(await ui.find({ key: 'period' })).toBeDefined()
  expect(await labelOf(ui)).toBeUndefined() // the strip's LED names the page there
  await ui.unmount()
})

// ---------------------------------------------------------------- the pixel menu

/** A row of the pixel menu's props, as hooks/menu.tsx takes them. */
type MenuRowProps = { row: 'tabs' | 'lapse' | 'export'; keys: MenuKey[]; width: number; joined: boolean; under?: boolean; prompt?: string }

/** The props the pixel menu's row `key` (its Client) was drawn with. */
async function menuOf(ui: Finder, key: 'tabs' | 'lapse' | 'export'): Promise<MenuRowProps | undefined> {
  return (await ui.find({ key }))?.props.props as MenuRowProps | undefined
}

/** The cell under the middle of the menu row's key `id`, in a region `columns` cells and a part wide, as the module reads a click. */
function keyCell(row: MenuRowProps, id: string, columns: number): number {
  const drawn = renderMenu(row)
  const zone = drawn.zones.find(z => z.id === id)
  if (!zone) throw new Error(`no key ${id}`)
  const x = Math.floor(((zone.x + zone.w / 2) / drawn.W) * (columns + 0.5))
  expect(menuZoneAt(drawn, x / (columns + 0.5), (x + 1) / (columns + 0.5))?.id).toBe(id)
  return x
}

test('a click on the pixel menu picks its tab: the key drawn pressed while held, the tab switched with a page turn, the menu lit at once', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.resize({ columns: 100, rows: 2, in: 'tabs' })
  const row = (await menuOf(ui, 'tabs'))!
  // the six tabs, the Office lit, then its Quiet switch and the Zoom, off; nothing under it on the Office tab
  expect(row.keys.map(k => [k.id, k.label, k.short, k.icon, k.isOn === true])).toEqual([
    ['all', 'Live', 'Live', 'live', true], ['today', 'Today', 'Today', 'today', false], ['week', 'Week', 'Week', 'week', false],
    ['month', 'Month', 'Month', 'month', false], ['work', 'What they did', 'Work', 'work', false], ['timelapse', 'Timelapse', 'Lapse', 'timelapse', false],
    ['quiet', 'Quiet', 'Quiet', 'quiet', false], ['zoom', 'Zoom', 'Zoom', 'zoom', false],
  ])
  for (const k of row.keys.slice(-2)) expect(k).toMatchObject({ isSwitch: true })
  for (const k of row.keys.slice(-2)) expect(k.isHidden).toBeUndefined()
  expect([row.row, row.width, row.joined]).toEqual(['tabs', 900, false])
  // it draws itself, an image (no frame, so the pointer reaches it), the row as lib/svg-menu.mjs draws it
  const art = await ui.find({ type: 'Svg', in: 'tabs' })
  expect(art?.props.isInteractive).toBeUndefined()
  expect(art?.props.source).toBe(renderMenu(row).source)

  const month = keyCell(row, 'month', 100)
  const turns = played(w, /\/page\.mp3$/).length
  await ui.pointer({ type: 'down', x: month, y: 0, button: 'left', in: 'tabs' })
  expect((await ui.find({ type: 'Svg', in: 'tabs' }))?.props.source).toBe(renderMenu({ ...row, pressed: 'month' }).source)
  expect((await peek($)).tab).toBe(null) // nothing until the button comes up
  // let go on the row's second row of cells (38 px over 19 px rows)
  await ui.pointer({ type: 'up', x: month, y: 1, button: 'left', in: 'tabs' })
  await w.clock.settle()
  expect((await peek($)).tab).toBe('month')
  expect(w.store.get('tab')).toBe('month')
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns + 1) // a page turns, as on a tab press
  expect(runsOf(w, 'month')).toHaveLength(1) // the tab's own facts, as a press fetches them
  const lit = (await menuOf(ui, 'tabs'))!
  expect(lit.keys.filter(k => k.isOn).map(k => k.id)).toEqual(['month'])
  expect(lit.joined).toBe(true) // the strip under it now, flush
  expect(await stripOf(ui)).toMatchObject({ unit: 'month', joined: true })
  expect((await ui.find({ key: 'tab-month' }))?.props.variant).toBe('primary') // its hidden Button follows

  // a press let go off its key goes nowhere, nor does one let go on the row of cells under the menu (the strip's)
  await ui.pointer({ type: 'down', x: keyCell(lit, 'week', 100), y: 0, button: 'left', in: 'tabs' })
  await ui.pointer({ type: 'up', x: keyCell(lit, 'today', 100), y: 0, button: 'left', in: 'tabs' })
  await ui.pointer({ type: 'down', x: keyCell(lit, 'week', 100), y: 0, button: 'left', in: 'tabs' })
  await ui.pointer({ type: 'up', x: keyCell(lit, 'week', 100), y: 2, button: 'left', in: 'tabs' })
  await w.clock.settle()
  expect((await peek($)).tab).toBe('month')
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns + 1)
  // at 20 px a row the menu is 1 row and a part of one: let go on that part, on the row all the same
  await ui.resize({ columns: 100, rows: 1, in: 'tabs' })
  await ui.pointer({ type: 'down', x: keyCell(lit, 'week', 100), y: 0, button: 'left', in: 'tabs' })
  await ui.pointer({ type: 'up', x: keyCell(lit, 'week', 100), y: 1, button: 'left', in: 'tabs' })
  await w.clock.settle()
  expect((await peek($)).tab).toBe('week')
  await ui.unmount()
})

// the tags the Live tab lays on its floors' slabs (svg-kit tagsSvg: their boards, then their frames), and the cards Quiet
// draws instead, each shown while the pointer rests on its desk (svg-kit cardsSvg); Quiet keeps the basement's tags, a
// line each, so the floors' are the ones above it
const TAGS = '"/><path fill="none" stroke="#ece2cd" stroke-opacity=".22"'
const CARDS = 'g:hover g{display:inline}'
const floorsTagged = (svg: string) => svg.includes(TAGS) && svg.indexOf(TAGS) < svg.indexOf('>WHAT THEY DID<')

test('the Live tab\'s Quiet key: pressed, the Live tab is drawn with its names alone at once and kept so, each desk\'s words under the pointer; pressed again, its tags are back; silent, and only on the Live tab', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.resize({ columns: 100, rows: 2, in: 'tabs' })
  // the tags, which Quiet takes off for its cards (the rooms' nameplates stay)
  const hasWords = async () => floorsTagged(await sourceOf(ui))
  const hasCards = async () => (await sourceOf(ui)).includes(CARDS)
  expect(await hasWords()).toBe(true)
  expect(await hasCards()).toBe(false)
  expect(w.store.has('quiet')).toBe(false) // nothing kept until the person presses it
  const turns = played(w, /\/page\.mp3$/).length

  // a click on its pixel key: the drawing quiet at once, the rooms still named, the key lit, kept
  const quietAt = keyCell((await menuOf(ui, 'tabs'))!, 'quiet', 100)
  await ui.pointer({ type: 'down', x: quietAt, y: 0, button: 'left', in: 'tabs' })
  await ui.pointer({ type: 'up', x: quietAt, y: 1, button: 'left', in: 'tabs' })
  await w.clock.settle()
  expect(await hasWords()).toBe(false)
  expect(await hasCards()).toBe(true)
  expect(await sourceOf(ui)).toContain('>MEETING ROOM</text>')
  expect((await menuOf(ui, 'tabs'))!.keys.find(k => k.id === 'quiet')).toMatchObject({ id: 'quiet', isSwitch: true, isOn: true })
  expect((await ui.find({ key: 'live-quiet' }))?.props.variant).toBe('primary') // its hidden Button follows
  expect(w.store.get('quiet')).toBe(true)
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns) // no page turns
  expect((await peek($)).tab).toBe(null) // nor does the tab

  // its Button (hotkey q) turns it off: the tags back
  await ui.press({ key: 'live-quiet' })
  await w.clock.settle()
  expect(await hasWords()).toBe(true)
  expect(await hasCards()).toBe(false)
  expect(w.store.get('quiet')).toBe(false)

  // on another tab its room is kept with nothing in it, no Button, and a post of it changes nothing
  await ui.press({ key: 'live-quiet' })
  await w.clock.settle()
  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  expect(await ui.find({ key: 'live-quiet' })).toBeUndefined()
  expect((await menuOf(ui, 'tabs'))!.keys.find(k => k.id === 'quiet')).toMatchObject({ id: 'quiet', isOn: true, isHidden: true })
  await ui.post({ row: 'tabs', id: 'quiet' }, { in: 'tabs' })
  await w.clock.settle()
  expect(w.store.get('quiet')).toBe(true)
  // the Live tab again: still quiet
  await ui.press({ key: 'tab-all' })
  await w.clock.settle()
  expect(await hasWords()).toBe(false)
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns + 2) // the two tab presses alone
  await ui.unmount()
})

test('the next session draws the Live tab as Quiet was left; a terminal draws its text all the same, with no Quiet', WITH_PEEK, async ($, on) => {
  const w = engine(on, { quiet: true })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  expect(floorsTagged(await sourceOf(ui))).toBe(false)
  expect(await sourceOf(ui)).toContain(CARDS)
  expect(await sourceOf(ui)).toContain('>MEETING ROOM</text>')
  expect((await menuOf(ui, 'tabs'))!.keys.find(k => k.id === 'quiet')).toMatchObject({ id: 'quiet', isOn: true })
  await ui.unmount()
  const text = await $.ui.mount(pane('terminal', 100))
  expect(await text.find({ key: 'live-quiet' })).toBeUndefined()
  // every word of it, each desk's doing included
  const said = (await artLines(text)).join('\n')
  for (const s of ['meeting room', 'meeting arcade-finale-brief', '3 working · 1 hand up']) expect(said).toContain(s)
  await text.unmount()
})

// the drawing's box and its art pixels: its root's width and height (CSS px), then its viewBox's
const boxOf = (svg: string): [number, number, number, number] => {
  const [w, h, uw, uh] = /^<svg [^>]*width="(\d+)" height="(\d+)" viewBox="0 0 (\d+) (\d+)"/.exec(svg)!.slice(1).map(Number)
  return [w ?? 0, h ?? 0, uw ?? 0, uh ?? 0]
}

test('the Zoom key: pressed, every tab is drawn bigger at once (the same width in fewer art pixels) and kept so; pressed again, as before; silent, and no terminal has it', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.resize({ columns: 100, rows: 2, in: 'tabs' })
  const [width, height, units] = boxOf(await sourceOf(ui))
  expect([width, units]).toEqual([900, 450])
  expect(w.store.has('zoom')).toBe(false) // nothing kept until the person presses it
  const turns = played(w, /\/page\.mp3$/).length

  // a click on its pixel key: 2.5 px a pixel at once, as wide and taller, the key lit, kept
  const zoomAt = keyCell((await menuOf(ui, 'tabs'))!, 'zoom', 100)
  await ui.pointer({ type: 'down', x: zoomAt, y: 0, button: 'left', in: 'tabs' })
  await ui.pointer({ type: 'up', x: zoomAt, y: 1, button: 'left', in: 'tabs' })
  await w.clock.settle()
  const [zw, zh, zu] = boxOf(await sourceOf(ui))
  expect([zw, zu]).toEqual([900, 360])
  expect(zh).toBeGreaterThan(height)
  expect((await menuOf(ui, 'tabs'))!.keys.at(-1)).toMatchObject({ id: 'zoom', isSwitch: true, isOn: true })
  expect((await ui.find({ key: 'zoom' }))?.props.variant).toBe('primary') // its hidden Button follows
  expect(w.store.get('zoom')).toBe(true)
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns) // no page turns
  expect((await peek($)).tab).toBe(null) // nor does the tab

  // every tab, its key at the right edge there too
  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  expect(boxOf(await sourceOf(ui))[2]).toBe(360)
  expect((await menuOf(ui, 'tabs'))!.keys.at(-1)).toMatchObject({ id: 'zoom', isOn: true })

  // its Button (hotkey z) turns it off: as before
  await ui.press({ key: 'zoom' })
  await w.clock.settle()
  expect(boxOf(await sourceOf(ui))[2]).toBe(450)
  expect(w.store.get('zoom')).toBe(false)
  await ui.unmount()
  const text = await $.ui.mount(pane('terminal', 100))
  expect(await text.find({ key: 'zoom' })).toBeUndefined()
  await text.unmount()
})

test('the next session draws every tab as the Zoom was left', WITH_PEEK, async ($, on) => {
  const w = engine(on, { zoom: true })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  expect(boxOf(await sourceOf(ui))[2]).toBe(360)
  expect((await menuOf(ui, 'tabs'))!.keys.at(-1)).toMatchObject({ id: 'zoom', isOn: true })
  await ui.unmount()
})

test('a menu post is input, never a fact: only a key of its own row turns anything, the Timelapse\'s ranges and Export as their Buttons do', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const clicks = w.plays.length
  const junk: JsonValue[] = [
    { row: 'lapse', id: 'month' }, { row: 'tabs', id: 'banana' }, { row: 'tabs', id: 4 }, { id: 'month' }, { row: 'tabs' }, 'month', null, [1],
  ]
  for (const data of junk) await ui.post(data, { in: 'tabs' })
  await w.clock.settle()
  expect((await peek($)).tab).toBe(null)
  expect(w.plays).toHaveLength(clicks)

  // the Timelapse, then its ranges: its row of keys under the tabs, flush, the week lit
  await ui.post({ row: 'tabs', id: 'timelapse' }, { in: 'tabs' })
  await w.clock.settle()
  expect((await peek($)).tab).toBe('timelapse')
  expect(lapseRuns(w).map(r => r.argv[3])).toEqual(['week'])
  expect((await menuOf(ui, 'tabs'))?.joined).toBe(true)
  const lapse = (await menuOf(ui, 'lapse'))!
  expect([lapse.row, lapse.joined, lapse.under, lapse.keys.map(k => [k.id, k.isOn === true, k.isRepeatable === true])]).toEqual([
    'lapse', false, true, [['yesterday', false, false], ['week', true, true], ['month', false, false], ['export', false, false]],
  ])
  // the lit range pressed again replays it afresh, as its Button does (a replay never refreshes by itself)
  expect(renderMenu(lapse).zones.map(z => z.id)).toEqual(['yesterday', 'week', 'month', 'export'])
  await ui.post({ row: 'lapse', id: 'week' }, { in: 'lapse' })
  await w.clock.settle()
  expect(lapseRuns(w).map(r => r.argv[3])).toEqual(['week', 'week'])
  for (const data of [{ row: 'tabs', id: 'month' }, { row: 'lapse', id: 'banana' }, { row: 'lapse', id: 'all' }] as JsonValue[]) await ui.post(data, { in: 'lapse' })
  await w.clock.settle()
  expect((await peek($)).lapse).toBe(null)
  expect((await peek($)).tab).toBe('timelapse')
  expect(lapseRuns(w)).toHaveLength(2)
  await ui.post({ row: 'lapse', id: 'month' }, { in: 'lapse' })
  await w.clock.settle()
  expect((await peek($)).lapse).toBe('month')
  expect(lapseRuns(w).map(r => r.argv[3])).toEqual(['week', 'week', 'month'])
  expect((await menuOf(ui, 'lapse'))!.keys.filter(k => k.isOn).map(k => k.id)).toEqual(['month'])

  // Export, as its Button: the range on screen, its key busy while it runs and going nowhere
  w.delay.export = 5_000
  await ui.post({ row: 'lapse', id: 'export' }, { in: 'lapse' })
  expect(lapseRuns(w, '--export').map(r => r.argv[3])).toEqual(['month'])
  await w.clock.advance(1_000)
  const busy = (await menuOf(ui, 'lapse'))!.keys.at(-1)
  expect(busy).toEqual({ id: 'export', label: 'Exporting', short: 'Export', icon: 'export', isBusy: true })
  expect(renderMenu({ keys: (await menuOf(ui, 'lapse'))!.keys, width: 900 }).zones.map(z => z.id)).toEqual(['yesterday', 'week', 'month'])
  await ui.post({ row: 'lapse', id: 'export' }, { in: 'lapse' }) // one is under way: ignored
  await w.clock.settle()
  expect(lapseRuns(w, '--export')).toHaveLength(1)
  await ui.unmount()
})

test('a closed pane lets go of the pages read, keeps the pages picked, and reads its page again once open', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  await ui.unmount()
  await $.command.run(command('close'))
  await w.clock.settle()
  expect(await peek($)).toMatchObject({ past: null, pastReading: false, backs: { day: 0, week: 0, month: 1 } })
  await $.command.run(command('open'))
  await w.clock.settle()
  expect(pastRuns(w)).toEqual([['month', '1'], ['month', '1']])
  expect((await peek($)).past).toBe('September 2026')
})

test('every tab renders on the terminal and the desktop', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()

  const head = {
    'tab-all': /^THE OFFICE · live · /, 'tab-today': /^THE OFFICE · today · Mon 26 Oct · /, 'tab-week': /^THE OFFICE · week · /,
    'tab-month': /^THE OFFICE · month · Sun 27 Sep → Mon 26 Oct/, 'tab-work': /^THE OFFICE · what they did · /,
    'tab-timelapse': /^THE OFFICE · timelapse · this week · Tue 20 Oct → Mon 26 Oct/,
  } as const
  for (const [key] of TABS) {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(pane(surface, 100))
      await ui.press({ key })
      await w.clock.settle()
      expect((await ui.find({ key }))?.props.variant).toBe('primary')
      const isLapse = key === 'tab-timelapse'
      if (surface === 'terminal') {
        const lines = await artLines(ui)
        expect(lines[0]).toMatch(head[key])
        for (const line of lines) expect([...line].length).toBeLessThanOrEqual(100)
        expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      } else {
        const source = await sourceOf(ui)
        expect(source.startsWith('<svg')).toBe(true)
        expect(source.length).toBeLessThan(131_072)
        // the same column on every tab: the pixel menu (the tabs, and flush under them the Timelapse's own row or the
        // strip of a tab that pages), then the drawing, one gap apart, no caption
        const root = (await ui.findAll({ type: 'Box' }))[0]
        expect(root?.props.gap).toBe(1)
        expect(root?.children.map(c => (c as { type?: string }).type)).toEqual(['Box', 'Svg'])
        expect((await ui.find({ key: 'menu' }))?.props.gap).toBe(key === 'tab-all' ? 1 : 0)
        // every tab: a card on the pane (rounded corners, no root background, no box of another color around it, no
        // bleed past the pane's padding) and, but for the Timelapse's replay, the commits line under its street
        expect(source).not.toMatch(/^<svg [^>]*style=/)
        expect(source).toMatch(/<clipPath id="(tl-card|[a-zA-Z]+)">/)
        if (isLapse) expect(source).toContain('data-timelapse="week"')
        else expect(source).toContain('COMMITS LINE')
        for (const box of await ui.findAll({ type: 'Box' })) {
          expect(box.props.marginX ?? 0).toBe(0)
          expect(box.props.marginTop ?? 0).toBe(0)
          expect(box.props.backgroundColor).toBeUndefined()
        }
      }
      for (const t of await ui.findAll({ type: 'Text' })) expect(/\u001b/.test(t.text)).toBe(false)
      await ui.unmount()
    }
  }
})

test('switching tabs leaks no timers: one heartbeat, and the frame clock only on the Office tab and the Timelapse', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal', 100))

  for (let i = 0; i < 12; i++) {
    await ui.press({ key: TABS[i % TABS.length]![0] })
    await w.clock.settle()
  }
  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  let runs = w.runs.length
  const still = (await peek($)).frame
  await w.clock.advance(60_000)
  expect(w.runs.length - runs).toBe(1) // one heartbeat, one week refresh: nothing doubled, no range runs
  expect((await peek($)).frame).toBe(still) // the week's text does not move: no frame clock

  await ui.press({ key: 'tab-all' })
  await w.clock.settle()
  const moving = (await peek($)).frame
  await w.clock.advance(7_000)
  expect((await peek($)).frame - moving).toBe(10) // the floor plan moves again: 7 s / 700 ms

  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  runs = w.runs.length
  await w.clock.advance(60_000)
  expect(w.runs.length - runs).toBe(2) // the week and the month, on the heartbeat

  await $.command.run(command('close'))
  runs = w.runs.length
  const closed = (await peek($)).frame
  await w.clock.advance(120_000)
  expect(w.runs.length - runs).toBe(2) // closed: the week once a minute, and nothing else
  expect((await peek($)).frame).toBe(closed)
  await ui.unmount()
})

test('a Today run that fails says why on its tab, keeps the tabs, and backs off until a run works', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  w.ranges.today = { exitCode: 3, stdout: '' }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))

  await ui.press({ key: 'tab-today' })
  await w.clock.settle()
  expect((await ui.find({ type: 'Text', text: /could not read today's hours yet/ }))?.text).toContain('exited with code 3')
  // the tabs, the Zoom and the strip (the past may still be read) stay, their keys hidden Buttons
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(10)
  expect(await ui.find({ key: 'period' })).toBeDefined()
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(w.logs.some(l => l.startsWith('theoffice: today refresh failed'))).toBe(true)
  expect((await peek($)).trouble).toBe(null) // the week's facts are fine

  // skips 1 heartbeat, runs, skips 2, runs: a failing collector is not restarted every minute
  await w.clock.advance(60_000)
  expect(runsOf(w, 'today')).toHaveLength(1)
  await w.clock.advance(60_000)
  expect(runsOf(w, 'today')).toHaveLength(2)
  w.ranges.today = { exitCode: 0, stdout: JSON.stringify(TODAY) }
  await w.clock.advance(120_000)
  expect(runsOf(w, 'today')).toHaveLength(2)
  await w.clock.advance(60_000)
  expect(runsOf(w, 'today')).toHaveLength(3)
  expect(await sourceOf(ui)).toContain('aria-label="The Office today: ')
  expect(await ui.find({ type: 'Text', text: /could not read/ })).toBeUndefined()
  await ui.unmount()
})

// ---------------------------------------------------------------- pixel and text

/** The text replay of `facts` a pane draws at `columns` on the frame clock's `frame`: one loop is timelapseFrames long. */
const lapseLines = (facts: OfficeFacts, columns: number, frame: number) =>
  renderTimelapseText(facts, { width: columns, frame: frame % timelapseFrames(facts) }).map(plain)

test('there is no Text switch: off the terminal every tab is pixel art, whatever an older version kept, and no key t', WITH_PEEK, async ($, on) => {
  const w = engine(on, { mode: 'text', tab: 'week' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  for (const [key] of TABS) {
    for (const [surface, columns] of [['desktop', 100], ['vscode', 72], ['mobile', 64]] as const) {
      const ui = await $.ui.mount(pane(surface, columns))
      await ui.press({ key })
      await w.clock.settle()
      expect(String((await ui.find({ type: 'Svg' }))?.props.source).startsWith('<svg')).toBe(true)
      expect(await artLines(ui)).toEqual([])
      expect(await ui.find({ key: 'mode' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Button' })).some(b => b.props.hotkey === 't')).toBe(false)
      await ui.unmount()
    }
  }
  expect(w.store.get('mode')).toBe('text') // left as it was, never read
})

test('the terminal always draws text, never an Svg, with no switch; a desktop attached to the same session draws pixel art', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await w.clock.settle()

  const check = async () => {
    for (const columns of [100, 72]) {
      const ui = await $.ui.mount(pane('terminal', columns))
      const at = (await peek($)).frame
      // the Office tab is the live floor alone at every width
      expect(await artLines(ui)).toEqual(renderOffice(SAMPLE, { view: 'live', width: columns, frame: at }).map(plain))
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ key: 'mode' })).toBeUndefined()
      expect(await ui.find({ key: 'tabs' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Button' })).map(b => b.key)).toEqual(TABS.map(t => t[0]))
      const colors = new Set((await ui.findAll({ type: 'Text' })).map(t => t.props.color).filter(Boolean))
      expect(colors.has(ROLE_TERM.busy.color)).toBe(true) // the theme's colors
      expect([...colors].some(c => /^#/.test(String(c)))).toBe(false)
      await ui.unmount()
    }
  }
  await check()
  const desk = await $.ui.mount(pane('desktop', 100))
  expect(await desk.find({ type: 'Svg' })).toBeDefined()
  expect(await artLines(desk)).toEqual([])
  await desk.unmount()
  await check()
})

test('the frame clock runs exactly while moving text is on screen: a terminal on the Office tab of a shown pane, never for the pixel art', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const frameNow = async () => (await peek($)).frame
  const still = async (ms: number) => {
    const at = await frameNow()
    await w.clock.advance(ms)
    expect(await frameNow()).toBe(at)
  }
  const moves = async () => {
    const at = await frameNow()
    await w.clock.advance(7_000)
    expect((await frameNow()) - at).toBe(10) // 7 s / 700 ms: one clock, never two
  }

  const desk = await $.ui.mount(pane('desktop', 100))
  await still(7_000) // the pixel art animates itself
  await desk.unmount()

  // a terminal attached: the floor plan moves on the Office tab, and the drawing follows the frame
  await $.session.attach({ surface: 'terminal', clientId: 'terminal:default' })
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal', 100))
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    await w.clock.advance(700)
    seen.add((await artLines(ui)).join('\n'))
  }
  expect(seen.size).toBeGreaterThan(1)
  await moves()

  // a tab whose text does not move: still; back on the Office tab: moving, one clock however often it switched
  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  await still(7_000)
  for (let i = 0; i < 3; i++) {
    await ui.press({ key: 'tab-all' })
    await ui.press({ key: 'tab-week' })
  }
  await ui.press({ key: 'tab-all' })
  await w.clock.settle()
  await moves()

  // behind another pane: still, the facts still refresh (the heartbeat); on screen again: moving
  w.isShown = false
  await w.clock.advance(5_000) // the look that sees it
  const runs = w.runs.length
  await still(60_000)
  expect(w.runs.length).toBeGreaterThan(runs)
  w.isShown = true
  await w.clock.advance(6_000) // the next look, 6 s at most behind another tab
  await moves()

  // closed: still
  await $.command.run(command('close'))
  await still(7_000)
  await ui.unmount()
})

// ---------------------------------------------------------------- the timelapse

/** The collector runs asked for a timelapse (`timelapse <range> --json`), or with `flag` `--export` for an export. */
const lapseRuns = (w: { runs: Run[] }, flag = '--json') => w.runs.filter(r => r.argv[2] === 'timelapse' && r.argv[4] === flag)

test('the Timelapse tab runs the week once and draws its replay: one looping, interactive Svg under the tabs and its own row', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  expect(lapseRuns(w)).toHaveLength(0) // nothing asked for it yet

  await ui.press({ key: 'tab-timelapse' })
  await w.clock.settle()
  const runs = lapseRuns(w)
  expect(runs).toHaveLength(1)
  expect(runs[0]?.argv.slice(2)).toEqual(['timelapse', 'week', '--json'])
  expect(runs[0]?.timeoutMs).toBe(600_000) // nothing kept for it yet: a cold cache may build first
  expect(await peek($)).toMatchObject({ tab: 'timelapse', timelapse: 'week', lapseTrouble: null })

  const svg = await ui.find({ type: 'Svg' })
  const source = String(svg?.props.source)
  expect(source.startsWith('<svg')).toBe(true)
  expect(source).toContain('data-timelapse="week"')
  expect(source).toContain('<animate')
  expect(source.length).toBeLessThan(131_072)
  // the pane's width, a card on the pane like every tab
  expect(source).toBe(renderTimelapse(LAPSE.week, { width: 900, card: true }))
  expect(svg?.props.isInteractive).toBe(true)
  const [, wide, high] = /^<svg\b[^>]*?\swidth="(\d+)"[^>]*?\sheight="(\d+)"/.exec(source) ?? []
  expect([svg?.props.width, svg?.props.height]).toEqual([Number(wide), Number(high)])
  expect(String(svg?.props.alt)).toMatch(/^The Office timelapse, this week \(Tue 20 Oct → Mon 26 Oct\): \d+ sessions in \d+ projects/)

  // one column, one gap: the pixel menu (the tabs, and flush under them its own row: the ranges and Export), the replay
  const root = (await ui.findAll({ type: 'Box' }))[0]
  expect(root?.props.gap).toBe(1)
  expect(root?.children.map(c => (c as { type?: string }).type)).toEqual(['Box', 'Svg'])
  const menu = await ui.find({ key: 'menu' })
  expect(menu?.props.gap).toBe(0)
  expect(menu?.children.map(c => (c as { type?: string }).type)).toEqual(['Client', 'Client', 'Box']) // the tabs, the ranges, the hidden keys
  const lapseMenu = await ui.find({ key: 'lapse' })
  expect([lapseMenu?.type, lapseMenu?.props.module]).toEqual(['Client', 'hooks/menu.tsx'])
  expect((lapseMenu?.props.props as { keys: { id: string; isOn?: boolean }[] }).keys.map(k => [k.id, k.isOn === true])).toEqual([
    ['yesterday', false], ['week', true], ['month', false], ['export', false],
  ])
  // every key still a Button, hidden, for its hotkey (the picked range the primary one, Export last)
  const buttons = await ui.findAll({ type: 'Button' })
  expect(buttons.map(b => [b.key, b.props.hotkey, b.text])).toEqual([...TABS.map(t => [...t]), ['zoom', 'z', 'Zoom'], ...LAPSE_ROW.map(r => [...r])])
  expect((await ui.find({ key: 'tab-timelapse' }))?.props.variant).toBe('primary')
  expect(buttons.slice(7).map(b => [b.props.variant, b.props.dimColor])).toEqual([['secondary', true], ['primary', false], ['secondary', true], ['secondary', false]])
  expect(await ui.find({ type: 'Text', text: /^Saved to/ })).toBeUndefined() // nothing exported yet

  // the SVG replays itself: no frame clock
  const frame = (await peek($)).frame
  await w.clock.advance(7_000)
  expect((await peek($)).frame).toBe(frame)
  await ui.unmount()
})

test('the same facts give the same replay: a redraw, the watcher, the heartbeat and a long look away never hand its frame a new source', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  claudeDir(w)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('timelapse'))
  await w.clock.settle()
  expect(lapseRuns(w)).toHaveLength(1)
  const desk = await $.ui.mount(pane('desktop', 100))
  const source = await sourceOf(desk)
  const phone = await $.ui.mount(pane('mobile', 40))
  expect(await sourceOf(phone)).toBe(renderTimelapse(LAPSE.week, { width: 360, card: true })) // its own width
  await desk.redraw() // the engine draws it again for its own reasons
  expect(await sourceOf(desk)).toBe(source)
  const first = await peek($)

  // agents work (every look sees it) for two minutes and the heartbeat beats: the week refreshes for the status line
  // alone, the replay is left alone
  const weeks = runsOf(w, 'all').length
  for (let i = 0; i < 80; i++) {
    touch(w, TRANSCRIPT, 50)
    await w.clock.advance(1_500)
  }
  expect(runsOf(w, 'all').length - weeks).toBeGreaterThanOrEqual(1)
  expect(runsOf(w, 'all').length - weeks).toBeLessThanOrEqual(3)
  expect(lapseRuns(w)).toHaveLength(1)
  expect((await peek($)).lapseVersion).toBe(first.lapseVersion)
  expect(await sourceOf(desk)).toBe(source)

  // behind another tab for two minutes and back: nothing runs, and it is never drawn again (it would start over)
  w.isShown = false
  await w.clock.advance(120_000)
  w.isShown = true
  await w.clock.advance(6_000)
  expect(lapseRuns(w)).toHaveLength(1)
  expect((await peek($)).lapseVersion).toBe(first.lapseVersion)
  expect(await sourceOf(desk)).toBe(source)
  expect(await sourceOf(phone)).toBe(renderTimelapse(LAPSE.week, { width: 360, card: true }))
  await phone.unmount()
  await desk.unmount()
})

test('a range press draws the facts kept for it at once, runs it afresh (the range on screen too), and keeps the pick in the store', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-timelapse' })
  await w.clock.settle()
  expect(w.store.has('lapse')).toBe(false) // nothing kept until the person picks

  await ui.press({ key: 'lapse-month' })
  await w.clock.settle()
  expect(lapseRuns(w).map(r => r.argv.slice(2))).toEqual([['timelapse', 'week', '--json'], ['timelapse', 'month', '--json']])
  expect(lapseRuns(w)[1]?.timeoutMs).toBe(600_000) // the month's first run
  expect(await sourceOf(ui)).toContain('data-timelapse="month"')
  expect((await ui.find({ key: 'lapse-month' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'lapse-week' }))?.props.variant).toBe('secondary')
  expect(await peek($)).toMatchObject({ lapse: 'month', timelapse: 'month' })
  expect(w.store.get('lapse')).toBe('month')

  // back to the week while its run takes a while: the week kept is drawn at once, then the run lands
  w.delay.lapse = 3_000
  await ui.press({ key: 'lapse-week' })
  expect(lapseRuns(w)).toHaveLength(3)
  expect(lapseRuns(w)[2]?.timeoutMs).toBe(20_000) // something kept: the usual wait
  expect(await sourceOf(ui)).toBe(renderTimelapse(LAPSE.week, { width: 900, card: true }))
  expect(w.store.get('lapse')).toBe('week')
  const drawn = await peek($)
  await w.clock.advance(3_000)
  expect((await peek($)).lapseVersion).toBeGreaterThan(drawn.lapseVersion)

  // the range on screen pressed again runs again; a press while that run is under way is answered by it
  await ui.press({ key: 'lapse-week' })
  await ui.press({ key: 'lapse-week' })
  expect(lapseRuns(w)).toHaveLength(4)
  await w.clock.advance(3_000)
  expect(lapseRuns(w)).toHaveLength(4)
  expect(await sourceOf(ui)).toContain('data-timelapse="week"')
  expect(runsOf(w, 'today').length + runsOf(w, 'month').length).toBe(0) // its ranges are its own runs
  await ui.unmount()
})

test('the next session opens the Timelapse on the kept range; /theoffice timelapse (or lapse) runs it afresh, a bare open only with nothing to draw', WITH_PEEK, async ($, on) => {
  const w = engine(on, { tab: 'timelapse', lapse: 'month' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await w.clock.settle()
  expect(await peek($)).toMatchObject({ tab: 'timelapse', lapse: 'month' })
  expect(lapseRuns(w)).toHaveLength(0) // the pane is closed: nothing asked for it

  await $.command.run(command('open'))
  await w.clock.settle()
  expect(lapseRuns(w).map(r => r.argv.slice(2))).toEqual([['timelapse', 'month', '--json']])
  const ui = await $.ui.mount(pane('desktop', 100))
  expect((await ui.find({ key: 'lapse-month' }))?.props.variant).toBe('primary')
  expect(await sourceOf(ui)).toContain('data-timelapse="month"')

  await $.command.run(command('open')) // on screen, its facts kept: nothing to run
  await w.clock.settle()
  expect(lapseRuns(w)).toHaveLength(1)
  await $.command.run(command('timelapse')) // asked for by name: a new replay
  await w.clock.settle()
  expect(lapseRuns(w)).toHaveLength(2)
  await $.command.run(command('week'))
  await $.command.run(command('/lapse'))
  await w.clock.settle()
  expect((await peek($)).tab).toBe('timelapse')
  expect(lapseRuns(w).map(r => r.argv[3])).toEqual(['month', 'month', 'month'])
  await ui.unmount()
})

test('a kept range that is no range leaves the week', WITH_PEEK, async ($, on) => {
  const w = engine(on, { tab: 'timelapse', lapse: 'decade' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  expect((await peek($)).lapse).toBe(null)
  expect(lapseRuns(w).map(r => r.argv[3])).toEqual(['week'])
  const ui = await $.ui.mount(pane('desktop', 100))
  expect((await ui.find({ key: 'lapse-week' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

test('a terminal draws the text replay, which the frame clock moves only while the Timelapse is on screen as text', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run(command('timelapse'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('terminal', 100))
  // the tabs and its row, no Svg, the replay from its first frame
  expect((await ui.findAll({ type: 'Button' })).map(b => [b.key, b.props.hotkey, b.text])).toEqual([...TABS.map(t => [...t]), ...LAPSE_ROW.map(r => [...r])])
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await peek($)).frame).toBe(0)
  const first = await artLines(ui)
  expect(first).toEqual(lapseLines(LAPSE.week, 100, 0))
  expect(first[0]).toMatch(/^THE OFFICE · timelapse · this week · Tue 20 Oct → Mon 26 Oct/)
  for (const line of first) expect([...line].length).toBeLessThanOrEqual(100)
  const colors = new Set((await ui.findAll({ type: 'Text' })).map(t => t.props.color).filter(Boolean))
  expect([...colors].some(c => /^#/.test(String(c)))).toBe(false) // the theme's colors on a terminal
  for (const t of await ui.findAll({ type: 'Text' })) expect(/\u001b/.test(t.text)).toBe(false)

  const seen = new Set<string>()
  for (let i = 1; i <= 10; i++) {
    await w.clock.advance(700)
    expect((await peek($)).frame).toBe(i)
    const lines = await artLines(ui)
    expect(lines).toEqual(lapseLines(LAPSE.week, 100, i))
    seen.add(lines.join('\n'))
  }
  expect(seen.size).toBeGreaterThan(5)

  // a tab whose text does not move: still; back on the Timelapse: moving again, from its first frame
  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  const still = (await peek($)).frame
  await w.clock.advance(7_000)
  expect((await peek($)).frame).toBe(still)
  await ui.press({ key: 'tab-timelapse' })
  await w.clock.settle()
  expect((await peek($)).frame).toBe(0)
  await w.clock.advance(7_000)
  expect((await peek($)).frame).toBe(10)

  // closed: still
  await $.command.run(command('close'))
  await w.clock.advance(7_000)
  expect((await peek($)).frame).toBe(10)
  await ui.unmount()
})

test('Export saves the picked range and opens it, one at a time: a toast says where, and off the terminal the page is named under the row', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('timelapse'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const source = await sourceOf(ui)
  const exports = () => lapseRuns(w, '--export')

  w.delay.export = 5_000
  await ui.press({ key: 'lapse-export' })
  expect(exports().map(r => [r.argv.slice(2), r.timeoutMs])).toEqual([[['timelapse', 'week', '--export', '--open'], 120_000]])
  expect((await ui.find({ key: 'lapse-export' }))?.text).toBe('⤓ Exporting…')
  expect((await peek($)).lapseExporting).toBe(true)
  await ui.press({ key: 'lapse-export' }) // one is under way: ignored
  await w.clock.advance(2_000)
  await ui.press({ key: 'lapse-export' })
  expect(exports()).toHaveLength(1)
  expect(w.toasts).toEqual([])

  await w.clock.advance(3_000)
  expect(w.toasts).toEqual([{ text: `The timelapse is saved and opening in your browser: ${PAGE('week')}. Save it there as a GIF, a video or an SVG.`, timeoutMs: 10_000 }])
  expect(await peek($)).toMatchObject({ lapseSaved: PAGE('week'), lapseExporting: false })
  expect((await ui.find({ key: 'lapse-export' }))?.text).toBe('⤓ Export')
  const line = await ui.find({ type: 'Text', text: /^Saved to/ })
  expect(line?.text).toBe(`Saved to ${PAGE('week')}`)
  expect(line?.props.dimColor).toBe(true)
  // the pixel menu, the line under it, then the replay, which an export never reloads; the menu's Export key says it
  // is done
  const root = (await ui.findAll({ type: 'Box' }))[0]
  expect(root?.children.map(c => (c as { type?: string }).type)).toEqual(['Box', 'Text', 'Svg'])
  const keys = (await ui.find({ key: 'lapse' }))?.props.props as { keys: { id: string; label: string; isBusy?: boolean }[] }
  expect(keys.keys.at(-1)).toEqual({ id: 'export', label: 'Export', short: 'Export', icon: 'export' })
  expect(await sourceOf(ui)).toBe(source)
  expect(lapseRuns(w)).toHaveLength(1)

  // the month has no page saved: no line; back on the week it is there again; a terminal never draws it
  await ui.press({ key: 'lapse-month' })
  await w.clock.settle()
  expect(await ui.find({ type: 'Text', text: /^Saved to/ })).toBeUndefined()
  await ui.press({ key: 'lapse-week' })
  await w.clock.settle()
  expect((await ui.find({ type: 'Text', text: /^Saved to/ }))?.text).toBe(`Saved to ${PAGE('week')}`)
  const term = await $.ui.mount(pane('terminal', 100))
  expect(await term.find({ type: 'Text', text: /^Saved to/ })).toBeUndefined()
  await term.unmount()

  // done: the next press exports again, the month now, and the line follows
  w.delay.export = 0
  await ui.press({ key: 'lapse-month' })
  await w.clock.settle()
  await ui.press({ key: 'lapse-export' })
  await w.clock.settle()
  expect(exports().map(r => r.argv[3])).toEqual(['week', 'month'])
  expect((await peek($)).lapseSaved).toBe(PAGE('month'))
  expect((await ui.find({ type: 'Text', text: /^Saved to/ }))?.text).toBe(`Saved to ${PAGE('month')}`)
  await ui.unmount()
})

test('an export that fails says why in a toast, in a few words, and names no page', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('timelapse'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))

  const cases: [Answer, RegExp][] = [
    [{ exitCode: 2, stdout: '' }, /^The timelapse could not be saved: the export exited with code 2\.$/],
    [{ exitCode: 0, stdout: 'saved it somewhere\n' }, /^The timelapse could not be saved: the export named no page\.$/],
    [{ exitCode: 0, stdout: 'pixel/timelapse-week.html\n' }, /^The timelapse could not be saved: the export named no page\.$/], // not absolute
    [{ exitCode: 0, stdout: `${PAGE('week').replace(/\.html$/, '.svg')}\n` }, /^The timelapse could not be saved: the export named no page\.$/],
    [{ error: 'spawn node ENOENT' }, /^The timelapse could not be saved: the export did not run \(.+\)\.$/], // the engine's words for it
  ]
  for (const [answer, said] of cases) {
    w.exported = answer
    await ui.press({ key: 'lapse-export' })
    await w.clock.settle()
    expect(w.toasts.at(-1)?.text).toMatch(said)
  }
  expect(w.toasts).toHaveLength(cases.length)
  expect(lapseRuns(w, '--export')).toHaveLength(cases.length)
  expect(await peek($)).toMatchObject({ lapseSaved: null, lapseExporting: false })
  expect(await ui.find({ type: 'Text', text: /^Saved to/ })).toBeUndefined()
  expect((await ui.find({ key: 'lapse-export' }))?.text).toBe('⤓ Export')
  await ui.unmount()
})

// ---------------------------------------------------------------- the Month's export

/** The Month export runs asked (`month … --export <part> --as <format>`). */
const monthExports = (w: { runs: Run[] }) => w.runs.filter(r => r.argv[2] === 'month' && r.argv.includes('--export'))
/** The export row's Buttons (the hidden ones on the desktop), as [key, hotkey, text]. */
async function answersOf(ui: { findAll: (q: { type: string }) => Promise<readonly { key?: string | null; text: string; props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('export-')).map(b => [b.key, b.props.hotkey, b.text])
}

test('the Month\'s Export key opens a row under its strip that asks what to export, then how, and saves the page on screen from the facts it draws: one at a time, a toast says where', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const source = await sourceOf(ui)
  const turns = played(w, /\/page\.mp3$/).length
  // the strip ends in Export, its Button hidden beside the strip's keys with the hotkey e; no row yet
  expect((await stripOf(ui))?.exporter).toBe('idle')
  const toggle = await ui.find({ key: 'month-export' })
  expect([toggle?.props.hotkey, toggle?.text, toggle?.props.variant]).toEqual(['e', '⤓ Export', 'secondary'])
  expect(await ui.find({ key: 'export' })).toBeUndefined()
  expect(await answersOf(ui)).toEqual([])

  await ui.press({ key: 'month-export' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('what')
  expect(await stripOf(ui)).toMatchObject({ exporter: 'open', hangs: true, joined: true })
  const asked = (await menuOf(ui, 'export'))!
  expect([asked.row, asked.joined, asked.under, asked.prompt, asked.width]).toEqual(['export', false, true, 'Export', 900])
  expect(asked.keys).toEqual([
    { id: 'calendar', label: 'Calendar', short: 'Calendar', icon: 'calendar' }, { id: 'directory', label: 'Directory', short: 'Directory', icon: 'directory' },
    { id: 'whole', label: 'Whole month', short: 'Month', icon: 'building' }, { id: 'stats', label: 'Stats', short: 'Stats', icon: 'stats' },
  ])
  // one console: the tabs, the strip, the row flush under it, then the hidden keys
  const menu = await ui.find({ key: 'menu' })
  expect(menu?.children.map(c => (c as { type?: string }).type)).toEqual(['Client', 'Client', 'Client', 'Box'])
  expect((await ui.find({ key: 'export' }))?.props.module).toBe('hooks/menu.tsx')
  expect((await ui.find({ type: 'Svg', in: 'export' }))?.props.source).toBe(renderMenu(asked).source)
  expect(await answersOf(ui)).toEqual([['export-calendar', 'a', 'Calendar'], ['export-directory', 'd', 'Directory'], ['export-whole', 'm', 'Whole month'], ['export-stats', 's', 'Stats']])
  expect((await ui.find({ key: 'month-export' }))?.props.variant).toBe('primary')

  // a part asks how to keep it, Back asks what again, and the stats are kept otherwise
  await ui.press({ key: 'export-calendar' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('calendar')
  expect((await menuOf(ui, 'export'))?.prompt).toBe('Calendar as')
  expect((await menuOf(ui, 'export'))?.keys.map(k => [k.id, k.icon])).toEqual([['png', 'png'], ['svg', 'svg'], ['gif', 'gif'], ['video', 'video'], ['back', 'back']])
  expect(await answersOf(ui)).toEqual([['export-png', 'i', 'PNG'], ['export-svg', 's', 'SVG'], ['export-gif', 'g', 'GIF'], ['export-video', 'v', 'Video'], ['export-back', 'b', '‹ Back']])
  await ui.press({ key: 'export-back' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('what')
  await ui.press({ key: 'export-stats' })
  await w.clock.settle()
  expect((await menuOf(ui, 'export'))?.keys.map(k => k.id)).toEqual(['html', 'csv', 'json', 'back'])
  expect(await answersOf(ui)).toEqual([['export-html', 'h', 'Page'], ['export-csv', 't', 'CSV'], ['export-json', 'j', 'JSON'], ['export-back', 'b', '‹ Back']])
  expect(monthExports(w)).toEqual([])

  // the calendar as a PNG: the row closes, the key says it works, the run draws the facts on screen, handed on stdin
  await ui.press({ key: 'export-back' })
  await w.clock.settle()
  await ui.press({ key: 'export-calendar' })
  await w.clock.settle()
  w.delay.month = 5_000
  await ui.press({ key: 'export-png' })
  await w.clock.advance(1_000)
  expect(monthExports(w).map(r => [r.argv.slice(2), r.timeoutMs])).toEqual([[['month', '--export', 'calendar', '--as', 'png', '--open', '--stdin'], 120_000]])
  expect(JSON.parse(String(monthExports(w)[0]?.stdin))).toEqual(MONTH)
  expect(await peek($)).toMatchObject({ monthAsk: null, monthExporting: true })
  expect(await ui.find({ key: 'export' })).toBeUndefined()
  const busy = (await stripOf(ui))!
  expect([busy.exporter, busy.hangs]).toEqual(['busy', undefined])
  expect((await ui.find({ key: 'month-export' }))?.text).toBe('⤓ Exporting…')
  expect((await ui.find({ key: 'month-export' }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'month-export' }) // one is under way: nothing opens
  await w.clock.advance(1_000)
  expect((await peek($)).monthAsk).toBe(null)
  expect(w.toasts).toEqual([])

  await w.clock.advance(3_000)
  expect(w.toasts).toEqual([{
    text: `The wall calendar of last month and this one is opening in your browser, which saves it as a PNG to your downloads: ${SAVED('calendar', 'png')}.`, timeoutMs: 10_000,
  }])
  expect(await peek($)).toMatchObject({ monthExporting: false, monthSaved: { file: SAVED('calendar', 'png'), page: 'month:now' } })
  expect((await stripOf(ui))?.exporter).toBe('idle')
  const line = await ui.find({ type: 'Text', text: /^Saved to/ })
  expect([line?.text, line?.props.dimColor]).toEqual([`Saved to ${SAVED('calendar', 'png')}`, true])
  // the console, the line under it, then the drawing, which an export never reloads
  const root = (await ui.findAll({ type: 'Box' }))[0]
  expect(root?.children.map(c => (c as { type?: string }).type)).toEqual(['Box', 'Text', 'Svg'])
  expect(await sourceOf(ui)).toBe(source)

  // a page of the past names no file until one of its own is saved: its facts as read, its page asked for
  w.delay.month = 0
  await ui.press({ key: 'period-older' })
  await w.clock.settle()
  expect(await ui.find({ type: 'Text', text: /^Saved to/ })).toBeUndefined()
  for (const key of ['month-export', 'export-stats', 'export-csv']) {
    await ui.press({ key })
    await w.clock.settle()
  }
  const last = monthExports(w).at(-1)!
  expect(last.argv.slice(2)).toEqual(['month', '--back', '1', '--export', 'stats', '--as', 'csv', '--open', '--stdin'])
  expect(JSON.parse(String(last.stdin))).toEqual(pastFacts('month', 1))
  expect(w.toasts.at(-1)?.text).toBe(`The stats of September 2026 are saved as a CSV, shown in its folder: ${SAVED('stats', 'csv', 'month-2026-09')}.`)
  expect((await peek($)).monthSaved).toEqual({ file: SAVED('stats', 'csv', 'month-2026-09'), page: 'month:2026-09-01' })
  expect((await ui.find({ type: 'Text', text: /^Saved to/ }))?.text).toBe(`Saved to ${SAVED('stats', 'csv', 'month-2026-09')}`)
  // the whole month as an SVG, and the stats as a page, say so too
  for (const [part, as, said] of [
    ['whole', 'svg', `The drawing of September 2026 is saved as an SVG, shown in its folder: ${SAVED('whole', 'svg', 'month-2026-09')}.`],
    ['stats', 'html', `The stats of September 2026 are saved and opening in your browser: ${SAVED('stats', 'html', 'month-2026-09')}.`],
  ] as const) {
    for (const key of ['month-export', `export-${part}`, `export-${as}`]) {
      await ui.press({ key })
      await w.clock.settle()
    }
    expect(w.toasts.at(-1)?.text).toBe(said)
  }
  expect(played(w, /\/page\.mp3$/)).toHaveLength(turns + 1) // the page turned; the Export key and its row make no sound
  await ui.unmount()
})

test('the Month\'s export posts are input, never facts: the strip\'s Export key and the row\'s keys, only on the Month and never while one runs; a tab switch closes the row', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  for (const data of [{ unit: 'week', act: 'export' }, { unit: 'month', act: 'nope' }, { act: 'export' }, 'export', null] as JsonValue[]) await ui.post(data, { in: 'period' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe(null)

  // a click on the strip's Export key, as the module reads it from its cell: the row opens, the strip lit at once
  await ui.resize({ columns: 100, rows: 2, in: 'period' })
  const x = cellOf((await stripOf(ui))!, 'export', 100)
  await ui.pointer({ type: 'down', x, y: 0, button: 'left', in: 'period' })
  expect((await ui.find({ type: 'Svg', in: 'period' }))?.props.source).toBe(renderPeriod({ ...(await stripOf(ui))!, pressed: 'export' }).source)
  await ui.pointer({ type: 'up', x, y: 1, button: 'left', in: 'period' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('what')
  expect(await stripOf(ui)).toMatchObject({ exporter: 'open', hangs: true })
  expect(w.runs.filter(r => r.argv.includes('--back'))).toEqual([]) // no page turned

  // the row's junk turns nothing; a part asks how, its keys handed at once
  for (const data of [{ row: 'export', id: 'png' }, { row: 'export', id: 'banana' }, { row: 'tabs', id: 'calendar' }, { id: 'calendar' }, { row: 'export', id: 3 }] as JsonValue[]) {
    await ui.post(data, { in: 'export' })
  }
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('what')
  await ui.post({ row: 'export', id: 'directory' }, { in: 'export' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('directory')
  expect(await menuOf(ui, 'export')).toMatchObject({ prompt: 'Directory as' })
  await ui.post({ row: 'export', id: 'json' }, { in: 'export' }) // not a drawing's format
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('directory')
  expect(monthExports(w)).toEqual([])

  // the key again closes it; open again, a tab switch closes it, and no other tab has the key
  await ui.post({ unit: 'month', act: 'export' }, { in: 'period' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe(null)
  expect((await stripOf(ui))?.exporter).toBe('idle')
  await ui.post({ unit: 'month', act: 'export' }, { in: 'period' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe('what')
  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe(null)
  expect(await ui.find({ key: 'month-export' })).toBeUndefined()
  expect((await stripOf(ui))?.exporter).toBeUndefined()
  await ui.post({ unit: 'week', act: 'export' }, { in: 'period' })
  await w.clock.settle()
  expect((await peek($)).monthAsk).toBe(null)

  // back on the Month: the directory as a GIF, by clicks on the row
  await ui.press({ key: 'tab-month' })
  await w.clock.settle()
  await ui.post({ unit: 'month', act: 'export' }, { in: 'period' })
  await w.clock.settle()
  await ui.post({ row: 'export', id: 'directory' }, { in: 'export' })
  await w.clock.settle()
  await ui.post({ row: 'export', id: 'gif' }, { in: 'export' })
  await w.clock.settle()
  expect(monthExports(w).map(r => r.argv.slice(2))).toEqual([['month', '--export', 'directory', '--as', 'gif', '--open', '--stdin']])
  expect(w.toasts.at(-1)?.text).toBe(
    `The building directory of last month and this one is opening in your browser, which saves it as a GIF to your downloads: ${SAVED('directory', 'gif')}.`,
  )
  expect(await ui.find({ key: 'export' })).toBeUndefined()
  await ui.unmount()
})

test('off the desktop the Month\'s Export is a Button after the strip\'s, and the row it opens Buttons that say what they ask: a terminal, VS Code and mobile', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const textOf = async (ui: Finder) => (await ui.find({ key: 'export-ask' }))?.text
  for (const surface of ['terminal', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount(pane(surface, 100))
    expect(await ui.find({ key: 'period' })).toBeUndefined()
    expect(await ui.find({ key: 'export' })).toBeUndefined()
    // the strip's Buttons, then Export, in one row
    const row = (await ui.findAll({ type: 'Button' })).filter(b => /^(period-|month-export)/.test(String(b.key)))
    expect(row.map(b => [b.key, b.props.hotkey, b.text])).toEqual([...STEP_ROW.map(r => [...r]), ['month-export', 'e', '⤓ Export']])
    await ui.press({ key: 'month-export' })
    await w.clock.settle()
    expect(await textOf(ui)).toBe('Export:')
    expect((await answersOf(ui)).map(a => a[0])).toEqual(['export-calendar', 'export-directory', 'export-whole', 'export-stats'])
    await ui.press({ key: 'export-whole' })
    await w.clock.settle()
    expect(await textOf(ui)).toBe('Month as:')
    await ui.press({ key: 'export-svg' })
    await w.clock.settle()
    expect(await textOf(ui)).toBeUndefined()
    expect(w.toasts.at(-1)?.text).toBe(`The drawing of last month and this one is saved as an SVG, shown in its folder: ${SAVED('whole', 'svg')}.`)
    // off the terminal the file is named under the strip, as the Timelapse's page is under its row
    expect((await ui.find({ type: 'Text', text: /^Saved to/ }))?.text).toBe(surface === 'terminal' ? undefined : `Saved to ${SAVED('whole', 'svg')}`)
    await ui.unmount()
  }
  expect(monthExports(w)).toHaveLength(3)
})

test('a Month export that fails says why in a toast, in a few words, and names no file; with no facts on screen yet it reads the page itself', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('month'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  const exportAs = async (part: string, as: string) => {
    for (const key of ['month-export', `export-${part}`, `export-${as}`]) {
      await ui.press({ key })
      await w.clock.settle()
    }
  }
  const cases: [Answer, RegExp][] = [
    [{ exitCode: 2, stdout: '' }, /^The wall calendar could not be exported: the export exited with code 2\.$/],
    [{ exitCode: 0, stdout: 'saved it somewhere\n' }, /^The wall calendar could not be exported: the export named no file\.$/],
    [{ exitCode: 0, stdout: 'pixel/month-2026-09-calendar.html\n' }, /^The wall calendar could not be exported: the export named no file\.$/], // not absolute
    [{ exitCode: 0, stdout: `${SAVED('calendar', 'png').replace(/\.html$/, '.png')}\n` }, /^The wall calendar could not be exported: the export named no file\.$/],
    [{ error: 'spawn node ENOENT' }, /^The wall calendar could not be exported: the export did not run \(.+\)\.$/],
  ]
  for (const [answer, said] of cases) {
    w.monthExported = answer
    await exportAs('calendar', 'png')
    expect(w.toasts.at(-1)?.text).toMatch(said)
  }
  expect(w.toasts).toHaveLength(cases.length)
  expect(monthExports(w)).toHaveLength(cases.length)
  expect(await peek($)).toMatchObject({ monthSaved: null, monthExporting: false, monthAsk: null })
  expect(await ui.find({ type: 'Text', text: /^Saved to/ })).toBeUndefined()
  expect((await ui.find({ key: 'month-export' }))?.text).toBe('⤓ Export')
  await ui.unmount()

  // a page whose facts are not read yet (its run failing): the export reads it itself, no stdin
  w.monthExported = undefined
  w.pasts.set('month 2', { exitCode: 1 })
  const again = await $.ui.mount(pane('desktop', 100))
  for (const key of ['period-older', 'period-older']) {
    await again.press({ key })
    await w.clock.settle()
  }
  for (const key of ['month-export', 'export-stats', 'export-json']) {
    await again.press({ key })
    await w.clock.settle()
  }
  const last = monthExports(w).at(-1)!
  expect([last.argv.slice(2), last.stdin]).toEqual([['month', '--back', '2', '--export', 'stats', '--as', 'json', '--open'], undefined])
  expect(w.toasts.at(-1)?.text).toBe(`The stats of August 2026 are saved as JSON, shown in its folder: ${SAVED('stats', 'json', 'month-2026-08')}.`)
  await again.unmount()
})

test('a timelapse run that fails says why and which press tries again, keeps the last facts, and is never run again by itself', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  w.lapses.week = { exitCode: 4, stdout: '' }
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))

  await ui.press({ key: 'tab-timelapse' })
  await w.clock.settle()
  expect((await ui.find({ type: 'Text', text: /could not replay/ }))?.text)
    .toBe('The Office could not replay this week yet: the collector exited with code 4. Press Week to try again.')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(11) // the tabs, the Zoom and its row stay, hidden behind the pixel menu
  expect((await peek($)).lapseTrouble).toBe('the collector exited with code 4')
  expect(w.logs.some(l => l.startsWith('theoffice: the week timelapse failed'))).toBe(true)
  expect((await peek($)).trouble).toBe(null) // the week's facts are fine

  // not the heartbeat, not a look: nothing runs it again by itself; back on screen with nothing to draw, it runs
  await w.clock.advance(180_000)
  expect(lapseRuns(w)).toHaveLength(1)
  w.isShown = false
  await w.clock.advance(5_000)
  w.isShown = true
  await w.clock.advance(6_000)
  expect(lapseRuns(w)).toHaveLength(2)
  expect(lapseRuns(w)[1]?.timeoutMs).toBe(600_000) // still nothing kept

  // an answer with no timeline is no replay either
  w.lapses.week = { exitCode: 0, stdout: STDOUT }
  await ui.press({ key: 'lapse-week' })
  await w.clock.settle()
  expect((await ui.find({ type: 'Text', text: /could not replay/ }))?.text).toContain('the collector answer has no timeline of this week')

  // one that works is drawn; a failure after it keeps it on screen (the reason is kept, not drawn)
  w.lapses.week = { exitCode: 0, stdout: JSON.stringify(LAPSE.week) }
  await ui.press({ key: 'lapse-week' })
  await w.clock.settle()
  const source = await sourceOf(ui)
  expect(source).toContain('data-timelapse="week"')
  expect(await ui.find({ type: 'Text', text: /could not replay/ })).toBeUndefined()
  expect((await peek($)).lapseTrouble).toBe(null)
  w.lapses.week = { exitCode: 5, stdout: '' }
  await ui.press({ key: 'lapse-week' })
  await w.clock.settle()
  expect(await sourceOf(ui)).toBe(source)
  expect((await peek($)).lapseTrouble).toBe('the collector exited with code 5')
  expect(await ui.find({ type: 'Text', text: /could not replay/ })).toBeUndefined()

  // its facts kept, the pane back on screen runs nothing
  const runs = lapseRuns(w).length
  w.isShown = false
  await w.clock.advance(5_000)
  w.isShown = true
  await w.clock.advance(6_000)
  expect(lapseRuns(w)).toHaveLength(runs)
  await ui.unmount()
})

// ---------------------------------------------------------------- sound

const FLIP = 'sounds/page.mp3'
/** The clips played whose asset matches `re`, in order. */
const played = (w: { plays: Play[] }, re: RegExp) => w.plays.filter(p => re.test(p.asset))

test('a tab, a range of the Timelapse or a page of the past pressed turns a page, always; nothing else in the pane makes a sound', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  // the floor changes, a hand goes up, minutes go by: silence
  w.answer = { exitCode: 0, stdout: JSON.stringify(withDesk(SAMPLE, 'c41d7a06', { state: 'asking' })) }
  await w.clock.advance(180_000)
  expect(w.plays).toEqual([])

  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'tab-week' })
  await w.clock.settle()
  expect(w.plays.map(p => [p.asset, p.loop, p.gain])).toEqual([[FLIP, false, 0.3]])
  // a range of the Timelapse turns a page
  await ui.press({ key: 'tab-timelapse' })
  await w.clock.advance(1_000)
  await ui.press({ key: 'lapse-month' })
  await w.clock.advance(1_000)
  expect(w.plays.map(p => p.asset)).toEqual([FLIP, FLIP, FLIP])
  // and so does a page of the past, from the strip or its Buttons
  await ui.press({ key: 'tab-week' })
  await w.clock.advance(1_000)
  await ui.post({ unit: 'week', back: 2 }, { in: 'period' })
  await w.clock.advance(1_000)
  await ui.press({ key: 'period-now' })
  await w.clock.advance(1_000)
  expect(w.plays).toHaveLength(6)
  // no switch turns it off
  expect(await ui.find({ key: 'sound' })).toBeUndefined()
  expect(await ui.find({ key: 'music' })).toBeUndefined()
  await ui.unmount()
})

test('a quick run of presses turns two pages at once at most', WITH_PEEK, async ($, on) => {
  const w = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run(command('open'))
  await w.clock.settle()
  const ui = await $.ui.mount(pane('desktop', 100))
  for (const key of ['tab-week', 'tab-work', 'tab-all', 'tab-week']) await ui.press({ key })
  await w.clock.settle()
  expect(w.plays).toHaveLength(2) // two still turning: the next two presses make none
  await w.clock.advance(500)
  await ui.press({ key: 'tab-work' })
  await w.clock.settle()
  expect(w.plays).toHaveLength(3)
  await ui.unmount()
})

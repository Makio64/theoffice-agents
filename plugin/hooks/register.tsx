// The Office as a desktop-app mod (Claude Code function hooks): a status line that always says who is at work, and a
// live pane beside the chat that the person opens with /theoffice, or with the Open The Office Button the band above
// the prompt holds while the pane is not on screen: the pixel-art office of their agents, every one a Clawd. A row of
// tabs picks what the pane draws: Live (the live building: who is at a desk right now, floor by floor, and what they
// did this week in its basement), Today, Week,
// Month and What they did, each with the commits line running under its street, and Timelapse, which replays
// yesterday, this week or this month slot by slot on a loop (a row of its own under the tabs picks the range and exports
// it as a page to save as a GIF, a video or an SVG). The desktop app, VS Code and mobile draw the animated SVG of the
// tab as a card; a terminal, which cannot draw an SVG, draws the full text version of the same tab.
// The facts come from the same Node collector the skill uses (scripts/office.mjs, run through $.process.run): this
// module has no Node and no DOM, so it only renders. Live, Week and What they did draw the week's facts (`all`);
// Today and Month need facts of their own range (today's hours, last month and this one), fetched only while their tab
// is on screen.
// On a machine whose collector never answered, the week's first read takes ten seconds and more: a first light comes
// before it (`--first-light`, the live floor alone in about a second), which the Live tab draws while the week is read.
// Today, Week, Month and What they did page through the past with no end to it, one strip under the tabs (◀ older,
// ▶ newer, Now): Today by days, Week and What they did by Monday-to-Sunday weeks (one page for both), Month by
// calendar months, January 2026 a page of its own (lib/period.mjs). The Month's strip ends in an Export key, which opens
// a row under it that asks what to export (the wall calendar, the building directory, the whole month, its stats), then
// how (a PNG, an SVG, a GIF or a video; the stats as a page, CSV or JSON), and the collector saves the page on screen so
// (`month --export`). On the desktop the strip is pixel art, a surface
// module of its own (hooks/period.tsx, a `Client`) that posts the page a click asks for; a terminal, VS Code, mobile
// and a strip that failed draw the same three as Buttons around the page's name. A page of the past is
// the collector's `<today|week|month> --back N`, read when a press or its tab coming on screen asks for it, one at a
// time with the engine's longest wait (a month far back reads every transcript of it), the newest press winning; its
// days are over, so nothing runs it again, the last few read are kept for a press back to them, and another run's
// answer of the last hour will do (PAST_AGE_MS). While one is read the drawing on screen stays, and the strip's LED
// blinks.
// The Timelapse draws the collector's `timelapse <range>` answer, fetched only when the person asks for it (a press, the
// pane opening on it with nothing to draw), never by the watcher or the heartbeat: a new source restarts its replay.
//
// It updates itself when something changes, and only then: while the pane is open a cheap watcher ($.fs stats, no
// process) looks at the session records, the transcripts and the running workflows of the live sessions, and the session
// files of the other agents at desks (Codex, Gemini, Cursor, Kimi, Grok: the facts name them) (every 1.5 s while the
// pane is on screen), runs the collector the moment a session or a meeting moved, as soon as NOISE_GAP_MS allows when
// only transcripts grew, and a heartbeat runs it once a minute anyway (commits, visitors).
// Every session of the machine holds this module and asks for the same facts, so they share them: the collector leaves
// its answer in a file (facts.sources.shared), a session takes it from there with a stat and a read when it is recent
// enough for what the session draws (allowedAge), and only then runs a process, which itself waits for a run under way
// rather than start another (scripts/office.mjs sharedRun). A pane off screen, closed or behind another tab, draws
// nothing but the status line: it watches nothing, and takes whatever is at most a minute old, or 10 s after a prompt or
// a turn of this session. A new SVG
// source reloads the pane's sandboxed frame (a blink that restarts every animation), so new facts are only drawn when
// the drawing they make differs from the one on screen: its clocks run by themselves, its durations and running totals
// move in coarse steps (lib/svg.mjs `liveClock`), and what changes with every tool call (what a busy desk is doing, its
// tool and file; the counts and shares of what they did) is redrawn at most once a minute (ACTIVITY_MS). So an office where nothing happens is redrawn when the hour
// turns or a desk's time crosses a step (10 minutes, 1, 3 or 12 hours, a day); one where agents work about once a
// minute, and at once when a desk arrives, leaves, raises its hand, finishes its turn, goes on a break or a meeting moves on.
//
// Engine rules this file keeps (measured on 2.1.308): `$` and `on` are spelled literally and `$` is only handed to
// functions declared at the top of this file; Text holds no ANSI, so colors travel as props; a render hook never
// writes $.state (a tab press writes it, from the Button's onPress; a drawing may set plain variables);
// Button children are strings only, each Button has its own key; the pane opens only from the person's command or
// press, never from a timer or a load; ~/.claude is only listed, stat'ed and read (never a sessions/*.key file), the
// other agents' session files only stat'ed.
//
// Sound: a press of a tab, a range of the Timelapse or a page of the past turns a page (sounds/page.mp3, made with
// ElevenLabs), always; the pane makes no other sound.
import { atom, read, update } from 'claude-code'
import type {
  BoxProps, ButtonProps, ElementConstructor, EngineInterface, FsEntry, Register, RenderElement, RenderInput, RenderNode,
  TextProps, Timer, UiOpenResult, UiPane,
} from 'claude-code'

import type { OfficeBacks, OfficeFacts, OfficeFrameLink, OfficeMonthFormat, OfficeMonthPart, OfficeProgress, OfficeTab, OfficeTimeline, OfficeUnit } from '../types'
import type { Line, View } from '../lib/ascii.mjs'
import type { MenuArt, MenuKey } from '../lib/svg-menu.mjs'
import { ROLE_TERM, renderOffice, renderStatus } from '../lib/ascii.mjs'
import { renderTimelapseText, timelapseFrames } from '../lib/ascii-timelapse.mjs'
import { pageDays, pageName } from '../lib/period.mjs'
import { onBeat, renderLoading, renderSvg, renderTimelapse } from '../lib/svg.mjs'
import { frameState, frameText, renderFrameCard } from '../lib/svg-frame.mjs'

// ---------------------------------------------------------------- constants

const PANE = 'office'
const TITLE = 'The Office'
const BEAT_MS = 60_000 // a collector run whatever the watcher saw: commits, visitors, anything not in a transcript
const WATCH_SHOWN_MS = 1_500 // the pane on screen: a change is drawn within this
const WATCH_HIDDEN_MS = 6_000 // the pane behind another tab: how soon it is seen coming back
const WATCH_CLOSED_MS = 30_000 // closed: only the status line reads the facts
const POKE_MS = 300 // a prompt sent or a turn ended here: look this soon after, once the transcript has the line
const CLOSED_AGE_MS = 60_000 // how old the facts may be when only the status line reads them...
const CLOSED_CHANGE_MS = 10_000 // ...and right after a prompt or a turn of this session
const OPEN_AGE_MS = 15_000 // the week's drawing on screen, for a heartbeat: a run a moment ago knows the commits and the visitors too
// On screen, a transcript that only grew runs the collector no sooner than this after the last facts: a busy desk's tool
// and file are redrawn once a minute at most (ACTIVITY_MS), so a run per tool call would only be thrown away. The rest
// that moves on the floor (a desk's status, an intern, a meeting) runs it at once, a hand going up with it: the engine
// writes `waiting` in the session's record for every question and prompt.
const NOISE_GAP_MS = 15_000
// The other agents have no record: their session files are all there is to see of them, a hand going up included.
const OTHERS_GAP_MS = 5_000
// The pane came back on screen after longer than this behind another tab: a surface that drew it afresh restarted its
// clocks from the source's moment, so a drawing put on screen longer ago than this is drawn again, its clocks phased
// from now. A shorter look away keeps the frame as it is (what a surface does with a hidden frame is not documented).
const REANCHOR_MS = 60_000
// A busy desk's tool and file (its slab line, its tooltip, its pose) change with every tool call: on screen they are
// redrawn at most this often, so watching agents work reloads the frame about once a minute, not on every call (a
// busy hour here had 931). Anything else that moves on the floor is drawn at once.
const ACTIVITY_MS = 60_000
// After a change, Today and Month run again no sooner than this after their last run started (a month run takes ~1.7 s
// of CPU, and working agents change something every few seconds): a change inside the gap runs once at its end. A page
// of the past never runs again by itself: its days are over.
const RANGE_GAP_MS: Record<NowRange, number> = { today: 10_000, month: 30_000 }
const FRAME_MS = 700 // text animation: the block-glyph floor wherever text is drawn (the SVG animates itself)
const RUN_TIMEOUT_MS = 20_000
// No snapshot yet: the collector may be building its cache from every transcript (a cold month took 30 s here), and
// a killed run saves nothing, so the first run gets the engine's longest wait instead of being killed every beat.
const FIRST_RUN_TIMEOUT_MS = 600_000
const MAX_SKIP = 15 // heartbeats skipped at most after repeated failures with no snapshot (15 min)
const STATUS_WIDTH = 80
const DOCK_COLUMNS = 100 // asked, not granted: the dock gives at most 45% of the terminal
const STORE_TAB = 'tab' // $.store key: the person's tab outlives the session
const STORE_LAPSE = 'lapse' // $.store key: the range the Timelapse tab replays, kept like the tab
const STORE_QUIET = 'quiet' // $.store key: the Live tab drawn quiet (its Quiet key), kept like the tab
const STORE_SHARED = 'shared' // $.store key: where the collector leaves its answer, known before a session's first run
const EXPORT_HOTKEY = 'e'
const EXPORT = 'export' // the Export key's id in the pixel menu
const QUIET = 'quiet' // the Live tab's Quiet key: its id in the pixel menu
const QUIET_HOTKEY = 'q'
const STORE_ZOOM = 'zoom' // $.store key: the drawings drawn bigger (the Zoom key), kept like the tab
const ZOOM = 'zoom' // the Zoom key: its id in the pixel menu
const ZOOM_HOTKEY = 'z'
// CSS px per art pixel while zoomed (lib/svg.mjs `scale`; 2 otherwise): the art and its words a quarter bigger, fewer
// desks to a row, the building taller
const ZOOM_SCALE = 2.5
const PAGE_TURN = 'sounds/page.mp3' // a press of a tab, a range or a page of the past: the pane's only sound
const PAGE_GAIN = 0.3
// An export collects its range afresh (a cold month takes a while), then writes the page and the SVG and opens the page.
const EXPORT_TIMEOUT_MS = 120_000
const SAVED_TOAST_MS = 10_000 // a toast that names a file stays long enough to read the path
// The page an export names on its first line: an absolute path (POSIX, or a Windows drive) to an .html file.
const PAGE_RE = /^(?:\/|[A-Za-z]:[\\/])[^\x00-\x1f\x7f]{1,1000}\.html$/
// The file a Month export names on its first line: an absolute path to the page, the SVG, the CSV or the JSON it saved.
const FILE_RE = /^(?:\/|[A-Za-z]:[\\/])[^\x00-\x1f\x7f]{1,1000}\.(?:html|svg|csv|json)$/
const USAGE = "Usage: /theoffice [live|today|week|month|work|timelapse] [open|close|browser|frame [on|off|new]]. With no word it opens or closes The Office; a tab's name opens it on that tab; browser opens it in your browser, in pixel art (in a terminal it always opens there); frame shows The Office on a screen of its own, a tablet or a picture frame on your network (on turns it on, off turns it off, new replaces its link)."
// The browser's office (scripts/dashboard.mjs): one local server for the machine (`--reuse`), opened on the pane's tab.
// Its first line is the page's address, a capability URL on this computer only.
const BROWSER_WORD = 'browser'
const BROWSER_HOTKEY = 'o'
const BROWSER_TIMEOUT_MS = 20_000
const BROWSER_URL_RE = /^http:\/\/127\.0\.0\.1:\d{1,5}\/\?token=[\w-]{32}(?:&[\w=&-]*)?$/
// The Frame key: The Office on a screen of its own, a tablet on a stand, a picture frame, a spare monitor
// (scripts/dashboard.mjs --frame): a server that answers on the person's network at one link that only looks. Nothing
// starts it but the person: the key opens a panel that says what it is and where it stands (`--status`), and Turn on,
// in its row, starts it. The launcher answers in one line of JSON, checked before anything of it is drawn or said.
const FRAME_KEY = 'frame' // its id in the pixel menu, its Button's key, and the word /theoffice takes
const FRAME_HOTKEY = 'f'
const FRAME_TIMEOUT_MS = 20_000
// An address a screen opens the frame at: this computer's address on the network or its Bonjour name, never a domain
const FRAME_URL_RE = /^http:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.local):\d{1,5}\/frame\?token=[\w-]{32}$/
const FRAME_LOCAL_RE = /^http:\/\/127\.0\.0\.1:\d{1,5}\/frame\?token=[\w-]{32}$/
// A live session's record (~/.claude/sessions/<pid>.json); the <pid>.<hash>.key files beside them are never touched.
const SESSION_RE = /^\d+\.json$/
const SESSION_ID_RE = /^[A-Za-z0-9-]{1,80}$/
const RUN_ID_RE = /^wf_[A-Za-z0-9-]{1,80}$/ // a workflow run's folder under <session>/subagents/workflows
const SHARED_RE = /^(?:\/|[A-Za-z]:[\\/])[^\x00-\x1f\x7f]{1,1000}[\\/]shared[\\/]all\.json$/ // facts.sources.shared
const WIN_ABS_RE = /^[A-Za-z]:[\\/]/ // a Windows path from its drive: %USERPROFILE%, a session's cwd
const UP_RE = /[\\/]\.\.(?:[\\/]|$)/ // a `..` step, with either separator
const MAX_RUNS = 6 // a session's running workflows the watcher looks into, the newest
const STRIP = 'period' // the strip's Client key, which its posts name
// The pixel menu's Client keys (hooks/menu.tsx), which its posts name: the tabs, and the Timelapse's ranges
const MENU_TABS = 'tabs'
const MENU_LAPSE = 'lapse'
const MENU_EXPORT = 'export' // and the Month's export row, under its strip
const MENU_FRAME = 'frame-row' // and the Frame's row, under the tabs while its panel is on screen
const MAX_PAGES = 6 // pages of the past kept for a press back to them, the last read
// A progress file older than this belongs to a run that stopped: it says nothing any more
const PROGRESS_STALE_MS = 10_000
// A page of the past another run read this recently is taken as it is (the collector's shared answer): its days are
// over, only its sky, its clock and its lamps of who is at a desk now are that old. A pane opened again, or another
// session, then turns to it at once; a month far back may take a minute to read again.
const PAST_AGE_MS = 3_600_000
// the furthest page a press may turn to: a hundred years back
const MAX_BACK: Record<OfficeUnit, number> = { day: 36_600, week: 5_220, month: 1_200 }

/**
 * One tab of the pane: the view it draws, its label (and a shorter one for a narrow menu), its icon as a Button shows it
 * and as the pixel menu draws it (`art`), its hotkey, and the line under the drawing that says what it is.
 */
type TabSpec = { view: OfficeTab; label: string; short: string; icon: string; art: MenuArt; hotkey: string; alt: string }

/** The pane's tabs, in order. `all` is the Live tab (the live building); its pick is the default. */
const TABS: readonly TabSpec[] = [
  {
    view: 'all', icon: '◉', label: 'Live', short: 'Live', art: 'live', hotkey: '1',
    alt: "the live office of your coding agents in pixel art, floor by floor, one room per project, every desk and what it is doing, what they did this week in the basement, and today's commits on a train under it",
  },
  {
    view: 'today', icon: '◷', label: 'Today', short: 'Today', art: 'today', hotkey: '2',
    alt: 'today in pixel art, the time clock and the timesheets',
  },
  {
    view: 'week', icon: '▥', label: 'Week', short: 'Week', art: 'week', hotkey: '3',
    alt: 'this week in pixel art, the office tower',
  },
  {
    view: 'month', icon: '▤', label: 'Month', short: 'Month', art: 'month', hotkey: '4',
    alt: 'this month in pixel art, the wall calendar and the building directory',
  },
  {
    view: 'work', icon: '▨', label: 'What they did', short: 'Work', art: 'work', hotkey: '5',
    alt: 'what they did in pixel art, one room per kind of work',
  },
  {
    view: 'timelapse', icon: '▶', label: 'Timelapse', short: 'Lapse', art: 'timelapse', hotkey: '6',
    alt: 'a timelapse of yesterday, this week or this month in pixel art, every desk coming and going slot by slot, on a loop',
  },
]

/** The words /theoffice takes for a tab: each tab's view, `live` and `office` for the Live tab, `lapse` for the Timelapse. */
const TAB_WORDS: ReadonlyMap<string, OfficeTab> = new Map([
  ...TABS.map(t => [t.view, t.view] as const), ['office', 'all'], ['live', 'all'], ['lapse', 'timelapse'],
])

/** The tabs the runs keep fresh, every one but the Timelapse: the drawings they compare before a write are theirs. */
type FreshTab = Exclude<OfficeTab, 'timelapse'>
/** What h() hands back, as the pane's pieces hold it: a drawn node, or nothing where a row is not drawn. */
type Drawn = RenderNode | null | undefined
/**
 * The tabs drawn from facts of their own range: the collector's `today` and `month` answers, and `past`, the page of
 * the past a tab shows (`<view> --back N`).
 */
type Range = NowRange | 'past'
/** The ranges that run as they go: today's hours, and last month and this one so far. */
type NowRange = 'today' | 'month'
/** Where a tab's facts come from: the week's (`all`) or a range of its own. */
type Source = 'all' | Range
/** What the collector is asked for each range of now (then `--json`). */
const RANGE_ARGS: Record<NowRange, readonly string[]> = { today: ['today'], month: ['month'] }

/** How each tab pages through the past (Live and the Timelapse do not): Week and What they did share their page. */
const UNIT_OF: Partial<Record<OfficeTab, OfficeUnit>> = { today: 'day', week: 'week', month: 'month', work: 'week' }
/** The collector's view for a page of each unit (then `--back N --json`). */
const UNIT_VIEW: Record<OfficeUnit, string> = { day: 'today', week: 'week', month: 'month' }
/** What a tab shows of a page of the past, after its name, for a reader that cannot see it. */
const PAST_ALT: Partial<Record<OfficeTab, string>> = {
  today: 'the time clock and the timesheets', week: 'the office tower', month: 'the wall calendar and the building directory',
  work: 'what they did, one room per kind of work',
}

/** One key of the strip as a Button (its text row, and the desktop's hidden hotkeys): its key, label and hotkey letter. */
type StepSpec = { key: string; label: string; hotkey: string; to: (back: number) => number }

/** The strip's keys as Buttons, around the page's name: older, newer, and back to the range as it runs now. */
const STEPS: readonly StepSpec[] = [
  { key: 'period-older', label: '◀', hotkey: 'p', to: back => back + 1 },
  { key: 'period-newer', label: '▶', hotkey: 'n', to: back => Math.max(0, back - 1) },
  { key: 'period-now', label: 'Now', hotkey: 'c', to: () => 0 },
]

/** A range the Timelapse tab replays: yesterday by the quarter hour, the last 7 days by the hour, the last 30 by 4 hours. */
type Lapse = OfficeTimeline['kind']
/** One range of the Timelapse tab: its Button's label (and a shorter one), its pixel icon, hotkey letter, and how a line names it. */
type LapseSpec = { lapse: Lapse; label: string; short: string; art: MenuArt; hotkey: string; words: string }

/** The Timelapse tab's ranges, in order (lib/model.mjs LAPSE_WORDS names them the same way). */
const LAPSES: readonly LapseSpec[] = [
  { lapse: 'yesterday', label: 'Yesterday', short: 'Yesterday', art: 'yesterday', hotkey: 'y', words: 'yesterday' },
  { lapse: 'week', label: 'Week', short: 'Week', art: 'week', hotkey: 'w', words: 'this week' },
  { lapse: 'month', label: 'Month', short: 'Month', art: 'month', hotkey: 'm', words: 'this month' },
]

/** One thing the Month's export keeps: its key's id, words and pixel icon, its hotkey letter, how a sentence names it. */
type PartSpec = { part: OfficeMonthPart; label: string; short: string; art: MenuArt; hotkey: string; words: string }

/** What the Month's export row asks first, in order. */
const PARTS: readonly PartSpec[] = [
  { part: 'calendar', label: 'Calendar', short: 'Calendar', art: 'calendar', hotkey: 'a', words: 'the wall calendar' },
  { part: 'directory', label: 'Directory', short: 'Directory', art: 'directory', hotkey: 'd', words: 'the building directory' },
  { part: 'whole', label: 'Whole month', short: 'Month', art: 'building', hotkey: 'm', words: 'the drawing' },
  { part: 'stats', label: 'Stats', short: 'Stats', art: 'stats', hotkey: 's', words: 'the stats' },
]

/** One way to keep it: its key's id, words and pixel icon, its hotkey letter, how a sentence names it. */
type FormatSpec = { format: OfficeMonthFormat; label: string; art: MenuArt; hotkey: string; words: string }

/** How the row then asks to keep a drawing (a room, or the whole month), in order. */
const DRAWING_FORMATS: readonly FormatSpec[] = [
  { format: 'png', label: 'PNG', art: 'png', hotkey: 'i', words: 'a PNG' },
  { format: 'svg', label: 'SVG', art: 'svg', hotkey: 's', words: 'an SVG' },
  { format: 'gif', label: 'GIF', art: 'gif', hotkey: 'g', words: 'a GIF' },
  { format: 'video', label: 'Video', art: 'video', hotkey: 'v', words: 'a video' },
]

/** ...and the stats. */
const STATS_FORMATS: readonly FormatSpec[] = [
  { format: 'html', label: 'Page', art: 'page', hotkey: 'h', words: 'a page' },
  { format: 'csv', label: 'CSV', art: 'csv', hotkey: 't', words: 'a CSV' },
  { format: 'json', label: 'JSON', art: 'json', hotkey: 'j', words: 'JSON' },
]

/** The formats a page in the browser makes: the collector opens it, and the browser saves the file to its downloads. */
const IN_BROWSER: ReadonlySet<OfficeMonthFormat> = new Set(['png', 'gif', 'video'])
const BACK = 'back' // the row's Back key: what to export, asked again
const BACK_HOTKEY = 'b'

/** The Month's export row: what it asks (what to export, or how to keep a part), null while it is closed. */
type MonthAsk = 'what' | OfficeMonthPart | null

/** What a key of the Frame's row has the launcher do: turn the frame on, turn it off, give it a new link. */
type FrameAct = 'start' | 'stop' | 'renew'
/** What the launcher is asked: a key of the row, or only where the frame stands. */
type FrameAsk = FrameAct | 'status'
/** One key of the Frame's row: its words (and what it says while it works), its pixel icon, its hotkey letter. */
type FrameSpec = { act: FrameAct; label: string; short: string; doing: string; art: MenuArt; hotkey: string }
const FRAME_ACTS: Record<FrameAct, FrameSpec> = {
  start: { act: 'start', label: 'Turn on', short: 'On', doing: 'Turning on', art: 'power', hotkey: 't' },
  stop: { act: 'stop', label: 'Turn off', short: 'Off', doing: 'Turning off', art: 'power', hotkey: 't' },
  renew: { act: 'renew', label: 'New link', short: 'New', doing: 'New link', art: 'renew', hotkey: 'n' },
}
/** What the launcher takes for each (after `--frame`, before `--json`): it never starts anything for `status`. */
const FRAME_ARGS: Record<FrameAsk, readonly string[]> = { status: ['--status'], start: ['--detach'], stop: ['--stop'], renew: ['--detach', '--new-link'] }
/** The words /theoffice frame takes after it. */
const FRAME_WORDS: ReadonlyMap<string, FrameAct> = new Map([['on', 'start'], ['off', 'stop'], ['stop', 'stop'], ['new', 'renew']])

// ---------------------------------------------------------------- state

// $.state survives a hot reload, module variables do not: what a drawing reads lives in $.state.
const snapshot = atom({ plugin: 'theoffice', key: 'snapshot' } as const, null)
const todayFacts = atom({ plugin: 'theoffice', key: 'today' } as const, null)
const monthFacts = atom({ plugin: 'theoffice', key: 'month' } as const, null)
const pastFacts = atom({ plugin: 'theoffice', key: 'past' } as const, null)
const pastReading = atom({ plugin: 'theoffice', key: 'pastReading' } as const, false)
const backs = atom({ plugin: 'theoffice', key: 'backs' } as const, { day: 0, week: 0, month: 0 })
const tab = atom({ plugin: 'theoffice', key: 'tab' } as const, 'all')
const quiet = atom({ plugin: 'theoffice', key: 'quiet' } as const, false) // the Live tab drawn with its names alone
const zoom = atom({ plugin: 'theoffice', key: 'zoom' } as const, false) // every tab's drawing drawn bigger
const frame = atom({ plugin: 'theoffice', key: 'frame' } as const, 0)
const trouble = atom({ plugin: 'theoffice', key: 'trouble' } as const, null)
const rangeTrouble = atom({ plugin: 'theoffice', key: 'rangeTrouble' } as const, null)
const lapseFacts = atom({ plugin: 'theoffice', key: 'timelapse' } as const, null)
const lapse = atom({ plugin: 'theoffice', key: 'lapse' } as const, 'week')
const lapseTrouble = atom({ plugin: 'theoffice', key: 'lapseTrouble' } as const, null)
const lapseSaved = atom({ plugin: 'theoffice', key: 'lapseSaved' } as const, null)
const lapseExporting = atom({ plugin: 'theoffice', key: 'lapseExporting' } as const, false)
const monthAsk = atom({ plugin: 'theoffice', key: 'monthAsk' } as const, null)
const monthExporting = atom({ plugin: 'theoffice', key: 'monthExporting' } as const, false)
const monthSaved = atom({ plugin: 'theoffice', key: 'monthSaved' } as const, null)
const onScreen = atom({ plugin: 'theoffice', key: 'onScreen' } as const, false)
const framePanel = atom({ plugin: 'theoffice', key: 'framePanel' } as const, false) // the Frame key's panel in place of the tab's drawing
const frameLink = atom({ plugin: 'theoffice', key: 'frameLink' } as const, null) // where the frame stands, as its launcher last said
const frameBusy = atom({ plugin: 'theoffice', key: 'frameBusy' } as const, null) // what the launcher is asked right now
const progress = atom({ plugin: 'theoffice', key: 'progress' } as const, null)

let beat: Timer | undefined
let watcher: Timer | undefined
let poke: Timer | undefined
let anim: Timer | undefined
let picked: OfficeTab = 'all' // the tab the timers follow; the drawing reads the `tab` state value
let pickedBacks: OfficeBacks = { day: 0, week: 0, month: 0 } // the pages the runs follow; the drawing reads `backs`
let isPaneOpen = false
let isPaneShown = false // open, placed and not behind another tab: only then does the frame clock run
let markedUp: boolean | undefined // what the `onScreen` state value was last written as (markScreen)
let hasTerminal = false // a terminal draws text, which reads `frame`; elsewhere the pixel art animates itself
// The session began in a terminal (a console): The Office opens in the browser there, never as the text pane. A terminal
// attached to a session that began elsewhere (the desktop draws the pixel art) still draws the pane's text.
let isConsole = false
let lastStatus: string | undefined
let strikes = 0 // failed runs in a row while there is no snapshot
let skip = 0 // heartbeats left to sit out after those
const isRefreshing = { all: false, today: false, month: false }
// a change the watcher saw landed while that run was in flight: one more run right after it
const isDue = { all: false, today: false, month: false }
const lastKey = { all: '', today: '', month: '' }
const rangeStrikes = { today: 0, month: 0, past: 0 }
const rangeSkip = { today: 0, month: 0, past: 0 }
const rangeRunAt = { today: -Infinity, month: -Infinity } // when its last run started
const isRangeQueued = { today: false, month: false } // a run waits for the end of RANGE_GAP_MS
// The newest facts of each source, kept or not: the drawing draws these (the state may hold older facts that draw the
// same), so a tab switch or a redraw never shows facts older than the last run. Gone after a reload: the state's then.
// `past`: the page of the past on screen's, once read.
const latest: Record<Source, OfficeFacts | null> = { all: null, today: null, month: null, past: null }
let factsAt = -Infinity // when the run behind the week's facts here began, or the last one that failed
let sharedPath: string | undefined // where the collector leaves its answer (facts.sources.shared)
let isLit = false // this load has asked for its first light (firstLight): once at most
// No session of this machine had left an answer when this one started: its first week is read from every session
let isNewMachine = false
// Where the run after a first light leaves its answer, before it has (only the progress file beside it is read there)
let lightShared: string | undefined
// The waiting room's drawing, by what it reads, its width and the hour: the same string for the whole wait; and the hour
// each wait began in, kept to its end (the week's facts landing meanwhile may tell another)
const rooms = new Map<string, string>()
const roomNights = new Map<Wait, boolean>()
// Today's date as the collector's facts last said it (`now.local_date`): the calendar the pages of the past count on.
let dayNow: string | undefined
// The pages of the past read, the last MAX_PAGES, by unit and first day (`month:2026-08-01`), so a press back to one
// draws it at once; and the one being read now, one at a time. Gone with the pane.
const pages = new Map<string, OfficeFacts>()
let pastRun: string | null = null
// The props each surface's strip was last drawn with, which a click's answer hands it again with its next page.
const strips = new Map<string, StripProps>()
// Likewise for the pixel menu: the props each surface's rows were last drawn with
const menus = new Map<string, { tabs?: MenuProps; lapse?: MenuProps; export?: MenuProps; frame?: MenuProps }>()

let pickedLapse: Lapse = 'week' // the range the timelapse runs follow; the drawing reads the `lapse` state value
// Each range's newest timelapse facts, so a range picked again is drawn at once while its own run goes on. The state
// holds only the picked range's; gone after a reload: the state's then.
const lapseLatest: Record<Lapse, OfficeFacts | null> = { yesterday: null, week: null, month: null }
const isLapseRunning: Record<Lapse, boolean> = { yesterday: false, week: false, month: false }
let isExporting = false // one export at a time: a press while one runs is ignored
let isOpeningBrowser = false // one browser open at a time: a press while one runs is ignored
let isFrameAsked = false // one run of the frame's launcher at a time: a press while one runs is ignored
let savedLapse: Lapse | null = null // the range of the page in `lapseSaved`, when its name does not say (pageLapse)
let isMonthExporting = false // one Month export at a time: a press while one runs is ignored
// What each surface's timelapse drew last: the same facts at the same width hand the frame the same string without
// drawing it again. The runs never compare a timelapse (nothing refreshes it by itself), so it stays out of `drawings`.
const lapseDrawn = new Map<string, { facts: OfficeFacts; width: number; isZoomed: boolean; source: string }>()

/**
 * A pixel drawing on screen: the facts it drew, whether quiet (the Live tab's Quiet key) and zoomed (the Zoom key), its source, what that was
 * before it went on the beat (`plain`, which the runs compare), the same facts drawn calm (calmFacts: the busy desks'
 * activity and the tool-call counts left out, drawn only when a comparison first needs it: most drawings are replaced
 * without one, and a first one costs no more), the moment its clocks are phased from, and when it went on screen.
 * `compared`: the last facts held up against it, so a redraw of the same facts draws nothing.
 */
type PixelDrawing = {
  kind: 'pixel'; view: FreshTab; facts: OfficeFacts; width: number; isQuiet: boolean; isZoomed: boolean; source: string; plain: string; calm?: string
  clockAt: number | undefined
  at: number; compared?: { facts: OfficeFacts; isSame: boolean; isCalm?: boolean }
}
/** A text drawing on screen: the facts it drew at that width. */
type TextDrawing = { kind: 'text'; view: FreshTab; columns: number; facts: OfficeFacts }

// What each surface drew last (a desktop and a phone may draw the pane at once, each its own), set by the drawing
// (plain variables, never state) and read by the runs to tell whether new facts would draw anything else on any of
// them. Forgotten when the pane opens afresh.
const drawings = new Map<string, PixelDrawing | TextDrawing>()
// When the pane went behind another tab (the look that saw it), while it is there: the reanchor's measure.
let hiddenAt: Promise<number> | undefined

let turning = 0 // pages turning now: two at once at most
let isTurnTold = false // the debug log said once that a page turn did not play

// The watcher: $HOME once read, the signature it saw last, and per live session record its id and folder (read again
// only when the record's mtime moves).
let home: string | undefined
let seen: Look | undefined
let isWatching = false
let isWatchDue = false
const sessionRecords = new Map<string, { mtimeMs: number; sessionId: string | null; cwd: string | null }>()
// The session files of the other agents at desks (Codex, Gemini, Cursor, Kimi, Grok), as the last facts named them
// (sources.watch): the watcher stats them too, so their next tool call is drawn as soon as Claude's would be. A session
// of theirs that starts is seen by the heartbeat.
let agentFiles: string[] = []
const MAX_AGENT_FILES = 24
// per session folder: its workflow runs still going, listed again only when a folder they are read from moves
const sessionRuns = new Map<string, { key: string; runs: string[] }>()

/** What the watcher compares: what moves the floor (`state`), the transcripts, which only say an agent is at it, and the other agents' session files. */
type Look = { state: string; noise: string; others: string }

// ---------------------------------------------------------------- refresh

/**
 * One collector run with `args` (`all --json`, `today --json`, `month --json`, `timelapse <range> --json`): its facts,
 * or why there are none, in a few words (never collector output). With no facts kept yet the run gets the engine's
 * longest wait, since a cold cache builds first.
 */
async function collectFacts($: EngineInterface, args: readonly string[], isFirst: boolean): Promise<OfficeFacts | string> {
  try {
    const timeoutMs = isFirst ? FIRST_RUN_TIMEOUT_MS : RUN_TIMEOUT_MS
    const ran = await $.process.run(['node', `${$.plugin.root}/scripts/office.mjs`, ...args], { timeoutMs })
    if (ran.exitCode !== 0) return `the collector exited with code ${ran.exitCode}`
    if (ran.isStdoutTruncated) return 'the collector answer was cut short'
    let parsed: unknown
    try {
      parsed = JSON.parse(ran.stdout)
    } catch {
      return 'the collector answer is not JSON'
    }
    return isFacts(parsed) ? parsed : 'the collector answer is not theoffice/1 facts'
  } catch (error) {
    return `the collector did not run (${errorText(error)})`
  }
}

/** Whether a drawing of the week's facts is on screen: the Live, Week and What they did tabs. Else only the status line reads them. */
function isWeekShown(): boolean {
  return isPaneShown && picked !== 'timelapse' && rangeOf(picked) === null
}

/**
 * How old the week's facts may be for what this session draws now: on screen a change wants a run that begins after it,
 * on every tab, since a hand going up reaches the status line by the week's facts.
 */
function allowedAge(isChange: boolean): number {
  if (!isPaneShown) return isChange ? CLOSED_CHANGE_MS : CLOSED_AGE_MS
  if (isChange) return 0
  return isWeekShown() ? OPEN_AGE_MS : CLOSED_AGE_MS
}

/**
 * The facts another session's run left, begun at `since` or later and newer than the ones here, for a stat and a read,
 * or null when a run must answer. The file's mtime is when its run began.
 */
async function sharedFacts($: EngineInterface, since: number): Promise<OfficeFacts | null> {
  if (!sharedPath) return null
  try {
    const at = Math.round((await $.fs.stat(sharedPath)).mtimeMs)
    if (at < since || at <= factsAt) return null
    const parsed: unknown = JSON.parse(await $.fs.read(sharedPath))
    if (!isFacts(parsed)) return null
    factsAt = at
    return parsed
  } catch {
    return null
  }
}

/** The facts say where the collector leaves its answer; $.store keeps it for the next sessions. */
function keepShared($: EngineInterface, facts: OfficeFacts): void {
  const path = facts.sources?.shared
  if (typeof path !== 'string' || path === sharedPath || !SHARED_RE.test(path)) return
  sharedPath = path
  $.store.set(STORE_SHARED, path).catch(error => $.ui.log(`theoffice: could not keep the shared path (${errorText(error)})`, { to: 'debug' }))
}

/** At session start: where the last session's collector left its answer, so even this session's first facts may need no run. */
async function restoreShared($: EngineInterface): Promise<void> {
  const kept = await $.store.get(STORE_SHARED)
  if (typeof kept === 'string' && SHARED_RE.test(kept)) sharedPath = kept
  isNewMachine = sharedPath === undefined
}

/**
 * Bring the week's facts up to `age` and keep them: the Live, Week and What they did tabs and the status line draw
 * them. Facts that recent are left alone, another session's are taken from the shared file, and only then the collector
 * runs. Never overlaps itself: a run asked while one is in flight is dropped, unless it was asked because something
 * changed (`isChange`, the watcher), which runs once more right after. A failed run keeps the last good snapshot (a
 * flaky refresh must not blank the office); failures go to the debug log only. The snapshot is only written when the
 * pane would draw something else (isNewDrawing): every write redraws the pane, and on desktop a new source reloads the
 * animated SVG.
 */
async function refresh($: EngineInterface, isChange = false, age = allowedAge(isChange)): Promise<void> {
  if (isRefreshing.all) {
    if (isChange) isDue.all = true
    return
  }
  isRefreshing.all = true
  try {
    const now = await $.clock.now()
    if (now - factsAt < age) return
    const since = now - age
    const shared = await sharedFacts($, since)
    const isFirst = (await read($, snapshot)) === null
    if (!shared && isFirst && !sharedPath && !isLit) await firstLight($)
    const facts = shared ?? (await collectFacts($, ['all', '--json', '--since', String(since)], isFirst))
    if (!shared) factsAt = now
    if (typeof facts === 'string') return await fail($, facts)
    keepShared($, facts)
    latest.all = facts
    noteDay($, facts)
    agentFiles = watchList(facts)
    if (isNewDrawing('all', facts, await $.clock.now())) {
      await update($, snapshot, () => facts)
      lastKey.all = factsKey(facts)
    }
    strikes = 0
    if ((await read($, trouble)) !== null) await update($, trouble, () => null)
    postStatus($, renderStatus(facts, { width: STATUS_WIDTH }))
  } catch (error) {
    await fail($, `the facts could not be kept (${errorText(error)})`)
  } finally {
    isRefreshing.all = false
    if (isDue.all) {
      isDue.all = false
      // a change seen while backing off (no facts yet, this run failed too) waits for the backoff like any other
      if (skip === 0) void refresh($, true)
    }
  }
}

/**
 * A machine's first open: its collector has never answered (no shared path is known), so its first run reads every
 * session of the week, ten seconds and more on a busy machine. The live floor comes first (`--first-light`: the desks,
 * nothing counted, about a second), drawn and on the status line while that run goes on: the Live tab shows who is at
 * work at once, the tabs that are all counts wait. Asked once a load, whatever it answers; a failure only goes without.
 */
async function firstLight($: EngineInterface): Promise<void> {
  isLit = true
  const light = await collectFacts($, ['all', '--json', '--first-light'], false)
  if (typeof light === 'string' || light.first_light !== true || (await read($, snapshot)) !== null) return
  const shared = light.sources?.shared
  if (typeof shared === 'string' && SHARED_RE.test(shared)) lightShared = shared
  latest.all = light
  noteDay($, light)
  agentFiles = watchList(light)
  await update($, snapshot, () => light)
  lastKey.all = factsKey(light)
  postStatus($, renderStatus(light, { width: STATUS_WIDTH }))
}

// ---------------------------------------------------------------- the waiting room

/** What a tab waits for, as its waiting room says it: the week's facts, today's, last month and this one, a past page. */
type Wait = 'week' | 'today' | 'month' | 'past'

/** What the picked tab waits for when its facts are not there yet (the week's facts, its own range's or its page's). */
function waitOf(range: Range | null): Wait {
  return range === 'today' || range === 'month' || range === 'past' ? range : 'week'
}

/**
 * The shared answer the run the picked tab waits for will leave (`all`, `today`, `month`, `month-2026-08-01`…), while
 * that run is under way: its progress file is beside it. Null when none is.
 */
function waitedKey(): string | null {
  if (picked === 'timelapse') return null
  const range = rangeOf(picked)
  if (range === 'past') {
    // the run in flight is the page on screen's, not one passed by on the way
    const page = pageOn()
    return page && pastRun === page.key ? `${UNIT_VIEW[page.unit]}-${page.key.split(':')[1]}` : null
  }
  if (range) return isRefreshing[range] ? range : null
  return isRefreshing.all ? 'all' : null
}

/**
 * While the tab on screen waits for a run, how far that run has read: its `<key>.progress.json` beside the collector's
 * shared answer (collect `progress`), kept in the state with the moment of the look (so how long it has been going moves
 * on), null when no run is under way, it is not there, or it is older than PROGRESS_STALE_MS (its run stopped: a run
 * says it again every 2 s at least). The watcher reads it every look on screen.
 */
async function readProgress($: EngineInterface): Promise<void> {
  const key = waitedKey()
  const base = sharedPath ?? lightShared
  let next: OfficeProgress | null = null
  if (key && base) {
    try {
      const p = JSON.parse(await $.fs.read(`${base.slice(0, -'all.json'.length)}${key}.progress.json`)) as Record<string, unknown>
      // counts are whole and never below 0; the moments are any time at all
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : NaN)
      const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
      const step = num(p.step)
      const steps = num(p.steps)
      const done = num(p.done)
      const total = num(p.total)
      const began = time(p.began)
      const at = time(p.at)
      const seen = await $.clock.now()
      if (step >= 1 && steps >= step && [done, total, began, at].every(Number.isFinite) && seen - at < PROGRESS_STALE_MS) {
        next = { key, step, steps, done: Math.min(done, total), total, began, at, seen }
      }
    } catch {
      // not there yet, or half written: the next look reads it
    }
  }
  try {
    const held = await read($, progress)
    if (JSON.stringify(held) !== JSON.stringify(next)) await update($, progress, () => next)
  } catch (error) {
    $.ui.log(`theoffice: could not keep the progress (${errorText(error)})`, { to: 'debug' })
  }
}

/** Bytes as a reader says them: `840 MB`, `8.2 GB`. */
function bytesWord(n: number): string {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`
}

/** What each step of a run reads, as its waiting room names it. */
const STEP_WORDS = ["Claude's sessions", "the other agents' sessions", 'git']

/**
 * What a waiting room says: its title, the run's progress as a bar and its step (when the run says how far it is), and
 * what to expect. `name` names a page of the past.
 */
function waitLines(wait: Wait, name: string, p: OfficeProgress | null): { title: string; bar: string | null; step: string | null; note: string } {
  const title = { week: isNewMachine ? "Reading this week's sessions for the first time" : 'Counting desks', today: "Reading today's sessions",
    month: 'Reading last month and this one', past: `Reading ${name || 'that page'}` }[wait]
  const note = {
    week: isNewMachine ? 'Every session of the week is read once; after that The Office opens at once.' : '',
    today: '',
    month: 'The first time, every session of the month is read once: a minute or two. After that the Month tab opens in about a second.',
    past: 'A page far back is read from its sessions once; the last pages read, and any read in the last hour, open at once.',
  }[wait]
  if (!p) return { title, bar: null, step: null, note }
  const share = p.total > 0 ? p.done / p.total : 0
  const whole = Math.max(0, Math.min(1, (p.step - 1 + share) / p.steps))
  const cells = Math.round(whole * 24)
  const bar = `${'█'.repeat(cells)}${'░'.repeat(24 - cells)} ${Math.round(whole * 100)}%`
  const seconds = Math.max(0, Math.round((p.seen - p.began) / 1000))
  const amount = p.step >= 3 ? `${p.done} of ${p.total} repos` : `${bytesWord(p.done)} of ${bytesWord(p.total)}`
  const step = `Step ${p.step} of ${p.steps}, ${STEP_WORDS[p.step - 1] ?? 'reading'}: ${amount} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return { title, bar, step, note }
}

/** The waiting room's drawing for `wait` at `width` (svg-loading.mjs), on the beat, drawn once for the whole wait. */
function roomSource(wait: Wait, width: number): string {
  let night = roomNights.get(wait)
  if (night === undefined) roomNights.set(wait, (night = latest.all?.now.is_night === true))
  const key = `${wait}:${width}:${night}`
  let source = rooms.get(key)
  if (!source) {
    if (rooms.size >= 8) rooms.clear()
    source = onBeat(renderLoading(wait, { width, card: true, night }), 'ld-')
    rooms.set(key, source)
  }
  return source
}

/**
 * Record why a refresh failed (a few words, never collector output). With no data yet, clear the status line and back
 * off (1, 2, 4… heartbeats, at most MAX_SKIP): a collector that cannot finish must not restart a full build every beat.
 */
async function fail($: EngineInterface, why: string): Promise<void> {
  if ((await read($, trouble)) !== why) {
    $.ui.log(`theoffice: refresh failed: ${why}; keeping the last snapshot`, { to: 'debug' })
    await update($, trouble, () => why)
  }
  if ((await read($, snapshot)) !== null) return
  postStatus($, undefined)
  strikes++
  skip = Math.min(MAX_SKIP, 2 ** (strikes - 1))
}

/**
 * Run the collector for a tab with a range of its own as it runs now (today's hours, last month and this) and keep the
 * facts under that range. Only the selected tab of a pane on screen asks, on its page of now (a press asks at once, and
 * so does the pane coming back from behind another tab), so a closed or hidden pane never pays for a month. Same rules
 * as refresh: no overlap (a change seen meanwhile runs once more after, through rangeChanged's gap), a failure keeps the
 * last facts and says why while there are none, and with none it backs off; the facts are only written when the tab
 * would draw something else.
 */
async function refreshRange($: EngineInterface, range: NowRange, isChange = false): Promise<void> {
  if (isRefreshing[range]) {
    if (isChange) isDue[range] = true
    return
  }
  isRefreshing[range] = true
  try {
    const now = await $.clock.now()
    rangeRunAt[range] = now
    const held = await heldOf($, range)
    const facts = await collectFacts($, [...RANGE_ARGS[range], '--json', '--since', String(now)], held === null)
    if (!isPaneOpen) return
    if (typeof facts === 'string') {
      if ((await read($, rangeTrouble)) !== facts) {
        $.ui.log(`theoffice: ${range} refresh failed: ${facts}; keeping the last ${range} facts`, { to: 'debug' })
        if (rangeOf(picked) === range) await update($, rangeTrouble, () => facts)
      }
      if (held === null) {
        rangeStrikes[range]++
        rangeSkip[range] = Math.min(MAX_SKIP, 2 ** (rangeStrikes[range] - 1))
      }
      return
    }
    rangeStrikes[range] = 0
    latest[range] = facts
    noteDay($, facts)
    // the floor in them is today's: they keep the status line of a tab that runs no week of its own
    postStatus($, renderStatus(facts, { width: STATUS_WIDTH }))
    if (held === null || isNewDrawing(range, facts, await $.clock.now())) {
      await keepRange($, range, facts)
      lastKey[range] = factsKey(facts)
    }
    if ((await read($, rangeTrouble)) !== null) await update($, rangeTrouble, () => null)
  } catch (error) {
    $.ui.log(`theoffice: ${range} refresh failed: ${errorText(error)}`, { to: 'debug' })
  } finally {
    isRefreshing[range] = false
    if (isDue[range]) {
      isDue[range] = false
      void rangeChanged($, range)
    }
  }
}

/**
 * Something moved while a Today or Month tab is on screen on its page of now: its collector runs again, no sooner than
 * RANGE_GAP_MS after its last run started (a change inside the gap runs once, at its end), never while backing off with
 * no facts yet, and only if the tab (and its page) is still the one on screen by then.
 */
async function rangeChanged($: EngineInterface, range: NowRange): Promise<void> {
  if (rangeSkip[range] > 0 || isRangeQueued[range]) return
  if (isRefreshing[range]) {
    isDue[range] = true
    return
  }
  isRangeQueued[range] = true
  const run = () => {
    isRangeQueued[range] = false
    if (isPaneOpen && isPaneShown && rangeOf(picked) === range && rangeSkip[range] === 0) void refreshRange($, range, true)
  }
  try {
    const wait = rangeRunAt[range] + RANGE_GAP_MS[range] - (await $.clock.now())
    if (wait > 0) $.clock.after(wait, run)
    else run()
  } catch (error) {
    isRangeQueued[range] = false
    $.ui.log(`theoffice: could not schedule a ${range} run (${errorText(error)})`, { to: 'debug' })
  }
}

/** The facts the state keeps for a range (read in a drawing, it subscribes to them). */
async function heldOf($: EngineInterface, range: Range): Promise<OfficeFacts | null> {
  if (range === 'today') return read($, todayFacts)
  return range === 'month' ? read($, monthFacts) : read($, pastFacts)
}

/** Keep facts of a range in the state, where its drawing reads them. */
async function keepRange($: EngineInterface, range: Range, facts: OfficeFacts): Promise<void> {
  if (range === 'today') await update($, todayFacts, () => facts)
  else if (range === 'month') await update($, monthFacts, () => facts)
  else await update($, pastFacts, () => facts)
}

// ---------------------------------------------------------------- pages of the past

/**
 * Today's date as `facts` say it, kept when it is a day (YYYY-MM-DD) and, from a page of the past (`isPast`), only when
 * it is later: such an answer may be another run's of the last hour, read before midnight. When the day turns under a
 * page of the past on screen, that page is another one, read at once.
 */
function noteDay($: EngineInterface, facts: OfficeFacts, isPast = false): void {
  const day = facts.now?.local_date
  if (typeof day !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(day) || day === dayNow || (isPast && dayNow && day < dayNow)) return
  const page = pageOn()
  dayNow = day
  if (isPaneOpen && isPaneShown && page && pageOn()?.key !== page.key) void readPast($)
}

/**
 * The page of the past a tab shows (the picked one's, with the pages the runs follow, by default): its unit, how many
 * pages back, and its key in `pages`, its unit and first day on today's calendar (so the day turning under a page of
 * yesterday makes it another page). Null on a page of now, on a tab that does not page, or before any facts said what
 * day it is.
 */
function pageOn(view: OfficeTab = picked, b: OfficeBacks = pickedBacks): { unit: OfficeUnit; back: number; key: string } | null {
  const unit = UNIT_OF[view]
  if (!unit || !(b[unit] > 0) || !dayNow) return null
  return { unit, back: b[unit], key: `${unit}:${pageDays(unit, b[unit], dayNow)[0]}` }
}

/** The key facts of a page are kept under: their unit and the first day the collector read. */
function pageKeyOf(unit: OfficeUnit, facts: OfficeFacts): string {
  return `${unit}:${facts.range.days[0] ?? ''}`
}

/** Whether `facts` are the page `key` of `unit`: its kind (a month's first day may be a day's) and its first day. */
function isPage(facts: OfficeFacts | null, unit: OfficeUnit, key: string): facts is OfficeFacts {
  return facts !== null && facts.range.kind === UNIT_VIEW[unit] && facts.range.back !== undefined && pageKeyOf(unit, facts) === key
}

/** Keep a page read, the newest of the last MAX_PAGES. */
function keepPage(key: string, facts: OfficeFacts): void {
  pages.delete(key)
  pages.set(key, facts)
  for (const old of pages.keys()) if (pages.size > MAX_PAGES) pages.delete(old)
}

/**
 * Bring the page of the past on screen up: drawn at once when it is kept, else read (`<view> --back N`), one run at a
 * time and with the engine's longest wait, since a month far back reads every transcript of it and a killed run saves
 * nothing. The newest press wins: a page asked while another is read waits for that run, then only the page on screen
 * by then is read (the ones passed by on the way are not). Its days are over, so nothing reads it again but a failure
 * (the heartbeat tries again, backing off) or the day turning under it. While one is read the strip says so
 * (`pastReading`) and the tab keeps what it draws; a failure says why when the tab has nothing to draw.
 */
async function readPast($: EngineInterface): Promise<void> {
  const page = pageOn()
  if (!page) return markReading($, false)
  const kept = pages.get(page.key)
  if (kept) return showPast($, kept)
  // after a hot reload the state still holds the page on screen
  const held = await read($, pastFacts)
  if (isPage(held, page.unit, page.key)) {
    keepPage(page.key, held)
    return showPast($, held)
  }
  await markReading($, true)
  if (pastRun) return // the run in flight reads it next
  pastRun = page.key
  try {
    const now = await $.clock.now()
    const facts = await collectFacts($, [UNIT_VIEW[page.unit], '--back', String(page.back), '--json', '--since', String(now - PAST_AGE_MS)], true)
    if (!isPaneOpen) return
    if (typeof facts === 'string') {
      $.ui.log(`theoffice: ${page.key} could not be read: ${facts}`, { to: 'debug' })
      if (pageOn()?.key !== page.key) return
      rangeStrikes.past++
      rangeSkip.past = Math.min(MAX_SKIP, 2 ** (rangeStrikes.past - 1))
      if ((await read($, rangeTrouble)) !== facts) await update($, rangeTrouble, () => facts)
      return
    }
    rangeStrikes.past = 0
    // the collector's calendar: a day that turned under the run moved its pages too
    noteDay($, facts, true)
    keepPage(pageKeyOf(page.unit, facts), facts)
  } catch (error) {
    $.ui.log(`theoffice: ${page.key} could not be read: ${errorText(error)}`, { to: 'debug' })
  } finally {
    pastRun = null
    if (isPaneOpen) await pastDone($, page.key)
  }
}

/**
 * A run of the past ended (`tried`, the page it read): the page on screen now is drawn if kept, read if another (the
 * newest press), or left saying why if it is the page that just failed.
 */
async function pastDone($: EngineInterface, tried: string): Promise<void> {
  const page = pageOn()
  const kept = page ? pages.get(page.key) : undefined
  if (kept) await showPast($, kept)
  else if (page && page.key !== tried) void readPast($)
  else await markReading($, false)
}

/** A page of the past is on screen: its facts in the state, where its tab reads them, and nothing read or wrong. */
async function showPast($: EngineInterface, facts: OfficeFacts): Promise<void> {
  latest.past = facts
  try {
    if ((await read($, pastFacts)) !== facts) await update($, pastFacts, () => facts)
    if ((await read($, rangeTrouble)) !== null) await update($, rangeTrouble, () => null)
  } catch (error) {
    $.ui.log(`theoffice: could not show a page of the past (${errorText(error)})`, { to: 'debug' })
  }
  await markReading($, false)
}

/** Whether a page of the past is being read, as the strip shows it; a refused write costs only its look. */
async function markReading($: EngineInterface, isOn: boolean): Promise<void> {
  try {
    if ((await read($, pastReading)) !== isOn) await update($, pastReading, () => isOn)
  } catch (error) {
    $.ui.log(`theoffice: could not mark a page being read (${errorText(error)})`, { to: 'debug' })
  }
}

/** Bring a tab's range up: a page of the past read if it is not kept, a range of now run. */
function runRange($: EngineInterface, range: Range): Promise<void> {
  return range === 'past' ? readPast($) : refreshRange($, range)
}

/**
 * Whether facts of `source` would draw anything else than what the pane shows, on any surface drawing it at `now`. On
 * the tab on screen it draws them as each surface would and compares: the pixel art as pixelMoved says, the text
 * version at frame 0. Facts no drawing reads now (another tab, the Timelapse, a closed pane) cost no redraw: they are
 * kept when they differ at all (factsKey), so the state stays fresh for the next tab and the next load. Nothing kept
 * yet, or a drawing that throws: keep them.
 */
function isNewDrawing(source: 'all' | NowRange, facts: OfficeFacts, now: number): boolean {
  if (!lastKey[source]) return true
  let isCompared = false
  if (isPaneOpen && picked !== 'timelapse' && sourceOf(picked) === source) {
    try {
      for (const drawn of drawings.values()) {
        if (drawn.view !== picked) continue
        isCompared = true
        if (drawn.kind === 'pixel' ? pixelMoved(drawn, facts, now) : drawn.facts !== facts && textKey(facts, drawn.view, drawn.columns) !== textKey(drawn.facts, drawn.view, drawn.columns)) return true
      }
    } catch {
      return true
    }
  }
  return isCompared ? false : factsKey(facts) !== lastKey[source]
}

/**
 * Whether `facts` would replace a pixel drawing on screen at `now`. Drawn at its width with its clocks phased from the
 * same moment, the same facts within a 10-minute window give the same string (lib/svg.mjs `liveClock`). When the string
 * differs only in what busy desks are doing or in the tool-call counts (their drawings calm, calmFacts, are the same),
 * it is replaced only once the one on screen is ACTIVITY_MS old: those change with every tool call.
 */
function pixelMoved(drawn: PixelDrawing, facts: OfficeFacts, now: number): boolean {
  if (drawn.compared?.facts !== facts) drawn.compared = { facts, isSame: pixelSvg(facts, drawn.view, drawn.width, drawn.clockAt, drawn.isQuiet, drawn.isZoomed) === drawn.plain }
  const seen = drawn.compared
  if (seen.isSame) return false
  if (now - drawn.at >= ACTIVITY_MS) return true
  if (seen.isCalm === undefined) {
    drawn.calm ??= pixelSvg(calmFacts(drawn.facts), drawn.view, drawn.width, drawn.clockAt, drawn.isQuiet, drawn.isZoomed)
    seen.isCalm = pixelSvg(calmFacts(facts), drawn.view, drawn.width, drawn.clockAt, drawn.isQuiet, drawn.isZoomed) === drawn.calm
  }
  return !seen.isCalm
}

/** One status line per plugin under the prompt; only sent when it changes. */
function postStatus($: EngineInterface, text: string | undefined): void {
  if (text === lastStatus) return
  lastStatus = text
  $.ui.status(text)
}

// ---------------------------------------------------------------- the watcher

/**
 * What the watcher compares from one look to the next, read with $.fs alone (no process): each live session record
 * (`sessions/<pid>.json`, its mtime and size: a session starting, ending or changing status), and for each its
 * transcript (`projects/<cwd, every non-alphanumeric char a dash>/<sessionId>.jsonl`, mtime and size: every turn and
 * tool call lands there), its `subagents` and `workflows` folders (mtime: an intern starting, a meeting ending) and its
 * meetings still going (meetingStamps). A path that is not there reads as absent. A record is read again only when its
 * own mtime moved. The transcripts are the `noise` and the other agents' session files `others`: they move with every
 * tool call, the rest moves the floor. Nothing without $HOME.
 */
async function signature($: EngineInterface): Promise<Look> {
  const root = await homeDir($)
  if (!root) return { state: '', noise: '', others: '' }
  const dir = `${root}/.claude/sessions`
  let entries: readonly FsEntry[]
  try {
    entries = await $.fs.list(dir)
  } catch {
    return { state: 'no sessions', noise: '', others: '' }
  }
  const names = new Set<string>()
  const bases = new Set<string>()
  const transcripts: string[] = []
  const parts = await Promise.all(entries.filter(entry => entry.kind === 'file' && SESSION_RE.test(entry.name)).map(async entry => {
    names.add(entry.name)
    let record = sessionRecords.get(entry.name)
    if (record?.mtimeMs !== entry.mtimeMs) {
      record = { mtimeMs: entry.mtimeMs, ...(await sessionOf($, `${dir}/${entry.name}`)) }
      sessionRecords.set(entry.name, record)
    }
    const own = `${entry.name}:${entry.mtimeMs}:${entry.size}`
    if (!record.sessionId || !record.cwd) return own
    const base = `${root}/.claude/projects/${record.cwd.replace(/[^A-Za-z0-9]/g, '-')}/${record.sessionId}`
    bases.add(base)
    const [transcript, subagents, ended] = await Promise.all([stamp($, `${base}.jsonl`, true), stamp($, `${base}/subagents`, false), stamp($, `${base}/workflows`, false)])
    transcripts.push(`${entry.name}:${transcript}`)
    // a session that never had an intern has no meetings either: one stat less per look
    const meetings = subagents === '-' ? '' : await meetingStamps($, base, ended)
    return `${own}>${subagents},${ended}${meetings}`
  }))
  for (const name of [...sessionRecords.keys()]) if (!names.has(name)) sessionRecords.delete(name)
  for (const base of [...sessionRuns.keys()]) if (!bases.has(base)) sessionRuns.delete(base)
  const others = await Promise.all(agentFiles.map(file => stamp($, file, true)))
  return { state: parts.sort().join('|'), noise: transcripts.sort().join('|'), others: others.join(',') }
}

/**
 * The other agents' session files the facts name (sources.watch), as the watcher may stat them: absolute paths under
 * $HOME, at most MAX_AGENT_FILES. Anything else in the list is ignored.
 */
function watchList(facts: OfficeFacts): string[] {
  const list = (facts.sources as { watch?: unknown } | undefined)?.watch
  if (!Array.isArray(list) || !home) return []
  const root = home
  const isUnder = (p: string) => (p.startsWith(`${root}/`) || p.startsWith(`${root}\\`)) && !UP_RE.test(p)
  return list.filter((p): p is string => typeof p === 'string' && isUnder(p)).slice(0, MAX_AGENT_FILES)
}

/**
 * A session's meetings (workflow runs) as the watcher compares them: its `subagents/workflows` folder (a run
 * starting), and for each run still going its folder (an agent of it starting) and its `journal.jsonl` (an agent done
 * or failed, a new phase), none of which moves a folder above them. `ended` is the stamp of the session's `workflows`
 * folder, where a run's json lands when it ends: the runs still going are listed again only when it or
 * `subagents/workflows` moved. '' when the session has no workflow runs.
 */
async function meetingStamps($: EngineInterface, base: string, ended: string): Promise<string> {
  const dir = `${base}/subagents/workflows`
  const started = await stamp($, dir, false)
  if (started === '-') {
    sessionRuns.delete(base)
    return ''
  }
  const key = `${started}:${ended}`
  let known = sessionRuns.get(base)
  if (known?.key !== key) {
    known = { key, runs: await runsGoing($, dir, `${base}/workflows`) }
    sessionRuns.set(base, known)
  }
  const runs = await Promise.all(known.runs.map(async run => {
    const [folder, journal] = await Promise.all([stamp($, `${dir}/${run}`, false), stamp($, `${dir}/${run}/journal.jsonl`, true)])
    return `${folder}/${journal}`
  }))
  return `,${started}[${runs.join(',')}]`
}

/**
 * The workflow runs of a session still going: a `wf_` folder in `dir` with no `<run>.json` in `results` yet (the
 * collector's own test), newest first and MAX_RUNS at most, so runs a crash left open cost a few stats at worst.
 */
async function runsGoing($: EngineInterface, dir: string, results: string): Promise<string[]> {
  let entries: readonly FsEntry[]
  try {
    entries = await $.fs.list(dir)
  } catch {
    return []
  }
  let done: Set<string>
  try {
    done = new Set((await $.fs.list(results)).map(entry => entry.name))
  } catch {
    done = new Set()
  }
  const going = entries.filter(entry => entry.kind === 'dir' && RUN_ID_RE.test(entry.name) && !done.has(`${entry.name}.json`))
  const dated = await Promise.all(going.map(async entry => {
    try {
      return { name: entry.name, mtimeMs: (await $.fs.stat(`${dir}/${entry.name}`)).mtimeMs }
    } catch {
      return { name: entry.name, mtimeMs: 0 }
    }
  }))
  return dated.sort((a, b) => b.mtimeMs - a.mtimeMs || a.name.localeCompare(b.name)).slice(0, MAX_RUNS).map(run => run.name)
}

/**
 * The home folder, read once (literal names: the engine lists what a module reads); undefined when there is none. On
 * Windows it is %USERPROFILE%, as Claude Code's own (HOME there is unset, or a Git Bash `/c/Users/me` no file call
 * reaches); elsewhere $HOME.
 */
async function homeDir($: EngineInterface): Promise<string | undefined> {
  if (home) return home
  try {
    const profile = await $.env.get('USERPROFILE')
    if (profile && WIN_ABS_RE.test(profile)) home = profile.replace(/[\\/]+$/, '')
    else {
      const value = await $.env.get('HOME')
      if (value && value.startsWith('/')) home = value.replace(/\/+$/, '')
    }
  } catch {
    // no environment: the watcher has nothing to look at, the heartbeat still runs
  }
  return home
}

/** A session record's id and folder (`sessionId`, `cwd`), or nulls when it is not one: the watcher never guesses a path. */
async function sessionOf($: EngineInterface, path: string): Promise<{ sessionId: string | null; cwd: string | null }> {
  try {
    const record = JSON.parse(await $.fs.read(path)) as { sessionId?: unknown; cwd?: unknown }
    const sessionId = typeof record.sessionId === 'string' && SESSION_ID_RE.test(record.sessionId) ? record.sessionId : null
    const cwd = typeof record.cwd === 'string' && (record.cwd.startsWith('/') || WIN_ABS_RE.test(record.cwd)) ? record.cwd : null
    return { sessionId, cwd }
  } catch {
    return { sessionId: null, cwd: null }
  }
}

/** A path's mtime (and size, for a file): '-' when it is not there. */
async function stamp($: EngineInterface, path: string, withSize: boolean): Promise<string> {
  try {
    const stat = await $.fs.stat(path)
    return withSize ? `${stat.mtimeMs}:${stat.size}` : `${stat.mtimeMs}`
  } catch {
    return '-'
  }
}

/**
 * One look. While the pane is open it first looks at the pane: gone (an unload closes it without telling our hooks), or
 * on screen or not, which sets the watcher's cadence and the frame clock. Off screen, closed or behind another tab,
 * nothing here draws what moves on disk: the look only brings the status line's facts up to their age, and once it has
 * any it needs no heartbeat to (`isPoke`: this session just did something, which the facts may be asked to show sooner).
 * Then the signature: the first look only notes where things stand (a run is under way at load anyway); a different one
 * runs the collector now, or when only the noise or the others moved as soon as their gap has passed (changed), for the status line
 * alone on a tab that draws other facts. What moved behind another tab differs from the last signature seen, so the
 * first look back runs it. Looks never overlap: one asked meanwhile (a poke) looks again right after.
 */
async function watch($: EngineInterface, isPoke = false): Promise<void> {
  if (isWatching) {
    isWatchDue = true
    return
  }
  isWatching = true
  try {
    if (isPaneOpen) {
      const row = await paneRow($)
      if (row === undefined) setPane($, false)
      else setShown($, row.isShown && row.isPlaced)
    }
    if (!isPaneShown) {
      if (skip === 0 && (isPoke || latest.all)) void refresh($, isPoke)
      return
    }
    await readProgress($)
    const look = await signature($)
    if (look.state !== seen?.state) {
      const isFirst = seen === undefined
      seen = look
      if (!isFirst) changed($)
    } else if (look.others !== seen.others || look.noise !== seen.noise) {
      const gap = look.others !== seen.others ? OTHERS_GAP_MS : NOISE_GAP_MS
      if ((await $.clock.now()) - factsAt >= gap) {
        seen = look
        changed($, isWeekShown() ? gap : CLOSED_AGE_MS)
      }
    }
  } catch (error) {
    $.ui.log(`theoffice: a look failed (${errorText(error)})`, { to: 'debug' })
  } finally {
    isWatching = false
    if (isWatchDue) {
      isWatchDue = false
      void watch($, true)
    }
  }
}

/**
 * Something an agent does moved on disk: the week's facts now (once more after the one in flight) and, on screen, the
 * shown tab's own range of now (rangeChanged: no sooner than its gap; a page of the past is over). Never while backing
 * off with no facts yet: a collector that cannot finish is not restarted by every keystroke an agent makes.
 */
function changed($: EngineInterface, age?: number): void {
  if (skip === 0) void refresh($, true, age)
  const range = isPaneOpen && isPaneShown ? rangeOf(picked) : null
  if (range && range !== 'past') void rangeChanged($, range)
}

/**
 * A prompt was sent or a turn ended in this session: look soon (POKE_MS, once its transcript has the line) rather
 * than at the next tick, which is 30 s off while the pane is closed. Pokes in a burst make one look.
 */
function pokeWatcher($: EngineInterface): void {
  try {
    poke?.cancel()
    poke = $.clock.after(POKE_MS, () => void watch($, true))
  } catch (error) {
    $.ui.log(`theoffice: could not schedule a look (${errorText(error)})`, { to: 'debug' })
  }
}

/**
 * The heartbeat: the week's facts (unless backing off) and the shown tab's own range, whatever the watcher saw. A page
 * of the past is read only when it is not kept: it failed (backing off as a range does), or the day turned under it.
 */
async function heartbeat($: EngineInterface): Promise<void> {
  const jobs: Promise<void>[] = []
  if (skip > 0) skip--
  else jobs.push(refresh($))
  const range = isPaneOpen && isPaneShown ? rangeOf(picked) : null
  if (range && rangeSkip[range] > 0) rangeSkip[range]--
  else if (range) jobs.push(runRange($, range))
  await Promise.all(jobs)
}

// ---------------------------------------------------------------- tabs

/**
 * The person picked a tab (a tab's Button or its name after /theoffice, never a drawing): it is drawn at once (the
 * pane reads the `tab` state value) and kept in $.store for the next sessions; the Timelapse's text replay starts from
 * its first frame. A write that is refused costs only that write, never the switch.
 */
async function pickTab($: EngineInterface, next: OfficeTab): Promise<void> {
  picked = next
  animate($)
  try {
    if ((await read($, tab)) !== next) await update($, tab, () => next)
    if ((await read($, rangeTrouble)) !== null) await update($, rangeTrouble, () => null)
    if (next === 'timelapse') {
      if ((await read($, lapseTrouble)) !== null) await update($, lapseTrouble, () => null)
      await update($, frame, () => 0)
    }
  } catch (error) {
    $.ui.log(`theoffice: could not switch to the ${next} tab (${errorText(error)})`, { to: 'debug' })
  }
  try {
    await $.store.set(STORE_TAB, next)
  } catch (error) {
    $.ui.log(`theoffice: could not keep the ${next} tab (${errorText(error)})`, { to: 'debug' })
  }
}

/**
 * The person pressed a tab (a Button's onPress): it is picked (a page turns), and a tab with a range of its own fetches
 * its facts now rather than at the next beat (its page of the past, only when it is not kept); the Timelapse runs its
 * picked range afresh (its kept facts are drawn meanwhile).
 */
async function selectTab($: EngineInterface, next: OfficeTab): Promise<void> {
  await closeFrame($)
  await pickTab($, next)
  turnPage($)
  if (next !== 'month') await closeExport($)
  const range = rangeOf(next)
  if (range !== 'past') await markReading($, false)
  if (range) {
    rangeSkip[range] = 0
    await runRange($, range)
  }
  if (next === 'timelapse') await runLapse($, pickedLapse)
}

/**
 * The person pressed the Live tab's Quiet key (its Button or the pixel menu's, never a drawing): the Live tab is drawn
 * with its names alone (lib/svg.mjs `quiet`), or with its tags again, at once (the pane reads the `quiet` state
 * value), and that is kept in $.store for the next sessions. It makes no sound: it turns no page. A refused write costs
 * only that write.
 */
async function toggleQuiet($: EngineInterface): Promise<void> {
  let isQuiet: boolean
  try {
    isQuiet = await update($, quiet, was => !was)
  } catch (error) {
    $.ui.log(`theoffice: could not press Quiet (${errorText(error)})`, { to: 'debug' })
    return
  }
  try {
    await $.store.set(STORE_QUIET, isQuiet)
  } catch (error) {
    $.ui.log(`theoffice: could not keep Quiet ${isQuiet ? 'on' : 'off'} (${errorText(error)})`, { to: 'debug' })
  }
}

/** At session start (and after a hot reload): Quiet as the person left it, from $.store, else as the state still holds it. */
async function restoreQuiet($: EngineInterface): Promise<void> {
  let kept: unknown
  try {
    kept = await $.store.get(STORE_QUIET)
  } catch (error) {
    $.ui.log(`theoffice: could not read the kept Quiet (${errorText(error)})`, { to: 'debug' })
    return
  }
  if (typeof kept !== 'boolean' || kept === (await read($, quiet))) return
  await update($, quiet, () => kept)
}

/**
 * The person pressed the Zoom key (its Button or the pixel menu's, on any tab): every tab's drawing is drawn bigger
 * (ZOOM_SCALE CSS px per art pixel: its words and figures a quarter bigger, fewer desks to a row) or as before, at once
 * (the pane reads the `zoom` state value), and that is kept in $.store for the next sessions, as Quiet is.
 */
async function toggleZoom($: EngineInterface): Promise<void> {
  let isZoomed: boolean
  try {
    isZoomed = await update($, zoom, was => !was)
  } catch (error) {
    $.ui.log(`theoffice: could not press Zoom (${errorText(error)})`, { to: 'debug' })
    return
  }
  try {
    await $.store.set(STORE_ZOOM, isZoomed)
  } catch (error) {
    $.ui.log(`theoffice: could not keep Zoom ${isZoomed ? 'on' : 'off'} (${errorText(error)})`, { to: 'debug' })
  }
}

/** At session start (and after a hot reload): Zoom as the person left it, from $.store, else as the state still holds it. */
async function restoreZoom($: EngineInterface): Promise<void> {
  let kept: unknown
  try {
    kept = await $.store.get(STORE_ZOOM)
  } catch (error) {
    $.ui.log(`theoffice: could not read the kept Zoom (${errorText(error)})`, { to: 'debug' })
    return
  }
  if (typeof kept !== 'boolean' || kept === (await read($, zoom))) return
  await update($, zoom, () => kept)
}

/**
 * At session start (and after a hot reload): the tab the person picked last, from $.store, else the one the state
 * still holds. Nothing is fetched here; the timers and the open do that. The pages of the past are the state's alone,
 * so a hot reload keeps them and a new session opens on now. Today's date comes from the week's facts the state holds.
 */
async function restoreTab($: EngineInterface): Promise<void> {
  picked = await read($, tab)
  pickedBacks = await read($, backs)
  dayNow ??= (await read($, snapshot))?.now.local_date
  let kept: unknown
  try {
    kept = await $.store.get(STORE_TAB)
  } catch (error) {
    $.ui.log(`theoffice: could not read the kept tab (${errorText(error)})`, { to: 'debug' })
    return
  }
  if (!isTab(kept) || kept === picked) return
  picked = kept
  await update($, tab, () => kept)
}

/**
 * The person turned a page of the past (the strip's post, or one of its Buttons, never a drawing): the strip and the tab
 * follow at once (they read `backs`) with a page's turn, for this session only (never $.store: a new session opens on
 * now). The page is drawn when kept, else read; a page of now is drawn from its kept facts while its own run goes, as
 * a tab press runs its tab's. A press that goes nowhere is no press. A refused write costs only that write.
 */
async function selectBack($: EngineInterface, unit: OfficeUnit, back: number): Promise<void> {
  if (pickedBacks[unit] === back || back < 0 || back > MAX_BACK[unit]) return
  pickedBacks = { ...pickedBacks, [unit]: back }
  turnPage($)
  try {
    await update($, backs, () => pickedBacks)
    if ((await read($, rangeTrouble)) !== null) await update($, rangeTrouble, () => null)
  } catch (error) {
    $.ui.log(`theoffice: could not turn to page ${back} of the ${unit}s (${errorText(error)})`, { to: 'debug' })
  }
  const range = rangeOf(picked)
  if (range !== 'past') await markReading($, false)
  if (range) {
    rangeSkip[range] = 0
    rangeStrikes.past = 0
    await runRange($, range)
  }
}

/** One of the strip's Buttons pressed: its page counted from the page on screen at the press, on the picked tab. */
async function stepPast($: EngineInterface, step: StepSpec): Promise<void> {
  const unit = UNIT_OF[picked]
  if (unit) await selectBack($, unit, step.to(pickedBacks[unit]))
}

/**
 * The page the strip's post (`ui.message`) asks for on the picked tab, or null: code sent it, so it is input to check,
 * never a fact. A step (◀ ▶ « », older positive) counts from the page on screen now, so quick clicks each turn one,
 * and stops at now and MAX_BACK; a page (a window, NOW) is taken as it is, a whole one no further than MAX_BACK.
 */
function askedPage(data: unknown): { unit: OfficeUnit; back: number } | null {
  const unit = UNIT_OF[picked]
  const asked = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as { unit?: unknown; back?: unknown; step?: unknown }) : {}
  if (!unit || asked.unit !== unit) return null
  const isWhole = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n)
  if (isWhole(asked.step) && asked.back === undefined) return { unit, back: Math.min(MAX_BACK[unit], Math.max(0, pickedBacks[unit] + asked.step)) }
  if (isWhole(asked.back) && asked.step === undefined && asked.back >= 0 && asked.back <= MAX_BACK[unit]) return { unit, back: asked.back }
  return null
}

// ---------------------------------------------------------------- timelapse

/**
 * Run the collector for the timelapse of `range` and keep its facts. Only the person asks for one (the tab or a range
 * pressed, the pane opening or coming back on the tab with nothing to draw), never the watcher or the heartbeat: a new
 * source reloads the pane's frame and its replay starts over. The picked range's facts are drawn at once (written to
 * the state, the text replay from its first frame); another range's wait for its press. One run per range at a time: a
 * press while one is under way is answered by it. A failure keeps the last facts and, for the picked range, says why
 * (drawn while there are none). A range with nothing kept gets the engine's longest wait: a cold month builds first.
 */
async function runLapse($: EngineInterface, range: Lapse): Promise<void> {
  if (isLapseRunning[range]) return
  isLapseRunning[range] = true
  try {
    const answer = await collectFacts($, ['timelapse', range, '--json'], !(await hasLapse($, range)))
    if (!isPaneOpen) return
    const facts = typeof answer !== 'string' && isTimeline(answer.timeline, range) ? answer : null
    if (facts === null) {
      const why = typeof answer === 'string' ? answer : `the collector answer has no timeline of ${lapseOf(range).words}`
      $.ui.log(`theoffice: the ${range} timelapse failed: ${why}; keeping its last facts`, { to: 'debug' })
      if (range === pickedLapse && (await read($, lapseTrouble)) !== why) await update($, lapseTrouble, () => why)
      return
    }
    lapseLatest[range] = facts
    if (range !== pickedLapse) return
    await update($, lapseFacts, () => facts)
    if ((await read($, lapseTrouble)) !== null) await update($, lapseTrouble, () => null)
    if (picked === 'timelapse') await update($, frame, () => 0)
  } catch (error) {
    $.ui.log(`theoffice: the ${range} timelapse failed: ${errorText(error)}`, { to: 'debug' })
  } finally {
    isLapseRunning[range] = false
  }
}

/** Whether facts of `range` are kept: this load's, or the state's (the picked range's, which outlive a reload). */
async function hasLapse($: EngineInterface, range: Lapse): Promise<boolean> {
  return lapseLatest[range] !== null || (await read($, lapseFacts))?.timeline?.kind === range
}

/** The pane opened or came back on screen on the Timelapse tab: its picked range runs only when nothing is kept for it. */
async function lapseIfNone($: EngineInterface): Promise<void> {
  if (!(await hasLapse($, pickedLapse))) await runLapse($, pickedLapse)
}

/**
 * The person pressed a range of the Timelapse tab (a Button's onPress, never a drawing): it is drawn at once from the
 * facts kept for it, if any, its text replay from the first frame, $.store keeps the pick for the next sessions, and
 * its collector runs again, even for the range on screen (the press asks for the replay afresh). A refused write costs
 * only that write.
 */
async function selectLapse($: EngineInterface, next: Lapse): Promise<void> {
  pickedLapse = next
  turnPage($)
  try {
    if ((await read($, lapse)) !== next) await update($, lapse, () => next)
    const kept = lapseLatest[next]
    if (kept) await update($, lapseFacts, () => kept)
    if ((await read($, lapseTrouble)) !== null) await update($, lapseTrouble, () => null)
    await update($, frame, () => 0)
  } catch (error) {
    $.ui.log(`theoffice: could not switch to the ${next} timelapse (${errorText(error)})`, { to: 'debug' })
  }
  try {
    await $.store.set(STORE_LAPSE, next)
  } catch (error) {
    $.ui.log(`theoffice: could not keep the ${next} timelapse (${errorText(error)})`, { to: 'debug' })
  }
  await runLapse($, next)
}

/**
 * At session start (and after a hot reload): the range the person picked last, from $.store, else the state's. An
 * export the reload cut short no longer holds the Export Button.
 */
async function restoreLapse($: EngineInterface): Promise<void> {
  if (!isExporting) await markExport($, false)
  if (!isMonthExporting) await markMonthExport($, false)
  pickedLapse = await read($, lapse)
  let kept: unknown
  try {
    kept = await $.store.get(STORE_LAPSE)
  } catch (error) {
    $.ui.log(`theoffice: could not read the kept timelapse (${errorText(error)})`, { to: 'debug' })
    return
  }
  if (!isLapse(kept) || kept === pickedLapse) return
  pickedLapse = kept
  await update($, lapse, () => kept)
}

/**
 * The person pressed Export (a Button's onPress): the collector saves the picked range as a page and an SVG in its
 * cache folder and opens the page in the browser, whose player saves it as a GIF, a video or an SVG. One at a time: a
 * press while one runs is ignored (the Button says it is exporting). A toast says where the page went, or why it did
 * not, in a few words; off the terminal the page stays named under the row (`lapseSaved`).
 */
async function exportLapse($: EngineInterface): Promise<void> {
  if (isExporting) return
  isExporting = true
  const range = pickedLapse
  try {
    await markExport($, true)
    const saved = await savePage($, range)
    if ('why' in saved) {
      $.ui.log(`theoffice: the ${range} timelapse was not saved: ${saved.why}`, { to: 'debug' })
      $.ui.toast(`The timelapse could not be saved: ${saved.why}.`)
      return
    }
    savedLapse = range
    $.ui.toast(`The timelapse is saved and opening in your browser: ${saved.page}. Save it there as a GIF, a video or an SVG.`, { timeoutMs: SAVED_TOAST_MS })
    await update($, lapseSaved, () => saved.page)
  } catch (error) {
    $.ui.log(`theoffice: could not keep the saved timelapse (${errorText(error)})`, { to: 'debug' })
  } finally {
    isExporting = false
    await markExport($, false)
  }
}

/**
 * One export run (`timelapse <range> --export --open`): the page's path (its first line, kept only as an absolute path
 * to an .html file), or why there is none, in a few words of our own (never what the run printed).
 */
async function savePage($: EngineInterface, range: Lapse): Promise<{ page: string } | { why: string }> {
  try {
    const argv = ['node', `${$.plugin.root}/scripts/office.mjs`, 'timelapse', range, '--export', '--open']
    const ran = await $.process.run(argv, { timeoutMs: EXPORT_TIMEOUT_MS })
    if (ran.exitCode !== 0) return { why: `the export exited with code ${ran.exitCode}` }
    const page = (ran.stdout.split('\n', 1)[0] ?? '').trim()
    return PAGE_RE.test(page) ? { page } : { why: 'the export named no page' }
  } catch (error) {
    return { why: `the export did not run (${errorText(error)})` }
  }
}

/** The Export Button follows the run (`⤓ Exporting…` while one goes); a refused write costs only its look. */
async function markExport($: EngineInterface, isOn: boolean): Promise<void> {
  try {
    if ((await read($, lapseExporting)) !== isOn) await update($, lapseExporting, () => isOn)
  } catch (error) {
    $.ui.log(`theoffice: could not mark the export (${errorText(error)})`, { to: 'debug' })
  }
}

// ---------------------------------------------------------------- the Month's export

/**
 * The Month's Export key, pressed (the strip's post, or its Button): the row that asks what to export opens under the
 * strip, or closes when it is open. Only on the Month, and never while an export runs (the key says so).
 */
async function toggleExport($: EngineInterface): Promise<void> {
  if (picked !== 'month' || isMonthExporting) return
  try {
    const next: MonthAsk = (await read($, monthAsk)) === null ? 'what' : null
    await update($, monthAsk, () => next)
  } catch (error) {
    $.ui.log(`theoffice: could not open the export row (${errorText(error)})`, { to: 'debug' })
  }
}

/** The export row closed, as a tab switch closes it; a refused write costs only its look. */
async function closeExport($: EngineInterface): Promise<void> {
  try {
    if ((await read($, monthAsk)) !== null) await update($, monthAsk, () => null)
  } catch (error) {
    $.ui.log(`theoffice: could not close the export row (${errorText(error)})`, { to: 'debug' })
  }
}

/**
 * A key of the export row, pressed (its post or its Button), checked against what the row asks now: a part asks how to
 * keep it, Back asks what again, a format of the part exports it. Anything else, or a press while an export runs, is
 * no press.
 */
async function answerExport($: EngineInterface, id: string): Promise<void> {
  if (picked !== 'month' || isMonthExporting) return
  try {
    const ask = await read($, monthAsk)
    const next = nextAsk(ask, id)
    if (next !== undefined) await update($, monthAsk, () => next)
    else if (ask !== null && ask !== 'what' && formatsOf(ask).some(f => f.format === id)) await exportMonth($, ask, id as OfficeMonthFormat)
  } catch (error) {
    $.ui.log(`theoffice: could not answer the export row (${errorText(error)})`, { to: 'debug' })
  }
}

/** What the row asks after `id` is pressed while it asks `ask`: a part's how, or what again (Back); undefined for anything else. */
function nextAsk(ask: MonthAsk, id: string): MonthAsk | undefined {
  if (ask === 'what') return PARTS.find(p => p.part === id)?.part
  return ask !== null && id === BACK ? 'what' : undefined
}

/**
 * Export `part` of the Month's page on screen as `format` (one at a time; the row closes and the Export key says it is
 * at work): the collector draws it from the facts the tab draws, handed on stdin (else it reads the page itself), keeps
 * it in its cache folder and opens it (a page in the browser, which saves a PNG, a GIF or a video to its downloads) or
 * shows it in its folder. A toast says where it went, or why it did not, in a few words; off the terminal the file
 * stays named under the strip while that page is on screen (`monthSaved`).
 */
async function exportMonth($: EngineInterface, part: OfficeMonthPart, format: OfficeMonthFormat): Promise<void> {
  if (isMonthExporting) return
  isMonthExporting = true
  const back = pickedBacks.month
  const page = monthPageKey(back)
  const spec = partOf(part)
  const when = back ? safely(() => pageName('month', back, dayNow ?? ''), '') || 'that month' : 'last month and this one'
  try {
    await update($, monthAsk, () => null)
    await markMonthExport($, true)
    const saved = await saveMonth($, part, format, back, await monthOnScreen($, back))
    if ('why' in saved) {
      $.ui.log(`theoffice: the ${part} of month ${back} was not exported as ${format}: ${saved.why}`, { to: 'debug' })
      $.ui.toast(`${capital(spec.words)} could not be exported: ${saved.why}.`)
      return
    }
    $.ui.toast(savedToast(spec, formatOf(format), when, saved.file), { timeoutMs: SAVED_TOAST_MS })
    await update($, monthSaved, () => ({ file: saved.file, page }))
  } catch (error) {
    $.ui.log(`theoffice: could not keep the Month export (${errorText(error)})`, { to: 'debug' })
  } finally {
    isMonthExporting = false
    await markMonthExport($, false)
  }
}

/**
 * One Month export run (`month [--back N] --export <part> --as <format> --open`, then `--stdin` with the facts): the
 * file's path (its first line, kept only as an absolute path to an .html, .svg, .csv or .json file), or why there is
 * none, in a few words of our own (never what the run printed).
 */
async function saveMonth(
  $: EngineInterface, part: OfficeMonthPart, format: OfficeMonthFormat, back: number, facts: OfficeFacts | null,
): Promise<{ file: string } | { why: string }> {
  try {
    const argv = [
      'node', `${$.plugin.root}/scripts/office.mjs`, 'month', ...(back ? ['--back', String(back)] : []), '--export', part, '--as', format, '--open',
      ...(facts ? ['--stdin'] : []),
    ]
    const ran = await $.process.run(argv, { timeoutMs: EXPORT_TIMEOUT_MS, ...(facts ? { stdin: JSON.stringify(facts) } : {}) })
    if (ran.exitCode !== 0) return { why: `the export exited with code ${ran.exitCode}` }
    const file = (ran.stdout.split('\n', 1)[0] ?? '').trim()
    return FILE_RE.test(file) ? { file } : { why: 'the export named no file' }
  } catch (error) {
    return { why: `the export did not run (${errorText(error)})` }
  }
}

/**
 * The facts of the Month's page `back` as its tab draws them (the newest of now; a page of the past kept or held, the
 * floor of now over it), or null when there are none yet: the export then reads the page itself.
 */
async function monthOnScreen($: EngineInterface, back: number): Promise<OfficeFacts | null> {
  if (!back) return latest.month ?? (await read($, monthFacts))
  const page = pageOn('month', { ...pickedBacks, month: back })
  if (!page) return null
  const held = await read($, pastFacts)
  const own = pages.get(page.key) ?? (isPage(held, 'month', page.key) ? held : null)
  return own && withFloor(own, latest.all ?? (await read($, snapshot)))
}

/** Which Month page an export was of: `month:now`, or the page of the past's key (`month:2026-09-01`). */
function monthPageKey(back: number): string {
  return back ? pageOn('month', { ...pickedBacks, month: back })?.key ?? `month:-${back}` : 'month:now'
}

/** What the toast says once a Month export is saved: where, and, for a page, that the browser saves the file. */
function savedToast(part: PartSpec, format: FormatSpec, when: string, file: string): string {
  const what = `${capital(part.words)} of ${when}`
  const verb = part.part === 'stats' ? 'are' : 'is'
  if (IN_BROWSER.has(format.format)) return `${what} ${verb} opening in your browser, which saves it as ${format.words} to your downloads: ${file}.`
  if (format.format === 'html') return `${what} ${verb} saved and opening in your browser: ${file}.`
  return `${what} ${verb} saved as ${format.words}, shown in its folder: ${file}.`
}

/** The Export key and its Button follow the run (busy while one goes); a refused write costs only its look. */
async function markMonthExport($: EngineInterface, isOn: boolean): Promise<void> {
  try {
    if ((await read($, monthExporting)) !== isOn) await update($, monthExporting, () => isOn)
  } catch (error) {
    $.ui.log(`theoffice: could not mark the Month export (${errorText(error)})`, { to: 'debug' })
  }
}

function partOf(part: OfficeMonthPart): PartSpec {
  return PARTS.find(p => p.part === part) ?? PARTS[0]!
}

/** How the row asks to keep `part`: the stats as a page, CSV or JSON; a drawing as a PNG, an SVG, a GIF or a video. */
function formatsOf(part: OfficeMonthPart): readonly FormatSpec[] {
  return part === 'stats' ? STATS_FORMATS : DRAWING_FORMATS
}

function formatOf(format: OfficeMonthFormat): FormatSpec {
  return [...DRAWING_FORMATS, ...STATS_FORMATS].find(f => f.format === format) ?? DRAWING_FORMATS[0]!
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Whether a strip's post is its Export key's (`{ unit: 'month', act: 'export' }`): code sent it, so it is checked. */
function isExportPost(data: unknown): boolean {
  const asked = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as { unit?: unknown; act?: unknown }) : {}
  return asked.unit === 'month' && asked.act === 'export' && picked === 'month'
}

// ---------------------------------------------------------------- sound

/**
 * A press of a tab, a range of the Timelapse or a page of the Month turns a page: one soft paper flip, always, and the
 * pane's only sound. Two at most turn at once, so a quick run of presses never piles up (the engine refuses a plugin's
 * fifth clip); a platform with no player plays nothing, and a flip that cannot play says so once in the debug log.
 */
function turnPage($: EngineInterface): void {
  if (turning >= 2) return
  turning++
  void (async () => {
    try {
      await $.audio.play({ asset: PAGE_TURN }, { gain: PAGE_GAIN })
    } catch (error) {
      if (!isTurnTold) $.ui.log(`theoffice: a page turn did not play (${errorText(error)})`, { to: 'debug' })
      isTurnTold = true
    } finally {
      turning--
    }
  })()
}

// ---------------------------------------------------------------- cadence

/** The watcher follows the pane (1.5 s on screen, 6 s behind another tab, 30 s closed), and so does the frame clock. */
function schedule($: EngineInterface): void {
  watcher?.cancel()
  watcher = $.clock.every(!isPaneOpen ? WATCH_CLOSED_MS : isPaneShown ? WATCH_SHOWN_MS : WATCH_HIDDEN_MS, () => void watch($))
  animate($)
}

/**
 * The 700 ms frame clock, exactly while moving text is on screen: the pane open, placed and not behind another tab (a
 * hidden pane would just churn state writes), drawn on a terminal (the only surface that draws text) and on the Live
 * tab or the Timelapse, the only text that moves (the floor plan, the replay). The pixel-art SVG animates itself and
 * never reads `frame`. Every call cancels the last clock first, so a switch never
 * leaves two running.
 */
function animate($: EngineInterface): void {
  anim?.cancel()
  const isMoving = picked === 'all' || picked === 'timelapse'
  anim = isPaneOpen && isPaneShown && hasTerminal && isMoving ? $.clock.every(FRAME_MS, () => void nextFrame($)) : undefined
}

/**
 * The person asked for the pane (/theoffice, a tab's name after it, or the band's Button): it opens, or comes forward
 * when it is open behind another tab (`row`, the pane list's row for it), on `next` when a tab was named. Says whether
 * a surface draws it now.
 */
async function openPane($: EngineInterface, row: UiPane | undefined, next?: OfficeTab): Promise<UiOpenResult> {
  if (next) await pickTab($, next)
  const opened = await $.ui.open({ id: PANE, title: TITLE, columns: DOCK_COLUMNS, ...(row ? { focus: true as const } : {}) })
  setPane($, true)
  setShown($, opened.isPlaced)
  void refresh($, true)
  void watch($)
  const range = rangeOf(picked)
  if (range) void runRange($, range)
  // the Timelapse named runs afresh (a new replay); on it already, it runs only with nothing to draw
  if (next === 'timelapse') void runLapse($, pickedLapse)
  else if (picked === 'timelapse') void lapseIfNone($)
  return opened
}

/**
 * Opens The Office in the person's browser (scripts/dashboard.mjs `--detach --reuse --open`), on `asked` or the pane's
 * tab, page, range, Quiet and Zoom: the desktop pane's pixel art, its menu and keys, kept live by the server. A server
 * already running is opened again rather than started twice; it stops by itself once no page has been open for half an
 * hour. Hands back the page's address, or why there is none in a few words of our own (never what the run printed).
 */
async function openInBrowser($: EngineInterface, asked?: OfficeTab): Promise<{ url: string } | { why: string }> {
  const view = asked ?? picked
  const argv = ['node', `${$.plugin.root}/scripts/dashboard.mjs`, '--detach', '--reuse', '--open', '--view', view === 'all' ? 'live' : view]
  const unit = UNIT_OF[view]
  if (unit && pickedBacks[unit]) argv.push('--back', String(pickedBacks[unit]))
  if (view === 'timelapse') argv.push('--range', pickedLapse)
  try {
    if (view === 'all' && (await read($, quiet))) argv.push('--quiet')
    if (await read($, zoom)) argv.push('--zoom')
    const ran = await $.process.run(argv, { timeoutMs: BROWSER_TIMEOUT_MS })
    if (ran.exitCode !== 0) return { why: `the server exited with code ${ran.exitCode}` }
    const url = (ran.stdout.split('\n', 1)[0] ?? '').trim()
    return BROWSER_URL_RE.test(url) ? { url } : { why: 'the server named no page' }
  } catch (error) {
    return { why: `the server did not start (${errorText(error)})` }
  }
}

/** The pane's Browser key: The Office opens in the browser, and a toast says so, or why not. */
async function pressBrowser($: EngineInterface): Promise<void> {
  if (isOpeningBrowser) return
  isOpeningBrowser = true
  try {
    const opened = await openInBrowser($)
    if ('why' in opened) {
      $.ui.log(`theoffice: the browser's office did not open: ${opened.why}`, { to: 'debug' })
      $.ui.toast(`The Office could not open in your browser: ${opened.why}.`)
    } else $.ui.toast('The Office is open in your browser, in pixel art. It updates by itself.', { timeoutMs: SAVED_TOAST_MS })
  } finally {
    isOpeningBrowser = false
  }
}

/**
 * The person pressed Open The Office in the band: the pane opens or comes forward, and a toast says why it waits. In a
 * console The Office opens in the browser instead.
 */
async function pressOpen($: EngineInterface): Promise<void> {
  if (isConsole) return pressBrowser($)
  try {
    const opened = await openPane($, await paneRow($))
    if (!opened.isPlaced) $.ui.toast(`The Office opens when there is room (${opened.reason}).`)
  } catch (error) {
    $.ui.log(`theoffice: could not open the pane (${errorText(error)})`, { to: 'debug' })
  }
}

// ---------------------------------------------------------------- the frame: the office on a screen of its own

/**
 * Asks the frame's launcher one thing (scripts/dashboard.mjs `--frame … --json`): where the frame stands (`status`,
 * which starts nothing), or what a key of its row asks (FRAME_ARGS). Hands back where it stands now, checked
 * (readFrame), or why there is no answer in a few words of our own (never what the run printed).
 */
async function runFrame($: EngineInterface, ask: FrameAsk): Promise<OfficeFrameLink | { why: string }> {
  try {
    const ran = await $.process.run(['node', `${$.plugin.root}/scripts/dashboard.mjs`, '--frame', ...FRAME_ARGS[ask], '--json'], { timeoutMs: FRAME_TIMEOUT_MS })
    if (ran.exitCode !== 0) return { why: `its launcher exited with code ${ran.exitCode}` }
    return readFrame(ran.stdout) ?? { why: 'its launcher said nothing to read' }
  } catch (error) {
    return { why: `its launcher did not run (${errorText(error)})` }
  }
}

/**
 * One ask of the launcher at a time (the row's key says it is at work, `frameBusy`); what it says is kept (`frameLink`),
 * which the panel draws. A press while one runs is no press.
 */
async function askFrame($: EngineInterface, ask: FrameAsk): Promise<OfficeFrameLink | { why: string }> {
  if (isFrameAsked) return { why: 'it is already at work' }
  isFrameAsked = true
  await markFrame($, ask)
  try {
    const said = await runFrame($, ask)
    if ('why' in said) {
      $.ui.log(`theoffice: the frame (${ask}): ${said.why}`, { to: 'debug' })
      return said
    }
    await update($, frameLink, () => said).catch(error => $.ui.log(`theoffice: could not keep where the frame stands (${errorText(error)})`, { to: 'debug' }))
    return said
  } finally {
    isFrameAsked = false
    await markFrame($, null)
  }
}

/** The row's key follows the run; a refused write costs only its look. */
async function markFrame($: EngineInterface, ask: FrameAsk | null): Promise<void> {
  try {
    if ((await read($, frameBusy)) !== ask) await update($, frameBusy, () => ask)
  } catch (error) {
    $.ui.log(`theoffice: could not mark the frame's run (${errorText(error)})`, { to: 'debug' })
  }
}

/**
 * The Frame key, pressed (its Button, the pixel menu's, or Back in its row): its panel comes on screen in place of the
 * tab's drawing and the launcher is asked where the frame stands (nothing is started), or the panel goes and the tab's
 * drawing is back. It makes no sound: it turns no page.
 */
async function toggleFrame($: EngineInterface): Promise<void> {
  try {
    const isOpen = await update($, framePanel, was => !was)
    if (isOpen) void askFrame($, 'status')
  } catch (error) {
    $.ui.log(`theoffice: could not press Frame (${errorText(error)})`, { to: 'debug' })
  }
}

/** The panel closed, as a tab pressed or the pane closing closes it; a refused write costs only its look. */
async function closeFrame($: EngineInterface): Promise<void> {
  try {
    if (await read($, framePanel)) await update($, framePanel, () => false)
  } catch (error) {
    $.ui.log(`theoffice: could not close the Frame panel (${errorText(error)})`, { to: 'debug' })
  }
}

/** Whether a key of the row may be pressed where the frame stands: Turn on while it is off, the others while it is on. */
function mayFrame(act: FrameAct, link: OfficeFrameLink | null): boolean {
  return (act === 'start') !== (link?.running === true)
}

/**
 * A key of the Frame's row, pressed (its post or its Button), checked against where the frame stands: Turn on starts
 * it, on the person's network, Turn off stops it, New link gives it another address (every screen then needs the new
 * one). A toast says how it went, in a few words; the panel draws where it stands now.
 */
async function pressFrame($: EngineInterface, act: FrameAct): Promise<void> {
  if (isFrameAsked) return
  let link: OfficeFrameLink | null = null
  try {
    link = await read($, frameLink)
  } catch { /* unknown: only Turn on may be pressed */ }
  if (!mayFrame(act, link)) return
  const said = await askFrame($, act)
  if ('why' in said) $.ui.toast(`The Office's frame did not answer: ${said.why}.`)
  else $.ui.toast(frameToast(act, said), { timeoutMs: SAVED_TOAST_MS })
}

/** What a toast says once a key of the row has been answered. */
function frameToast(act: FrameAct, link: OfficeFrameLink): string {
  if (!link.running) return "The Office's frame is off. Its link is kept: the same address works when it is on again."
  if (!link.lan) return "The Office's frame is on, on this computer only."
  if (!link.urls.length) return "The Office's frame is on, but this computer is on no network: no screen can reach it yet."
  if (act === 'renew') return "The Office's frame has a new link: every screen needs the new address."
  return 'The Office is on your network, for a screen to show: scan the code, or open the address on it.'
}

/**
 * `/theoffice frame`, with `on`, `off` or `new` after it or nothing (where it stands, nothing started): the launcher is
 * asked, and where the frame stands now is said. Where there is a pane it opens on the Frame's panel, which holds the
 * code and the address; a console has none, and gets them in words, the code in half blocks.
 */
async function commandFrame($: EngineInterface, act: FrameAct | undefined): Promise<string> {
  const said = await askFrame($, act ?? 'status')
  if ('why' in said) return `The Office's frame did not answer: ${said.why}.`
  const keys = '/theoffice frame on turns it on, /theoffice frame off turns it off, /theoffice frame new replaces its link.'
  if (isConsole) return [...frameText({ link: said, columns: 80 }), '', keys].join('\n')
  try {
    if (!(await read($, framePanel))) await update($, framePanel, () => true)
  } catch (error) {
    $.ui.log(`theoffice: could not open the Frame panel (${errorText(error)})`, { to: 'debug' })
  }
  const opened = await openPane($, await paneRow($))
  const where = opened.isPlaced ? (said.running ? 'Its code and address are in the pane.' : 'Turn on, in the pane, starts it.') : `The pane opens when there is room (${opened.reason}).`
  return `The Office's frame is ${frameState(said)}. ${where}`
}

/**
 * Whether the pane is on screen (open, placed, not behind another tab), as the band reads it: its Button shows only
 * while it is not. Written only when that changes; a refused write leaves the Button as it was.
 */
function markScreen($: EngineInterface): void {
  const isShownNow = isPaneOpen && isPaneShown
  if (isShownNow === markedUp) return
  markedUp = isShownNow
  update($, onScreen, () => isShownNow).catch(error => $.ui.log(`theoffice: could not update the band (${errorText(error)})`, { to: 'debug' }))
}

/**
 * The pane opened or closed. Opened afresh it draws afresh (its clocks start from now): what it drew before is
 * forgotten. Closed, the watcher looks at nothing, so what it last saw is forgotten too, and what only the pane reads.
 */
function setPane($: EngineInterface, isOpen: boolean): void {
  if (!isOpen) isPaneShown = false
  if (isOpen !== isPaneOpen) {
    isPaneOpen = isOpen
    if (isOpen) drawings.clear()
    else {
      seen = undefined
      forgetPane($).catch(error => $.ui.log(`theoffice: could not let go of the pane (${errorText(error)})`, { to: 'debug' }))
    }
    schedule($)
  }
  markScreen($)
}

/**
 * The pane closed: what only it reads goes with it, or a session that looked at a month once would hold it for as long
 * as it lives, days at times: the pages of the past read too. The week's facts stay, for the status line, and the
 * pages picked. A run under way drops its answer as it lands (refreshRange, readPast, runLapse), and a tab opened
 * again fetches its own, as on a first press.
 */
async function forgetPane($: EngineInterface): Promise<void> {
  drawings.clear()
  lapseDrawn.clear()
  sessionRecords.clear()
  sessionRuns.clear()
  for (const range of ['today', 'month'] as const) {
    latest[range] = null
    lastKey[range] = ''
  }
  latest.past = null
  pages.clear()
  for (const { lapse: range } of LAPSES) lapseLatest[range] = null
  // what a pane opened again in the meantime has fetched stays
  const gone = <T,>(held: T): T | null => (isPaneOpen ? held : null)
  await Promise.all([
    update($, todayFacts, gone), update($, monthFacts, gone), update($, pastFacts, gone), update($, lapseFacts, gone),
    update($, rangeTrouble, gone), update($, lapseTrouble, gone), update($, pastReading, reading => isPaneOpen && reading),
    // the Frame's panel too: the pane opens on its tab again (the frame itself runs on, whatever the pane does)
    update($, framePanel, shown => isPaneOpen && shown),
  ])
}

/**
 * The pane came on screen or went behind another tab (or out of its slot): the watcher's cadence and the frame clock
 * follow, a Today or Month tab coming back on screen fetches its facts at once (they are not fetched while hidden), a
 * page of the past and the Timelapse their own only when they have none, and after a long look away a pixel drawing
 * put on screen long ago is drawn again (reanchor).
 */
function setShown($: EngineInterface, isShown: boolean): void {
  if (isShown === isPaneShown) return
  isPaneShown = isShown
  markScreen($)
  schedule($)
  const since = hiddenAt
  // a refused clock reads as no time at all: the reanchor then keeps the frame
  hiddenAt = !isShown && isPaneOpen ? $.clock.now().catch(() => NaN) : undefined
  if (!isShown || !isPaneOpen) return
  const range = rangeOf(picked)
  if (range && rangeSkip[range] === 0) void runRange($, range)
  if (picked === 'timelapse') void lapseIfNone($)
  if (since) void reanchor($, since)
}

/**
 * The pane is back on screen after a look away that began at `since`. A surface that dropped the hidden frame draws
 * the same source afresh, its clocks phased from when that source first went on screen; one that kept it shows it as
 * it was, and a new source would only reload it. So only after more than REANCHOR_MS away are the pixel drawings
 * older than REANCHOR_MS redrawn (the tab's facts written again, the drawings forgotten), their clocks from now. The
 * Timelapse has no clock to phase (its replay starts when its frame loads) and is never redrawn here: it would start over.
 */
async function reanchor($: EngineInterface, since: Promise<number>): Promise<void> {
  if (picked === 'timelapse') return
  try {
    const now = await $.clock.now()
    if (!(now - (await since) > REANCHOR_MS)) return
    const stale = [...drawings].filter(([, d]) => d.kind === 'pixel' && d.view === picked && d.clockAt !== undefined && now - d.clockAt > REANCHOR_MS)
    const source = sourceOf(picked)
    const facts = latest[source]
    if (!stale.length || !facts) return
    for (const [surface] of stale) drawings.delete(surface)
    if (source === 'all') await update($, snapshot, () => facts)
    else await keepRange($, source, facts)
  } catch (error) {
    $.ui.log(`theoffice: could not redraw the pane (${errorText(error)})`, { to: 'debug' })
  }
}

async function nextFrame($: EngineInterface): Promise<void> {
  await update($, frame, n => (n + 1) % 1_000_000)
}

async function paneRow($: EngineInterface): Promise<UiPane | undefined> {
  return (await $.ui.panes()).find(pane => pane.id === PANE)
}

async function isUp($: EngineInterface): Promise<boolean> {
  return (await paneRow($)) !== undefined
}

/**
 * The pixel art of a tab for the pane on `surface`: the same source as that surface drew last when the facts would
 * not replace it (pixelMoved: so a redraw the engine makes for its own reasons, a focus or a scroll, hands the frame
 * the very same string, and a busy desk's new tool waits its turn), else drawn afresh with its clocks phased from now,
 * the moment the frame loads it. What it hands over is what the runs compare against.
 */
async function pixelSource($: EngineInterface, surface: string, facts: OfficeFacts, view: FreshTab, width: number, isQuiet: boolean, isZoomed: boolean): Promise<string> {
  const drawn = drawings.get(surface)
  const now = await $.clock.now()
  if (drawn?.kind === 'pixel' && drawn.view === view && drawn.width === width && drawn.isQuiet === isQuiet && drawn.isZoomed === isZoomed && !pixelMoved(drawn, facts, now)) {
    return drawn.source
  }
  const clockAt = anchorOf(facts, now)
  const plain = pixelSvg(facts, view, width, clockAt, isQuiet, isZoomed)
  const source = onBeat(plain)
  drawings.set(surface, { kind: 'pixel', view, facts, width, isQuiet, isZoomed, source, plain, clockAt, at: now })
  return source
}

/**
 * What `/theoffice` was asked: a leading `/` dropped, case ignored. No word at all toggles; `open` and `close` say
 * which (`close` wins over every other word); a tab's name (TAB_WORDS) opens or raises the pane on that tab, the last
 * one named winning; `browser` opens The Office in the browser instead, on the tab named or the pane's; any other word
 * makes it `unknown`, which changes nothing, so a typo or a word from an older version never closes or opens the pane.
 */
function readCommand(args: unknown): { action: 'toggle' | 'open' | 'close' | 'browser' | 'frame' | 'unknown'; tab?: OfficeTab; act?: FrameAct } {
  const words = String(args ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).map(w => w.replace(/^\/+/, ''))
  // `frame`, alone or with one of its own words after it (on, off, new): never mixed with a tab or another word
  if (words[0] === FRAME_KEY) {
    if (words.length === 1) return { action: 'frame' }
    const act = words.length === 2 ? FRAME_WORDS.get(words[1] ?? '') : undefined
    return act ? { action: 'frame', act } : { action: 'unknown' }
  }
  if (words.some(word => word !== 'open' && word !== 'close' && word !== BROWSER_WORD && !TAB_WORDS.has(word))) return { action: 'unknown' }
  if (words.includes('close')) return { action: 'close' }
  let tab: OfficeTab | undefined
  for (const word of words) tab = TAB_WORDS.get(word) ?? tab
  if (words.includes(BROWSER_WORD)) return tab ? { action: 'browser', tab } : { action: 'browser' }
  if (tab) return { action: 'open', tab }
  return { action: words.includes('open') ? 'open' : 'toggle' }
}

// ---------------------------------------------------------------- pure helpers

/**
 * The launcher's `--frame … --json` answer, checked: where the frame stands, or null when the line is not one. Its
 * addresses are drawn and said, so each must read as one of this computer's on the network (FRAME_URL_RE) and its own
 * as the loopback one; an answer with any other is no answer.
 */
function readFrame(stdout: string): OfficeFrameLink | null {
  let said: unknown
  try {
    said = JSON.parse(stdout.split('\n', 1)[0] ?? '')
  } catch {
    return null
  }
  if (said === null || typeof said !== 'object' || Array.isArray(said)) return null
  const f = said as { spec?: unknown; running?: unknown; lan?: unknown; urls?: unknown; local?: unknown }
  if (f.spec !== 'theoffice-frame/1' || typeof f.running !== 'boolean' || typeof f.lan !== 'boolean' || !Array.isArray(f.urls) || typeof f.local !== 'string') return null
  if (!f.running) return { running: false, lan: false, urls: [], local: '' }
  const urls = f.urls.filter((url): url is string => typeof url === 'string' && FRAME_URL_RE.test(url))
  if (urls.length !== f.urls.length || urls.length > 8 || !FRAME_LOCAL_RE.test(f.local)) return null
  return { running: true, lan: f.lan, urls: f.lan ? urls : [], local: f.local }
}

function isFrameAct(x: unknown): x is FrameAct {
  return x === 'start' || x === 'stop' || x === 'renew'
}

function isFacts(x: unknown): x is OfficeFacts {
  if (!x || typeof x !== 'object') return false
  const f = x as Partial<OfficeFacts>
  return typeof f.spec === 'string' && f.spec.startsWith('theoffice/') && typeof f.now?.iso === 'string' && Array.isArray(f.live?.desks)
}

function isTab(x: unknown): x is OfficeTab {
  return TABS.some(t => t.view === x)
}

function isLapse(x: unknown): x is Lapse {
  return LAPSES.some(l => l.lapse === x)
}

function lapseOf(range: Lapse): LapseSpec {
  return LAPSES.find(l => l.lapse === range) ?? LAPSES[1]!
}

/**
 * Whether `t` is a timeline of `range` the renderers can replay: that kind, a whole number of slots on a grid of whole
 * slots a day, its days and its desks. The renderers clean the rest themselves (a broken desk draws, never throws).
 */
function isTimeline(t: unknown, range: Lapse): t is OfficeTimeline {
  if (!t || typeof t !== 'object') return false
  const x = t as Partial<OfficeTimeline>
  const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
  return x.kind === range && isCount(x.slots) && isCount(x.per_day) && x.per_day !== 0 && typeof x.slot_min === 'number'
    && Array.isArray(x.days) && Array.isArray(x.desks)
}

/** The range of an exported page by its name (`timelapse-<range>.html`, as the collector writes it), else the last one exported. */
function pageLapse(page: string): Lapse | null {
  const named = /timelapse-([a-z]+)\.html$/.exec(page)?.[1]
  return isLapse(named) ? named : savedLapse
}

/**
 * The range a tab draws from on its page (`b`, the pages the runs follow by default): a page of the past, else Today's
 * own and the Month's own, else none (the week's).
 */
function rangeOf(view: OfficeTab, b: OfficeBacks = pickedBacks): Range | null {
  const unit = UNIT_OF[view]
  if (unit && b[unit] > 0) return 'past'
  if (view === 'today') return 'today'
  return view === 'month' ? 'month' : null
}

function sourceOf(view: OfficeTab): Source {
  return rangeOf(view) ?? 'all'
}

function tabOf(view: OfficeTab): TabSpec {
  return TABS.find(t => t.view === view) ?? TABS[0]!
}

/**
 * The facts with every busy desk doing one and the same thing (at work, its tool and file unsaid; thinking reads as
 * working too) and no tool call counted (the totals' and each project's, by kind and in all): what changes with every
 * tool call. What they did (the Office's B1, the Work tab) prints those counts, a project's exact under 100, and its
 * shares cross whole percents, so without them here one call of a small week's kind would reload the frame at once.
 * Two facts whose calm drawings match differ only in that.
 */
function calmFacts(facts: OfficeFacts): OfficeFacts {
  const desks = facts.live.desks.map(d => (d.state === 'working' ? { ...d, activity: { kind: 'tools' } } : d))
  const projects = Array.isArray(facts.projects) ? facts.projects.map(p => ({ ...p, tool_calls: 0, activity: {} })) : facts.projects
  return { ...facts, live: { ...facts.live, desks }, projects, totals: { ...facts.totals, tool_calls: 0, activity: {} } }
}

/**
 * The pane's pixel art: a card (lib/svg.mjs `card`), its clocks running by themselves from `clockAt` (`liveClock`), the
 * Live tab with its names alone when `isQuiet` (lib/svg.mjs `quiet`), every tab's art bigger when `isZoomed` (lib/svg.mjs
 * `scale`, ZOOM_SCALE). As it goes on screen it is put on the beat (onBeat,
 * lib/svg-beat.mjs); the runs compare the drawing as it comes from here.
 */
function pixelSvg(facts: OfficeFacts, view: FreshTab, width: number, clockAt: number | undefined, isQuiet: boolean, isZoomed: boolean): string {
  return renderSvg(facts, {
    view, width, card: true, liveClock: true, ...(clockAt === undefined ? {} : { clockAt }), ...(isQuiet ? { quiet: true } : {}), ...(isZoomed ? { scale: ZOOM_SCALE } : {}),
  })
}

/**
 * The moment a drawing's clocks are phased from: the engine's clock when it is that of the facts (no earlier than a
 * minute before them, no later than a day after: a test's mock clock at 0 is not), else the facts' own now.
 */
function anchorOf(facts: OfficeFacts, clockNow: number): number | undefined {
  const at = Date.parse(facts.now.iso)
  if (Number.isFinite(clockNow) && Number.isFinite(at) && clockNow >= at - 60_000 && clockNow <= at + 86_400_000) return clockNow
  return Number.isFinite(at) ? at : undefined
}

/**
 * The timelapse for the pane on `surface`: the string it drew last when the facts, the width and the zoom are the same (a redraw
 * the engine makes for its own reasons hands the frame the very same string, so the replay runs on), else drawn
 * afresh. renderTimelapse is deterministic, so this only saves the drawing time; a card, like every tab.
 */
function lapseSource(surface: string, facts: OfficeFacts, width: number, isZoomed: boolean): string {
  const drawn = lapseDrawn.get(surface)
  if (drawn?.facts === facts && drawn.width === width && drawn.isZoomed === isZoomed) return drawn.source
  const source = renderTimelapse(facts, { width, card: true, ...(isZoomed ? { scale: ZOOM_SCALE } : {}) })
  lapseDrawn.set(surface, { facts, width, isZoomed, source })
  return source
}

const ENTITY: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/**
 * What the timelapse says to a reader that cannot see it: its own label (the range, its sessions and projects, its
 * busiest slot), unescaped, and that it loops.
 */
function lapseAlt(source: string): string {
  const label = /^<svg\b[^>]*?\saria-label="([^"]*)"/.exec(source)?.[1]
  if (!label) return `The Office, ${tabOf('timelapse').alt}`
  return `${label.replace(/&(?:amp|lt|gt|quot|#39);/g, m => ENTITY[m] ?? m)}, replayed in pixel art on a loop`
}

/** The text replay at the pane's width and the frame clock's frame (one loop lasts timelapseFrames frames). */
function lapseText(facts: OfficeFacts, columns: number, at: number): Line[] {
  return renderTimelapseText(facts, { width: columns, frame: at % timelapseFrames(facts) })
}

/** The text version of a tab as the runs compare it: its lines at frame 0 (the frame clock moves the rest). */
function textKey(facts: OfficeFacts, view: FreshTab, columns: number): string {
  return JSON.stringify(renderOffice(facts, { view: textView(view), width: columns, frame: 0 }))
}

const ISO_RE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:/

/**
 * Facts as a comparable string, for facts no drawing reads now: the facts minus the run's own bookkeeping (generated_at,
 * sources, notes), every timestamp to the minute (now.iso and range.to move by the millisecond on every run).
 */
function factsKey(facts: OfficeFacts): string {
  const { generated_at: _at, sources: _sources, notes: _notes, ...rest } = facts
  return JSON.stringify(rest, (_, v) => (typeof v === 'string' && ISO_RE.test(v) ? v.slice(0, 16) : v))
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return text.replace(/[\x00-\x1f\x7f-\x9f]+/g, ' ').slice(0, 160)
}

/**
 * The pane's body when a drawing threw: the tabs (and the row under them, `controls`, unless the pixel menu holds it)
 * and one dim line, so the pane stays open and the tab can change. Nothing redraws the Timelapse by itself
 * (`isReplay`), so there the line says a press does.
 */
function broken(
  Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, tabs: RenderElement, error: unknown, controls: RenderElement | undefined,
  isReplay: boolean,
): RenderElement {
  const next = isReplay ? 'A range pressed draws it again.' : 'It redraws with the next snapshot.'
  return (
    <Box flexDirection="column" gap={1}>
      {tabs}
      {controls}
      <Text dimColor>{`The Office could not be drawn (${errorText(error)}). ${next}`}</Text>
    </Box>
  )
}

/**
 * The pane's body while its facts are read: the tabs (and the row under them, `controls`), the waiting room (`room`, a
 * drawing that stays the same for the whole wait, where the surface draws one) and under it what is read, how far it
 * is (a bar and its step) and what to expect, in text that changes as it goes without reloading the drawing.
 */
function waitingRoom(
  Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, tabs: RenderElement, lines: ReturnType<typeof waitLines>,
  controls?: RenderElement, room?: RenderElement,
): RenderElement {
  return (
    <Box flexDirection="column" gap={1}>
      {tabs}
      {controls}
      {room}
      {waitBlock(Box, Text, lines)}
    </Box>
  )
}

/** What is read, how far it is and what to expect, as lines of text (key `waiting`): under a waiting room, or over a drawing kept meanwhile. */
function waitBlock(Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, lines: ReturnType<typeof waitLines>): RenderElement {
  return (
    <Box key="waiting" flexDirection="column">
      <Text bold>{lines.title}</Text>
      {lines.bar ? <Text mono>{lines.bar}</Text> : null}
      {lines.step ? <Text>{lines.step}</Text> : null}
      {lines.note ? <Text dimColor>{lines.note}</Text> : null}
    </Box>
  )
}

/** The pane's body while its facts are not there yet: the tabs (and the Timelapse's or the Month's row, `controls`) and why. */
function pending(Box: ElementConstructor<BoxProps>, Text: ElementConstructor<TextProps>, tabs: RenderElement, why: string, controls?: RenderElement): RenderElement {
  return (
    <Box flexDirection="column" gap={1}>
      {tabs}
      {controls}
      <Text dimColor>{why}</Text>
    </Box>
  )
}

/**
 * What a tab says while its facts are not there yet: still counting (a page of the past, named `name`, being read), or
 * why the last run failed. A first read that takes long (a new machine's first week, a month, a page far back) says so.
 */
function waiting(why: string | null, range: Range | null, name = ''): string {
  if (!range) {
    if (why) return `The Office could not be read yet: ${why}. Trying again shortly.`
    // no session on this machine has left an answer yet: its first run reads the week's sessions, once
    return sharedPath ? 'Opening The Office... counting desks.' : "Opening The Office for the first time... reading this week's sessions once, which can take a minute. After that it opens at once."
  }
  const what = range === 'today' ? "today's hours" : range === 'month' ? "this month's days" : name || 'that page'
  if (why) return `The Office could not read ${what} yet: ${why}. Trying again shortly.`
  // a month, or a page far back, read for the first time reads every session of it once
  if (range === 'past') return `Opening The Office... reading ${what}. The first time, a page far back can take a minute.`
  return range === 'month' ? `Opening The Office... counting ${what}. The first time they are all read once, which can take a minute or two.` : `Opening The Office... counting ${what}.`
}

/**
 * What the Timelapse says while its range's facts are not there yet: rewinding, or why the run failed. Nothing runs it
 * again by itself, so it says which press does.
 */
function waitingLapse(why: string | null, range: Lapse): string {
  const { words, label } = lapseOf(range)
  return why ? `The Office could not replay ${words} yet: ${why}. Press ${label} to try again.` : `Opening The Office... rewinding ${words}.`
}

/**
 * The tab row as Buttons, where there is no pixel menu (a terminal, VS Code, mobile, a menu that failed): one per tab,
 * each with its own key and hotkey digit; the selected one is the primary button, the others dim. A press only calls
 * `choose`, which writes state from the press, never from the drawing. Rows that wrap keep the one gap the pane uses
 * everywhere, so the tabs and the drawing sit evenly apart on every tab.
 */
function tabRow(
  Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, selected: OfficeTab | null, choose: (next: OfficeTab) => void, hasIcons = false,
  switches: readonly RenderElement[] = [],
): RenderElement {
  // off the terminal each tab carries its icon, straight on the pane like the drawing under it; the surface draws a
  // Button its own way (styles inside one are not kept) and adds the hotkey badge. The switches after them (the Live
  // tab's Quiet, the Zoom)
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {tabButtons(Button, selected, choose, hasIcons)}
      {switches}
    </Box>
  )
}

/**
 * The Browser key as a Button (`browser`, hotkey o), where the pane draws text (a terminal): the same tab in pixel art,
 * in the person's browser. A press only calls `open`.
 */
function browserButton(Button: ElementConstructor<ButtonProps>, open: () => void): RenderElement {
  return (
    <Button key="browser" hotkey={BROWSER_HOTKEY} variant="secondary" onPress={open}>
      ⧉ Browser
    </Button>
  )
}

/**
 * The Live tab's Quiet key as a Button (`live-quiet`, hotkey q): the primary button while the Live tab is drawn quiet.
 * A press only calls `toggle`. Where the pixel art draws its words, there is one (a terminal draws text: no Quiet there).
 */
function quietButton(Button: ElementConstructor<ButtonProps>, isQuiet: boolean, toggle: () => void, hasIcons: boolean): RenderElement {
  return (
    <Button key="live-quiet" hotkey={QUIET_HOTKEY} variant={isQuiet ? 'primary' : 'secondary'} dimColor={!isQuiet} onPress={toggle}>
      {hasIcons ? '⊘ Quiet' : 'Quiet'}
    </Button>
  )
}

/**
 * The Zoom key as a Button (`zoom`, hotkey z): the primary button while the drawings are drawn bigger. A press only
 * calls `toggle`. Where pixel art is drawn, on every tab (a terminal draws text: no Zoom there).
 */
function zoomButton(Button: ElementConstructor<ButtonProps>, isZoomed: boolean, toggle: () => void, hasIcons: boolean): RenderElement {
  return (
    <Button key="zoom" hotkey={ZOOM_HOTKEY} variant={isZoomed ? 'primary' : 'secondary'} dimColor={!isZoomed} onPress={toggle}>
      {hasIcons ? '⊕ Zoom' : 'Zoom'}
    </Button>
  )
}

/**
 * The Frame key as a Button (`frame`, hotkey f), on every surface: the primary button while its panel is on screen. A
 * press only calls `toggle`.
 */
function frameButton(Button: ElementConstructor<ButtonProps>, isOpen: boolean, toggle: () => void, hasIcons: boolean): RenderElement {
  return (
    <Button key={FRAME_KEY} hotkey={FRAME_HOTKEY} variant={isOpen ? 'primary' : 'secondary'} dimColor={!isOpen} onPress={toggle}>
      {hasIcons ? '▣ Frame' : 'Frame'}
    </Button>
  )
}

/** The tabs as Buttons (keys `tab-<view>`, hotkeys 1 to 6), the selected one primary (none while the Frame's panel is on screen). */
function tabButtons(Button: ElementConstructor<ButtonProps>, selected: OfficeTab | null, choose: (next: OfficeTab) => void, hasIcons: boolean): RenderElement[] {
  return TABS.map(t => (
    <Button key={`tab-${t.view}`} hotkey={t.hotkey} variant={t.view === selected ? 'primary' : 'secondary'} dimColor={t.view !== selected} onPress={() => choose(t.view)}>
      {hasIcons ? `${t.icon} ${t.label}` : t.label}
    </Button>
  ))
}

/**
 * A row of the pixel menu, as hooks/menu.tsx takes it: which row, its keys, its width in CSS px, and whether a row
 * hangs under it (`joined`) or it under another (`under`), flush, as one console.
 */
type MenuProps = {
  row: typeof MENU_TABS | typeof MENU_LAPSE | typeof MENU_EXPORT | typeof MENU_FRAME; keys: MenuKey[]; width: number; joined: boolean; under?: boolean
  prompt?: string
}

/**
 * The tabs as keys of the pixel menu, the picked one lit, then three switches apart at the right end, each lit while on:
 * the Live tab's Quiet (on any other tab its room kept and nothing drawn in it, isHidden, so the tabs never move), the
 * Zoom, on every tab, and at the edge the Frame, its icon alone (isIcon) so the tabs keep their names' room. While the
 * Frame's panel is on screen (`isFraming`) it is the lit key: no tab is, so each can be pressed to go back to it, and
 * Quiet keeps its room empty as off the Live tab.
 */
function tabKeys(selected: OfficeTab, isQuiet = false, isZoomed = false, isFraming = false): MenuKey[] {
  const tabs: MenuKey[] = TABS.map(t => ({ id: t.view, label: t.label, short: t.short, icon: t.art, ...(t.view === selected && !isFraming ? { isOn: true } : {}) }))
  const quietKey: MenuKey = { id: QUIET, label: 'Quiet', short: 'Quiet', icon: 'quiet', isSwitch: true, ...(isQuiet ? { isOn: true } : {}) }
  const zoomKey: MenuKey = { id: ZOOM, label: 'Zoom', short: 'Zoom', icon: 'zoom', isSwitch: true, ...(isZoomed ? { isOn: true } : {}) }
  const frameKey: MenuKey = { id: FRAME_KEY, label: 'Frame', short: 'Frame', icon: 'frame', isSwitch: true, isIcon: true, ...(isFraming ? { isOn: true } : {}) }
  return [...tabs, selected === 'all' && !isFraming ? quietKey : { ...quietKey, isHidden: true }, zoomKey, frameKey]
}

/** The keys of the Frame's row where it stands: Turn on while it is off (or not known yet), Turn off and New link while it is on. */
function frameActs(link: OfficeFrameLink | null): readonly FrameSpec[] {
  return link?.running ? [FRAME_ACTS.stop, FRAME_ACTS.renew] : [FRAME_ACTS.start]
}

/** What the row's LED says (and its words off the pixel art): whether the frame is on. */
function frameLed(link: OfficeFrameLink | null): string {
  return link === null ? 'Frame' : link.running ? 'Frame on' : 'Frame off'
}

/**
 * The Frame's row as keys of the pixel menu: its keys where it stands, the one at work busy (its letters blink, it goes
 * nowhere; while the launcher is only asked where the frame stands, the first one), and Back apart at the right end.
 */
function frameKeys(link: OfficeFrameLink | null, busy: FrameAsk | null): MenuKey[] {
  const acts = frameActs(link)
  const at = busy === 'status' ? acts[0]?.act : busy
  const keys: MenuKey[] = acts.map(s => ({ id: s.act, label: s.act === at && busy !== 'status' ? s.doing : s.label, short: s.short, icon: s.art, ...(s.act === at ? { isBusy: true } : {}) }))
  return [...keys, { id: BACK, label: 'Back', short: 'Back', icon: 'back' }]
}

/** The row's keys as Buttons (`frame-<act>`, t and n; Back `frame-back`, b), in its keys' order. A press only calls `act` or `back`. */
function frameButtons(Button: ElementConstructor<ButtonProps>, link: OfficeFrameLink | null, busy: FrameAsk | null, act: (a: FrameAct) => void, back: () => void): RenderElement[] {
  const keys = frameActs(link).map(s => (
    <Button key={`frame-${s.act}`} hotkey={s.hotkey} variant="secondary" dimColor={busy !== null} onPress={() => act(s.act)}>
      {busy === s.act ? `${s.doing}…` : s.label}
    </Button>
  ))
  return [...keys, <Button key="frame-back" hotkey={BACK_HOTKEY} variant="secondary" onPress={back}>‹ Back</Button>]
}

/** The Frame's row as Buttons, where it is not pixel art: whether the frame is on, in words, then its keys. */
function frameRow(
  Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, Text: ElementConstructor<TextProps>, link: OfficeFrameLink | null,
  busy: FrameAsk | null, act: (a: FrameAct) => void, back: () => void,
): RenderElement {
  return (
    <Box key="frame-row" flexDirection="row" flexWrap="wrap" gap={1}>
      <Box key="frame-ask">
        <Text dimColor>{`${frameLed(link)}:`}</Text>
      </Box>
      {frameButtons(Button, link, busy, act, back)}
    </Box>
  )
}

/**
 * The Timelapse's ranges and Export as keys of the pixel menu: the range shown lit, and pressed again for a fresh
 * replay as its Button is (the replay is never refreshed by itself); Export busy while an export runs.
 */
function lapseKeys(shown: Lapse, isSaving: boolean): MenuKey[] {
  const ranges: MenuKey[] = LAPSES.map(l => ({ id: l.lapse, label: l.label, short: l.short, icon: l.art, ...(l.lapse === shown ? { isOn: true, isRepeatable: true } : {}) }))
  return [...ranges, { id: EXPORT, label: isSaving ? 'Exporting' : 'Export', short: 'Export', icon: 'export', ...(isSaving ? { isBusy: true } : {}) }]
}

/**
 * The key a pixel menu's post (`ui.message`) names in `row`, or null: code sent it, so it is input to check, never a
 * fact. The hooks module then checks that the id is one of that row's.
 */
function askedKey(data: unknown, row: MenuProps['row']): string | null {
  const asked = data !== null && typeof data === 'object' && !Array.isArray(data) ? (data as { row?: unknown; id?: unknown }) : {}
  return asked.row === row && typeof asked.id === 'string' ? asked.id : null
}

/**
 * The pane's menu where it is pixel art (the desktop): the tabs in a `Client` (hooks/menu.tsx) as wide as the pane and,
 * flush under them so the two read as one console, the row the tab has (`under`: the strip that pages it, or the
 * Timelapse's ranges), unless it is Buttons, and under that the Month's export row while it asks (`asks`, a row of
 * this menu too). A click posts what it asks for (ui.message). The keys a Client draws stay Buttons too (`keys`),
 * hidden, so their hotkeys work there as anywhere, and the pixel keys carry no badge.
 */
function pixelMenu(
  Box: ElementConstructor<BoxProps>, tabs: Drawn, joined: boolean, under: Drawn, keys: RenderElement[], asks: Drawn = null,
): RenderElement {
  return (
    <Box key="menu" flexDirection="column" gap={joined ? 0 : 1}>
      {tabs}
      {under}
      {asks}
      <Box key="menu-keys" display="none">
        {keys}
      </Box>
    </Box>
  )
}

/**
 * The Timelapse's own row, under the tabs: one Button per range (its own key and hotkey letter; the picked one the
 * primary button, the others dim) and Export (key `lapse-export`, hotkey e), dim and saying so while an export runs.
 * When `page` is given (off the terminal, an export of the range on screen saved), one line right under the row names
 * it, cut in the middle on a narrow pane so the file's name stays. A press only calls `choose` or `save`.
 */
function lapseRow(
  Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, Text: ElementConstructor<TextProps>,
  shown: Lapse, choose: (next: Lapse) => void, save: () => void, isSaving: boolean, page: string | null,
): RenderElement {
  const row = (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {lapseButtons(Button, shown, choose, save, isSaving)}
    </Box>
  )
  if (!page) return row
  return (
    <Box flexDirection="column">
      {row}
      {savedLine(Text, page)}
    </Box>
  )
}

/** The Timelapse's ranges and Export as Buttons (`lapse-<range>` y w m, `lapse-export` e), the range shown primary. */
function lapseButtons(Button: ElementConstructor<ButtonProps>, shown: Lapse, choose: (next: Lapse) => void, save: () => void, isSaving: boolean): RenderElement[] {
  const ranges = LAPSES.map(l => (
    <Button key={`lapse-${l.lapse}`} hotkey={l.hotkey} variant={l.lapse === shown ? 'primary' : 'secondary'} dimColor={l.lapse !== shown} onPress={() => choose(l.lapse)}>
      {l.label}
    </Button>
  ))
  const exporter = (
    <Button key="lapse-export" hotkey={EXPORT_HOTKEY} variant="secondary" dimColor={isSaving} onPress={save}>
      {isSaving ? '⤓ Exporting…' : '⤓ Export'}
    </Button>
  )
  return [...ranges, exporter]
}

/** The line that names the file an export of what is on screen saved, cut in the middle on a narrow pane so the file's name stays. */
function savedLine(Text: ElementConstructor<TextProps>, page: string, key = 'lapse-saved'): RenderElement {
  return <Text key={key} dimColor wrap="truncate-middle">{`Saved to ${page}`}</Text>
}

/** The Month's Export key on its strip: busy while an export runs, open while the row under it asks, else idle. */
function exporterOf(ask: MonthAsk, isSaving: boolean): 'idle' | 'open' | 'busy' {
  return isSaving ? 'busy' : ask === null ? 'idle' : 'open'
}

/** The question the export row asks: what to export, or how to keep the part (its LED, and its words off the pixel art). */
function askWords(ask: Exclude<MonthAsk, null>): string {
  return ask === 'what' ? 'Export' : `${partOf(ask).short} as`
}

/** The export row's keys for the pixel menu: what to export, or how to keep the part and Back, apart at its right end. */
function exportKeys(ask: Exclude<MonthAsk, null>): MenuKey[] {
  if (ask === 'what') return PARTS.map(p => ({ id: p.part, label: p.label, short: p.short, icon: p.art }))
  return [...formatsOf(ask).map(f => ({ id: f.format, label: f.label, short: f.label, icon: f.art })), { id: BACK, label: 'Back', short: 'Back', icon: 'back' }]
}

/** The export row's keys as Buttons (`export-<id>`, each its hotkey letter, Back `b`), in its keys' order. A press only calls `answer`. */
function exportButtons(Button: ElementConstructor<ButtonProps>, ask: Exclude<MonthAsk, null>, answer: (id: string) => void): RenderElement[] {
  const keys = ask === 'what' ? PARTS.map(p => [p.part, p.hotkey, p.label] as const)
    : [...formatsOf(ask).map(f => [f.format, f.hotkey, f.label] as const), [BACK, BACK_HOTKEY, '‹ Back'] as const]
  return keys.map(([id, hotkey, label]) => (
    <Button key={`export-${id}`} hotkey={hotkey} variant="secondary" onPress={() => answer(id)}>
      {label}
    </Button>
  ))
}

/**
 * The Month's Export key as a Button (`month-export`, hotkey e): the primary button while the row it opens asks, dim and
 * saying so while an export runs. A press only calls `toggle`.
 */
function exportToggle(Button: ElementConstructor<ButtonProps>, ask: MonthAsk, isSaving: boolean, toggle: () => void): RenderElement {
  return (
    <Button key="month-export" hotkey={EXPORT_HOTKEY} variant={ask !== null && !isSaving ? 'primary' : 'secondary'} dimColor={isSaving} onPress={toggle}>
      {isSaving ? '⤓ Exporting…' : '⤓ Export'}
    </Button>
  )
}

/** The export row as Buttons, where it is not pixel art: its question in words, then its keys. */
function exportRow(
  Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, Text: ElementConstructor<TextProps>, ask: Exclude<MonthAsk, null>,
  answer: (id: string) => void,
): RenderElement {
  return (
    <Box key="export-row" flexDirection="row" flexWrap="wrap" gap={1}>
      <Box key="export-ask">
        <Text dimColor>{`${askWords(ask)}:`}</Text>
      </Box>
      {exportButtons(Button, ask, answer)}
    </Box>
  )
}

/** Rows that go under the strip as one block (the export row's Buttons, the saved line), or none. */
function stack(Box: ElementConstructor<BoxProps>, key: string, rows: (RenderElement | null | undefined)[]): RenderElement | undefined {
  const kept = rows.filter((r): r is RenderElement => r !== null && r !== undefined)
  if (!kept.length) return undefined
  return kept.length === 1 ? kept[0] : <Box key={key} flexDirection="column">{kept}</Box>
}

/**
 * The strip's props, as hooks/period.tsx takes them: the tab's unit and page, today, its width, whether it is read,
 * whether the pixel menu's tabs sit on it (`joined`, drawn as one console), the Month's Export key (`exporter`), and
 * whether the export row hangs under it (`hangs`).
 */
type StripProps = {
  unit: OfficeUnit; back: number; today: string; width: number; busy: boolean; joined?: boolean; exporter?: 'idle' | 'open' | 'busy'; hangs?: boolean
}

/**
 * The strip's three keys as Buttons (`period-older` p, `period-newer` n, `period-now` c), in order; the two that go
 * nowhere on a page of now drawn dim. A press only calls `step`, which counts from the page on screen at the press.
 */
function stepButtons(Button: ElementConstructor<ButtonProps>, back: number, step: (s: StepSpec) => void): RenderElement[] {
  return STEPS.map(s => (
    <Button key={s.key} hotkey={s.hotkey} variant="secondary" dimColor={s.to(back) === back} onPress={() => step(s)}>
      {s.label}
    </Button>
  ))
}

/**
 * The page of the past as text, under the tabs where there is no pixel strip (a terminal, VS Code, mobile, a strip that
 * failed, a pane wider than an image may be): ◀, the page's name (saying so while it is read), ▶ and Now, one gap apart,
 * then `extra` (the Month's Export Button).
 */
function periodRow(
  Box: ElementConstructor<BoxProps>, Button: ElementConstructor<ButtonProps>, Text: ElementConstructor<TextProps>,
  strip: StripProps, name: string, step: (s: StepSpec) => void, extra: RenderElement[] = [],
): RenderElement {
  const [older, newer, now] = stepButtons(Button, strip.back, step)
  return (
    <Box flexDirection="row" flexWrap="wrap" gap={1}>
      {older}
      <Box key="period-label">
        <Text>{strip.busy ? `${name} · reading…` : name}</Text>
      </Box>
      {newer}
      {now}
      {extra}
    </Box>
  )
}

/**
 * The strip's width in CSS px for a pane of `columns` cells: as svgWidth, with no cap, so it is never narrower than its
 * region (the surface caps it at the slot's width) and a click's share of the region is its share of the strip.
 */
function stripWidth(columns: number): number {
  return Math.max(320, Math.ceil(columns * 9))
}

/**
 * The most cells a drawing surface lays the pane out in: the site's building stops at 1088 CSS px (site/style.css
 * `--bw`), and 124 desktop cells of about 8.75 px hold about as much. So the building stops growing there instead of
 * stretching across a wide window, and the menu, the strip and the drawing (at most stripWidth(124), 1116 px) stay well
 * under the widest image the desktop draws (4096 px, past which it refuses the tree).
 */
const WIDEST_COLUMNS = 124

/**
 * The pane's tree in a pane wider than WIDEST_COLUMNS: laid out in that many cells and centered, the pane's own ground
 * either side, so its menu, its strip and its drawing keep one width and line up as in a narrower pane.
 */
function centered(Box: ElementConstructor<BoxProps>, tree: RenderElement): RenderElement {
  return (
    <Box key="pane-held" flexDirection="column" alignItems="center" width="100%">
      <Box key="pane-column" flexDirection="column" width={WIDEST_COLUMNS}>{tree}</Box>
    </Box>
  )
}

// A page of the past drawn with the floor of now over it, per page and floor (so the same pair is the same facts, which
// the drawing compares by)
const floors = new WeakMap<OfficeFacts, { floor: OfficeFacts; facts: OfficeFacts }>()

/**
 * A page of the past as a tab draws it: its days as read, the floor of now over them (`now` and `live`: the lamps of who
 * is at a desk, the sky, the clock, what its alt says is going on right now), so a page kept for hours never shows the
 * floor of when it was read. Its days stay past: `now` only moves on.
 */
function withFloor(page: OfficeFacts, floor: OfficeFacts | null): OfficeFacts {
  if (!floor || floor === page || !(floor.now.iso > page.now.iso)) return page
  const known = floors.get(page)
  if (known?.floor === floor) return known.facts
  const facts = { ...page, now: floor.now, live: floor.live }
  floors.set(page, { floor, facts })
  return facts
}

/** What `read` gives, or `fallback` when it throws: a page a calendar cannot name draws its tab's pending line instead. */
function safely<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

/**
 * SVG width in CSS px for a pane of `columns` cells. A desktop cell is about 8.75 px; asking ~9 lands at or past the
 * slot, and the surface caps a drawing at the slot's width, so it spans the pane's width (the card hangs from the top
 * of its box: the sliver of height the cap leaves is the pane itself, under it).
 */
function svgWidth(columns: number): number {
  return Math.max(320, Math.min(2400, Math.ceil(columns * 9)))
}

/**
 * The drawing's box, read back from the root's width/height attributes renderSvg writes. The desktop draws an
 * interactive Svg in a sandboxed frame that does not take the markup's own height: left to it, a tall drawing (a busy
 * office, the week tower) was shrunk into a ~300 px frame and came out a thumbnail. Both sides, explicitly.
 */
function svgBox(source: string): { width?: number; height?: number } {
  const m = /^<svg\b[^>]*?\swidth="(\d+)"[^>]*?\sheight="(\d+)"/.exec(source)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : {}
}

/** What a tab says to a reader that cannot see it; a page of the past names its days for what they are. */
function altText(facts: OfficeFacts, view: OfficeTab): string {
  const scene = PAST_ALT[view]
  const alt = facts.range.back && scene ? `${facts.range.label} in pixel art, ${scene}` : tabOf(view).alt
  return `The Office, ${alt}. Right now: ${renderStatus(facts, { width: 400 }).replace(/^\S+ /u, '')}`
}

/**
 * One art line as one Text of colored runs. Text refuses ANSI, so each role's color travels as props: ROLE_TERM (theme
 * keys and basic color names, so a light terminal stays readable, as the CLI's SGR codes do). A blank line keeps one
 * space so the column layout does not collapse it.
 */
function drawLine(Text: ElementConstructor<TextProps>, line: Line): RenderElement {
  const runs = line.map(([text, role]) => {
    const look = role ? ROLE_TERM[role] : undefined
    return look ? <Text {...look}>{text}</Text> : text
  })
  return (
    <Text mono wrap="truncate-end">
      {runs.length ? runs : ' '}
    </Text>
  )
}

/**
 * The text view of a tab. The Live tab is the live floor alone at every width (a list of desks under 60 columns): the week's tower has a tab of its own, so the first screen never repeats it. The skill, drawing
 * the office in the chat, keeps the long `all` text.
 */
function textView(view: FreshTab): View {
  return view === 'all' ? 'live' : view
}

// ---------------------------------------------------------------- hooks

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    hasTerminal = e.surface === 'terminal'
    isConsole = e.surface === 'terminal'
    // A refused name (another command already answers to /theoffice) costs the command alone: the band's button still
    // opens the pane, and the rest of the start runs.
    await $.command.register({
      name: 'theoffice',
      description: 'Open or close The Office: a live, pixel-art pane of your coding agents (in a terminal, in your browser)',
      argumentHint: '[live|today|week|month|work|timelapse|close|browser|frame]',
    }).catch(error => $.ui.log(`theoffice: /theoffice is not registered (${errorText(error)}); the band's button still opens the pane`, { to: 'debug' }))
    await restoreTab($).catch(() => undefined)
    await restoreQuiet($).catch(() => undefined)
    await restoreZoom($).catch(() => undefined)
    await restoreLapse($).catch(() => undefined)
    await restoreShared($).catch(() => undefined)
    // After a hot reload the pane may still be up: pick the cadence from what is on screen, never open anything.
    const row = await paneRow($).catch(() => undefined)
    isPaneOpen = row !== undefined
    isPaneShown = row !== undefined && row.isShown && row.isPlaced
    markScreen($)
    schedule($)
    beat?.cancel()
    beat = $.clock.every(BEAT_MS, () => void heartbeat($))
    void watch($)
    void refresh($)
    const range = rangeOf(picked)
    if (isPaneShown && range) void runRange($, range)
    if (isPaneShown && picked === 'timelapse') void lapseIfNone($)

    return next(e)
  })

  on('session.attach', ($, e, next) => {
    if (e.surface === 'terminal' && !hasTerminal) {
      hasTerminal = true
      schedule($)
    }
    return next(e)
  })

  // This session's own activity: a prompt sent, a turn ended (an agent's too). Each only asks for a look soon; the
  // prompt and the answer pass through untouched, first.
  on('prompt.submit', ($, e, next) => {
    pokeWatcher($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', ($, e, next) => {
    pokeWatcher($)
    return next(e)
  })

  // The person typed the command, so the open counts as asked (the band's Button is the other way in). With no word it
  // toggles: a pane on screen closes, one that is open but behind another tab (or waiting undrawn) comes forward
  // instead. `open` opens or raises, `close` closes, a tab's name opens or raises it on that tab, `browser` opens it in
  // the browser (the pane is left as it is); a word it does not know only gets the usage line. In a console every word
  // that opens opens the browser instead, on the tab named or the one picked last: no text pane, no fallback to one.
  on('command.run', { command: 'theoffice' }, async ($, e) => {
    const asked = readCommand(e.args)
    if (asked.action === 'unknown') return { text: USAGE }
    // `frame`: The Office on a screen of its own, where it stands or turned on, off, or given a new link as asked
    if (asked.action === 'frame') return { text: await commandFrame($, asked.act) }
    if (asked.action === 'browser' || (isConsole && asked.action !== 'close')) {
      if (isConsole && asked.tab) await pickTab($, asked.tab) // the console's next /theoffice opens it there again
      const opened = await openInBrowser($, asked.tab)
      if ('why' in opened) return { text: `The Office could not open in your browser: ${opened.why}.` }
      return { text: `The Office is open in your browser, in pixel art, and updates by itself: ${opened.url}\nIt stops by itself half an hour after its last page closes.` }
    }
    const row = await paneRow($)
    const isShown = row !== undefined && row.isShown && row.isPlaced

    if (asked.action === 'close' || (isShown && asked.action === 'toggle')) {
      if (row) await $.ui.close({ id: PANE })
      setPane($, false)
      if (!row && isConsole) return { text: 'The Office runs in your browser here: close its tab, or press Stop server on it.' }
      return { text: row ? 'The Office is closed.' : 'The Office was not open.' }
    }

    const opened = await openPane($, row, asked.tab)

    return { text: opened.isPlaced ? 'The Office is open.' : `The Office opens when there is room (${opened.reason}).` }
  })

  // The band above the prompt (the terminal and the desktop app draw it): one Button that opens The Office as
  // /theoffice does, drawn while the pane is not on screen (closed, waiting for room, behind another tab) and never over
  // a survey. The person collapses the band with its [-].
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const isOnScreen = await read($, onScreen) // subscribes: the pane opening or closing redraws
    if (isOnScreen || e.props.hasSurvey) return next(e)
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="row">
        <Button key="open-office" variant="secondary" onPress={() => void pressOpen($)}>
          🏢 Open The Office
        </Button>
      </Box>
    )
  })

  // Every close of the pane (the person's close mark or key, our own command) slows the timers back down. The close
  // always goes through: next(e) runs first, and the .catch replays it if anything after it throws. The pane list is
  // asked afterwards because the event names only an id, which another plugin's pane could share.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    if (e.origin.kind === 'person') $.ui.log('theoffice: the person closed the pane; it stays closed until /theoffice', { to: 'debug' })
    if (!(await isUp($))) setPane($, false)

    return closed
  }).catch(($, e, next) => next(e))

  // The pixel strip posted a click (hooks/period.tsx): the page it asks for, checked before it turns anything, turned
  // at once (the page read after, never awaited here), and the strip handed its next props with no wait for a redraw.
  on('ui.message', { requestId: PANE, element: STRIP }, async ($, e, next) => {
    const heard = await next(e)
    // the Month's Export key: the row it opens or closes, the key lit or not at once (busy, it goes nowhere)
    if (isExportPost(e.data)) {
      const shown = strips.get(e.surface)
      void toggleExport($)
      if (!shown?.exporter || shown.exporter === 'busy' || isMonthExporting) return heard
      const isOpen = shown.exporter === 'idle'
      return { ...heard, props: { ...shown, exporter: isOpen ? 'open' : 'idle', hangs: isOpen && shown.joined === true } }
    }
    const asked = askedPage(e.data)
    if (!asked) return heard
    void selectBack($, asked.unit, asked.back)
    const shown = strips.get(e.surface)
    return shown?.unit === asked.unit ? { ...heard, props: { ...shown, back: asked.back } } : heard
  })

  // The pixel menu's tabs posted a click (hooks/menu.tsx): the tab it names, checked, picked at once as a press of its
  // Button would (its facts fetched after, never awaited here), and the row handed its next props with no wait.
  on('ui.message', { requestId: PANE, element: MENU_TABS }, async ($, e, next) => {
    const heard = await next(e)
    const id = askedKey(e.data, MENU_TABS)
    const shown = menus.get(e.surface)?.tabs
    const wasQuiet = shown?.keys.some(k => k.id === QUIET && k.isOn === true) === true
    const wasZoomed = shown?.keys.some(k => k.id === ZOOM && k.isOn === true) === true
    const wasFraming = shown?.keys.some(k => k.id === FRAME_KEY && k.isOn === true) === true
    // the Frame: its panel on or off at once, as its Button would, on any tab
    if (id === FRAME_KEY) {
      void toggleFrame($)
      return shown ? { ...heard, props: { ...shown, keys: tabKeys(picked, wasQuiet, wasZoomed, !wasFraming) } } : heard
    }
    // the Live tab's Quiet: pressed on or off at once, as its Button would; only while the Live tab is picked and drawn
    if (id === QUIET) {
      if (picked !== 'all' || wasFraming) return heard
      void toggleQuiet($)
      return shown ? { ...heard, props: { ...shown, keys: tabKeys('all', !wasQuiet, wasZoomed) } } : heard
    }
    // the Zoom: pressed on or off at once on any tab, as its Button would
    if (id === ZOOM) {
      void toggleZoom($)
      return shown ? { ...heard, props: { ...shown, keys: tabKeys(picked, wasQuiet, !wasZoomed, wasFraming) } } : heard
    }
    if (!isTab(id)) return heard
    void selectTab($, id)
    return shown ? { ...heard, props: { ...shown, keys: tabKeys(id, wasQuiet, wasZoomed) } } : heard
  })

  // The Timelapse's ranges posted a click: a range, or Export, as their Buttons would; only while the Timelapse is picked.
  on('ui.message', { requestId: PANE, element: MENU_LAPSE }, async ($, e, next) => {
    const heard = await next(e)
    const id = askedKey(e.data, MENU_LAPSE)
    if (picked !== 'timelapse' || (id !== EXPORT && !isLapse(id))) return heard
    if (id === EXPORT) void exportLapse($)
    else void selectLapse($, id)
    const shown = menus.get(e.surface)?.lapse
    const keys = id === EXPORT ? lapseKeys(pickedLapse, true) : lapseKeys(id, isExporting)
    return shown ? { ...heard, props: { ...shown, keys } } : heard
  })

  // The Month's export row posted a click: a part, a format or Back, as their Buttons would; only while the Month is
  // picked and no export runs. The row is handed what it asks next at once; a format closes it (the export starts).
  on('ui.message', { requestId: PANE, element: MENU_EXPORT }, async ($, e, next) => {
    const heard = await next(e)
    const id = askedKey(e.data, MENU_EXPORT)
    if (picked !== 'month' || id === null || isMonthExporting) return heard
    const after = nextAsk(await read($, monthAsk), id)
    void answerExport($, id)
    const shown = menus.get(e.surface)?.export
    return shown && after ? { ...heard, props: { ...shown, keys: exportKeys(after), prompt: askWords(after) } } : heard
  })

  // The Frame's row posted a click: Turn on, Turn off, New link or Back, as their Buttons would; only while its panel is
  // on screen, and a key only where the frame stands (mayFrame) and while nothing runs. The key pressed is handed back
  // busy at once; what the launcher says redraws the row.
  on('ui.message', { requestId: PANE, element: MENU_FRAME }, async ($, e, next) => {
    const heard = await next(e)
    const id = askedKey(e.data, MENU_FRAME)
    if (id === null || !(await read($, framePanel))) return heard
    if (id === BACK) {
      void toggleFrame($)
      return heard
    }
    if (!isFrameAct(id) || isFrameAsked || !mayFrame(id, await read($, frameLink))) return heard
    void pressFrame($, id)
    const shown = menus.get(e.surface)?.frame
    return shown ? { ...heard, props: { ...shown, keys: shown.keys.map(k => (k.id === id ? { ...k, label: FRAME_ACTS[id].doing, isBusy: true } : k)) } } : heard
  })

  // The pane: the terminal's text in every column it has; a drawing surface's menu, strip and drawing in WIDEST_COLUMNS
  // at most, centered in a wider pane (centered), so the building stops growing there as the site's does
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const columns = Math.max(20, Math.floor(e.props.bodyColumns || 0))
    if (e.surface === 'terminal' || columns <= WIDEST_COLUMNS) return paneTree($, e, columns)
    return centered($.ui.resolve(e).Box, await paneTree($, e, WIDEST_COLUMNS))
  })
}

/** The pane's tree laid out in `columns` cells. */
async function paneTree($: EngineInterface, e: RenderInput<'Pane'>, columns: number): Promise<RenderElement> {
  const view = await read($, tab) // subscribes: a tab press redraws
  const isQuiet = await read($, quiet) // and so does Quiet pressed (on the Live tab: anywhere else its key is hidden)
  const isZoomed = await read($, zoom) // and Zoom, on every tab
  const choose = (next: OfficeTab) => void selectTab($, next)
  const toggleQuietKey = () => void toggleQuiet($)
  const toggleZoomKey = () => void toggleZoom($)
  const toggleFrameKey = () => void toggleFrame($)

  // the Frame's panel, in place of the tab's drawing while its key is on (it subscribes: the key pressed redraws)
  if (await read($, framePanel)) return frameTree($, e, columns, view, isQuiet, isZoomed)

  // the Timelapse: the tabs, its own row, then its replay, one gap apart. It reads only its own facts (no other run
  // redraws it) and draws the newest kept for the range shown, so a range picked again is drawn at once while its run
  // goes on. The runs never compare it: what this surface drew of the other tabs is forgotten, as on a tab switch
  if (view === 'timelapse') {
    const shownLapse = await read($, lapse) // subscribes: a range press redraws
    const held = await read($, lapseFacts) // and so do its facts landing
    const facts = lapseLatest[shownLapse] ?? (held?.timeline?.kind === shownLapse ? held : null)
    const isSaving = await read($, lapseExporting) // and the Export Button follows its run
    const chooseLapse = (next: Lapse) => void selectLapse($, next)
    const save = () => void exportLapse($)
    drawings.delete(e.surface)
    if (e.surface === 'terminal') {
      const { Box, Button, Text } = $.ui.resolve(e)
      const tabs = tabRow(Box, Button, view, choose, false, [browserButton(Button, () => void pressBrowser($)), frameButton(Button, false, toggleFrameKey, false)])
      const controls = lapseRow(Box, Button, Text, shownLapse, chooseLapse, save, isSaving, null)
      if (facts === null) return pending(Box, Text, tabs, waitingLapse(await read($, lapseTrouble), shownLapse), controls)
      try {
        const lines = lapseText(facts, columns, await read($, frame))
        return (
          <Box flexDirection="column" gap={1}>
            {tabs}
            {controls}
            <Box flexDirection="column">{lines.map(line => drawLine(Text, line))}</Box>
          </Box>
        )
      } catch (error) {
        return broken(Box, Text, tabs, error, controls, true)
      }
    }
    const elements = $.ui.resolve(e)
    const { Box, Button, Svg, Text } = elements
    const saved = await read($, lapseSaved) // and so does an export landing, which names its page
    const page = saved !== null && pageLapse(saved) === shownLapse ? saved : null // the range on screen's only
    // the pixel menu on the desktop: the tabs and, flush under them, the ranges and Export; else their Buttons
    const width = stripWidth(columns)
    let tabs: RenderElement
    let controls: RenderElement | undefined
    if (e.surface === 'desktop' && 'Client' in elements) {
      // each Client is written as h('Client', …) with its fixed module, so a reader of the source sees which code loads
      const tabsProps: MenuProps = { row: MENU_TABS, keys: tabKeys(view, isQuiet, isZoomed), width, joined: true }
      const lapseProps: MenuProps = { row: MENU_LAPSE, keys: lapseKeys(shownLapse, isSaving), width, joined: false, under: true }
      menus.set(e.surface, { tabs: tabsProps, lapse: lapseProps })
      const keys = [
        ...tabButtons(Button, view, choose, false), zoomButton(Button, isZoomed, toggleZoomKey, false), frameButton(Button, false, toggleFrameKey, false),
        ...lapseButtons(Button, shownLapse, chooseLapse, save, isSaving),
      ]
      const tabsMenu = h('Client', { key: MENU_TABS, module: './menu.tsx', width: '100%', props: tabsProps })
      const lapseMenu = h('Client', { key: MENU_LAPSE, module: './menu.tsx', width: '100%', props: lapseProps })
      tabs = pixelMenu(Box, tabsMenu, true, lapseMenu, keys)
      controls = page ? savedLine(Text, page) : undefined
    } else {
      menus.delete(e.surface)
      tabs = tabRow(Box, Button, view, choose, true, [zoomButton(Button, isZoomed, toggleZoomKey, true), frameButton(Button, false, toggleFrameKey, true)])
      controls = lapseRow(Box, Button, Text, shownLapse, chooseLapse, save, isSaving, page)
    }
    if (facts === null) return pending(Box, Text, tabs, waitingLapse(await read($, lapseTrouble), shownLapse), controls)
    try {
      // one self-animating loop, a card like every tab; the same facts at the same width are the same string,
      // so a redraw the engine makes for its own reasons never reloads the frame: only new facts start it over
      const source = lapseSource(e.surface, facts, svgWidth(columns), isZoomed)
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {controls}
          <Svg source={source} alt={lapseAlt(source)} isInteractive {...svgBox(source)} />
        </Box>
      )
    } catch (error) {
      return broken(Box, Text, tabs, error, controls, true)
    }
  }

  lapseDrawn.delete(e.surface) // the replay left this surface: a press draws it again

  // the tab's page of the past (read on a tab that pages alone, so a page turned redraws only those): 0 for now
  const unit = UNIT_OF[view]
  const shownBacks = unit ? await read($, backs) : pickedBacks
  const back = unit ? shownBacks[unit] : 0
  const range = rangeOf(view, shownBacks)
  // only the facts this tab draws are read (so another range's refresh never redraws it); the drawing then draws the
  // newest of them, which a run keeps without a write when they draw the same (isNewDrawing). A page of the past draws
  // its own facts, kept or held, and while it is read (it subscribes) what this surface drew of the tab stays
  const held = range ? await heldOf($, range) : await read($, snapshot)
  const page = range === 'past' ? safely(() => pageOn(view, shownBacks), null) : null
  const isReading = range === 'past' && (await read($, pastReading))
  const drawn = drawings.get(e.surface)
  let facts = held === null ? null : latest[range ?? 'all'] ?? held
  let isKept = false // the tab keeps its last drawing while its page is read
  if (range === 'past') {
    const own = page ? pages.get(page.key) ?? (isPage(held, page.unit, page.key) ? held : null) : null
    // its days as read, the floor of now over them (it subscribes to the week's facts, which carry the floor)
    facts = own && withFloor(own, latest.all ?? (await read($, snapshot)))
    if (facts === null && isReading && drawn?.view === view) {
      facts = drawn.facts
      isKept = true
    }
  }
  // a first light holds the floor alone: the Live tab draws it, a tab that is all counts waits for the week
  if (facts?.first_light === true && view !== 'all') facts = null
  // the strip under the tabs that page: the page's name on the calendar of today's facts
  const today = dayNow ?? facts?.now.local_date
  const strip: StripProps | null = unit && today ? { unit, back, today, width: stripWidth(columns), busy: isReading } : null
  const name = strip ? safely(() => pageName(strip.unit, strip.back, strip.today), '') : ''
  const step = (s: StepSpec) => void stepPast($, s)
  // the Month's export: its key on the strip, the row it opens, the file it saved of the page on screen (each read on
  // the Month alone, so no other tab redraws for them)
  const isMonth = view === 'month'
  const ask: MonthAsk = isMonth ? await read($, monthAsk) : null
  const isSavingMonth = isMonth && (await read($, monthExporting))
  const savedMonth = isMonth ? await read($, monthSaved) : null
  const savedFile = savedMonth && savedMonth.page === monthPageKey(back) ? savedMonth.file : null
  const toggle = () => void toggleExport($)
  const answer = (id: string) => void answerExport($, id)
  if (strip && isMonth) strip.exporter = exporterOf(ask, isSavingMonth)
  // while the facts are not there: why, when a run failed, else the waiting room with how far the read is (it
  // subscribes to the progress the watcher reads)
  const problem = async () => (range ? await read($, rangeTrouble) : await read($, trouble))
  const wait = async () => {
    const p = await read($, progress)
    return waitLines(waitOf(range), name, p && p.key === waitedKey() ? p : null)
  }
  // a page read while the tab keeps its last drawing: once its run says how far it is (a read that takes a while),
  // that is said over the drawing, in text, so the drawing's frame never reloads for it; a quick turn says nothing
  let over: RenderElement | null = null
  if (isKept) {
    const p = await read($, progress)
    const { Box, Text } = $.ui.resolve(e)
    if (p && p.key === waitedKey()) over = waitBlock(Box, Text, waitLines('past', name, p))
  }
  if (facts !== null && !isKept) roomNights.delete(waitOf(range))

  // a drawing that throws would make the engine drop the pane: each branch shows why instead, the next snapshot redraws
  // a terminal has no Svg: it draws the text version, its tabs and rows as Buttons
  if (e.surface === 'terminal') {
    const { Box, Button, Text } = $.ui.resolve(e)
    const tabs = tabRow(Box, Button, view, choose, false, [browserButton(Button, () => void pressBrowser($)), frameButton(Button, false, toggleFrameKey, false)])
    const row = strip ? periodRow(Box, Button, Text, strip, name, step, isMonth ? [exportToggle(Button, ask, isSavingMonth, toggle)] : []) : undefined
    const controls = stack(Box, 'month-controls', [row, ask === null ? null : exportRow(Box, Button, Text, ask, answer)])
    if (facts === null) {
      drawings.delete(e.surface)
      const why = await problem()
      return why ? pending(Box, Text, tabs, waiting(why, range, name), controls) : waitingRoom(Box, Text, tabs, await wait(), controls)
    }
    const text = textView(view)
    // only the floor plan moves, so only it follows the frame clock
    const at = text === 'live' ? await read($, frame) : 0
    try {
      const lines = renderOffice(facts, { view: text, width: columns, frame: at })
      drawings.set(e.surface, { kind: 'text', view, columns, facts })
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {controls}
          {over}
          <Box flexDirection="column">{lines.map(line => drawLine(Text, line))}</Box>
        </Box>
      )
    } catch (error) {
      drawings.delete(e.surface)
      return broken(Box, Text, tabs, error, controls, false)
    }
  }

  // desktop, vscode, mobile: the tab's animated pixel art (SMIL in a sandboxed frame, it never reads `frame`)
  const elements = $.ui.resolve(e)
  const { Box, Button, Svg, Text } = elements
  // the pixel menu and the strip on the desktop, the one surface here that runs a Client (VS Code's table lists none,
  // though its resolve hands one that draws nothing); else their Buttons
  const width = stripWidth(columns)
  const isPixel = e.surface === 'desktop' && 'Client' in elements
  // the Month's export row: a deck of the console, flush under a pixel strip under the pixel menu; else Buttons
  const pixelAsk = ask !== null && isPixel && strip ? ask : null
  const pixelStrip = strip && isPixel ? { ...strip, joined: true, ...(pixelAsk ? { hangs: true } : {}) } : null
  if (pixelStrip) strips.set(e.surface, pixelStrip)
  const toggleKey = isMonth && strip ? [exportToggle(Button, ask, isSavingMonth, toggle)] : []
  // the strip flush under the tabs as one console, the export row flush under it; Buttons' rows a gap apart
  const tabsProps: MenuProps = { row: MENU_TABS, keys: tabKeys(view, isQuiet, isZoomed), width, joined: !!pixelStrip }
  const askProps: MenuProps | null = pixelAsk === null ? null
    : { row: MENU_EXPORT, keys: exportKeys(pixelAsk), width, joined: false, under: true, prompt: askWords(pixelAsk) }
  // Each Client is written as h('Client', …) with its fixed module, so a reader of the source sees which code loads. The
  // pixel strip (hooks/period.tsx) draws the strip and posts the page a click asks for (ui.message), the
  // menu (hooks/menu.tsx) the tabs and the export row; their keys stay as hidden Buttons beside them (pixelMenu, or a
  // Box of their own under Button tabs), so p, n and c turn a page there too.
  const stripRow = strip && !pixelStrip ? periodRow(Box, Button, Text, strip, name, step, toggleKey) : null // its Buttons
  let under: Drawn = stripRow
  let tabsMenu: Drawn = null
  let askMenu: Drawn = null
  if (isPixel) {
    if (pixelStrip) under = h('Client', { key: STRIP, module: './period.tsx', width: '100%', props: pixelStrip })
    tabsMenu = h('Client', { key: MENU_TABS, module: './menu.tsx', width: '100%', props: tabsProps })
    if (askProps) askMenu = h('Client', { key: MENU_EXPORT, module: './menu.tsx', width: '100%', props: askProps })
  }
  const askRow = ask !== null && pixelAsk === null ? exportRow(Box, Button, Text, ask, answer) : null
  const saved = savedFile ? savedLine(Text, savedFile, 'month-saved') : null
  let tabs: RenderElement
  let controls: RenderElement | undefined
  if (tabsMenu) {
    menus.set(e.surface, { tabs: tabsProps, ...(askProps ? { export: askProps } : {}) })
    const keys = [
      ...tabButtons(Button, view, choose, false), ...(view === 'all' ? [quietButton(Button, isQuiet, toggleQuietKey, false)] : []),
      zoomButton(Button, isZoomed, toggleZoomKey, false), frameButton(Button, false, toggleFrameKey, false),
      ...(pixelStrip ? [...stepButtons(Button, pixelStrip.back, step), ...toggleKey] : []), ...(pixelAsk === null ? [] : exportButtons(Button, pixelAsk, answer)),
    ]
    tabs = pixelMenu(Box, tabsMenu, !!pixelStrip, under, keys, askMenu)
    controls = stack(Box, 'month-controls', [askRow, saved])
  } else {
    menus.delete(e.surface)
    tabs = tabRow(Box, Button, view, choose, true, [
      ...(view === 'all' ? [quietButton(Button, isQuiet, toggleQuietKey, true)] : []), zoomButton(Button, isZoomed, toggleZoomKey, true),
      frameButton(Button, false, toggleFrameKey, true),
    ])
    // the strip's keys hidden beside it, as the menu holds them
    const paging = pixelStrip ? (
      <Box key="menu" flexDirection="column">
        {under}
        <Box key="menu-keys" display="none">
          {stepButtons(Button, pixelStrip.back, step)}
          {toggleKey}
        </Box>
      </Box>
    ) : stripRow
    controls = stack(Box, 'month-controls', [paging, askRow, saved])
  }
  if (facts === null) {
    drawings.delete(e.surface)
    const why = await problem()
    if (why) return pending(Box, Text, tabs, waiting(why, range, name), controls)
    // the room where the surface draws pixel art, the same drawing for the whole wait
    const room = roomSource(waitOf(range), svgWidth(columns))
    const what = { week: "this week's sessions", today: "today's sessions", month: 'last month and this one', past: name || 'a page of the past' }[waitOf(range)]
    const alt = `The Office is reading ${what}: Clawd at the archive desk, the calendar's days lighting up one by one`
    return waitingRoom(Box, Text, tabs, await wait(), controls, <Svg source={room} alt={alt} isInteractive {...svgBox(room)} />)
  }
  try {
    // a card: the scene with its own sky and ground, rounded corners and a hairline edge (lib/svg.mjs `card`). The pane
    // keeps a gutter around what a plugin draws, which a transparent drawing's street, line and tunnel ran into as a
    // hard cut; a card ends there by design, in any theme. The drawing comes right under the tabs, one gap apart, with
    // no caption: its own title says what the tab shows. The surface may cap the drawing's width and keep its height;
    // the sliver that leaves (the drawing hangs from the top of its box) falls below it. The source stays the same
    // string while the facts draw nothing new (pixelSource): its clocks tick by themselves
    const source = await pixelSource($, e.surface, facts, view, svgWidth(columns), view === 'all' && isQuiet, isZoomed)
    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {controls}
        {over}
        <Svg source={source} alt={altText(facts, view)} isInteractive {...svgBox(source)} />
      </Box>
    )
  } catch (error) {
    drawings.delete(e.surface)
    return broken(Box, Text, tabs, error, controls, false)
  }
}

/**
 * The Frame's panel, in place of the tab's drawing: the tabs (none lit: a press of any goes back to it), the Frame's row
 * under them (whether the frame is on, Turn on or Turn off and New link, Back), and what the frame is and where it
 * stands: a card with the QR code of its address where the surface draws pixel art (and the addresses in words under
 * it, to copy), lines of text with the code in half blocks on a terminal. It reads only the frame's own state, so no
 * run of the collector redraws it, and what this surface drew of the tabs is forgotten, as on a tab switch.
 */
async function frameTree($: EngineInterface, e: RenderInput<'Pane'>, columns: number, view: OfficeTab, isQuiet: boolean, isZoomed: boolean): Promise<RenderElement> {
  const link = await read($, frameLink) // subscribes: what the launcher says redraws
  const busy = await read($, frameBusy) // and so does the key at work
  const choose = (next: OfficeTab) => void selectTab($, next)
  const back = () => void toggleFrame($)
  const act = (a: FrameAct) => void pressFrame($, a)
  drawings.delete(e.surface)
  lapseDrawn.delete(e.surface)
  strips.delete(e.surface)

  if (e.surface === 'terminal') {
    const { Box, Button, Text } = $.ui.resolve(e)
    menus.delete(e.surface)
    return (
      <Box flexDirection="column" gap={1}>
        {tabRow(Box, Button, null, choose, false, [frameButton(Button, true, back, false)])}
        {frameRow(Box, Button, Text, link, busy, act, back)}
        <Box key="frame-text" flexDirection="column">
          {frameText({ link, columns }).map((line, i) => <Text key={`frame-line-${i}`} mono wrap="truncate-end">{line || ' '}</Text>)}
        </Box>
      </Box>
    )
  }

  const elements = $.ui.resolve(e)
  const { Box, Button, Svg, Text } = elements
  const width = stripWidth(columns)
  let tabs: RenderElement
  let controls: RenderElement | undefined
  if (e.surface === 'desktop' && 'Client' in elements) {
    // each Client is written as h('Client', …) with its fixed module, so a reader of the source sees which code loads
    const tabsProps: MenuProps = { row: MENU_TABS, keys: tabKeys(view, isQuiet, isZoomed, true), width, joined: true }
    const rowProps: MenuProps = { row: MENU_FRAME, keys: frameKeys(link, busy), width, joined: false, under: true, prompt: frameLed(link) }
    menus.set(e.surface, { tabs: tabsProps, frame: rowProps })
    const keys = [
      ...tabButtons(Button, null, choose, false), zoomButton(Button, isZoomed, () => void toggleZoom($), false), frameButton(Button, true, back, false),
      ...frameButtons(Button, link, busy, act, back),
    ]
    const tabsMenu = h('Client', { key: MENU_TABS, module: './menu.tsx', width: '100%', props: tabsProps })
    const rowMenu = h('Client', { key: MENU_FRAME, module: './menu.tsx', width: '100%', props: rowProps })
    tabs = pixelMenu(Box, tabsMenu, true, rowMenu, keys)
  } else {
    menus.delete(e.surface)
    tabs = tabRow(Box, Button, null, choose, true, [zoomButton(Button, isZoomed, () => void toggleZoom($), true), frameButton(Button, true, back, true)])
    controls = frameRow(Box, Button, Text, link, busy, act, back)
  }
  try {
    const card = renderFrameCard({ width: svgWidth(columns), link })
    // the addresses in words under the card, where they can be copied: a screen's, or this computer's own off the network
    const addresses = link?.running ? (link.lan ? link.urls : [link.local]) : []
    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {controls}
        <Svg source={card.source} alt={card.alt} isInteractive {...svgBox(card.source)} />
        {addresses.length ? (
          <Box key="frame-links" flexDirection="column">
            {addresses.map((url, i) => <Text key={`frame-link-${i}`} dimColor wrap="truncate-middle">{url}</Text>)}
          </Box>
        ) : null}
      </Box>
    )
  } catch (error) {
    return broken(Box, Text, tabs, error, controls, false)
  }
}

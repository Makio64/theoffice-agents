// The $.state contract of the theoffice mod, named in plugin.json as "types". Self-contained on purpose (the engine
// reads it alone: no import, no reference). The facts types mirror the collector's `theoffice/1` output, which is the
// renderers' input; the hooks module and the lib/*.d.mts sidecars import them from here so they are written once.

// ---------------------------------------------------------------- facts (theoffice/1)

/** What a desk is doing, in office words: the kinds lib/activity.mjs maps tool names to. */
export type OfficeActivityKind =
  | 'coding' | 'reading' | 'terminal' | 'testing' | 'web' | 'delegating' | 'planning' | 'talking' | 'design' | 'tools'
  | 'thinking' | 'idle'

/** Tool calls per activity kind over the range. */
export type OfficeActivityCounts = Partial<Record<OfficeActivityKind, number>>

/**
 * The kind of agent at a desk, each drawn as its own character (lib/cast.mjs): Clawd for Claude, Dex for Codex, Gem for
 * Gemini (the CLI and Antigravity), Caret for Cursor, Mooni for Kimi, Rok for Grok. Missing means Claude.
 */
export type OfficeAgent = 'claude' | 'codex' | 'gemini' | 'cursor' | 'kimi' | 'grok'

/** Agent-minutes per agent over the range (agents at zero left out). */
export type OfficeAgentMinutes = Partial<Record<OfficeAgent, number>>

/** A subagent working for a desk right now. */
export type OfficeIntern = {
  id: string
  /** The intern's kind of agent: its boss's. */
  agent?: OfficeAgent
  type: string
  description?: string
  started_at?: string
  last_seen?: string
}

/** A workflow run in progress at a desk. */
export type OfficeMeeting = {
  id: string
  name: string
  phase?: string | null
  agents_running: number
  agents_done: number
  agents_failed: number
  agents_total: number
  started_at?: string
  labels?: string[]
}

/** One live main session: a desk on the floor. */
export type OfficeDesk = {
  id: string
  pid?: number | null
  /** Which kind of agent sits here (Claude when missing). */
  agent?: OfficeAgent
  /**
   * The account it works from, when its agent has several on this machine (`main` for ~/.claude, `work` for
   * ~/.claude-work…); null when it has one.
   */
  account?: string | null
  title: string
  project: string
  project_path?: string
  worktree?: string | null
  branch?: string | null
  status: 'busy' | 'idle' | 'waiting' | 'shell' | (string & {})
  state: 'working' | 'waiting_on_agents' | 'idle' | 'asking'
  /**
   * Why an idle desk is idle (null otherwise; done when missing): its last turn ended with an answer (done), was
   * stopped by the user (stopped), ended on an API error (error, its words in activity.label), was left open and went
   * quiet (stalled), or something will start the next turn by itself, a background job or a scheduled wakeup (break).
   */
  idle_reason?: 'done' | 'stopped' | 'error' | 'stalled' | 'break' | null
  activity?: { kind: OfficeActivityKind | (string & {}); tool?: string | null; label?: string | null; since?: string | null }
  model?: string | null
  started_at?: string
  last_seen?: string
  entrypoint?: string | null
  interns: OfficeIntern[]
  meetings: OfficeMeeting[]
  /** Its folder is a throwaway one a script made for the run: a worker of that script, seated after the sessions somebody opened. */
  worker?: boolean
}

export type OfficeLiveCounts = {
  desks: number
  busy: number
  idle: number
  waiting: number
  interns: number
  meetings: number
  meeting_agents: number
}

export type OfficeDay = {
  minutes: number
  desk_minutes: number
  sessions: number
  subagents: number
  workflows?: number
  prompts: number
  commits: number
}

/** A project active in the range (sessions, subagents, workflows or commits). */
export type OfficeProject = {
  name: string
  path?: string
  worktrees?: string[]
  worktrees_more?: number
  live?: { desks: number; busy: number; idle: number; waiting?: number; interns: number; meetings: number }
  sessions: number
  subagents: number
  workflows: number
  desk_minutes: number
  agent_minutes: number
  /** How much of agent_minutes was whose: agent-minutes per kind of agent. */
  agents?: OfficeAgentMinutes
  prompts: number
  tool_calls: number
  files_edited: number
  commits: number
  additions: number
  deletions: number
  activity?: OfficeActivityCounts
  intern_types?: Record<string, number>
  models?: Record<string, number>
  per_day?: Record<string, OfficeDay>
  per_hour?: number[]
  titles?: string[]
  top_commits?: { sha: string; subject: string; time: string }[]
}

/**
 * One main session of a timelapse (a desk's worth of work): the project it worked in, who it was, and the slots it
 * worked in. Slot `i` is local wall-clock time on day `days[floor(i / per_day)]`, from minute `(i % per_day) * slot_min`
 * of that day, `slot_min` long.
 */
export type OfficeTimelineDesk = {
  /** A stable short id (a hash of the session id, never the id itself): what a drawing keys a desk's look by. */
  id: string
  /** The project it worked in, named as `projects` names it (the same git-ancestor rollup). */
  project: string
  /** Which kind of agent it was (Claude when missing). */
  agent?: OfficeAgent
  /** The account it worked from, when its agent has several (`main`, `work`…); null or missing when it has one. */
  account?: string | null
  /** Its title (custom or AI title), redacted and clipped to 80; missing when it has none. */
  title?: string
  /**
   * The slots it worked in, as [from, to) ranges of slot indices: sorted, apart (two ranges never touch), each at least
   * one slot long, all within [0, slots). A slot counts once the session was active in it for at least a twentieth of a
   * slot, and at least a minute.
   */
  runs: [number, number][]
  /**
   * Its subagents at work (interns, not workflow agents), as change points [slot, count]: from that slot on, `count` of
   * them work, until the next point. Sorted by slot, no two at one slot, no two in a row with the same count, the last
   * one at count 0. Missing when it had none in the range.
   */
  interns?: [number, number][]
}

/** One workflow run of a timelapse (a meeting): its project, name and the slots it ran in, [from, to). */
export type OfficeTimelineMeeting = { project: string; name: string; from: number; to: number; agents: number }

/**
 * The range replayed slot by slot (`node scripts/office.mjs timelapse <yesterday|week|month> --json`): yesterday in
 * quarters of an hour, the last 7 days in hours, the last 30 days in 4-hour slots, from the first day's midnight up to
 * the slot of now (the whole of yesterday).
 */
export type OfficeTimeline = {
  kind: 'yesterday' | 'week' | 'month'
  /** The range's label, as `range.label`: 'Tue 27 Oct' or 'Thu 22 Oct → Wed 28 Oct'. */
  label: string
  /** The range's local days, `YYYY-MM-DD`, oldest first (`range.days`). */
  days: string[]
  /** Minutes per slot: 15, 60 or 240. */
  slot_min: number
  /** Slots per day: 1440 / slot_min. */
  per_day: number
  /** How many slots there are to replay: up to and including the slot of now (all of them for yesterday). */
  slots: number
  /** The sessions that worked in the range, by their first slot (then project, then id); at most 600. */
  desks: OfficeTimelineDesk[]
  /** The workflow runs that ran in the range, by `from`. */
  meetings: OfficeTimelineMeeting[]
  /** Commits per project and slot (n ≥ 1), by slot then project. */
  commits: { project: string; slot: number; n: number }[]
  /** Sessions that worked in the range but were left out of `desks` (the cap). */
  more: number
}

/** The collector's whole answer (`node scripts/office.mjs all --json`): the renderers' only input. */
export type OfficeFacts = {
  spec: 'theoffice/1' | (string & {})
  generated_at: string
  /** The days read; `back`: how many pages back a page of the past is (lib/period.mjs), absent on a range as it runs now. */
  range: { kind: 'live' | 'today' | 'week' | 'month' | 'all' | (string & {}); from: string; to: string; days: string[]; label: string; back?: number }
  now: { iso: string; local_date: string; local_time: string; hour: number; weekday: string; is_night: boolean }
  live: {
    counts: OfficeLiveCounts
    desks: OfficeDesk[]
    recently_left: { title: string; project: string; left_at: string; agent?: OfficeAgent }[]
  }
  projects: OfficeProject[]
  projects_more: number
  /** Other agents reported by novi that the office has no reader of its own for (Aider, Amp, Cline…): visitors. */
  contractors: { tool: string; project: string; title?: string; minutes: number; start?: string; end?: string; live?: boolean }[]
  /**
   * The accounts read, one per agent home (~/.claude, ~/.claude-work, ~/.codex…) that worked in the range or has a desk:
   * label null when its agent has one account.
   */
  accounts?: { agent: OfficeAgent; label: string | null; minutes: number; sessions: number; live: number }[]
  totals: Omit<OfficeProject, 'name' | 'path' | 'worktrees' | 'worktrees_more' | 'live' | 'per_day' | 'per_hour' | 'titles'
    | 'top_commits'> & { projects: number }
  per_day: Record<string, OfficeDay>
  per_hour: number[]
  /** The range slot by slot, for the timelapse: only in a `timelapse` answer. */
  timeline?: OfficeTimeline
  sources?: Record<string, unknown>
  notes?: string[]
  /**
   * A first light (`--first-light`): the live floor alone, read in about a second on a machine's first open while the
   * run after it reads the week. Nothing is counted yet (totals, projects' time, commits are 0), and the drawings say so.
   */
  first_light?: boolean
}

// ---------------------------------------------------------------- state

/**
 * A tab of the desktop pane, named by the view it draws: `all` is the Office tab (the live building, in pixel art and in
 * text alike; this week's tower is the Week tab), `work` is What they did, `timelapse` the replay of yesterday, this week
 * or this month. Today and Month draw facts of their own range, the Timelapse the `timelapse` facts of its picked range;
 * the others draw `snapshot`.
 */
export type OfficeTab = 'all' | 'today' | 'week' | 'month' | 'work' | 'timelapse'

/**
 * How far a run of the collector has read, as the pane shows it while a tab waits: the shared answer it is for (`key`:
 * `all`, `today`, `month`, `month-2026-08-01`…), its step (1 Claude's sessions, 2 the other agents', in bytes; 3 git, in
 * repos) of `steps`, `done` of `total` in that step, when it began, when it last said so and when the pane last looked
 * (epoch ms: how long it has been going is `seen - began`).
 */
export type OfficeProgress = { key: string; step: number; steps: number; done: number; total: number; began: number; at: number; seen: number }

/**
 * How a tab pages through the past (lib/period.mjs): Today by days, Week and What they did by Monday-to-Sunday weeks,
 * Month by calendar months.
 */
export type OfficeUnit = 'day' | 'week' | 'month'

/**
 * The page each unit's tabs show: 0 the range as it runs now (today, the last 7 days, last month and this one so far),
 * N the N-th whole day, Monday-to-Sunday week or calendar month before it, with no end (the collector's `<view> --back N`).
 */
export type OfficeBacks = { day: number; week: number; month: number }

/** What the Month's export keeps: a room of its drawing (the wall calendar, the building directory), all of it, or its stats. */
export type OfficeMonthPart = 'calendar' | 'directory' | 'whole' | 'stats'

/** How the Month's export keeps it: a still (PNG, SVG) or a loop (GIF, video) of a drawing, the stats as a page, CSV or JSON. */
export type OfficeMonthFormat = 'png' | 'svg' | 'gif' | 'video' | 'html' | 'csv' | 'json'

declare module 'claude-code' {
  interface PluginState {
    theoffice: {
      /** The last week facts (`all`) the collector answered; null until the first good run. A failed run keeps the last one. */
      snapshot: OfficeFacts | null
      /** The last `today` facts (today's hours), fetched only while the Today tab is on screen; null until then. */
      today: OfficeFacts | null
      /** The last `month` facts (last month and this one so far), fetched only while the Month tab is on screen; null until then. */
      month: OfficeFacts | null
      /** The tab the pane draws; a press sets it, and $.store keeps the person's pick across sessions. */
      tab: OfficeTab
      /**
       * True while the Live tab is drawn with its names alone (its Quiet key, lib/svg.mjs `quiet`); false by default. A
       * press of the key flips it, and $.store keeps it like the tab.
       */
      quiet: boolean
      /**
       * True while every tab's drawing is drawn bigger (its Zoom key, lib/svg.mjs `scale`); false by default. A press of
       * the key flips it, and $.store keeps it like the tab.
       */
      zoom: boolean
      /**
       * Animation frame of the block-glyph office (typing hands, blinking monitors) and of the text timelapse; ticks
       * only while the pane is open, on screen, on the Office tab or the Timelapse (the only text that moves) and drawn as
       * text, on a terminal. Back to 0 when a timelapse replay starts. The pixel-art SVG animates
       * itself and never reads it.
       */
      frame: number
      /** Why the last refresh failed, in a few words (never collector output); null after a good run. */
      trouble: string | null
      /** Why the selected Today or Month tab's facts could not be read, in a few words; null after a good run. */
      rangeTrouble: string | null
      /**
       * The last `timelapse <lapse>` facts of the picked range (with `timeline`), fetched only when the person asks (the
       * Timelapse tab or a range pressed, the pane opening on it with none); null until then. Never refreshed by
       * itself: new facts restart the replay.
       */
      timelapse: OfficeFacts | null
      /** The range the Timelapse replays (`week` by default); a range press sets it, and $.store keeps it like the tab. */
      lapse: OfficeTimeline['kind']
      /** Why the picked range's timelapse could not be read, in a few words; null after a good run or a new pick. */
      lapseTrouble: string | null
      /** The page the last export saved and opened (an absolute path to an .html file); null until one is saved. */
      lapseSaved: string | null
      /** True while an export runs (one at a time): the Export Button says so. */
      lapseExporting: boolean
      /**
       * The page of the past each unit's tabs show (all 0 by default): the strip under the tabs sets it, for this session
       * only (never $.store). Week and What they did share theirs.
       */
      backs: OfficeBacks
      /**
       * The facts of the page of the past on screen (`<view> --back N`), read when a press or its tab coming on screen
       * asks for one that is not kept; null until then, and once the pane closes.
       */
      past: OfficeFacts | null
      /** True while the page of the past on screen is being read: the strip says so, and the tab keeps what it drew. */
      pastReading: boolean
      /**
       * The Month's export row under its strip: closed (null), asking what to export (`what`), or how to keep the part it
       * names. Only a press sets it (the Export key, a part, Back); a tab switch or an export closes it.
       */
      monthAsk: 'what' | OfficeMonthPart | null
      /** True while a Month export runs (one at a time): the strip's Export key and its Button say so. */
      monthExporting: boolean
      /**
       * The file the last Month export saved (an absolute path), and the page it was of (`month:now`, or the page's key,
       * `month:2026-09-01`): named under the strip while that page is on screen. Null until one is saved.
       */
      monthSaved: { file: string; page: string } | null
      /** True while the pane is open, placed and not behind another tab; the band's Open The Office Button shows while it is false. */
      onScreen: boolean
      /**
       * How far the run a tab waits for has read (its `<key>.progress.json`, beside the collector's shared answer): read
       * by the watcher while the tab waits on screen, null when there is nothing to say.
       */
      progress: OfficeProgress | null
    }
  }
}

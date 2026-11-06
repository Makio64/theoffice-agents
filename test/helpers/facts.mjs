// Facts builders for the renderer tests (test/ascii.test.mjs): the anonymized sample, the empty office, a 20-desk
// stress office full of hostile text, and the sample as a today or a month range.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seeded } from '../../plugin/lib/model.mjs'

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'facts-sample.json'), 'utf8'))
export const clone = (o) => JSON.parse(JSON.stringify(o))

// ---------------------------------------------------------------- fixtures

export function emptyFacts() {
  const f = clone(SAMPLE)
  return {
    spec: f.spec, generated_at: f.generated_at, range: f.range, now: f.now,
    live: { counts: { desks: 0, busy: 0, idle: 0, waiting: 0, interns: 0, meetings: 0, meeting_agents: 0 }, desks: [], recently_left: [] },
    projects: [], projects_more: 0, contractors: [],
    totals: { projects: 0, sessions: 0, subagents: 0, workflows: 0, desk_minutes: 0, agent_minutes: 0, prompts: 0, tool_calls: 0, files_edited: 0, commits: 0, additions: 0, deletions: 0, activity: {}, intern_types: {}, models: {} },
    per_day: {}, per_hour: new Array(24).fill(0), sources: {}, notes: [],
  }
}

const NASTY = [
  '🚀 Ship the 新しい renderer with 漢字 and emoji 🎉🎉 everywhere and then some more words',
  'Ünïcödé façade — naïve café résumé Héraclès',
  'Zero\u200bwidth\u200d joiner 👨‍👩‍👧 family ✨ sparkle',
  'x'.repeat(220),
  'Tab\tand\nnewline \x1b[31mred\x1b[0m \x07bell \u009bcsi',
  'Back`tick`s in `code` spans',
  '한국어 제목 테스트 프로젝트',
  'e\u0301 combining + q\u0301 marks ©™‼',
  'שלום עולם hebrew rtl title مرحبا',
]

/** 20 desks over 9 projects (every class and kind), 3 meetings of 12 agents, many interns, 40 projects + 9 capped. */
export function stressFacts() {
  const f = clone(SAMPLE)
  const base = SAMPLE.live.desks[2]
  const names = ['プロジェクト-alpha', 'island-tour-3d', 'an-extremely-long-project-name-that-keeps-going-and-going', 'md2epub', '🎮-games', 'glyph-atlas-webgpu', 'recipe-chat', 'gizmo3d', 'theoffice-agents']
  const kinds = ['coding', 'reading', 'terminal', 'testing', 'web', 'delegating', 'planning', 'talking', 'design', 'tools', 'thinking']
  const states = ['working', 'working', 'working', 'waiting_on_agents', 'asking', 'idle', 'idle']
  const intern = (k, type) => ({ id: `i${k}`, type, description: NASTY[k % NASTY.length], started_at: f.now.iso, last_seen: f.now.iso })
  const meeting = (k) => ({ id: `wf_${k}`, name: `${NASTY[k]}-workflow`, phase: k === 1 ? '実装フェーズ' : 'Implement', agents_running: 7, agents_done: 3, agents_failed: 1, agents_total: 12, started_at: f.now.iso, labels: ['impl:a', 'impl:b', 'impl:🎉', 'impl:d'] })
  f.live.desks = Array.from({ length: 20 }, (_, i) => {
    const state = states[i % states.length]
    const kind = kinds[i % kinds.length]
    return {
      ...clone(base), id: `s${String(i).padStart(7, '0')}`, pid: 80000 + i, project: names[i % names.length], title: NASTY[i % NASTY.length],
      worktree: i % 5 === 0 ? `wt-${NASTY[0]}` : null, branch: i % 3 ? 'main' : `feature/${NASTY[6]}`,
      status: state === 'idle' ? 'idle' : state === 'asking' ? 'waiting' : 'busy', state,
      // the idle ones of the last 10 minutes on a break (the kitchen); the older ones dozing, stopped, on an error
      idle_reason: state !== 'idle' ? null : i % 2 ? ['stopped', 'error', 'done'][Math.floor(i / 7) % 3] : 'break',
      activity: { kind: state === 'idle' ? 'idle' : kind, tool: i % 2 ? 'Edit' : null, label: NASTY[(i + 3) % NASTY.length], since: i % 2 ? '2026-10-25T21:00:00.000Z' : '2026-10-26T00:30:00.000Z' },
      started_at: `2026-10-25T${String(18 + (i % 6)).padStart(2, '0')}:${String(10 + i).padStart(2, '0')}:00.000Z`,
      interns: i === 0 ? Array.from({ length: 9 }, (_, k) => intern(k, ['Explore', 'Plan', 'general-purpose', 'my-custom-agent'][k % 4])) : i % 4 === 1 ? [intern(i, 'code-reviewer'), intern(i + 1, 'Explore')] : [],
      meetings: i === 3 ? [meeting(0), meeting(1)] : i === 10 ? [meeting(2)] : [],
    }
  })
  f.projects = Array.from({ length: 40 }, (_, i) => ({
    ...clone(SAMPLE.projects[i % SAMPLE.projects.length]),
    name: i < names.length ? names[i] : `${NASTY[i % NASTY.length].slice(0, 30)}-${i}`,
    titles: [NASTY[(i + 1) % NASTY.length]],
    worktrees: i % 7 ? [] : ['a', 'b', 'c'],
  }))
  f.projects_more = 9
  f.live.recently_left = [{ title: NASTY[0], project: names[0], left_at: '2026-10-26T00:31:00.000Z' }, { title: NASTY[1], project: '新項目', left_at: '2026-10-26T00:20:00.000Z' }, { title: 'x', project: 'y', left_at: 'not a date' }]
  f.contractors = [{ tool: 'codex', project: names[0], title: NASTY[0], minutes: 95, start: f.now.iso, end: f.now.iso, live: true }, { tool: '🤖bot', project: 'md2epub', title: 't', minutes: 0, start: f.now.iso, end: f.now.iso, live: false }]
  return f
}

/**
 * The sample with every way a turn can end on the floor: Lava Cavern done (38m ago), a desk stopped by the user and one
 * on an API error (2h ago: neither dozes), Atlas on its break, Fresques dozing (done 1h33 ago): 12 desks.
 */
export function idleFacts() {
  const f = clone(SAMPLE)
  const lava = f.live.desks.find((d) => d.id === '93e1aa07')
  lava.idle_reason = 'done'
  const later = (id, title, idle_reason, label = null) => ({
    ...clone(lava), id, title, idle_reason, activity: { kind: 'idle', tool: null, label, since: '2026-10-25T22:40:00.000Z' },
  })
  f.live.desks.push(later('5a0b0c0d', 'Shader warmup pass', 'stopped'), later('e7707e77', 'Volcano particles', 'error', "You've hit your session limit"))
  return f
}

/** The sample as a 30-day month range (the 23 earlier days empty except a few), for the wall calendar. */
export function monthFacts() {
  const f = clone(SAMPLE)
  const days = []
  for (let i = 29; i >= 0; i--) days.push(new Date(Date.UTC(2026, 9, 26 - i)).toISOString().slice(0, 10))
  f.range = { ...f.range, kind: 'month', days, label: 'Sun 27 Sep → Mon 26 Oct' }
  for (const d of days) f.per_day[d] ??= { minutes: d === '2026-10-01' ? 600 : 0, desk_minutes: 0, sessions: 0, subagents: 0, workflows: 0, prompts: 0, commits: 0 }
  return f
}

/** The sample as a today range (per_hour only up to now), for the timesheet. */
export function todayFacts() {
  const f = clone(SAMPLE)
  f.range = { ...f.range, kind: 'today', from: '2026-10-25T23:00:00.000Z', days: ['2026-10-26'], label: 'Mon 26 Oct' }
  f.per_day = { '2026-10-26': SAMPLE.per_day['2026-10-26'] }
  f.per_hour = [307, 372, ...new Array(22).fill(0)]
  for (const p of f.projects) p.per_hour = p.per_hour.map((v, h) => (h <= 1 ? v : 0))
  return f
}

// ---------------------------------------------------------------- the timelapse

// What a made-up office does in a day, for timelapseFacts: the projects it works on (the sample's busiest, the first
// the most), the agents at its desks, and the titles of its sessions.
const LAPSE_PROJECTS = ['harborledger', 'glyph-atlas-webgpu', 'island-tour-3d', 'webgl-swatch-demos', 'csv-batch-importer', 'recipe-chat', 'md2epub']
const LAPSE_TITLES = [
  'Footnote links in EPUB 3', 'Coconut drum rhythm puzzle', 'Deploy previews and assets', 'Playtest notes and difficulty',
  'Clawd desk sprites in pixel art', 'Final arcade world design', 'Exporter cleanup', 'Ledger import for March',
  'Swatch grid on WebGPU', 'CSV batch retries', 'Recipe chat onboarding', 'Wizard cape shoulder pose',
]
const LAPSE = {
  yesterday: { days: ['2026-10-25'], slot: 15, label: 'Sun 25 Oct' },
  week: { days: Array.from({ length: 7 }, (_, i) => `2026-10-${20 + i}`), slot: 60, label: 'Tue 20 Oct → Mon 26 Oct' },
  month: {
    days: Array.from({ length: 30 }, (_, i) => new Date(Date.UTC(2026, 8, 27 + i)).toISOString().slice(0, 10)),
    slot: 240, label: 'Sun 27 Sep → Mon 26 Oct',
  },
}

/**
 * The sample as a timelapse answer (`office.mjs timelapse <kind> --json`): `kind` is 'yesterday' (Sun 25 Oct in
 * quarters of an hour), 'week' (Tue 20 → Mon 26 Oct in hours) or 'month' (27 Sep → 26 Oct in 4-hour slots), now
 * Mon 26 Oct 18:10 local (17:10Z, Europe/Paris). Seeded, so the same kind always gives the same facts: an office that
 * gets in around nine, works into the evening (a night owl now and then), with interns, meetings and commits; a few
 * Dex, Gem and Caret desks unless `claudeOnly`. `heavy` packs a project with 30 sessions at once and every agent of
 * the cast, on two accounts, for the size budget.
 */
export function timelapseFacts(kind = 'week', { claudeOnly = false, heavy = false } = {}) {
  const spec = LAPSE[kind] ?? LAPSE.week
  const f = clone(SAMPLE)
  const perDay = 1440 / spec.slot
  const nowSlot = Math.floor((18 * 60 + 10) / spec.slot)
  const slots = kind === 'yesterday' ? perDay : (spec.days.length - 1) * perDay + nowSlot + 1
  f.now = { iso: '2026-10-26T17:10:00.000Z', local_date: '2026-10-26', local_time: '18:10', hour: 18, weekday: 'Mon', is_night: false }
  f.generated_at = f.now.iso
  const fromIso = kind === 'yesterday' ? '2026-10-24T22:00:00.000Z' : kind === 'week' ? '2026-10-19T22:00:00.000Z' : '2026-09-26T22:00:00.000Z'
  f.range = { kind, from: fromIso, to: kind === 'yesterday' ? '2026-10-25T23:00:00.000Z' : f.now.iso, days: spec.days, label: spec.label }
  const rnd = seeded(`timelapse:${kind}:${claudeOnly}:${heavy}`)
  const pick = (list) => list[Math.floor(rnd() * list.length) % list.length]
  // the busiest project first: a weighted pick, harborledger about a third of the time
  const project = () => LAPSE_PROJECTS[Math.min(LAPSE_PROJECTS.length - 1, Math.floor(rnd() ** 1.7 * LAPSE_PROJECTS.length))]
  const agent = () => {
    if (claudeOnly) return undefined
    const r = rnd()
    return heavy ? pick(['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok']) : r < 0.72 ? undefined : r < 0.88 ? 'codex' : r < 0.96 ? 'gemini' : 'cursor'
  }
  const toSlot = (day, min) => day * perDay + Math.floor(min / spec.slot)
  const desks = []
  const meetings = []
  const commits = new Map()
  spec.days.forEach((date, day) => {
    const weekend = ['2026-10-24', '2026-10-25', '2026-10-17', '2026-10-18', '2026-10-10', '2026-10-11', '2026-10-03', '2026-10-04', '2026-09-27'].includes(date)
    const n = kind === 'month' ? (weekend ? 4 : 11) : kind === 'yesterday' ? 22 : weekend ? 6 : 16
    for (let k = 0; k < n; k++) {
      // most start in the morning, some after lunch, a night owl now and then
      const r = rnd()
      const start = r < 0.6 ? 480 + Math.floor(rnd() * 240) : r < 0.9 ? 780 + Math.floor(rnd() * 300) : 1200 + Math.floor(rnd() * 200)
      const len = 30 + Math.floor(rnd() * 270)
      const runs = []
      let at = start
      while (at < start + len) {
        const work = 20 + Math.floor(rnd() * 100)
        runs.push([toSlot(day, at), toSlot(day, Math.min(1439, at + work)) + 1])
        at += work + (rnd() < 0.5 ? 15 + Math.floor(rnd() * 45) : 120)
      }
      const merged = []
      for (const [a, b] of runs) {
        const lo = Math.min(a, slots - 1)
        const hi = Math.min(b, slots)
        if (hi <= lo) continue
        const last = merged.at(-1)
        if (last && lo <= last[1]) last[1] = Math.max(last[1], hi)
        else merged.push([lo, hi])
      }
      if (!merged.length) continue
      const d = { id: `d${kind[0]}${String(desks.length).padStart(3, '0')}`, project: project(), runs: merged }
      const a = agent()
      if (a) d.agent = a
      if (heavy && rnd() < 0.5) d.account = rnd() < 0.5 ? 'main' : 'work'
      if (rnd() < 0.9) d.title = pick(LAPSE_TITLES)
      if (rnd() < 0.35) {
        const [a0, b0] = merged[0]
        const s = Math.min(b0 - 1, a0 + Math.floor(rnd() * Math.max(1, b0 - a0)))
        const e = Math.min(b0, s + 1 + Math.floor(rnd() * 3))
        const c = 1 + Math.floor(rnd() * 3)
        d.interns = e > s + 1 && rnd() < 0.5 ? [[s, c], [s + 1, c + 1], [e, 0]] : [[s, c], [e, 0]]
      }
      desks.push(d)
      if (rnd() < 0.4) {
        const slot = merged.at(-1)[1] - 1
        const key = `${slot}|${d.project}`
        commits.set(key, (commits.get(key) ?? 0) + 1 + Math.floor(rnd() * 3))
      }
    }
    if (kind !== 'month' || day % 3 === 0) {
      const from = toSlot(day, 600 + Math.floor(rnd() * 360))
      if (from < slots) meetings.push({ project: project(), name: pick(['arcade-finale-brief', 'release-checklist', 'island-audio-pass']), from, to: Math.min(slots, from + 1 + Math.floor(rnd() * (kind === 'yesterday' ? 8 : 3))), agents: 3 + Math.floor(rnd() * 9) })
    }
  })
  if (heavy) {
    for (let k = 0; k < 30; k++) desks.push({ id: `dh${String(k).padStart(3, '0')}`, project: 'island-tour-3d', agent: pick(['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok']), account: k % 2 ? 'work' : 'main', title: pick(LAPSE_TITLES), runs: [[Math.min(slots - 2, perDay + 2 + (k % 5)), Math.min(slots, perDay + 8 + (k % 7))]], interns: [[Math.min(slots - 2, perDay + 3), 4], [Math.min(slots - 1, perDay + 6), 0]] })
  }
  desks.sort((a, b) => a.runs[0][0] - b.runs[0][0] || a.project.localeCompare(b.project) || a.id.localeCompare(b.id))
  meetings.sort((a, b) => a.from - b.from)
  f.timeline = {
    kind, label: spec.label, days: spec.days, slot_min: spec.slot, per_day: perDay, slots, desks, meetings,
    commits: [...commits].map(([k, n]) => ({ project: k.split('|')[1], slot: Number(k.split('|')[0]), n }))
      .sort((a, b) => a.slot - b.slot || a.project.localeCompare(b.project)),
    more: 0,
  }
  return f
}

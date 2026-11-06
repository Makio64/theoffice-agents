// PURE: the words of the voxel office, shared by its local host (lib/voxel-dashboard.mjs) and its browser (site/voxel):
// what a desk's tag says, and how long it has been at it, in the same words and steps as the pixel office's tags
// (lib/svg-live.mjs doing, brief and deskTime). No node:* imports: the browser bundle imports this file.
import { IDLE_CLASSES, KIND_VERB, TOOL_VERB, idleDoing, plural } from './model.mjs'
import { fmtAtLeast } from './format.mjs'

/** What a desk at work is at, in a word, for its tag ('coding · 1h30+'): svg-live KIND_WORD. */
export const KIND_WORD = Object.freeze(Object.assign(Object.create(null), {
  coding: 'coding', terminal: 'terminal', testing: 'tests', web: 'web', reading: 'reading', planning: 'planning', delegating: 'delegating',
  talking: 'talking', design: 'design', tools: 'tools',
}))

/** Desk classes that need you now: their tag says what in full, framed in their color (svg-live NEEDY). */
export const NEEDY = Object.freeze(new Set(['asking', 'error', 'stopped']))
/** Desk classes that wait on you: the needy ones and a turn done (svg-live YOURS). */
export const YOURS = Object.freeze(new Set([...NEEDY, 'done']))

/**
 * A desk's words, as the pixel office writes them: `doing` its whole caption ('edit cape.js', 'asks: Which cape
 * anchor?'), `words` the short second line of its tag ('coding', 'your turn', '3 interns') and `clock`, where the time
 * after those words counts from: `fine` (ten-minute steps) for a desk at work, coarse for one at rest, null for none.
 * `kind` is the desk's class (model.mjs deskClass); the rest are the desk's already cleaned fields.
 */
export function deskWords(kind, { label = '', tool = null, activityKind = null, idleReason = null, interns = [], meetings = [], startedAt = null, since = null, lastSeen = null } = {}) {
  let doing
  if (kind === 'thinking') doing = 'thinking…'
  else if (kind === 'waiting') doing = meetings.length ? `meeting ${meetings[0].name ?? ''}`.trim() : interns.length ? `${plural(interns.length, 'intern')} at work` : 'waiting on helpers'
  else if (kind === 'asking') doing = `asks: ${label || 'a question'}`
  else if (IDLE_CLASSES.has(kind)) doing = idleDoing({ activity: { label }, idle_reason: idleReason }, kind)
  else {
    const verb = TOOL_VERB[tool] ?? KIND_VERB[activityKind] ?? 'use'
    doing = label ? `${verb} ${label}` : verb
  }
  const rest = since ?? lastSeen
  let words
  let clock = null
  if (NEEDY.has(kind)) words = doing
  else if (kind === 'thinking') { words = 'thinking'; clock = startedAt ? { from: startedAt, fine: true } : null }
  else if (kind === 'waiting') words = meetings.length ? 'in a meeting' : interns.length ? plural(interns.length, 'intern') : 'helpers busy'
  else if (kind === 'done') { words = 'your turn'; clock = rest ? { from: rest, fine: false } : null }
  else if (kind === 'dozing') { words = 'dozing'; clock = rest ? { from: rest, fine: false } : null }
  else if (kind === 'break') words = 'on break'
  else { words = KIND_WORD[activityKind] ?? 'at work'; clock = startedAt ? { from: startedAt, fine: true } : null }
  return { doing, words, clock }
}

/**
 * The time after a tag's words, read off `nowMs`: a desk at work to ten minutes ('<20m', '10m+' … '1h30+', '9h50+',
 * whole hours to a day, then '1d+'), as svg-live deskTime says it on a live drawing; a desk at rest in the coarse steps
 * of format.mjs fmtAtLeast ('10m+', '1h+', '3h+'). '' without a time.
 */
export function tagTime(clock, nowMs) {
  const from = Date.parse(clock?.from ?? '')
  if (!Number.isFinite(from) || !Number.isFinite(nowMs)) return ''
  const m = Math.max(0, (nowMs - from) / 60e3)
  if (!clock.fine) return fmtAtLeast(m)
  if (m < 10) return '<20m'
  if (m < 60) return `${Math.floor(m / 10) * 10}m+`
  if (m < 600) {
    const tens = Math.floor((m % 60) / 10) * 10
    return `${Math.floor(m / 60)}h${tens || ''}+`
  }
  if (m < 1440) return `${Math.floor(m / 60)}h+`
  return `${Math.floor(m / 1440)}d+`
}

/** A desk class's status in the voxel office's four older words, for its directory and activity feed. */
export function statusOfKind(kind) {
  if (kind === 'asking') return 'waiting'
  if (kind === 'done') return 'done'
  if (kind === 'working' || kind === 'thinking' || kind === 'waiting') return 'working'
  return 'idle'
}

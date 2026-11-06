// PURE: tool name → activity kind, desk labels, intern job titles.
// No node:* imports — shared with the desktop mod hooks module.
import { clip, redact } from './format.mjs'

// ---------------------------------------------------------------- kinds

/** Activity kinds counted in history (facts `activity` objects always carry all ten keys, in this order). */
export const KINDS = ['coding', 'reading', 'terminal', 'testing', 'web', 'delegating', 'planning', 'talking', 'design', 'tools']

const CODING = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READING = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead', 'ToolSearch'])
const TERMINAL = new Set(['Bash', 'Monitor', 'BashOutput', 'KillShell', 'TaskOutput'])
const WEB = new Set(['WebFetch', 'WebSearch'])
const DELEGATING = new Set(['Agent', 'Task', 'Workflow', 'SendMessage', 'TaskStop'])
const PLANNING = new Set(['TodoWrite', 'mcp__ccd_turn__update_plan', 'ExitPlanMode', 'EnterPlanMode', 'Skill'])
const TALKING = new Set(['AskUserQuestion', 'mcp__ccd_turn__wrap_up', 'PushNotification', 'SendUserFile'])
const DESIGN = new Set(['Artifact'])
const TEST_RE = /\b(test|tests|jest|vitest|pytest|mocha|playwright|node --test|cargo test|go test|npm (run )?test|pnpm test)\b/i

/** Tools whose `file_path` counts as an edited file. */
export const EDIT_TOOLS = CODING

/**
 * Activity kind of one tool call. `input` is optional and only consulted for Bash/Monitor, where a
 * test run (`npm test`, `node --test`, `pytest`…) is promoted from `terminal` to `testing`.
 */
export function kindOf(name, input) {
  const n = String(name ?? '')
  if (CODING.has(n)) return 'coding'
  if (READING.has(n)) return 'reading'
  if (TERMINAL.has(n)) {
    if ((n === 'Bash' || n === 'Monitor') && input && (TEST_RE.test(String(input.command ?? '')) || TEST_RE.test(String(input.description ?? '')))) return 'testing'
    return 'terminal'
  }
  if (WEB.has(n)) return 'web'
  if (DELEGATING.has(n)) return 'delegating'
  if (PLANNING.has(n)) return 'planning'
  if (TALKING.has(n)) return 'talking'
  if (DESIGN.has(n)) return 'design'
  if (n.startsWith('mcp__')) {
    const server = n.slice(5, n.indexOf('__', 5) > 0 ? n.indexOf('__', 5) : undefined).toLowerCase()
    if (server === 'claude_browser' || server === 'claude-in-chrome' || server.includes('browser')) return 'web'
    if (server === 'ccd_session') return 'delegating'
    if (server === 'visualize' || server === 'blender' || server.includes('figma')) return 'design'
    const tool = n.slice(n.lastIndexOf('__') + 2).toLowerCase()
    if (/image|video|figma|figjam/.test(tool)) return 'design'
    return 'tools'
  }
  return 'tools'
}

// ---------------------------------------------------------------- labels

function basename(p) {
  return String(p ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

function hostname(url) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(String(url ?? ''))
  return m ? m[1] : ''
}

/**
 * Short desk caption for a tool call: Bash → its description (or the start of the command), Edit/Read →
 * file basename, WebFetch → host, Agent → description… Always redacted, control-stripped, ≤ 40 columns.
 */
export function labelOf(name, input) {
  const n = String(name ?? '')
  const i = input && typeof input === 'object' ? input : {}
  let s = ''
  if (n === 'Bash' || n === 'Monitor') s = i.description || String(i.command ?? '').slice(0, 200)
  else if (CODING.has(n) || n === 'Read' || n === 'NotebookRead') s = basename(i.file_path || i.notebook_path)
  else if (n === 'Grep' || n === 'Glob') s = i.pattern
  else if (n === 'WebFetch') s = hostname(i.url)
  else if (n === 'WebSearch') s = i.query
  else if (n === 'Agent' || n === 'Task') s = i.description || i.subagent_type
  else if (n === 'Workflow') s = i.workflowName || i.name || basename(i.scriptPath).replace(/\.m?js$/, '') || 'workflow'
  else if (n === 'Skill') s = i.skill
  else if (n === 'AskUserQuestion') s = i.questions?.[0]?.header || 'question'
  else if (n === 'TodoWrite') s = 'todo list'
  else if (n.startsWith('mcp__')) s = n.slice(n.lastIndexOf('__') + 2)
  else s = n
  return clip(redact(s ?? ''), 40)
}

// ---------------------------------------------------------------- interns

/** Office job title per subagent type (the office calls subagents "interns"). */
export const JOB_TITLES = {
  Explore: 'researcher',
  Plan: 'architect',
  'general-purpose': 'generalist',
  'workflow-subagent': 'consultant',
  'claude-code-guide': 'librarian',
  'statusline-setup': 'decorator',
  'code-reviewer': 'reviewer',
}

/**
 * Job title for an agentType; unknown custom agents are "specialist". Own keys only: the type comes from a transcript
 * and a project may name an agent `constructor` or `toString`.
 */
export function jobTitle(agentType) {
  return Object.hasOwn(JOB_TITLES, agentType) ? JOB_TITLES[agentType] : 'specialist'
}

/** A zeroed `{ coding: 0, … tools: 0 }` object (stable key order for renderers). */
export function emptyActivity() {
  const o = {}
  for (const k of KINDS) o[k] = 0
  return o
}

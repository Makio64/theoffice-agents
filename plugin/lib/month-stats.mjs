// PURE: the month's full stats, as the Month tab's export writes them (`office.mjs month --export stats`): the numbers
// the wall calendar, the building directory and the crew draw, and the ones they leave out, as one object
// (monthStats), then as a page (statsPage: the month's drawing over its tables), a spreadsheet's CSV (statsCsv: a
// row per day, a column per project) or JSON (statsJson). The page has no script and loads nothing (a CSP meta forbids
// it), like the office's other pages. No node:* imports.
import { CAST } from './cast.mjs'
import { fmtAgentTime, fmtHours, fmtInt } from './format.mjs'
import { ROLE_HEX, crewRows, dayInfo } from './model.mjs'
import { esc } from './svg.mjs'

/** What the JSON says it is: its shape's name and version. */
export const STATS_SPEC = 'theoffice-month-stats/1'

const YMD = /^\d{4}-\d{2}-\d{2}$/
const num = (x) => (Number.isFinite(Number(x)) ? Math.max(0, Number(x)) : 0)
const hours = (min) => Math.round((num(min) / 60) * 100) / 100
const isDay = (d) => typeof d === 'string' && YMD.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d

/** The range's days, oldest first: range.days, else the per_day keys, real days only, at most the last 62. */
function daysOf(f) {
  let list = (Array.isArray(f.range?.days) ? f.range.days : []).filter(isDay)
  if (!list.length && f.per_day && typeof f.per_day === 'object') list = Object.keys(f.per_day).filter(isDay)
  return [...new Set(list)].sort().slice(-62)
}

/**
 * The month in numbers, from the facts the Month tab draws: its range (label, first and last day, how many), its
 * totals, what stood out (the days worked, the busiest day, the longest run of worked days, the weekends' agent-time,
 * agent-time per worked day), the crew (each AI's agent-time, sessions and share, busiest first), the projects (busiest
 * first, as the directory lists them, with the days each worked) and one entry per day. A day counts as worked when
 * it has agent-time, sessions or commits. Minutes stay minutes; `*_hours` are the same to two decimals.
 */
export function monthStats(facts) {
  const f = facts && typeof facts === 'object' ? facts : {}
  const t = f.totals && typeof f.totals === 'object' ? f.totals : {}
  const per = f.per_day && typeof f.per_day === 'object' ? f.per_day : {}
  const list = daysOf(f)
  const days = list.map((d) => {
    const p = per[d] && typeof per[d] === 'object' ? per[d] : {}
    const i = dayInfo(d)
    const row = {
      day: d, weekday: i.wd, agent_minutes: Math.round(num(p.minutes)), sessions: num(p.sessions), interns: num(p.subagents),
      meetings: num(p.workflows), prompts: num(p.prompts), commits: num(p.commits),
    }
    return { ...row, agent_hours: hours(row.agent_minutes), worked: row.agent_minutes > 0 || row.sessions > 0 || row.commits > 0, weekend: i.wdi >= 5 }
  })
  let streak = 0
  let run = 0
  let best = null
  for (const d of days) {
    run = d.worked ? run + 1 : 0
    streak = Math.max(streak, run)
    if (d.agent_minutes > (best?.agent_minutes ?? 0)) best = d
  }
  const worked = days.filter((d) => d.worked).length
  const timed = days.filter((d) => d.agent_minutes > 0)
  const total = Math.round(num(t.agent_minutes))
  const weekend = days.filter((d) => d.weekend).reduce((s, d) => s + d.agent_minutes, 0)
  const projects = (Array.isArray(f.projects) ? f.projects : []).filter((p) => p && typeof p === 'object').map((p) => {
    const pd = p.per_day && typeof p.per_day === 'object' ? p.per_day : {}
    const am = Math.round(num(p.agent_minutes))
    return {
      name: String(p.name ?? '?'), agent_minutes: am, agent_hours: hours(am), sessions: num(p.sessions), interns: num(p.subagents),
      meetings: num(p.workflows), prompts: num(p.prompts), tool_calls: num(p.tool_calls), commits: num(p.commits), additions: num(p.additions),
      deletions: num(p.deletions), files_edited: num(p.files_edited),
      days_worked: list.filter((d) => num(pd[d]?.minutes) + num(pd[d]?.sessions) + num(pd[d]?.commits) > 0).length,
      per_day: Object.fromEntries(list.map((d) => [d, Math.round(num(pd[d]?.minutes))])),
    }
  })
  const crew = crewRows(f, t).map((c) => ({
    agent: c.a, name: CAST[c.a]?.name ?? c.a, who: CAST[c.a]?.who ?? '', agent_minutes: Math.round(c.min), agent_hours: hours(c.min),
    sessions: c.n, share: Math.round(c.share * 1000) / 1000,
  }))
  return {
    spec: STATS_SPEC,
    generated_at: typeof f.generated_at === 'string' ? f.generated_at : '',
    range: {
      label: String(f.range?.label ?? ''), first_day: list[0] ?? '', last_day: list.at(-1) ?? '', days: list.length,
      ...(Number.isInteger(f.range?.back) && f.range.back > 0 ? { back: f.range.back } : {}),
    },
    totals: {
      agent_minutes: total, agent_hours: hours(total), sessions: num(t.sessions), interns: num(t.subagents), meetings: num(t.workflows),
      prompts: num(t.prompts), tool_calls: num(t.tool_calls), commits: num(t.commits), additions: num(t.additions), deletions: num(t.deletions),
      files_edited: num(t.files_edited), projects: projects.length + num(f.projects_more),
    },
    highlights: {
      days_worked: worked, longest_streak: streak,
      busiest_day: best ? { day: best.day, agent_minutes: best.agent_minutes, agent_hours: best.agent_hours } : null,
      weekend_minutes: weekend, weekend_hours: hours(weekend),
      minutes_per_worked_day: timed.length ? Math.round(timed.reduce((s, d) => s + d.agent_minutes, 0) / timed.length) : 0,
    },
    crew,
    projects,
    projects_more: num(f.projects_more),
    days: days.map(({ weekend: _w, ...d }) => d),
  }
}

/** The stats as the JSON file says them: monthStats' object, two spaces in. */
export function statsJson(stats) {
  return `${JSON.stringify(stats, null, 2)}\n`
}

/**
 * One CSV cell: quoted when it holds a comma, a quote or a line break; a text that a spreadsheet would read as a formula
 * (= + - @, a tab or a carriage return first) is kept as text by a leading apostrophe.
 */
export function csvCell(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  let s = String(v ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * The stats as a spreadsheet: one row per day (its date, weekday, agent-hours, sessions, interns, meetings, prompts,
 * commits), then one column per project with its agent-hours that day, busiest first; a last row of totals. CRLF line
 * ends, as RFC 4180 has them.
 */
export function statsCsv(stats) {
  const s = stats ?? monthStats(null)
  const projects = s.projects ?? []
  const head = ['date', 'weekday', 'agent_hours', 'sessions', 'interns', 'meetings', 'prompts', 'commits', ...projects.map((p) => `${p.name} (agent_hours)`)]
  const rows = (s.days ?? []).map((d) => [
    d.day, d.weekday, d.agent_hours, d.sessions, d.interns, d.meetings, d.prompts, d.commits, ...projects.map((p) => hours(p.per_day?.[d.day])),
  ])
  const t = s.totals ?? {}
  const sum = (k) => (s.days ?? []).reduce((a, d) => a + num(d[k]), 0)
  rows.push(['total', '', t.agent_hours ?? 0, sum('sessions'), sum('interns'), sum('meetings'), sum('prompts'), sum('commits'), ...projects.map((p) => p.agent_hours)])
  return `${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
}

// ---------------------------------------------------------------- the page

const PAGE_CSS = [
  `:root{color-scheme:dark light;--bg:#171512;--card:#211e1a;--line:#3a342d;--text:#ece2cd;--dim:${ROLE_HEX.dim.dark};--accent:${ROLE_HEX.accent.dark};` +
    `--busy:${ROLE_HEX.busy.dark};--ship:${ROLE_HEX.ship.dark};--intern:${ROLE_HEX.intern.dark};--meeting:${ROLE_HEX.meeting.dark};--night:${ROLE_HEX.night.dark}}`,
  `@media (prefers-color-scheme:light){:root{--bg:#f6f2ea;--card:#fffdf8;--line:#ddd3c2;--text:#2b2620;--dim:${ROLE_HEX.dim.light};` +
    `--accent:${ROLE_HEX.accent.light};--busy:${ROLE_HEX.busy.light};--ship:${ROLE_HEX.ship.light};--intern:${ROLE_HEX.intern.light};` +
    `--meeting:${ROLE_HEX.meeting.light};--night:${ROLE_HEX.night.light}}}`,
  '*{box-sizing:border-box}',
  'body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
  'main{max-width:1000px;margin:0 auto;padding:24px 16px 40px}',
  'header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:14px}',
  'h1{margin:0;font-size:22px;letter-spacing:.06em;color:var(--accent)}',
  'h2{margin:28px 0 10px;font-size:14px;font-weight:600;color:var(--dim)}',
  '.when{color:var(--dim)}',
  '.counts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;padding:0;list-style:none}',
  '.counts li{border:1px solid var(--line);background:var(--card);border-radius:6px;padding:3px 9px}',
  '.counts b{font-weight:700}',
  '.note{color:var(--dim);margin:0}',
  'figure{margin:16px 0 0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:hidden}',
  'figure svg{display:block;width:100%;height:auto;margin:0 auto;max-width:960px}',
  '.wide{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:8px}',
  'table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}',
  'th,td{padding:4px 10px;text-align:right;white-space:nowrap;border-bottom:1px solid var(--line)}',
  'th{color:var(--dim);font-weight:600}',
  'th:first-child,td:first-child{text-align:left}',
  'tr:last-child td{border-bottom:0}',
  'tfoot td{font-weight:700;border-top:1px solid var(--line)}',
  'td.bar{width:40%;text-align:left}',
  '.bar i{display:inline-block;height:9px;border-radius:2px;background:var(--busy);vertical-align:middle}',
  '.off{color:var(--dim)}',
  '.we{color:var(--night)}',
  'footer{margin-top:28px;color:var(--dim);font-size:12px}',
].join('\n')

/** A table: its caption as an h2, its head, its rows (cells already escaped HTML), and a foot row when given. */
function table(title, head, rows, foot) {
  if (!rows.length) return `<h2>${esc(title)}</h2><p class="note">nothing to list</p>`
  const tr = (cells, tag = 'td') => `<tr>${cells.map((c) => `<${tag}${c.cls ? ` class="${c.cls}"` : ''}>${c.html ?? esc(c)}</${tag}>`).join('')}</tr>`
  return `<h2>${esc(title)}</h2><div class="wide"><table><thead>${tr(head, 'th')}</thead><tbody>${rows.map((r) => tr(r)).join('')}</tbody>` +
    `${foot ? `<tfoot>${tr(foot)}</tfoot>` : ''}</table></div>`
}

const chip = (n, word, color) => `<li style="color:var(--${color})"><b>${esc(n)}</b> ${esc(word)}</li>`

/**
 * The stats as a page of their own: the month's name and range, its totals, what stood out, the month's drawing
 * (`svg`, renderSvg's month, inline when given), then the crew, the projects and the days as tables, a bar per day
 * for its agent-time. No script, nothing loaded: a CSP meta forbids both. `<meta name="generator" content="theoffice">`
 * in its first 1024 bytes, as every page of the office has.
 */
export function statsPage(stats, { svg = '', title } = {}) {
  const s = stats ?? monthStats(null)
  const t = s.totals ?? {}
  const h = s.highlights ?? {}
  const name = String(title ?? `The Office · ${s.range?.label || 'the month'} · stats`)
  const counts = [
    chip(fmtAgentTime(t.agent_minutes), 'agent-time', 'text'), chip(fmtInt(t.sessions), 'sessions', 'text'), chip(fmtInt(t.interns), 'interns', 'intern'),
    chip(fmtInt(t.meetings), 'meetings', 'meeting'), chip(fmtInt(t.commits), 'commits', 'ship'), chip(fmtInt(t.tool_calls), 'tool calls', 'dim'),
    chip(fmtInt(t.projects), 'projects', 'accent'),
  ]
  const stood = [
    `worked ${h.days_worked ?? 0} of ${s.range?.days ?? 0} days`,
    h.longest_streak > 1 && `longest streak ${h.longest_streak} days`,
    h.busiest_day && `busiest day ${h.busiest_day.day} (${fmtHours(h.busiest_day.agent_minutes)})`,
    h.minutes_per_worked_day && `${fmtHours(h.minutes_per_worked_day)} per day with agent-time`,
    h.weekend_minutes && `weekends ${fmtAgentTime(h.weekend_minutes)}`,
  ].filter(Boolean).join(' · ')
  const max = Math.max(1, ...(s.days ?? []).map((d) => d.agent_minutes))
  const pct = (share) => (share >= 0.005 ? `${Math.round(share * 100)}%` : share > 0 ? '<1%' : '0%')
  const crew = (s.crew ?? []).map((c) => [
    { html: `<span style="color:${CAST[c.agent]?.hex?.dark ?? 'inherit'}">${esc(c.name)}</span>${c.who ? ` <span class="off">(${esc(c.who)})</span>` : ''}` },
    fmtAgentTime(c.agent_minutes), c.sessions == null ? '·' : fmtInt(c.sessions), pct(c.share),
  ])
  const projects = (s.projects ?? []).map((p) => [
    p.name, fmtAgentTime(p.agent_minutes), fmtInt(p.sessions), fmtInt(p.interns), fmtInt(p.commits), `+${fmtInt(p.additions)} −${fmtInt(p.deletions)}`,
    String(p.days_worked),
  ])
  const days = (s.days ?? []).map((d) => {
    const w = d.agent_minutes ? Math.max(1, Math.round((d.agent_minutes / max) * 100)) : 0
    const we = ['Sat', 'Sun'].includes(d.weekday)
    return [
      { html: `${esc(d.day)} <span class="${we ? 'we' : 'off'}">${esc(d.weekday)}</span>` },
      d.agent_minutes ? fmtHours(d.agent_minutes) : { html: '<span class="off">·</span>' },
      { cls: 'bar', html: w ? `<i style="width:${w}%"></i>` : '' },
      fmtInt(d.sessions), fmtInt(d.interns), fmtInt(d.commits),
    ]
  })
  const more = s.projects_more ? [`+${fmtInt(s.projects_more)} more`, '', '', '', '', '', ''] : null
  const figure = /^<svg[\s>]/.test(String(svg).trim()) ? `<figure>${String(svg).trim().replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s+xmlns(?::[A-Za-z]+)?="[^"]*"/g, ''))}</figure>` : ''
  const footer = [`${s.range?.first_day ?? ''} → ${s.range?.last_day ?? ''}`, `generated ${s.generated_at ?? ''}`, s.spec, 'local data only']
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="generator" content="theoffice">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(name)}</title>`,
    `<style>\n${PAGE_CSS}\n</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<header><h1>${esc(name.toUpperCase())}</h1><span class="when">${esc(s.range?.first_day ? `${s.range.first_day} → ${s.range.last_day}` : '')}</span></header>`,
    `<ul class="counts">${counts.join('')}</ul>`,
    `<p class="note">${esc(stood)}</p>`,
    figure,
    table('the crew · one row per AI, busiest first', ['AI', 'agent-time', 'sessions', 'share'], crew),
    table('the projects · busiest first', ['project', 'agent-time', 'sessions', 'interns', 'commits', 'lines', 'days'], projects, more),
    table('the days', ['day', 'agent-time', '', 'sessions', 'interns', 'commits'], days),
    `<footer>${esc(footer.join(' · '))}</footer>`,
    '</main>',
    '</body>',
    '</html>',
  ].join('\n') + '\n'
}

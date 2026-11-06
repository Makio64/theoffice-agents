// PURE: one self-contained HTML page for the office (`office.mjs --html`): live counts, then the pixel-art scenes of the
// asked view (the floor plan, the week tower, today's time clock, the month's wall calendar, what they did), each
// followed, when given, by the same thing as block-glyph text (lib/ascii.mjs lines) in <pre>. The lines arrive
// ready-made, so this module does not import the text renderer. No node:* imports and no external requests: no
// scripts, fonts, images or stylesheets from anywhere, and a CSP meta that forbids fetching anything.
import { fmtInt, fmtMinutes } from './format.mjs'
import { rangeWord } from './model.mjs'
import { ROLE_HEX } from './model.mjs'
import { esc, officeCounts, renderSvg } from './svg.mjs'

// ---------------------------------------------------------------- roles

/**
 * Role colors for the block-glyph text in `<pre>`: [dark background, light background], the shared table (model.mjs) the terminal
 * pane and the SVG use too. Not imported from lib/ascii.mjs, so the page renders even when only the SVG is used.
 */
export const ROLE = Object.fromEntries(Object.entries(ROLE_HEX).map(([k, v]) => [k, [v.dark, v.light]]))

const ROLE_KEYS = Object.keys(ROLE)

function css() {
  const vars = (i) => ROLE_KEYS.map((k) => `--${k}:${ROLE[k][i]}`).join(';')
  const classes = ROLE_KEYS.map((k) => `.r-${k}{color:var(--${k})}`).join('')
  return [
    `:root{color-scheme:dark light;--bg:#171512;--card:#211e1a;--line:#3a342d;--text:#ece2cd;${vars(0)}}`,
    `@media (prefers-color-scheme:light){:root{--bg:#f6f2ea;--card:#fffdf8;--line:#ddd3c2;--text:#2b2620;${vars(1)}}}`,
    '*{box-sizing:border-box}',
    'body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    'main{max-width:1000px;margin:0 auto;padding:24px 16px 40px}',
    'header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:14px}',
    'h1{margin:0;font-size:22px;letter-spacing:.06em;color:var(--accent)}',
    'h2{margin:28px 0 10px;font-size:14px;font-weight:600;color:var(--dim)}',
    'h2 b{color:var(--text);font-weight:600}',
    '.when{color:var(--dim)}',
    '.counts{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px;padding:0;list-style:none}',
    '.counts li{border:1px solid var(--line);background:var(--card);border-radius:6px;padding:3px 9px}',
    '.counts b{font-weight:700}',
    'figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:hidden}',
    'figure svg{display:block;width:100%;height:auto;margin:0 auto;max-width:960px}',
    'pre{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;' +
      'font:12.5px/1.15 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}', // ≤ 1.16: the box glyphs of the walls touch
    '.totals{color:var(--dim);margin:8px 2px 0}',
    'footer{margin-top:28px;color:var(--dim);font-size:12px}',
    classes,
    '.r-title{font-weight:600}.r-accent{font-weight:600}.r-ask{font-weight:600}',
  ].join('\n')
}

// ---------------------------------------------------------------- pieces

// Line[] (Array<[text, role]>) → escaped spans; unknown roles get no class (a role string never reaches markup raw).
function pre(lines, label) {
  if (!Array.isArray(lines) || !lines.length) return ''
  const body = lines.map((line) => (Array.isArray(line) ? line : []).map((seg) => {
    const [text, role] = Array.isArray(seg) ? seg : [seg]
    const t = esc(String(text ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, ''))
    return ROLE_KEYS.includes(role) ? `<span class="r-${role}">${t}</span>` : t
  }).join('')).join('\n')
  return `<pre aria-label="${esc(label)}">${body}</pre>`
}

function chip(n, word, role) {
  return `<li class="r-${role}"><b>${esc(fmtInt(n))}</b> ${esc(word)}</li>`
}

// Inline SVG in HTML needs no namespace attribute; dropping it keeps the page free of any URL-looking markup.
const inline = (svg) => svg.replace(' xmlns="http://www.w3.org/2000/svg"', '')

/**
 * Scene → its heading (`kicker · <b>subject</b>`), the label of its text, and the `<defs>` id prefix that keeps two
 * drawings on one page from sharing an id. `range` is the facts' range in words (`this week`, `today`…).
 */
const SCENE = {
  live: { kicker: () => 'live', subject: () => 'the floor', text: () => 'the floor', id: 'tl' },
  week: { kicker: (range) => range, subject: (f) => f.range?.label ?? '', text: (range) => range, id: 'tw' },
  today: { kicker: (range) => range, subject: (f) => f.range?.label ?? '', text: (range) => range, id: 'tt' },
  month: { kicker: (range) => range, subject: (f) => f.range?.label ?? '', text: (range) => range, id: 'tm' },
  work: { kicker: () => 'what they did', subject: () => 'share of the tool calls, by kind of work', text: () => 'what they did', id: 'tk' },
}

// ---------------------------------------------------------------- entry

/**
 * Self-contained HTML page: header with the live counts, then one section per scene of `scenes` (`[{ view, lines }]`,
 * view one of live, week, today, month, work): its pixel-art SVG, then its block-glyph text when `lines` (Line[] from
 * lib/ascii.mjs) are given. The range totals follow the first range scene (or what they did, when it is alone). Each
 * drawing sits over its own text, so nothing is drawn twice; each <pre> span gets one CSS class per role. Without
 * `scenes` it is the floor plan over `liveLines` and the week tower over `rangeLines`. Dark by default, light under
 * prefers-color-scheme. Why a page at all: it is the one artifact a user can keep, share or open on a phone, so it
 * must work offline and never phone home (CSP `default-src 'none'`).
 */
export function renderHtml(facts, { title = 'The Office', scenes, liveLines, rangeLines } = {}) {
  const f = facts && typeof facts === 'object' ? facts : {}
  const c = officeCounts(f)
  const t = f.totals ?? {}
  const when = [f.now?.weekday, f.now?.local_date, f.now?.local_time].filter(Boolean).join(' ')
  const shift = !c.desks ? (f.now?.is_night ? 'lights off' : 'nobody in') : f.now?.is_night ? 'night shift' : 'office hours'
  const chips = [
    chip(c.desks, c.desks === 1 ? 'desk' : 'desks', 'title'),
    c.working && chip(c.working, 'working', 'busy'),
    c.waiting && chip(c.waiting, c.meetings ? 'in a meeting' : 'waiting on helpers', 'wait'),
    c.asking && chip(c.asking, c.asking > 1 ? 'hands up' : 'hand up', 'ask'),
    c.errors && chip(c.errors, c.errors > 1 ? 'errors' : 'error', 'warn'),
    c.stopped && chip(c.stopped, 'stopped', 'accent'),
    c.onBreak && chip(c.onBreak, 'on break', 'idle'),
    c.done && chip(c.done, 'done', 'idle'),
    c.interns && chip(c.interns, c.interns > 1 ? 'interns' : 'intern', 'intern'),
    c.meetings && chip(c.meetings, `meeting${c.meetings > 1 ? 's' : ''} (${c.meetingAgents} agent${c.meetingAgents === 1 ? '' : 's'})`, 'meeting'),
  ].filter(Boolean).join('')
  const totals = [
    `${fmtMinutes(t.agent_minutes ?? 0)} agent-time`, `${fmtInt(t.sessions ?? 0)} sessions`, `${fmtInt(t.subagents ?? 0)} interns`,
    `${fmtInt(t.workflows ?? 0)} meetings`, `${fmtInt(t.commits ?? 0)} commits`,
  ].join(' · ')
  // a live range is the one day the floor stands in
  const range = rangeWord(f)
  const list = (Array.isArray(scenes) ? scenes : [{ view: 'live', lines: liveLines }, { view: 'week', lines: rangeLines }])
    .filter((x) => x && Object.hasOwn(SCENE, x.view))
  const withTotals = list.find((x) => x.view !== 'live' && x.view !== 'work') ?? list.find((x) => x.view === 'work')
  const art = list.flatMap((x) => {
    const sc = SCENE[x.view]
    const svg = inline(renderSvg(f, { view: x.view, width: 720, idPrefix: sc.id }))
    return [
      `<h2>${esc(sc.kicker(range))} · <b>${esc(sc.subject(f))}</b></h2>`,
      `<figure>${svg}</figure>`,
      x === withTotals ? `<p class="totals">${esc(totals)}</p>` : '',
      pre(x.lines, `${sc.text(range)}, as text`),
    ]
  })
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    // the CLI's `--html` replaces an existing file only when it carries this mark
    '<meta name="generator" content="theoffice">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<style>\n${css()}\n</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<header><h1>${esc(String(title).toUpperCase())}</h1>` +
      `<span class="when">${esc(when)}</span><span class="r-${f.now?.is_night ? 'night' : 'day'}">${esc(shift)}</span></header>`,
    `<ul class="counts" aria-label="live counts">${chips}</ul>`,
    ...art,
    `<footer>${esc(`generated ${f.generated_at ?? ''} · ${f.spec ?? 'theoffice/1'} · local data only`)}</footer>`,
    '</main>',
    '</body>',
    '</html>',
  ].filter((x) => x !== '').join('\n') + '\n'
}

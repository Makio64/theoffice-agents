// PURE: the timelapse's own page (`office.mjs timelapse --html` and the pane's Export): the looping drawing (lib/svg.mjs
// renderTimelapse) inline, the player under it (play and pause, a scrubber with the replayed slot's day and time, the
// speed) and the export bar (Save GIF, Save video, Save SVG), all done in the browser by the page's one script
// (lib/timelapse-player.mjs PLAYER_JS). The slots' labels come from lib/model.mjs lapseSlot, like every renderer's, and
// travel as JSON in a data attribute. No node:* imports and no network: a CSP meta lets nothing load and runs only the
// script whose hash the caller passes in (the CLI hashes PLAYER_JS with node:crypto). Without that hash nothing runs,
// and the drawing still loops on its own.
import { LAPSE_WORDS, ROLE_HEX, cropTimeline, lapseSlot } from './model.mjs'
import { esc } from './svg-kit.mjs'
import { PLAYER_JS } from './timelapse-player.mjs'

/** The page's one inline script (lib/timelapse-player.mjs): its CSP hash is the sha256 of exactly this text. */
export { PLAYER_JS }

// The most slots a page labels: a month of 4-hour slots is 180, so this only stops a hostile slot count.
const LABEL_CAP = 4000
// The speeds the player offers, 1× picked at load.
const SPEEDS = [0.5, 1, 2, 4]

// ---------------------------------------------------------------- look

function css() {
  const r = (k) => ROLE_HEX[k].dark
  return [
    // dark only: the drawing paints its own night or day, and a dark frame suits both
    `:root{color-scheme:dark;--bg:#171512;--card:#211e1a;--line:#3a342d;--text:#ece2cd;--dim:${r('dim')};--accent:${r('accent')};--busy:${r('busy')}}`,
    '*{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    'body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    'main{max-width:1000px;margin:0 auto;padding:24px 16px 40px}',
    'header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:14px}',
    'h1{margin:0;font-size:22px;letter-spacing:.06em;color:var(--accent)}',
    '.when{color:var(--dim)}',
    'figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:hidden}',
    'figure svg{display:block;max-width:100%;height:auto;margin:0 auto;image-rendering:pixelated}',
    'canvas{image-rendering:pixelated}',
    '.empty{margin:24px 8px;color:var(--dim);text-align:center}',
    '.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:12px}',
    'button{font:inherit;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}',
    'button:hover:not(:disabled){border-color:var(--accent)}',
    'button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    'button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}',
    'button:disabled{opacity:.45;cursor:default}',
    '#tl-play{min-width:3.4em}',
    '#tl-scrub{flex:1 1 220px;min-width:120px;margin:0;accent-color:var(--accent)}',
    '#tl-slot{min-width:12ch;color:var(--accent);font-variant-numeric:tabular-nums}',
    '.speed{display:inline-flex;gap:4px}',
    '.speed button{padding:4px 7px}',
    'progress{width:140px;accent-color:var(--busy)}',
    '.status{color:var(--dim);flex:1 1 260px}',
    // the canvas a video records from stays in the document, out of sight
    '.offstage{position:fixed;left:-99999px;top:0}',
    'footer{margin-top:28px;color:var(--dim);font-size:12px}',
  ].join('\n')
}

// ---------------------------------------------------------------- pieces

// The drawing as it goes inline: one <svg> element or nothing. Inline SVG in HTML needs no namespace attributes, and
// dropping them keeps the page free of URL-looking markup (the player's serializer puts them back in what it saves).
function stage(svg) {
  const s = typeof svg === 'string' ? svg.trim() : ''
  if (!/^<svg[\s>]/.test(s) || !s.endsWith('</svg>')) return '<p class="empty">Nothing to replay here.</p>'
  return s.replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s+xmlns(?::[A-Za-z]+)?="[^"]*"/g, ''))
}

// The page's CSP: nothing loads, no connect-src (never any network), images and media only from what the page makes
// itself (a frame drawn from a blob or data: URL, a recorded video), and the one script whose hash the caller passes
// ('sha256-…' as the CLI makes it); anything else in its place runs nothing.
function csp(hash) {
  const script = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(String(hash ?? '')) ? `'${hash}'` : `'none'`
  return `default-src 'none'; style-src 'unsafe-inline'; script-src ${script}; img-src blob: data:; media-src blob:`
}

// ---------------------------------------------------------------- entry

/**
 * The timelapse's self-contained page: the title line (`title`, by default 'The Office · timelapse · this week', then
 * the range label), the animated drawing `svg` (renderTimelapse's) inline, the player and the export bar (shown by the
 * script, which binds every listener: no on* attribute anywhere), the slots' lapseSlot labels as JSON in
 * #tl-data's data-labels, and one inline <script>, PLAYER_JS, allowed by `scriptHash` ('sha256-<base64>' of PLAYER_JS,
 * computed by the caller; without it the CSP runs nothing and the drawing loops by itself). Every facts string is
 * escaped, and the CSP (`default-src 'none'`, no connect-src) keeps it from ever touching the network, from file://
 * as from anywhere. `<meta name="generator" content="theoffice">` sits in its first 1024 bytes (the CLI's PAGE_MARK).
 */
export function renderTimelapsePage({ svg, facts, title, scriptHash } = {}) {
  const f = facts && typeof facts === 'object' ? facts : {}
  // cut to where something happened, as the drawing is, so its slots and these labels are the same
  const tl = f.timeline && typeof f.timeline === 'object' ? cropTimeline(f.timeline) : null
  const kind = [tl?.kind, f.range?.kind].find((k) => typeof k === 'string' && Object.hasOwn(LAPSE_WORDS, k)) ?? 'week'
  const name = String(title ?? `The Office · timelapse · ${LAPSE_WORDS[kind]}`)
  const label = String(tl?.label ?? f.range?.label ?? '')
  const slots = tl ? Math.min(LABEL_CAP, Math.max(0, Math.floor(Number(tl.slots) || 0))) : 0
  const labels = Array.from({ length: slots }, (_, i) => lapseSlot(tl, i).label)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(f.now?.local_date ?? '')) ? f.now.local_date : ''
  const speeds = SPEEDS.map((s) => `<button type="button" data-speed="${s}" aria-pressed="${s === 1}">${s}×</button>`).join('')
  const pace = tl ? `${slots} slots of ${Number(tl.slot_min) || 60} min, a twentieth of a second each` : 'nothing to replay'
  const footer = [pace, `generated ${f.generated_at ?? ''}`, f.spec ?? 'theoffice/1', 'local data only', 'space plays or pauses, ← → step a slot']
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    // the CLI's `--html` replaces an existing file only when it carries this mark
    '<meta name="generator" content="theoffice">',
    `<meta http-equiv="Content-Security-Policy" content="${csp(scriptHash)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(name)}</title>`,
    `<style>\n${css()}\n</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<header><h1>${esc(name.toUpperCase())}</h1><span class="when">${esc(label)}</span></header>`,
    `<figure id="tl-stage">${stage(svg)}</figure>`,
    '<div class="bar" id="tl-controls" hidden>',
    '<button type="button" id="tl-play" aria-label="Play">▶︎</button>',
    `<input type="range" id="tl-scrub" min="0" max="${Math.max(0, slots - 1)}" step="1" value="0" aria-label="Replay position, one step a slot">`,
    `<output id="tl-slot" for="tl-scrub">${esc(labels[0] ?? '')}</output>`,
    `<span class="speed" role="group" aria-label="Speed">${speeds}</span>`,
    '</div>',
    '<div class="bar" id="tl-export" hidden>',
    '<button type="button" id="tl-gif">Save GIF</button>',
    '<button type="button" id="tl-video">Save video</button>',
    '<button type="button" id="tl-svg">Save SVG</button>',
    '<progress id="tl-progress" max="1" value="0" hidden></progress>',
    '<span class="status" id="tl-status" role="status" aria-live="polite"></span>',
    '</div>',
    `<div id="tl-data" hidden data-kind="${kind}" data-date="${date}" data-labels="${esc(JSON.stringify(labels))}"></div>`,
    `<footer>${esc(footer.join(' · '))}</footer>`,
    '</main>',
    `<script>${PLAYER_JS}</script>`,
    '</body>',
    '</html>',
  ].join('\n') + '\n'
}

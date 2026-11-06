// PURE: the Month's export page (`office.mjs month --export <room> --as png|gif|video`, the pane's Month export): one
// room of the month's drawing (the wall calendar, the building directory) or all of it, inline and moving as it does in
// the pane, over an export bar (Save PNG, Save GIF, Save video, Save SVG) whose one script (lib/month-player.mjs
// MONTH_JS) makes the format the pane asked for as the page loads, in the browser, and the others on a press. No
// node:* imports and no network: a CSP meta lets nothing load and runs only the script whose hash the caller passes in
// (the CLI hashes MONTH_JS with node:crypto). Without that hash nothing runs, and the drawing still moves on its own.
import { ROLE_HEX } from './model.mjs'
import { MONTH_JS, autoFormat, saveName } from './month-player.mjs'
import { esc } from './svg.mjs'

/** The page's one inline script: its CSP hash is the sha256 of exactly this text. */
export { MONTH_JS }

/** What each room is called on the page and in a sentence. */
export const ROOM_WORDS = Object.freeze({ calendar: 'the wall calendar', directory: 'the building directory', whole: 'the month' })

function css() {
  const r = (k) => ROLE_HEX[k].dark
  return [
    // dark only, as the timelapse's page: the drawing paints its own night or day
    `:root{color-scheme:dark;--bg:#171512;--card:#211e1a;--line:#3a342d;--text:#ece2cd;--dim:${r('dim')};--accent:${r('accent')};--busy:${r('busy')}}`,
    '*{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    'body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    'main{max-width:1000px;margin:0 auto;padding:24px 16px 40px}',
    'header{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px;margin-bottom:14px}',
    'h1{margin:0;font-size:22px;letter-spacing:.06em;color:var(--accent)}',
    '.when{color:var(--dim)}',
    'figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px;overflow:hidden}',
    'figure svg{display:block;width:100%;max-width:960px;height:auto;margin:0 auto;image-rendering:pixelated}',
    '.empty{margin:24px 8px;color:var(--dim);text-align:center}',
    '.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:12px}',
    'button{font:inherit;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer}',
    'button:hover:not(:disabled){border-color:var(--accent)}',
    'button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}',
    'button.asked{border-color:var(--accent);color:var(--accent)}',
    'button:disabled{opacity:.45;cursor:default}',
    'progress{width:140px;accent-color:var(--busy)}',
    '.status{color:var(--dim);flex:1 1 260px}',
    '.offstage{position:fixed;left:-99999px;top:0}',
    'footer{margin-top:28px;color:var(--dim);font-size:12px}',
  ].join('\n')
}

// The drawing as it goes inline: one <svg> element or nothing, without its namespace attributes (the serializer puts
// them back in what it saves).
function stage(svg) {
  const s = typeof svg === 'string' ? svg.trim() : ''
  if (!/^<svg[\s>]/.test(s) || !s.endsWith('</svg>')) return '<p class="empty">Nothing to draw here.</p>'
  return s.replace(/^<svg[^>]*>/, (tag) => tag.replace(/\s+xmlns(?::[A-Za-z]+)?="[^"]*"/g, ''))
}

// The page's CSP, as the timelapse page's: nothing loads, never any network, images and media only from what the page
// makes itself, and the one script whose hash the caller passes.
function csp(hash) {
  const script = /^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(String(hash ?? '')) ? `'${hash}'` : `'none'`
  return `default-src 'none'; style-src 'unsafe-inline'; script-src ${script}; img-src blob: data:; media-src blob:`
}

/**
 * The export page: its title (`title`, by default 'The Office · the wall calendar'), the range's `label`, the drawing
 * `svg` inline (renderSvg's month, cropped to `room` by cropRoom), the export bar (shown by the script), and #mo-data
 * saying the format to make as it loads (`auto`: png, gif, video or svg, else none) and the downloads' name (`name`,
 * `theoffice-month-2026-10-calendar`). One inline <script>, MONTH_JS, allowed by `scriptHash`. Every string is
 * escaped; `<meta name="generator" content="theoffice">` sits in its first 1024 bytes (the CLI's PAGE_MARK).
 */
export function renderMonthPage({ svg, room = 'whole', label = '', title, auto, name, scriptHash } = {}) {
  const words = ROOM_WORDS[room] ?? ROOM_WORDS.whole
  const heading = String(title ?? `The Office · ${words}`)
  const asked = autoFormat(auto)
  const base = saveName(name, 'x').slice(0, -2)
  const button = (id, text) => `<button type="button" id="mo-${id}"${asked === id ? ' class="asked"' : ''}>${text}</button>`
  const footer = [`${words}, ${label || 'the month'}`, 'local data only', 'saved files go to your downloads']
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="generator" content="theoffice">',
    `<meta http-equiv="Content-Security-Policy" content="${csp(scriptHash)}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(heading)}</title>`,
    `<style>\n${css()}\n</style>`,
    '</head>',
    '<body>',
    '<main>',
    `<header><h1>${esc(heading.toUpperCase())}</h1><span class="when">${esc(label)}</span></header>`,
    `<figure id="mo-stage">${stage(svg)}</figure>`,
    '<div class="bar" id="mo-export" hidden>',
    button('png', 'Save PNG'),
    button('gif', 'Save GIF'),
    button('video', 'Save video'),
    button('svg', 'Save SVG'),
    '<progress id="mo-progress" max="1" value="0" hidden></progress>',
    '<span class="status" id="mo-status" role="status" aria-live="polite"></span>',
    '</div>',
    `<div id="mo-data" hidden data-room="${esc(room in ROOM_WORDS ? room : 'whole')}" data-auto="${asked}" data-name="${esc(base)}"></div>`,
    `<footer>${esc(footer.join(' · '))}</footer>`,
    '</main>',
    `<script>${MONTH_JS}</script>`,
    '</body>',
    '</html>',
  ].join('\n') + '\n'
}

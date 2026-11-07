// Local MCP adapter. The UI and its private activity stay on the loopback dashboard;
// the model receives only a link and the selected view, never the underlying transcripts.
import fs from 'node:fs'

// The other hosts' MCP server (Codex, Cursor, Antigravity), kept out of the Claude Code plugin, which never runs it. It
// goes into the portable bundle's scripts/ (scripts/package-plugin.mjs), where lib/ and assets/ sit one folder up; in
// this repository they are under plugin/.
const HOME = fs.existsSync(new URL('../lib/dashboard.mjs', import.meta.url)) ? new URL('../', import.meta.url) : new URL('../../plugin/', import.meta.url)
const { startDashboard, dashboardSelection } = await import(new URL('lib/dashboard.mjs', HOME).href)

export const OFFICE_UI = 'ui://theoffice/dashboard.html'
const MIME = 'text/html;profile=mcp-app'
const versions = ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25']
const identity = { name: 'theoffice', version: '1.0.2', title: 'The Office' }
const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
// Where a host lists The Office (Codex's sidebar and its entrypoints): the plugins' icon, inlined so no file is served.
// A copy with no icon (a test bundle) lists none.
const ICONS = (() => {
  try { return [{ src: `data:image/png;base64,${fs.readFileSync(new URL('assets/icon.png', HOME)).toString('base64')}`, mimeType: 'image/png', sizes: ['1024x1024'] }] } catch { return undefined }
})()

function select(args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Expected an object')
  if (Object.keys(args).some(key => !['view', 'range', 'back'].includes(key))) throw new Error('Unknown option')
  if (args.back !== undefined && (!Number.isInteger(args.back) || args.back < 0)) throw new Error('Invalid page')
  for (const key of ['view', 'range']) if (args[key] !== undefined && typeof args[key] !== 'string') throw new Error('Invalid selection')
  return dashboardSelection(new URLSearchParams(Object.entries(args).map(([key, value]) => [key, String(value)])))
}

/** MCP Apps bridge per SEP-1865; shared dashboard remains usable without UI-capable hosts. */
export function officeAppHtml(url) {
  const initial = JSON.stringify(url).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Office</title><style>*{box-sizing:border-box}html,body{margin:0;padding:0;width:100%;height:100%;background:#171512}iframe{display:block;width:100%;height:100vh;min-height:560px;border:0}a{color:#f4ce65;font:12px system-ui}footer{padding:5px 10px;background:#171512}</style></head><body><iframe id="office" title="The Office" src="${escapeHtml(url)}" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe><footer><a id="fallback" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open The Office in a full panel</a></footer><script>
const base=new URL(${initial}),frame=document.getElementById('office');
const send=(method,params)=>parent.postMessage({jsonrpc:'2.0',method,params},'*');
function show(value){try{const next=new URL(value);if(next.origin!==base.origin||next.searchParams.get('token')!==base.searchParams.get('token'))return;frame.src=next.href;document.getElementById('fallback').href=next.href}catch{}}
function deepLink(context){const path=context?.['openai/deepLink']?.url;if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))return;const selection=new URL(path,base);const next=new URL(base);for(const key of ['view','range','back'])if(selection.searchParams.has(key))next.searchParams.set(key,selection.searchParams.get(key));show(next.href)}
window.addEventListener('message',event=>{if(event.source!==parent||!event.data||event.data.jsonrpc!=='2.0')return;const message=event.data;if(message.id==='office-init'&&message.result){send('ui/notifications/initialized',{});send('ui/notifications/size-changed',{height:760});deepLink(message.result.hostContext)}else if(message.method==='ui/notifications/tool-result'){show(message.params?.structuredContent?.url)}else if(message.method==='ui/notifications/host-context-changed'){deepLink(message.params)}else if(message.method==='ui/resource-teardown'&&message.id!==undefined){parent.postMessage({jsonrpc:'2.0',id:message.id,result:{}},'*')}});
parent.postMessage({jsonrpc:'2.0',id:'office-init',method:'ui/initialize',params:{protocolVersion:'2026-01-26',appInfo:{name:'The Office',version:'1.0.2'},appCapabilities:{availableDisplayModes:['inline','fullscreen']}}},'*');
</script></body></html>`
}

export function createOfficeMcp({ start = startDashboard } = {}) {
  let dashboard
  let closed = false
  const ensure = async () => {
    if (closed) throw new Error('The Office is closed')
    if (dashboard) {
      const running = await dashboard
      // The server lives in this process. Use its lifecycle state: a cold history
      // scan must never be mistaken for a stopped server because an HTTP ping was slow.
      if (!running.isClosed) return running
      await running.close()
      dashboard = undefined
    }
    dashboard ??= start({ port: 0 })
    try { return await dashboard } catch (error) { dashboard = undefined;throw error }
  }
  const tool = {
    name: 'open_office', title: 'The Office', ...(ICONS ? { icons: ICONS } : {}),
    description: 'Open a live pixel-art office of the coding agents on this computer beside the conversation. Includes Live, Today, Week, Month, departments, and Timelapse with navigation and exports. Returns a local URL for clients without MCP Apps; open it in the host browser panel when available.',
    inputSchema: { type: 'object', properties: {
      view: { type: 'string', enum: ['live', 'today', 'week', 'month', 'work', 'timelapse'], default: 'live' },
      range: { type: 'string', enum: ['yesterday', 'week', 'month'], default: 'week' },
      back: { type: 'integer', minimum: 0, maximum: 3660, default: 0 },
    }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: OFFICE_UI },
      'openai/outputTemplate': OFFICE_UI,
      // a tab in any thread, and a page of its own in the sidebar, which codex://plugins/theoffice@makio64/app/open_office
      // ?path=%2F%3Fview%3Dmonth links open on a view (hostContext 'openai/deepLink')
      'openai/ui': { entrypoints: [{ type: 'thread' }, { type: 'global' }] },
      'openai/toolInvocation/invoking': 'Opening The Office',
      'openai/toolInvocation/invoked': 'The Office is open',
    },
  }
  const resource = { uri: OFFICE_UI, name: 'theoffice-dashboard', title: 'The Office', description: 'The live local pixel-art office.', mimeType: MIME }
  return {
    async request(method, params = {}) {
      if (method === 'initialize') return { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions.at(-1), serverInfo: { ...identity, ...(ICONS ? { icons: ICONS } : {}) }, capabilities: { tools: {}, resources: {} }, instructions: 'Use open_office to show the office. Its local URL can also open in the host browser panel. Activity remains local to that page.' }
      if (method === 'ping') return {}
      if (method === 'tools/list') return { tools: [tool] }
      if (method === 'resources/list') return { resources: [resource] }
      if (method === 'resources/templates/list') return { resourceTemplates: [] }
      if (method === 'tools/call') {
        if (params.name !== tool.name) throw Object.assign(new Error('Unknown tool'), { code: -32602 })
        let selection
        try { selection = select(params.arguments) } catch { return { isError: true, content: [{ type: 'text', text: 'Choose a supported office view, replay range, and nonnegative calendar page.' }] } }
        const running = await ensure()
        const url = new URL(running.url)
        url.searchParams.set('view', selection.view)
        if (selection.view === 'timelapse') url.searchParams.set('range', selection.range)
        if (selection.back) url.searchParams.set('back', String(selection.back))
        return { structuredContent: { url: url.href, view: selection.view, range: selection.range, back: selection.back }, content: [{ type: 'text', text: `The Office is ready: ${url.href}\nOpen this local URL in the host's browser panel if the live app is not displayed.` }] }
      }
      if (method === 'resources/read') {
        if (params.uri !== OFFICE_UI) throw Object.assign(new Error('Unknown resource'), { code: -32602 })
        const running = await ensure()
        const origin = new URL(running.url).origin
        return { contents: [{ ...resource, text: officeAppHtml(running.url), _meta: {
          ui: { prefersBorder: false, csp: { frameDomains: [origin] } },
          // Codex and ChatGPT draw inline or fullscreen (no pip); a page this tall reads best fullscreen
          'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'], preferredDisplayMode: 'fullscreen' },
          'openai/widgetDescription': 'The live office and its six activity views. No transcript data is sent to the model.',
        } }] }
      }
      throw Object.assign(new Error('Method not found'), { code: -32601 })
    },
    async close() {
      if (closed) return
      closed = true
      if (dashboard) await (await dashboard).close()
    },
  }
}

// The dashboard is served by lib/dashboard.mjs only. No remote assets or dependencies.
// `stoppable: false`: a host owns the server's life (Antigravity's sidecar), so the page offers no Stop button.
export function dashboardPage({ nonce, selection, restore = true, preferences = null, stoppable = true }) {
  const initial = JSON.stringify(selection).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Office</title>
<style>
:root{color-scheme:dark light;--bg:#171512;--panel:#24201a;--line:#4a4030;--ink:#ece2cd;--muted:#b5a78e;--accent:#f4ce65}
*{box-sizing:border-box}[hidden]{display:none!important}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}main{max-width:1100px;margin:auto;padding:22px 16px 36px}header{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}h1{margin:0;color:var(--accent);font-size:20px;letter-spacing:.12em}.status{color:var(--muted);font-size:12px;flex:1}button,select{font:inherit;color:inherit;background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:7px 11px;cursor:pointer}button:hover,select:hover{border-color:var(--accent)}button:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:3px}button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#241c0d}button:disabled{opacity:.4;cursor:default}nav{display:flex;gap:6px;flex-wrap:wrap}.toolbar{display:flex;align-items:center;gap:8px;min-height:50px;flex-wrap:wrap}.toolbar .period{flex:1;color:var(--muted);font-size:12px}.pages{display:flex;gap:5px}.message{min-height:22px;margin:2px 0 10px;color:var(--muted);font-size:12px}.message.error{color:#f9a584}.drawing{width:100%;min-height:240px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--panel);display:grid;align-items:start}.drawing svg{width:100%;height:auto;display:block}.placeholder{align-self:center;text-align:center;color:var(--muted);padding:70px 20px}iframe{display:block;width:100%;height:720px;border:0;background:#171512}.export-panel{border:1px solid var(--line);border-radius:8px;overflow:hidden}.export-panel .toolbar{padding:8px}details{margin-top:16px}summary{cursor:pointer;color:var(--muted)}pre{overflow:auto;padding:14px;background:var(--panel);border:1px solid var(--line);border-radius:6px;font:12px/1.15 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}.note{color:var(--muted);font-size:11px;margin-top:20px}
@media(prefers-color-scheme:light){:root{--bg:#f6f2ea;--panel:#fffdf8;--line:#d9ccba;--ink:#30271b;--muted:#78684f;--accent:#ac7b0d}button[aria-pressed=true]{color:#fff}}
@media(max-width:480px){main{padding:14px 8px}h1{font-size:17px}button,select{font-size:12px;padding:6px 8px}header{gap:6px}.status{flex-basis:100%}}
</style></head><body><main>
<header><h1>THE OFFICE</h1><div class="status" id="status">Your coding agents, at their desks.</div></header>
<nav aria-label="Office views" id="tabs"></nav>
<div class="toolbar"><div class="pages" id="pages"><button id="older" title="Previous page (p)">◀ Older</button><button id="newer" title="Next page (n)">Newer ▶</button><button id="now" title="Current page (c)">Now</button></div><label id="ranges">Replay <select id="range"><option value="yesterday">Yesterday</option><option value="week">Week</option><option value="month">Month</option></select></label><span class="period" id="period"></span><button id="quiet" title="Hide desk labels (q)" aria-pressed="false">Quiet</button><button id="export" aria-expanded="false">Export</button><button id="refresh">Refresh</button></div>
<div class="toolbar" id="export-controls" hidden><label>Keep <select id="part"><option value="calendar">Calendar</option><option value="directory">Directory</option><option value="whole">Whole month</option><option value="stats">Stats</option></select></label><label>as <select id="format"></select></label><button id="save">Open export</button></div>
<div class="message" role="status" aria-live="polite" id="message">Reading local agent activity…</div>
<section class="export-panel" id="export-panel" hidden><div class="toolbar"><button id="export-back">‹ Back to office</button><span class="period" id="export-title"></span></div><iframe id="export-frame" title="Export The Office" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe></section>
<div class="drawing" id="drawing" aria-label="The Office in pixel art" aria-busy="true"><div class="placeholder">Opening the office…<br>The first read can take a moment.</div></div>
<details id="fallback"><summary>Text version</summary><pre id="text"></pre></details>
<p class="note">Local activity only. Current views update every 5 seconds while visible. Replays and past pages stay on the revision you opened.<br>Keys: 1–6 tabs · p/n older/newer · c now · q quiet. Your view is remembered on this device.</p>${stoppable ? '<button id="stop">Stop dashboard</button>' : ''}
</main><script nonce="${nonce}">
const initial=${initial},restore=${restore ? 'true' : 'false'},persisted=${JSON.stringify(preferences).replaceAll('<', '\\u003c')};
const views=[['live','Live'],['today','Today'],['week','Week'],['month','Month'],['work','What they did'],['timelapse','Timelapse']];
const byId=id=>document.getElementById(id),storeKey='theoffice.dashboard.v1';
function savedState(){try{const cookie=document.cookie.split('; ').find(value=>value.startsWith('theoffice_dashboard='));return JSON.parse(cookie?decodeURIComponent(cookie.slice(20)):localStorage.getItem(storeKey)||'null')}catch{return null}}
const stored=persisted||savedState(),saved=restore?stored:null;
let view=views.some(([id])=>id===saved?.view)?saved.view:initial.view;
let range=['yesterday','week','month'].includes(saved?.range)?saved.range:initial.range;
let quiet=initial.quiet===true||Boolean(stored?.quiet),backs={today:0,week:0,month:0};
for(const [unit,max] of [['today',3660],['week',520],['month',1200]]){const n=stored?.backs?.[unit];if(Number.isInteger(n)&&n>=0&&n<=max)backs[unit]=n}
if(!saved&&view!=='live'&&view!=='timelapse')backs[view==='work'?'week':view]=initial.back;
let busy=false,again=false,stopped=false,nativeVisible=true,timer=null,lastSvg='',shown='',revision='',exporting=false,playerRevision='';
const buttons=new Map();
const isVisible=()=>nativeVisible&&!document.hidden;
function back(){return view==='live'||view==='timelapse'?0:backs[view==='work'?'week':view]}
function key(){return JSON.stringify([view,range,back(),view==='live'&&quiet])}
function selectionUrl(route){const url=new URL(route,location.href);url.searchParams.set('token',new URL(location.href).searchParams.get('token'));return url}
function remember(){
  const state=JSON.stringify({view,range,quiet,backs});try{localStorage.setItem(storeKey,state)}catch{}
  try{document.cookie='theoffice_dashboard='+encodeURIComponent(state)+';Path=/;Max-Age=31536000;SameSite=Strict'}catch{}
  fetch(selectionUrl('/preferences'),{method:'POST',headers:{'Content-Type':'application/json'},body:state,keepalive:true}).catch(()=>{});
  const url=selectionUrl('/');url.searchParams.set('view',view);url.searchParams.set('range',range);url.searchParams.set('back',String(back()));url.searchParams.set('quiet',quiet?'1':'0');history.replaceState(null,'',url);
}
function closeExport(){byId('export-panel').hidden=true;byId('export-frame').removeAttribute('src');byId('drawing').hidden=false;byId('fallback').hidden=false;exporting=false}
function controls(){
  for(const [id,button] of buttons)button.setAttribute('aria-pressed',String(view===id));
  byId('pages').hidden=view==='live'||view==='timelapse';byId('ranges').hidden=view!=='timelapse';byId('quiet').hidden=view!=='live';byId('quiet').setAttribute('aria-pressed',String(quiet));byId('export').hidden=view!=='month';
  if(view!=='month'){byId('export-controls').hidden=true;byId('export').setAttribute('aria-expanded','false')}
  byId('newer').disabled=back()===0;byId('now').disabled=back()===0;
  byId('older').disabled=back()>=(view==='month'?1200:view==='today'?3660:520);byId('range').value=range;
}
function schedule(){clearTimeout(timer);if(!stopped&&!exporting&&isVisible()&&view!=='timelapse'&&!back())timer=setTimeout(()=>refresh(),5000)}
function keyboard(event){
  if(event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(event.target?.tagName))return;
  const n=Number(event.key);if(n>=1&&n<=6){event.preventDefault();choose(views[n-1][0]);return}
  const id={p:'older',n:'newer',c:'now',q:'quiet'}[event.key.toLowerCase()];if(id&&!byId(id).hidden&&!byId(id).disabled&&(id==='quiet'?view==='live':view!=='live'&&view!=='timelapse')){event.preventDefault();byId(id).click()}
}
function fitFrame(frame){
  frame.addEventListener('load',()=>{try{const doc=frame.contentDocument;if(!doc)return;const fit=()=>{frame.style.height=Math.max(240,Math.ceil(doc.body.getBoundingClientRect().height))+'px'};fit();if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(fit);observer.observe(doc.body);frame.addEventListener('load',()=>observer.disconnect(),{once:true})}doc.addEventListener('keydown',keyboard)}catch{}});
}
fitFrame(byId('export-frame'));
async function refresh(){
  clearTimeout(timer);if(stopped||exporting)return;if(busy){again=true;return}if(!isVisible())return;
  busy=true;again=false;const requested=key();
  const url=selectionUrl('/snapshot');url.searchParams.set('view',view);url.searchParams.set('range',range);url.searchParams.set('back',String(back()));url.searchParams.set('quiet',view==='live'&&quiet?'1':'0');
  byId('message').className='message';byId('message').textContent=(shown===requested?'Refreshing ': 'Reading ')+views.find(([id])=>id===view)[1]+'…';byId('drawing').setAttribute('aria-busy','true');
  try{
    const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw new Error('refresh');const data=await response.json();
    if(stopped||exporting||!isVisible()||requested!==key())return;
    revision=data.revision;
    if(view==='timelapse'){
      if(playerRevision!==revision){const frame=document.createElement('iframe');frame.title='Timelapse player and exports';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads');fitFrame(frame);const player=selectionUrl('/player');player.searchParams.set('revision',revision);frame.src=player.href;byId('drawing').replaceChildren(frame);playerRevision=revision;lastSvg=''}
    }else if(data.svg!==lastSvg||playerRevision){byId('drawing').innerHTML=data.svg;lastSvg=data.svg;playerRevision=''}
    byId('text').textContent=data.text;byId('status').textContent=data.status;byId('period').textContent=data.label;
    byId('message').textContent='Updated '+new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});shown=requested;
  }catch(error){if(!stopped&&requested===key()){byId('message').className='message error';byId('message').textContent='Could not refresh. Your previous drawing is kept; press Refresh to try again.';if(!shown)byId('fallback').open=true}}
  finally{busy=false;byId('drawing').setAttribute('aria-busy','false');if(again||requested!==key())refresh();else schedule()}
}
function choose(id){closeExport();view=id;controls();remember();refresh()}
for(const [id,label] of views){const button=document.createElement('button');button.textContent=label;button.title=label+' ('+(views.findIndex(([key])=>key===id)+1)+')';button.type='button';button.addEventListener('click',()=>choose(id));buttons.set(id,button);byId('tabs').append(button)}
byId('range').addEventListener('change',()=>{range=byId('range').value;remember();refresh()});
byId('older').addEventListener('click',()=>{closeExport();backs[view==='work'?'week':view]++;controls();remember();refresh()});
byId('newer').addEventListener('click',()=>{closeExport();backs[view==='work'?'week':view]=Math.max(0,back()-1);controls();remember();refresh()});
byId('now').addEventListener('click',()=>{closeExport();backs[view==='work'?'week':view]=0;controls();remember();refresh()});
byId('quiet').addEventListener('click',()=>{quiet=!quiet;controls();remember();refresh()});
byId('refresh').addEventListener('click',()=>{closeExport();refresh()});
byId('export').addEventListener('click',()=>{byId('export-controls').hidden=!byId('export-controls').hidden;byId('export').setAttribute('aria-expanded',String(!byId('export-controls').hidden))});
function formats(){const select=byId('format');select.replaceChildren();for(const [value,label] of byId('part').value==='stats'?[['html','Page'],['csv','CSV'],['json','JSON']]:[['html','Export page'],['png','PNG'],['svg','SVG'],['gif','GIF'],['video','Video']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option)}}
byId('part').addEventListener('change',formats);formats();
byId('export-back').addEventListener('click',()=>{closeExport();if(!back())refresh();else schedule()});
byId('save').addEventListener('click',async()=>{
  if(!revision||shown!==key()){byId('message').textContent='Wait for this page to finish reading before exporting.';return}
  const part=byId('part').value,format=byId('format').value,url=selectionUrl('/export');url.searchParams.set('revision',revision);url.searchParams.set('part',part);url.searchParams.set('format',format);
  if(['svg','csv','json'].includes(format)){
    byId('save').disabled=true;try{const response=await fetch(url);if(!response.ok)throw new Error('export');const blob=await response.blob(),href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download='theoffice-month-'+part+'.'+format;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);byId('message').textContent='Download ready.'}catch{byId('message').className='message error';byId('message').textContent='Could not export this revision. Refresh the month and try again.'}finally{byId('save').disabled=false}
  }else{clearTimeout(timer);exporting=true;byId('drawing').hidden=true;byId('fallback').hidden=true;byId('export-title').textContent=byId('part').selectedOptions[0].textContent;byId('export-panel').hidden=false;byId('export-frame').src=url.href}
});
byId('stop')?.addEventListener('click',async()=>{
  stopped=true;clearTimeout(timer);byId('stop').disabled=true;
  try{const response=await fetch(selectionUrl('/shutdown'),{method:'POST'});if(!response.ok)throw new Error('stop');byId('message').className='message';byId('message').textContent='Dashboard stopped. You can close this tab.';byId('drawing').setAttribute('aria-busy','false');for(const button of document.querySelectorAll('button,select'))button.disabled=true}
  catch(error){stopped=false;byId('stop').disabled=false;byId('message').className='message error';byId('message').textContent='Could not stop the dashboard. Try again.';schedule()}
});
function becameVisible(){clearTimeout(timer);if(isVisible()&&(shown!==key()||view!=='timelapse'&&!back()))refresh()}
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='theoffice:visibility'||typeof event.data.visible!=='boolean'||nativeVisible===event.data.visible)return;nativeVisible=event.data.visible;becameVisible()});
document.addEventListener('keydown',keyboard);document.addEventListener('visibilitychange',becameVisible);
window.addEventListener('pagehide',()=>clearTimeout(timer));controls();refresh();
</script></body></html>`
}

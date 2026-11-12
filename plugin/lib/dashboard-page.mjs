// The dashboard is served by lib/dashboard.mjs only. No remote assets or dependencies.
// The page is the Claude desktop pane in a browser: the same pixel console on top (lib/svg-menu.mjs's tabs, and under
// them lib/svg-period.mjs's strip, the Timelapse's ranges or the Month's export row, drawn here by the very modules the
// desktop draws them with, served by the dashboard at /lib/), the same card drawing under it, the same hotkeys (1-6
// tabs, q Quiet, z Zoom, p n c pages, y w m ranges, e Export and the export row's letters, b Back). Each key of the
// console is a real button laid over its zone, so a click, Tab and Enter, and a screen reader all reach it. Until the
// modules load (or if they cannot), the same buttons stand as a plain row instead.
// The page listens to /events: the server pushes a nudge when the agents' files move, and the page asks for its drawing
// again; the server hands back the same revision when nothing drawn changed, so the drawing never reloads for nothing.
// With no stream (a host that blocks it, a server gone), it asks every 5 seconds while visible, as it always did.
// `stoppable: false`: a host owns the server's life (Antigravity's sidecar), so the page offers no Stop button.
export function dashboardPage({ nonce, selection, restore = true, preferences = null, stoppable = true, today = '' }) {
  const json = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Office</title>
<style>
:root{color-scheme:dark light;--bg:#191919;--ink:#e9e4d8;--muted:#9c968a;--line:#3b3832;--plate:#2a2722;--accent:#f4ce65}
@media(prefers-color-scheme:light){:root{--bg:#f6f4ee;--ink:#2e2a23;--muted:#776f60;--line:#d8d0c0;--plate:#fffdf8;--accent:#ac7b0d}}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{margin:0;background:var(--bg);color:var(--ink)}
body{font:13px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
main{max-width:1148px;margin:0 auto;padding:16px 16px 24px}
.console{display:flex;flex-direction:column}
.deck{position:relative;line-height:0}
.deck>img{display:block;width:100%;height:auto;user-select:none;-webkit-user-select:none;-webkit-user-drag:none;pointer-events:none}
.keys{position:absolute;inset:0}
.keys>button{position:absolute;top:0;bottom:0;margin:0;padding:0;border:0;border-radius:6px;background:transparent;color:transparent;font-size:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.keys>button:focus-visible{outline:2px solid var(--accent);outline-offset:-3px}
.keys>.name{display:none}
.plain .deck>img{display:none}
.plain .keys{position:static;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:3px 0;line-height:19px}
.plain .keys>button{position:static;color:var(--ink);font-size:13px;background:var(--plate);border:1px solid var(--line);padding:4px 10px}
.plain .keys>button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#241c0d}
.plain .keys>.name{display:inline;color:var(--muted);padding:0 4px}
.line{margin:10px 0 0;color:var(--muted);white-space:pre-wrap}
.line.error{color:#f2a582}
.line button{font:inherit;color:var(--ink);background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}
.stage{margin-top:19px}
.drawing{line-height:0;min-height:120px}
.drawing>svg,.drawing>img{display:block;width:100%;height:auto;max-width:100%}
.panel iframe{display:block;width:100%;height:720px;border:0;border-radius:7px;background:#171512}
footer{margin-top:16px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;color:var(--muted);font-size:12px;line-height:16px}
.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#8a8478;margin-right:6px;vertical-align:1px}
.dot.on{background:#78c27a}
footer button{font:inherit;color:inherit;background:none;border:1px solid var(--line);border-radius:5px;padding:2px 8px;cursor:pointer}
footer button:hover{color:var(--ink)}
@media(max-width:480px){main{padding:10px 8px 18px}}
</style></head><body class="plain"><main>
<div class="console" id="console" aria-label="The Office menu">
<div class="deck" id="deck-tabs"><img alt="" aria-hidden="true"><div class="keys" id="tabs" role="toolbar" aria-label="Tabs"></div></div>
<div class="deck" id="deck-lapse" hidden><img alt="" aria-hidden="true"><div class="keys" id="lapse" role="toolbar" aria-label="Timelapse"></div></div>
<div class="deck" id="deck-strip" hidden><img alt="" aria-hidden="true"><div class="keys" id="strip" role="toolbar" aria-label="Pages"></div></div>
<div class="deck" id="deck-ask" hidden><img alt="" aria-hidden="true"><div class="keys" id="ask" role="toolbar" aria-label="Export"></div></div>
</div>
<p class="line" id="line" role="status" aria-live="polite">Opening the office…</p>
<div class="stage">
<div class="drawing" id="drawing" role="img" aria-label="The Office" aria-busy="true"></div>
<section class="panel" id="panel" hidden><iframe id="panel-frame" title="Export The Office" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe></section>
</div>
<footer><span><span class="dot" id="dot"></span><span id="foot">Local activity only</span></span>${stoppable ? '<button id="stop" type="button">Stop server</button>' : ''}</footer>
</main><script nonce="${nonce}">
const initial=${json(selection)},restore=${restore ? 'true' : 'false'},persisted=${json(preferences)},serverToday=${json(today)};
// the pane's tabs (hooks/register.tsx TABS): id, label, short label, icon, hotkey
const VIEWS=[['live','Live','Live','live','1'],['today','Today','Today','today','2'],['week','Week','Week','week','3'],['month','Month','Month','month','4'],['work','What they did','Work','work','5'],['timelapse','Timelapse','Lapse','timelapse','6']];
const LAPSES=[['yesterday','Yesterday','y'],['week','Week','w'],['month','Month','m']];
const PARTS=[['calendar','Calendar','Calendar','calendar','a'],['directory','Directory','Directory','directory','d'],['whole','Whole month','Month','building','m'],['stats','Stats','Stats','stats','s']];
const DRAWING_FORMATS=[['png','PNG','png','i'],['svg','SVG','svg','s'],['gif','GIF','gif','g'],['video','Video','video','v']];
const STATS_FORMATS=[['html','Page','page','h'],['csv','CSV','csv','t'],['json','JSON','json','j']];
const UNIT={today:'day',week:'week',month:'month',work:'week'},MAX_BACK={today:3660,week:520,month:1200};
const STEP_WORDS={older:'Older (p)',newer:'Newer (n)','leap-older':'Much older','leap-newer':'Much newer',now:'Now (c)',export:'Export (e)'};
const byId=id=>document.getElementById(id),storeKey='theoffice.dashboard.v1';
function savedState(){try{const cookie=document.cookie.split('; ').find(value=>value.startsWith('theoffice_dashboard='));return JSON.parse(cookie?decodeURIComponent(cookie.slice(20)):localStorage.getItem(storeKey)||'null')}catch{return null}}
const stored=persisted||savedState(),saved=restore?stored:null;
let view=VIEWS.some(([id])=>id===saved?.view)?saved.view:initial.view;
let range=LAPSES.some(([id])=>id===saved?.range)?saved.range:initial.range;
let quiet=initial.quiet===true||Boolean(stored?.quiet),zoom=initial.zoom===true||Boolean(stored?.zoom),backs={today:0,week:0,month:0};
for(const [unit,max] of Object.entries(MAX_BACK)){const n=stored?.backs?.[unit];if(Number.isInteger(n)&&n>=0&&n<=max)backs[unit]=n}
if(!saved&&UNIT[initial.view])backs[initial.view==='work'?'week':initial.view]=initial.back;
let busy=false,again=false,stopped=false,nativeVisible=true,timer=null,shown='',shownView='',revision='',today=serverToday,label='',reading=false;
let ask=null,panel=null,pressed=null,ui=null,source=null,live=false,waitTimer=null,drawnWidth=0;
const isVisible=()=>nativeVisible&&!document.hidden;
const pageKey=()=>view==='work'?'week':view;
function back(){return UNIT[view]?backs[pageKey()]:0}
function isNow(){return view!=='timelapse'&&!back()}
function width(){const w=Math.round(byId('console')?.clientWidth||0);return w>=320?Math.min(2400,w):960}
function drawingWidth(){return Math.max(320,Math.min(2400,Math.round(width()/20)*20))}
function key(){return JSON.stringify([view,range,back(),view==='live'&&quiet,zoom,drawingWidth()])}
function selectionUrl(route){const url=new URL(route,location.href);url.search='';const token=new URL(location.href).searchParams.get('token');if(token)url.searchParams.set('token',token);return url}
function viewUrl(route){const url=selectionUrl(route);url.searchParams.set('view',view);url.searchParams.set('range',range);url.searchParams.set('back',String(back()));if(view==='live'&&quiet)url.searchParams.set('quiet','1');if(zoom)url.searchParams.set('zoom','1');url.searchParams.set('width',String(drawingWidth()));return url}
function remember(){
  const state=JSON.stringify({view,range,quiet,zoom,backs});try{localStorage.setItem(storeKey,state)}catch{}
  try{document.cookie='theoffice_dashboard='+encodeURIComponent(state)+';Path=/;Max-Age=31536000;SameSite=Strict'}catch{}
  fetch(selectionUrl('/preferences'),{method:'POST',headers:{'Content-Type':'application/json'},body:state,keepalive:true}).catch(()=>{});
  const url=selectionUrl('/');url.searchParams.set('view',view);url.searchParams.set('range',range);url.searchParams.set('back',String(back()));url.searchParams.set('quiet',quiet?'1':'0');if(zoom)url.searchParams.set('zoom','1');history.replaceState(null,'',url);
}
function say(text,{error=false,action=null}={}){
  const line=byId('line');line.className=error?'line error':'line';line.replaceChildren();line.textContent=text||'';line.hidden=!text&&!action;
  if(action){const button=document.createElement('button');button.type='button';button.textContent=action[0];button.addEventListener('click',action[1]);if(text)line.append(' ');line.append(button)}
}

// ---- the console: what each deck holds, as the pane builds its rows
function tabKeys(){
  const tabs=VIEWS.map(([id,label,short,icon])=>({id,label,short,icon,...(id===view?{isOn:true}:{})}));
  return [...tabs,{id:'quiet',label:'Quiet',short:'Quiet',icon:'quiet',isSwitch:true,...(quiet?{isOn:true}:{}),...(view==='live'?{}:{isHidden:true})},{id:'zoom',label:'Zoom',short:'Zoom',icon:'zoom',isSwitch:true,...(zoom?{isOn:true}:{})}];
}
function lapseKeys(){
  const open=panel?.kind==='lapse';
  return [...LAPSES.map(([id,label])=>({id,label,short:label,icon:id,...(id===range?{isOn:true,isRepeatable:true}:{})})),{id:'export',label:'Export',short:'Export',icon:'export',...(open?{isOn:true,isRepeatable:true}:{})}];
}
function exportKeys(){
  if(ask==='what')return PARTS.map(([id,label,short,icon])=>({id,label,short,icon}));
  return [...(ask==='stats'?STATS_FORMATS:DRAWING_FORMATS).map(([id,label,icon])=>({id,label,short:label,icon})),{id:'back',label:'Back',short:'Back',icon:'back'}];
}
function askWords(){return ask==='what'?'Export':(PARTS.find(([id])=>id===ask)?.[2]??'')+' as'}
const hotkeyOf={tabs:id=>VIEWS.find(([v])=>v===id)?.[4]??{quiet:'q',zoom:'z'}[id],lapse:id=>LAPSES.find(([v])=>v===id)?.[2]??'e',ask:id=>id==='back'?'b':(ask==='what'?PARTS:ask==='stats'?STATS_FORMATS:DRAWING_FORMATS).find(([v])=>v===id)?.[ask==='what'?4:3]};
function decks(){
  const list=[];const strip=UNIT[view]&&today?{unit:UNIT[view],back:back(),today,busy:reading,joined:true,...(view==='month'?{exporter:ask===null?'idle':'open',hangs:ask!==null}:{})}:null;
  list.push({id:'tabs',kind:'menu',keys:tabKeys(),joined:view==='timelapse'||!!strip});
  if(view==='timelapse')list.push({id:'lapse',kind:'menu',keys:lapseKeys(),under:true});
  if(strip)list.push({id:'strip',kind:'period',props:strip});
  if(view==='month'&&ask!==null&&strip)list.push({id:'ask',kind:'menu',keys:exportKeys(),under:true,prompt:askWords()});
  return list;
}
function keyButton(holder,id){
  let button=[...holder.children].find(b=>b.dataset.id===id);
  if(!button){button=document.createElement('button');button.type='button';button.dataset.id=id;button.dataset.deck=holder.id;
    button.addEventListener('pointerdown',e=>{if(e.button===0&&ui){pressed={deck:holder.id,id};drawConsole()}});
    for(const type of ['pointerup','pointerleave','pointercancel'])button.addEventListener(type,()=>{if(pressed){pressed=null;drawConsole()}});
    button.addEventListener('click',()=>press(holder.id,button.dataset.id,button));holder.append(button)}
  return button;
}
function prune(holder,ids){for(const child of [...holder.children])if(!ids.has(child.dataset.id))child.remove()}
function stripWords(zone,props){
  if(STEP_WORDS[zone.id])return STEP_WORDS[zone.id];
  try{return ui.pageName(props.unit,zone.back,props.today)}catch{return 'Page '+zone.back}
}
function drawConsole(){
  const shownDecks=decks(),ids=new Set(shownDecks.map(d=>d.id));
  for(const id of ['tabs','lapse','strip','ask'])byId('deck-'+id).hidden=!ids.has(id);
  const w=width();
  for(const deck of shownDecks){
    const holder=byId(deck.id),img=byId('deck-'+deck.id).querySelector('img');
    if(ui){
      const held=pressed?.deck===deck.id?pressed.id:null;
      const row=deck.kind==='period'?ui.renderPeriod({...deck.props,width:w,pressed:held}):ui.renderMenu({keys:deck.keys,width:w,joined:deck.joined===true,under:deck.under===true,pressed:held,prompt:deck.prompt??''});
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(row.source);byId('deck-'+deck.id).setAttribute('aria-label',row.alt||'');
      const seen=new Set();
      for(const zone of row.zones){
        seen.add(zone.id);const button=keyButton(holder,zone.id);
        button.style.left=(zone.x/row.W*100)+'%';button.style.width=(zone.w/row.W*100)+'%';
        const k=deck.keys?.find(k=>k.id===zone.id);
        const words=deck.kind==='period'?stripWords(zone,deck.props):k.label+(hotkeyOf[deck.id]?.(zone.id)?' ('+hotkeyOf[deck.id](zone.id)+')':'');
        button.title=words;button.setAttribute('aria-label',words);button.textContent=k?k.label:words;
        if(k?.isSwitch||k?.isOn)button.setAttribute('aria-pressed',String(k.isOn===true));else button.removeAttribute('aria-pressed');
        if(deck.kind==='period'){button.dataset.back=String(zone.back);button.dataset.step=String(zone.step??'');button.dataset.act=zone.act??''}
      }
      prune(holder,seen);
    }else plainKeys(deck,holder);
  }
  for(const id of ['tabs','lapse','strip','ask'])if(!ids.has(id))byId(id).replaceChildren();
}
// before the modules load, or without them: the same keys as a plain row of buttons
function plainKeys(deck,holder){
  const seen=new Set(),add=(id,text,on,hint)=>{seen.add(id);const b=keyButton(holder,id);b.textContent=text;b.title=hint?text+' ('+hint+')':text;b.removeAttribute('style');if(on!==undefined)b.setAttribute('aria-pressed',String(on));else b.removeAttribute('aria-pressed');b.disabled=false;return b};
  if(deck.kind==='period'){
    const n=deck.props.back;
    add('older','◀ Older',undefined,'p').disabled=n>=MAX_BACK[pageKey()];seen.add('name');
    let name=[...holder.children].find(c=>c.dataset.id==='name');if(!name){name=document.createElement('span');name.className='name';name.dataset.id='name';holder.append(name)}
    name.textContent=(label||'')+(reading?' · reading…':'');
    add('newer','Newer ▶',undefined,'n').disabled=n===0;add('now','Now',undefined,'c').disabled=n===0;
    if(deck.props.exporter)add('export','Export',deck.props.exporter==='open','e');
    for(const id of ['older','name','newer','now','export'])if(seen.has(id)){const c=[...holder.children].find(c=>c.dataset.id===id);if(c)holder.append(c)}
  }else for(const k of deck.keys)if(!k.isHidden)add(k.id,k.label,deck.id==='ask'?undefined:k.isOn===true,hotkeyOf[deck.id]?.(k.id));
  prune(holder,seen);
}

// ---- what a key does
function press(deck,id,button){
  if(deck==='tabs'){if(id==='quiet')toggleQuiet();else if(id==='zoom')toggleZoom();else if(VIEWS.some(([v])=>v===id))choose(id);return}
  if(deck==='lapse'){if(id==='export')togglePlayer();else chooseRange(id);return}
  if(deck==='ask'){answer(id);return}
  if(deck==='strip'){
    if(id==='export'||button?.dataset.act==='export'){toggleAsk();return}
    if(id==='older')return step(1);if(id==='newer')return step(-1);if(id==='now')return turn(0);
    const n=Number(button?.dataset.step);if(button?.dataset.step&&Number.isFinite(n))return step(n);
    turn(Number(button?.dataset.back))
  }
}
function choose(id){if(id===view&&id!=='timelapse')return;closePanel();ask=null;view=id;remember();drawConsole();refresh(true)}
function toggleQuiet(){if(view!=='live')return;quiet=!quiet;remember();drawConsole();refresh(true)}
function toggleZoom(){zoom=!zoom;remember();drawConsole();refresh(true)}
function chooseRange(id){closePanel();range=id;remember();drawConsole();refresh(true)}
function step(n){if(!UNIT[view])return;turn(back()+n)}
function turn(n){if(!UNIT[view]||!Number.isInteger(n))return;const next=Math.max(0,Math.min(MAX_BACK[pageKey()],n));if(next===back())return;closePanel();backs[pageKey()]=next;remember();drawConsole();refresh(true)}
function toggleAsk(){if(view!=='month')return;closePanel();ask=ask===null?'what':null;drawConsole()}
function answer(id){
  if(ask==='what'){if(PARTS.some(([p])=>p===id)){ask=id;drawConsole()}return}
  if(id==='back'){ask='what';drawConsole();return}
  const part=ask;if(!(part==='stats'?STATS_FORMATS:DRAWING_FORMATS).some(([f])=>f===id))return;
  ask=null;drawConsole();exportMonth(part,id);
}
async function exportMonth(part,format){
  if(!revision||shown!==key()){say('Wait for this page to finish reading before exporting.');return}
  const url=selectionUrl('/export');url.searchParams.set('revision',revision);url.searchParams.set('part',part);url.searchParams.set('format',format);
  const name=(PARTS.find(([p])=>p===part)?.[1]??part)+' as '+((part==='stats'?STATS_FORMATS:DRAWING_FORMATS).find(([f])=>f===format)?.[1]??format);
  if(['svg','csv','json'].includes(format)){
    try{const response=await fetch(url);if(!response.ok)throw new Error('export');const blob=await response.blob(),href=URL.createObjectURL(blob),link=document.createElement('a');link.href=href;link.download='theoffice-month-'+part+'.'+format;link.hidden=true;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),30000);say(name+': saved to your downloads.')}
    catch{say('Could not export this page. Let it refresh, then try again.',{error:true})}
  }else openPanel('month',url,name+(format==='html'?'':': the page below saves it to your downloads.'));
}
function togglePlayer(){
  if(panel?.kind==='lapse'){closePanel();drawConsole();return}
  if(!revision||shown!==key()){say('Wait for the replay to finish reading before exporting.');return}
  const url=selectionUrl('/player');url.searchParams.set('revision',revision);
  openPanel('lapse',url,"The replay's player: save it as a GIF, a video or an SVG.");drawConsole();
}
function openPanel(kind,url,words){clearTimeout(timer);clearTimeout(waitTimer);panel={kind};byId('drawing').hidden=true;byId('panel').hidden=false;byId('panel-frame').src=url.href;say(words,{action:['‹ Back to the office (b)',()=>{closePanel();drawConsole();refresh()}]})}
function closePanel(){if(!panel)return;panel=null;byId('panel').hidden=true;byId('panel-frame').removeAttribute('src');byId('drawing').hidden=false;say('')}

// ---- the drawing
function schedule(){clearTimeout(timer);if(!stopped&&!panel&&isVisible()&&isNow()&&!live)timer=setTimeout(()=>refresh(),5000)}
function waiting(){const img=document.createElement('img');img.alt='The Office is reading';img.src=viewUrl('/waiting').href;byId('drawing').replaceChildren(img);
  say({live:'Counting desks…',today:"Reading today's sessions…",week:'Counting desks…',month:'Reading last month and this one…',work:'Counting desks…',timelapse:'Reading the replay…'}[view]+(back()?' (a page far back is read once; after that it opens at once)':''))}
// A tab of its own shows the pane's waiting room when its drawing takes a moment; a page turned, Quiet, Zoom or a new
// width keep the drawing on screen meanwhile, the strip's LED blinking while a page is read (the pane's own way).
// While an export is shown nothing is read: the export stays on the revision it was made from.
async function refresh(changed=false){
  if(stopped||!isVisible()||panel)return;
  if(busy){again=true;return}
  busy=true;again=false;
  const requested=key(),sameView=shownView===view;
  if(changed&&back()&&shown!==requested){reading=true;drawConsole()}
  clearTimeout(waitTimer);
  if(shown!==requested)waitTimer=sameView?setTimeout(()=>{if(back())say('Reading '+(label||'that page')+'… A page far back is read once; after that it opens at once.')},800):setTimeout(waiting,400);
  byId('drawing').setAttribute('aria-busy','true');
  try{
    const response=await fetch(viewUrl('/snapshot'));if(!response.ok)throw new Error('refresh');
    const data=await response.json();
    if(stopped||requested!==key()||!isVisible()||panel)return;
    if(typeof data.today==='string'&&data.today)today=data.today;
    if(data.revision!==revision||shown!==requested){revision=data.revision;byId('drawing').innerHTML=data.svg;drawnWidth=drawingWidth()}
    label=data.label||'';shown=requested;shownView=view;
    byId('drawing').setAttribute('aria-label',data.alt||data.status||'The Office');
    document.title=data.status?'The Office · '+String(data.status).replace(/^[^A-Za-z0-9]+/,''):'The Office';
    clearTimeout(waitTimer);say('');
  }catch(error){if(!stopped&&requested===key()){clearTimeout(waitTimer);say(shown?'Could not refresh. The drawing is the last one read.':'The Office could not be drawn. It tries again in a moment.',{error:true})}}
  finally{clearTimeout(waitTimer);busy=false;byId('drawing').setAttribute('aria-busy','false');if(reading){reading=false;drawConsole()}if(again||requested!==key())refresh();else schedule()}
}

// ---- live: the server's nudges
function foot(){byId('dot').className=live?'dot on':'dot';byId('foot').textContent=stopped?'The server is stopped.':live?'Live · local activity only':'Local activity only'}
function connect(){
  if(stopped||source||typeof EventSource!=='function'||!isVisible())return;
  try{source=new EventSource(selectionUrl('/events').href)}catch{source=null;return}
  source.addEventListener('open',()=>{live=true;foot();schedule();if(isNow())refresh()});
  source.addEventListener('error',()=>{if(live){live=false;foot();schedule()}});
  source.addEventListener('change',()=>{if(isNow()&&!panel){clearTimeout(timer);refresh()}});
  source.addEventListener('bye',()=>{disconnect();ended('The Office server stopped. Open it again from your agent (/theoffice browser in Claude Code).')});
}
function disconnect(){if(source){source.close();source=null}if(live){live=false;foot()}}
function ended(words){stopped=true;clearTimeout(timer);disconnect();foot();say(words);byId('drawing').setAttribute('aria-busy','false');for(const b of document.querySelectorAll('button'))b.disabled=true}

// ---- keys
function keyboard(event){
  if(event.ctrlKey||event.metaKey||event.altKey||event.target?.isContentEditable||['INPUT','SELECT','TEXTAREA'].includes(event.target?.tagName)||stopped)return;
  const k=String(event.key||'').toLowerCase(),done=()=>event.preventDefault();
  const n=Number(event.key);if(n>=1&&n<=6){done();choose(VIEWS[n-1][0]);return}
  if(k==='escape'){if(panel){done();closePanel();drawConsole();refresh()}else if(ask!==null){done();ask=null;drawConsole()}return}
  if(panel&&k==='b'){done();closePanel();drawConsole();refresh();return}
  if(k==='z'){done();toggleZoom();return}
  if(k==='q'&&view==='live'){done();toggleQuiet();return}
  if(view==='timelapse'){const r=LAPSES.find(l=>l[2]===k);if(r){done();chooseRange(r[0]);return}if(k==='e'){done();togglePlayer()}return}
  if(view==='month'&&ask!==null){
    if(k==='e'){done();toggleAsk();return}
    const id=k==='b'?'back':(ask==='what'?PARTS.find(p=>p[4]===k)?.[0]:(ask==='stats'?STATS_FORMATS:DRAWING_FORMATS).find(f=>f[3]===k)?.[0]);
    if(id){done();answer(id);return}
  }
  if(UNIT[view]){if(k==='p'){done();step(1)}else if(k==='n'){done();step(-1)}else if(k==='c'){done();turn(0)}else if(k==='e'&&view==='month'){done();toggleAsk()}}
}
byId('stop')?.addEventListener('click',async()=>{
  byId('stop').disabled=true;
  try{const response=await fetch(selectionUrl('/shutdown'),{method:'POST'});if(!response.ok)throw new Error('stop');ended('The Office server stopped. You can close this tab.')}
  catch{byId('stop').disabled=false;say('Could not stop the server. Try again.',{error:true})}
});
function becameVisible(){clearTimeout(timer);if(isVisible()){connect();if(shown!==key()||isNow())refresh()}else disconnect()}
window.addEventListener('message',event=>{if(event.source!==parent||event.data?.type!=='theoffice:visibility'||typeof event.data.visible!=='boolean'||nativeVisible===event.data.visible)return;nativeVisible=event.data.visible;becameVisible()});
document.addEventListener('keydown',keyboard);document.addEventListener('visibilitychange',becameVisible);
window.addEventListener('pagehide',()=>{clearTimeout(timer);disconnect()});
let resized=null;
if(typeof ResizeObserver==='function')new ResizeObserver(()=>{drawConsole();clearTimeout(resized);resized=setTimeout(()=>{if(drawnWidth&&drawingWidth()!==drawnWidth&&!panel)refresh()},250)}).observe(byId('console'));
function load(name){try{return import('/lib/'+name)}catch(error){return Promise.reject(error)}}
Promise.all([load('svg-menu.mjs'),load('svg-period.mjs'),load('period.mjs')]).then(([menu,period,pages])=>{
  if(typeof menu.renderMenu!=='function'||typeof period.renderPeriod!=='function')return;
  ui={renderMenu:menu.renderMenu,renderPeriod:period.renderPeriod,pageName:pages.pageName};
  for(const id of ['tabs','lapse','strip','ask'])byId(id).replaceChildren();
  document.body.classList.remove('plain');drawConsole();
}).catch(()=>{});
drawConsole();foot();connect();refresh(true);
</script></body></html>`
}

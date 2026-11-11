// The Office on a screen of its own: a tablet on a stand, a picture frame, a spare monitor. Served by lib/dashboard.mjs
// at /frame, to a frame's link only (scripts/dashboard.mjs --frame). No remote assets or dependencies.
// The page is the drawing, and nothing else while nobody touches it: no words but a hint that leaves by itself, and the
// tabs as a bar of keys that a tap brings up at the foot of the screen and that leaves by itself too. It asks
// for the drawing that fills its screen (`screen`, in the screen's own pixels: lib/dashboard.mjs fitScreen draws it in
// the screen's shape, the building as big as it stands whole) and lays it over the whole screen, from a whole pixel.
// It listens to /events as the browser's office does
// and asks again when the office moves; with no stream it asks every few seconds.
// A frame outlives the server: when this computer sleeps or The Office stops, the last drawing dims under a Closed
// plate, and the page keeps knocking until the same link answers again (the launcher keeps a frame's port and token).
// The tabs: a tap anywhere brings up the bar (the pane's tabs, its keycaps and icons, lib/svg-menu.mjs menuIconSvg: Live,
// Today, Week, Month, What they did, and Full screen where the browser can), a key of it picks its tab, and it leaves
// after a few seconds or at a tap beside it. A swipe turns to the next tab or the one before, as the arrows do; 1 to 5
// pick one, f goes full screen, `rotate` minutes turns the tabs by itself. On an iPad, Add to Home Screen opens it
// without Safari's bars.
// A frame is looked at from across a room, so it trades the pane's haste for calm: a drawing on screen stands SWAP
// seconds before the next one of the same tab replaces it (each new drawing starts every walk over), the tab a tap
// turns to next is asked for ahead and kept, so the tap shows it at once and the fresh one follows (a tab picked that is
// not kept shows the pane's waiting room, Clawd at the archive desk, until its drawing comes: `loaders`, the rooms for
// the week, today and the month as lib/dashboard.mjs draws them, each also narrow for a screen held upright
// (`week-tall`…), sent with the page), and `smooth` asks
// for the drawing as it glides (the pane's steps on a beat, four a second, save a pane's CPU; a frame may spend it).
// A frame stays open for weeks, through updates of the plugin: every drawing it is sent names the page the server now
// serves (FRAME_BUILD, the X-Office-Page header), and a page that is not that one loads itself again, once.
// The script keeps to what an old frame's browser runs: no optional chaining, no modules.
import { menuIconSvg } from './svg-menu.mjs'

/** The tabs a frame shows, in the order a swipe turns them: the pane's, without the replay. */
export const FRAME_VIEWS = ['live', 'today', 'week', 'month', 'work']
/** Each tab's key on the bar: its name, a shorter one for a narrow screen, as the pane's menu has them. */
const KEYS = { live: ['Live', 'Live'], today: ['Today', 'Today'], week: ['Week', 'Week'], month: ['Month', 'Month'], work: ['What they did', 'Work'] }

/** Which page this is: a short mark of its source, so a frame left open knows when the server serves another. */
export const FRAME_BUILD = mark(framePage.toString())

function mark(text) {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function framePage({ nonce, view = 'live', rotate = 0, smooth = false, loaders = {} }) {
  const json = (value) => JSON.stringify(value).replaceAll('<', '\\u003c')
  // the bar's keys: the pane's own icons, two screen pixels to an art pixel, beside their names
  const keys = FRAME_VIEWS.map((id) => `<button type="button" data-view="${id}" aria-pressed="${id === view}">${menuIconSvg(id)}<span class="long">${KEYS[id][0]}</span><span class="short">${KEYS[id][1]}</span></button>`).join('')
  // four corners pulled apart: full screen
  const corners = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="#2a211b" d="M0 0h3v1H1v2H0zM6 0h3v3H8V1H6zM0 6h1v2h2v1H0zM8 6h1v3H6V8h2z"/></svg>'
  const full = `<button type="button" id="full" aria-label="Full screen" hidden>${corners}</button>`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="The Office"><meta name="theme-color" content="#14120f"><title>The Office</title>
<style>
html,body{margin:0;height:100%;overflow:hidden;background:#14120f;overscroll-behavior:none}
body{font:13px/19px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#e9e4d8;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
body.still{cursor:none}
#stage{position:fixed;top:0;right:0;bottom:0;left:0;transition:filter .8s}
#stage>svg{position:absolute;display:block}
#stage>img{position:absolute;top:4%;left:4%;width:92%;height:92%;object-fit:contain}
.closed #stage{filter:brightness(.38) saturate(.5)}
#stage{touch-action:none}
#bar{position:fixed;left:50%;bottom:14px;bottom:max(14px,env(safe-area-inset-bottom));transform:translate(-50%,160%);display:flex;gap:7px;max-width:calc(100% - 16px);padding:9px 11px 8px;border-radius:10px;background:#241c17;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),inset 0 2px 0 rgba(255,255,255,.07),0 8px 28px rgba(0,0,0,.55);transition:transform .22s ease-out}
#bar.on{transform:translate(-50%,0)}
#bar button{display:flex;align-items:center;gap:9px;flex:none;height:46px;margin:0;padding:0 15px 4px;border:2px solid #0e0b09;border-radius:4px;background:#e9dfc7;box-shadow:inset 0 2px 0 #fffaf0,inset 0 -4px 0 #a3967b;color:#2a211b;font:bold 15px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;cursor:pointer;-webkit-appearance:none;appearance:none}
#bar button:active{padding:2px 15px 0;background:#d2c5a8;box-shadow:none}
#bar button[aria-pressed=true]{background:#f6d860;box-shadow:inset 0 2px 0 #fff3c0,inset 0 -4px 0 #bf9a35,0 0 0 3px rgba(255,179,92,.2);color:#4a3417}
#bar button[hidden]{display:none}
#bar svg{display:block;flex:none}
#bar .short{display:none}
@media(max-width:820px){#bar{gap:5px;padding:7px 8px 6px}#bar button{height:42px;padding:0 10px 4px;gap:7px;font-size:13px}#bar .long{display:none}#bar .short{display:inline}}
@media(max-width:560px){#bar .short{display:none}#bar button[aria-pressed=true] .short{display:inline}}
#note{position:fixed;left:50%;bottom:7%;transform:translateX(-50%);max-width:86%;padding:7px 14px;border:1px solid #3b3832;border-radius:6px;background:rgba(25,23,19,.92);text-align:center;opacity:0;transition:opacity .6s;pointer-events:none}
#note.on{opacity:1}
#bar.on~#note{bottom:96px}
</style></head><body>
<div id="stage" role="img" aria-label="The Office" aria-busy="true"></div>
<nav id="bar" aria-label="Views">${keys}${full}</nav>
<p id="note" role="status" aria-live="polite"></p>
<script nonce="${nonce}">
var VIEWS=${json(FRAME_VIEWS)},NAMES={live:'Live',today:'Today',week:'Week',month:'Month',work:'What they did'},rotate=${json(rotate)},smooth=${json(smooth === true)},BUILD=${json(FRAME_BUILD)},LOADERS=${json(loaders)};
// a drawing stands SWAP ms before the next of its tab replaces it; the next tab is asked for ahead when its kept drawing is older than AHEAD
var SWAP=30000,AHEAD=300000;
var view=${json(view)},busy=false,again=false,revision='',shown='',isFresh=false,swapAt=0,due=null,kept={},isAhead=false,aheadTimer=null,loadTimer=null,source=null,live=false,timer=null,fails=0,noteTimer=null,sized=null,still=null,drawnAt=0;
var stage=document.getElementById('stage'),note=document.getElementById('note'),bar=document.getElementById('bar'),barTimer=null,down=null;
var token=new URL(location.href).searchParams.get('token');
function ratio(){return Math.max(1,Math.min(4,window.devicePixelRatio||1))}
// the screen in its own pixels, as the server takes one (240 to 8192 a side)
function screenSize(){var r=ratio(),side=function(n){return Math.max(240,Math.min(8192,Math.round(n*r)))};return side(window.innerWidth)+'x'+side(window.innerHeight)}
function keyOf(v){return v+' '+screenSize()}
function key(){return keyOf(view)}
function api(route){var url=new URL(route,location.href);url.search='';url.searchParams.set('token',token);return url}
function say(words,ms){clearTimeout(noteTimer);note.textContent=words||'';note.className=words?'on':'';if(words&&ms)noteTimer=setTimeout(function(){note.className=''},ms)}
// The drawing on the screen: as big as it stands whole on it, from a whole pixel. The server drew it in the screen's
// shape, so that is the whole screen, but for a building too high at every width, which stands scaled down in its middle.
// The shape is the screen's to the art pixel, and a screen is seldom a whole number of those: the part of one left over
// would show as a line of the page along an edge (over the sky, on a tablet held upright), so a drawing within two art
// pixels of the screen's shape is laid edge to edge, stretched by that fraction of a percent.
function place(){
  var svg=stage.querySelector('svg'),box=svg&&svg.viewBox&&svg.viewBox.baseVal;if(!box||!box.width||!box.height)return;
  var r=ratio(),wide=window.innerWidth*r,high=window.innerHeight*r,k=Math.min(wide/box.width,high/box.height);
  var whole=wide/k-box.width<2&&high/k-box.height<2;
  svg.setAttribute('preserveAspectRatio',whole?'none':'xMidYMin meet');
  svg.style.width=((whole?wide:box.width*k)/r)+'px';svg.style.height=((whole?high:box.height*k)/r)+'px';
  svg.style.left=(whole?0:Math.max(0,Math.floor((wide-box.width*k)/2))/r)+'px';svg.style.top=(whole?0:Math.max(0,Math.floor((high-box.height*k)/2))/r)+'px';
}
// the server serves another page than this one (the plugin was updated): load it, once for each
function renew(build){
  if(!build||build===BUILD)return;
  try{if(sessionStorage.getItem('office-page')===build)return;sessionStorage.setItem('office-page',build)}catch(e){return}
  location.reload();
}
// The waiting room, in place of whatever is on screen, while the tab's drawing is read: the pane's own (lib/svg-loading.mjs),
// standing whole in the middle of the screen. It came with the page (LOADERS), so it shows at once even while the server
// is busy reading; a page without it asks the server for it. Nothing is on screen as far as the tab goes. A screen held
// upright takes the room drawn narrow for it (its kind and '-tall'), which stands bigger across it.
function loader(){
  var kind=view==='today'||view==='month'?view:'week',room=(window.innerHeight>window.innerWidth&&LOADERS[kind+'-tall'])||LOADERS[kind];
  if(room){stage.innerHTML=room;place()}
  else{var img=document.createElement('img'),url=api('/waiting');url.searchParams.set('view',view);img.alt='The Office is reading';img.src=url.href;stage.innerHTML='';stage.appendChild(img)}
  shown='';revision='';isFresh=false;drawnAt=0;stage.setAttribute('aria-busy','true');
}
function waiting(){if(!stage.firstElementChild)loader()}
// A drawing's clocks run by themselves from the moment it went on screen: one that stood still meanwhile (the frame
// asleep, the office closed) is put back on time.
function onTime(){
  var svg=stage.querySelector('svg');if(!svg||!drawnAt)return;
  try{svg.unpauseAnimations();var due=(Date.now()-drawnAt)/1000;if(Math.abs(due-svg.getCurrentTime())>2)svg.setCurrentTime(due)}catch(e){}
}
function opened(){fails=0;onTime();if(document.body.className.indexOf('closed')>=0){document.body.classList.remove('closed');say('')}}
function failed(){
  fails++;if(fails<2||document.body.className.indexOf('closed')>=0)return;
  document.body.classList.add('closed');var svg=stage.querySelector('svg');try{if(svg)svg.pauseAnimations()}catch(e){}
  say('Closed · The Office opens again when its computer wakes up');
}
// One tab's drawing for this screen, asked of the server and kept: done(key, drawing), the drawing null when it did not come.
function ask(v,done){
  var k=keyOf(v),url=api('/snapshot');url.searchParams.set('view',v);url.searchParams.set('screen',screenSize());if(smooth)url.searchParams.set('smooth','1');
  fetch(url.href,{cache:'no-store'}).then(function(response){if(!response.ok)throw new Error('refresh');renew(response.headers.get('X-Office-Page'));return response.json()}).then(function(data){
    data.at=Date.now();kept[k]=data;done(k,data);
  }).catch(function(){done(k,null)});
}
// A drawing put on screen: fresh when the server just drew it, not when it is a kept one shown while the fresh one comes.
function show(k,data,fresh){
  revision=data.revision;stage.innerHTML=data.svg;drawnAt=swapAt=Date.now();isFresh=fresh;shown=k;place();
  stage.setAttribute('aria-label',data.alt||data.status||'The Office');stage.setAttribute('aria-busy','false');
  document.title=data.status?'The Office · '+String(data.status).replace(/^[^A-Za-z0-9]+/,''):'The Office';
}
// how long the drawing on screen still stands before a newer one of its tab may replace it (0: it may now)
function stands(){return isFresh&&shown===key()?Math.max(0,swapAt+SWAP-Date.now()):0}
// the office moved: the newest drawing is asked for once the one on screen has stood its time
function nudge(){var wait=stands();if(!wait){refresh();return}if(!due)due=setTimeout(function(){due=null;refresh()},wait)}
function schedule(){clearTimeout(timer);timer=setTimeout(function(){connect();refresh()},live?120000:5000)}
function refresh(){
  if(busy){again=true;return}
  busy=true;again=false;var asked=key();
  ask(view,function(k,data){
    if(data){
      if(k===key()){
        if(shown!==k||!isFresh||(data.revision!==revision&&!stands())){show(k,data,true);if(note.className&&!noteTimer)say('')}
        else if(data.revision!==revision&&!due)due=setTimeout(function(){due=null;refresh()},stands());
      }
      opened();
    }else failed();
    busy=false;if(again||asked!==key())refresh();else{schedule();ahead()}
  });
}
// the tab a tap turns to next, asked for ahead a moment after this one is drawn, so the tap shows it at once
function ahead(){
  clearTimeout(aheadTimer);
  aheadTimer=setTimeout(function(){
    var k=keyOf(VIEWS[(VIEWS.indexOf(view)+1)%VIEWS.length]);
    if(isAhead||busy||document.hidden||fails||(kept[k]&&Date.now()-kept[k].at<AHEAD))return;
    isAhead=true;ask(k.split(' ')[0],function(){isAhead=false});
  },2500);
}
// the server's nudges; a stream that ended for good (a server gone, then back) is opened again at the next knock
function connect(){
  if(source&&source.readyState!==2)return;
  if(source){source.close();source=null}
  if(typeof EventSource!=='function')return;
  try{source=new EventSource(api('/events').href)}catch(e){source=null;return}
  source.addEventListener('open',function(){live=true;refresh()});
  source.addEventListener('error',function(){if(live){live=false;schedule()}});
  source.addEventListener('change',nudge);
  source.addEventListener('bye',function(){live=false;source.close();fails=1;failed();schedule()});
}
// A tab picked: its kept drawing at once when there is one, its name said until a drawing of it is on screen, the fresh one asked for
function choose(next){
  if(VIEWS.indexOf(next)<0||next===view)return;
  view=next;clearTimeout(due);due=null;light();var k=key();
  clearTimeout(loadTimer);
  if(kept[k]){show(k,kept[k],false);say(NAMES[view],1600)}
  else{
    // its name at once; the waiting room a moment later, unless its drawing was that quick
    say(NAMES[view]+' …');noteTimer=null;
    loadTimer=setTimeout(function(){if(key()===k&&shown!==k)loader()},250);
  }
  refresh();
}
function turn(step){choose(VIEWS[(VIEWS.indexOf(view)+step+VIEWS.length)%VIEWS.length])}
function canFull(){var el=document.documentElement;return typeof (el.requestFullscreen||el.webkitRequestFullscreen)==='function'}
function fullscreen(){
  var el=document.documentElement,on=document.fullscreenElement||document.webkitFullscreenElement;
  try{if(on)(document.exitFullscreen||document.webkitExitFullscreen).call(document);else(el.requestFullscreen||el.webkitRequestFullscreen).call(el)}catch(e){}
}
function isStandalone(){try{return navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches||window.matchMedia('(display-mode: fullscreen)').matches}catch(e){return false}}
function awake(){try{if(navigator.wakeLock&&!document.hidden)navigator.wakeLock.request('screen').catch(function(){})}catch(e){}}
function stir(){document.body.classList.remove('still');clearTimeout(still);still=setTimeout(function(){document.body.classList.add('still')},3000)}
// The bar of tabs: the key of the tab on screen lit; up at a tap, gone by itself a few seconds after the last touch.
function light(){var keys=bar.querySelectorAll('[data-view]');for(var i=0;i<keys.length;i++)keys[i].setAttribute('aria-pressed',String(keys[i].getAttribute('data-view')===view))}
function barUp(){bar.className='on';clearTimeout(barTimer);barTimer=setTimeout(barDown,6000)}
function barDown(){clearTimeout(barTimer);bar.className=''}
function inBar(node){while(node&&node!==document.body){if(node===bar)return true;node=node.parentNode}return false}
bar.addEventListener('click',function(event){
  var key=event.target;while(key&&key!==bar&&key.tagName!=='BUTTON')key=key.parentNode;
  if(!key||key===bar)return;
  if(key.id==='full')fullscreen();else choose(key.getAttribute('data-view'));
  barUp();
});
// a tap beside the bar brings it up or sends it away; a swipe turns to the next tab or the one before
document.addEventListener('pointerdown',function(event){if(!event.button)down={x:event.clientX,y:event.clientY}});
document.addEventListener('pointerup',function(event){
  var from=down;down=null;if(event.button||!from||inBar(event.target))return;
  var dx=event.clientX-from.x,dy=event.clientY-from.y;
  if(Math.abs(dx)>60&&Math.abs(dx)>2*Math.abs(dy)){turn(dx<0?1:-1);barUp();return}
  if(Math.abs(dx)>12||Math.abs(dy)>12)return;
  if(bar.className==='on')barDown();else barUp();
});
document.addEventListener('pointercancel',function(){down=null});
document.addEventListener('keydown',function(event){
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  var k=String(event.key||'').toLowerCase(),n=Number(event.key);
  if(n>=1&&n<=VIEWS.length){event.preventDefault();choose(VIEWS[n-1])}
  else if(k==='f'){event.preventDefault();fullscreen()}
  else if(k==='arrowright'||k===' '){event.preventDefault();turn(1)}
  else if(k==='arrowleft'){event.preventDefault();turn(-1)}
});
document.addEventListener('pointermove',function(event){stir();if(event.pointerType==='mouse'&&!down)barUp()});
document.addEventListener('visibilitychange',function(){if(!document.hidden){awake();connect();refresh()}});
window.addEventListener('resize',function(){place();clearTimeout(sized);sized=setTimeout(function(){place();if(key()!==shown){kept={};refresh()}},250)});
if(rotate>0)setInterval(function(){turn(1)},rotate*60000);
if(canFull()&&!isStandalone())document.getElementById('full').hidden=false;
say('Tap for the views · swipe to turn them'+(!isStandalone()&&/iPad|iPhone|Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1?' · Share, then Add to Home Screen, hides the bars':''),8000);
stir();awake();setTimeout(waiting,400);connect();refresh();
</script></body></html>`
}

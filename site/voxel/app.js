import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/dm-mono/latin-500.css'
import './style.css'
import './pixel.css'
import './information.css'
import './classic.css'
import './views.css'
import { PROVIDERS, STATUS, VIEWS, demoSnapshot, escapeHtml as esc, minutesLabel } from './data.js'
import { CAST } from '../../plugin/lib/cast.mjs'
import { NEON } from '../../plugin/lib/svg-kit.mjs'
import { pageName, pageTicks } from '../../plugin/lib/period.mjs'
import { summaryMetrics, projectPanel, agentExtras, workRows, crewRows } from './information.js'

const hoverTooltip=document.createElement('div');hoverTooltip.className='scene-hover-tooltip';hoverTooltip.hidden=true;hoverTooltip.setAttribute('role','tooltip');document.querySelector('#scene-stage').append(hoverTooltip)
const paths = {
  'arrow-up-right':'M7 17 17 7M7 7h10v10', 'arrow-left':'m12 5-7 7 7 7M5 12h14', download:'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4',
  github:'M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-3c3-.4 6-1.5 6-5a4 4 0 0 0-1-3c.3-1 .3-2-.1-3-1-.3-3 1-3 1a11 11 0 0 0-6 0s-2-1.3-3-1c-.4 1-.4 2-.1 3a4 4 0 0 0-1 3c0 3.5 3 4.6 6 5a3.5 3.5 0 0 0-1 3v4',
  lock:'M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3', office:'M4 21V5h11v16M15 10h5v11M8 9h3M8 13h3M8 17h3M2 21h20', activity:'M3 12h4l3-8 4 16 3-8h4', chart:'M4 20h17M7 16v-5m5 5V5m5 11V8',
  settings:'m9 3-1 3-3 1-2 3 2 2v3l3 1 1 3h4l1-3 3-1v-3l2-2-2-3-3-1-1-3zM15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  sliders:'M4 7h16M4 17h16M8 4v6m8 4v6', search:'M15 15l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0', sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  moon:'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10', expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5', mouse:'M12 2a6 6 0 0 0-6 6v8a6 6 0 0 0 12 0V8a6 6 0 0 0-6-6M12 2v7', pause:'M8 5v14m8-14v14', play:'m7 4 14 8-14 8z', minus:'M5 12h14', plus:'M5 12h14M12 5v14', commit:'M3 12h5m8 0h5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0', scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 12h8m-4-4v8', camera:'M3 7h4l2-3h6l2 3h4v13H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0', x:'m6 6 12 12M6 18 18 6', copy:'M8 8h12v13H8zM16 8V3H3v13h5', check:'m5 12 4 4L19 6', focus:'M3 8V3h5m8 0h5v5M3 16v5h5m13-5v5h-5M12 8v8m-4-4h8',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2', calendar:'M4 6h16v14H4zM4 10h16M8 3v5m8-5v5',
}
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.office}"/></svg>` }
function paintIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)}) }
paintIcons()
const $ = selector => document.querySelector(selector)
const $$ = selector => [...document.querySelectorAll(selector)]
// Local refreshes often repeat the same snapshot. Keep existing SVG nodes and
// focused controls when their content has not changed.
const renderedMarkup = new WeakMap()
function renderMarkup(selector, markup) {
  const element=$(selector)
  if(renderedMarkup.get(element)===markup)return false
  element.innerHTML=markup
  renderedMarkup.set(element,markup)
  return true
}
const params = new URLSearchParams(location.search)
const token = params.get('token')
const isLocal = Boolean(token) && params.get('mode') !== 'demo'
const TABS = VIEWS.map(v=>v.id)
const UNITS = Object.fromEntries(VIEWS.map(v=>[v.id,v.unit]))
const emptySnapshot = () => ({source:'local',view:'live',agents:[],projects:[],activity:[],totals:{},daily:[],hourly:[],days:[],period:{days:[],back:0,past:false}})
const state = { snapshot:isLocal?emptySnapshot():null, selected:null, project:null, search:'',view:'office',activityFilter:'all',theme:'night',playing:!matchMedia('(prefers-reduced-motion: reduce)').matches,overview:false,camera:'front',exploded:false,facade:false,pixelScale:1,inspectorMode:'project',selectedProject:null,quiet:false,tab:'live',backs:{today:0,week:0,month:0,work:0},range:'week' }
state.themeAuto=true
try { const saved=JSON.parse(localStorage.getItem('theoffice-voxel-preferences-v2')||'null'); if(saved){if(saved.themeAuto===false){state.theme=saved.theme==='night'?'night':'day';state.themeAuto=false}if(typeof saved.playing==='boolean')state.playing=saved.playing;state.overview=false;state.pixelScale=[1,2,3].includes(saved.pixelScale)?saved.pixelScale:1;if(TABS.includes(saved.tab))state.tab=saved.tab;if(['yesterday','week','month'].includes(saved.range))state.range=saved.range;state.quiet=saved.quiet===true} }catch{}
// An explicit view in the address wins over the remembered one
if(TABS.includes(params.get('view')))state.tab=params.get('view')
if(!isLocal)state.snapshot=demoSnapshot({view:state.tab,back:state.backs[state.tab]??0,range:state.range})
let sceneApi,refreshTimer,demoTimer,toastTimer,metricsTimer,stopped=false,sceneStarting=false
let refreshController=null,refreshPending=false
const shownAgents = () => state.snapshot.agents.filter(a=>(!state.project || a.project===state.project) && (!state.search || `${a.name} ${a.agent} ${a.project} ${a.task} ${a.title||''}`.toLowerCase().includes(state.search)))
const provider = agent => PROVIDERS[agent] || {label:'Agent',name:'Teammate',color:'#a5b28e'}
const status = agent => STATUS[agent.status] || STATUS.idle
const color = value => /^#[\da-f]{3,8}$/i.test(value||'')?value:'#8eaa7b'
const spriteMarkup = new Map()
function nativeSprite(agent) {
  const cast=CAST[agent]||CAST.claude
  if(!spriteMarkup.has(cast))spriteMarkup.set(cast,`<svg viewBox="0 0 17 10" fill="none" shape-rendering="crispEdges" aria-hidden="true">${cast.sprite.flatMap((row,y)=>[...row].map((c,x)=>c==='.'?'':`<rect x="${x}" y="${y}" width="1" height="1" fill="${cast.eyes.includes(c)?cast.eye:cast.legend[c]}"/>`)).join('')}</svg>`)
  return spriteMarkup.get(cast)
}
const face = (agent,extra='') => `<span class="pixel-face cast-sprite-host ${extra}" style="--agent:${color(CAST[agent.agent]?.hex.dark||agent.color||provider(agent.agent).color)}" aria-hidden="true">${nativeSprite(agent.agent)}</span>`
$$('[data-native-sprite]').forEach(el=>el.innerHTML=nativeSprite(el.dataset.nativeSprite))
$('#hero-wordmark').innerHTML=`<svg viewBox="0 0 ${NEON.w} ${NEON.h}" shape-rendering="crispEdges" role="img" aria-label="THE OFFICE"><g stroke="#ffcf2e" stroke-width="3" fill="#fffbe0">${NEON.d.map(d=>`<path d="${d}"/>`).join('')}</g></svg>`
const dot = agent => `<i class="status-dot" style="--status:${status(agent).color}" title="${status(agent).label}"></i>`
// A desk's state in the pixel office's words, for the directory and the tooltip
const KIND_LABEL = {working:'At work',thinking:'Thinking',waiting:'Waiting on helpers',asking:'Hand up',error:'Stopped on an error',stopped:'Stopped',break:'On a break',done:'Your turn',dozing:'Dozing'}
const stateLabel = agent => KIND_LABEL[agent.kind] ?? status(agent).label
function notify(message) { clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3500) }
function savePreferences(){try{localStorage.setItem('theoffice-voxel-preferences-v2',JSON.stringify({theme:state.theme,themeAuto:state.themeAuto,playing:state.playing,overview:state.overview,pixelScale:state.pixelScale,tab:state.tab,range:state.range,quiet:state.quiet}))}catch{}}
function setTheme(theme,sky=null){state.theme=theme==='night'?'night':'day';state.sky=sky;document.documentElement.dataset.theme=state.theme;sceneApi?.setTheme(state.theme,{sky});$('#theme-toggle').setAttribute('aria-pressed',String(state.theme==='night'));$('#theme-toggle').setAttribute('aria-label',`Switch to ${state.theme==='night'?'day':'night'}`);$('#theme-toggle').innerHTML=`${icon(state.theme==='night'?'moon':'sun')}<span id="theme-label">${state.theme==='night'?'Night shift':'Day shift'}</span>`;$('#night-setting').checked=state.theme==='night';savePreferences()}
function setPlaying(value){state.playing=value;sceneApi?.setPlaying(value);$('#pause-button').innerHTML=icon(value?'pause':'play');$('#pause-button').setAttribute('aria-label',`${value?'Pause':'Play'} animation`);$('#pause-button').setAttribute('aria-pressed',String(!value));$('#motion-setting').checked=value;savePreferences()}
function setMode(app,updateUrl=true){document.body.dataset.mode=app?'app':'website';if(!app)document.body.dataset.cinema='false';$('#fullscreen-button').setAttribute('aria-label',app?'Enlarge the building':'Open full office');$('#leave-office').hidden=!app;if(updateUrl){const url=new URL(location.href);if(app)url.searchParams.set('mode',isLocal?'app':'demo');else if(token)url.searchParams.set('mode',isLocal?'website':'demo');else url.searchParams.delete('mode');history.pushState({},'',url)}if(!app){state.view='office';setView('office')}window.scrollTo({top:0,behavior:'instant'});requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')))}
function projectInfo(name){return state.snapshot.projects.find(p=>p.name===name)}
function renderTeam(){
  const agents=shownAgents(),focusedId=document.activeElement?.closest('.team-member')?.dataset.select
  if(!agents.some(a=>a.id===state.selected))state.selected=agents[0]?.id||null
  renderMarkup('#agent-list',agents.length?agents.map(a=>`<button class="team-member${a.id===state.selected?' selected':''}" data-select="${esc(a.id)}" title="${esc(a.name)} — ${esc(stateLabel(a))}" aria-label="Inspect ${esc(a.name)}, ${esc(a.project)}">${face(a)}<span><strong>${esc(a.title||a.name)}</strong><small>${esc(a.name)} · ${esc(a.project)}</small></span>${dot(a)}</button>`).join(''):'<p class="empty-state">No teammates here yet.</p>')
  $('#team-count').textContent=agents.length
  const visible=sceneApi&&state.tab==='live'?sceneApi.getVisibleAgents().length:Math.min(48,agents.length),n=agents.length
  if(state.inspectorMode==='agent'&&state.tab==='live')sceneApi?.selectAgent(state.selected)
  renderInspector()
  $('.floor-label').textContent=state.tab!=='live'?(VIEWS.find(v=>v.id===state.tab)?.label||'').toUpperCase():state.project&&n===0?'NO LIVE SESSIONS · BUILDING CONTEXT':n>visible?`${visible} OF ${n} DESKS IN VIEW`:'EVERY PROJECT UNDER ONE ROOF'
  $('#capacity-label').textContent=state.tab==='live'&&n>visible?`${visible}/${n} desks shown`:''
  if(focusedId)$$('.team-member').find(el=>el.dataset.select===focusedId)?.focus({preventScroll:true})
}
function renderProjects(){const count=state.snapshot.projects.length;$('#project-count').textContent=count;renderMarkup('#project-list',`<button class="project-button${!state.project?' selected':''}" data-project=""><i style="--project:#8d9e7f"></i><b>All projects</b><span>${count}</span></button>`+state.snapshot.projects.map(p=>`<button class="project-button${state.project===p.name?' selected':''}" data-project="${esc(p.name)}"><i style="--project:${color(p.color)}"></i><b>${esc(p.name)}</b><span>${state.snapshot.agents.filter(a=>a.project===p.name).length}</span></button>`).join(''))}
function renderStatus(){const agents=state.snapshot.agents;$('#working-count').textContent=agents.filter(a=>a.status==='working').length;$('#waiting-count').textContent=agents.filter(a=>['asking','error','stopped','done'].includes(a.kind)||(!a.kind&&a.status==='waiting')).length;$('#project-status-count').textContent=state.snapshot.projects.length;$('#nav-agent-count').textContent=agents.length;$('#data-source').textContent=isLocal?'Local activity':'Interactive demo';$('#source-description').textContent=isLocal?'Your local agents, under one roof.':'Sample activity. Same familiar faces.';$('#sample-note').textContent=isLocal?(state.tab==='live'?'Local activity · Refreshed every 10s':`Local activity · ${state.snapshot.period?.label||''}`):'Sample data · Real little personalities';const a=agents.find(a=>a.kind==='asking')||agents.find(a=>a.status==='waiting')||agents.find(a=>a.status==='working')||agents[0];$('#agent-bubble').hidden=!a||state.tab!=='live';if(a){$('#agent-bubble').dataset.select=a.id;renderMarkup('#agent-bubble',`${face(a,'bubble-agent')}<span><strong>${esc(a.name)}</strong> ${a.kind==='asking'?'has a question.':a.status==='working'?'is in the zone.':'is taking it easy.'}<small>${esc(a.project)} <span>↗</span></small></span>`)}}
function selectAgent(id,{focus=false}={}){
  const a=state.snapshot.agents.find(a=>a.id===id);if(!a)return
  if(!shownAgents().some(a=>a.id===id)){state.project=null;state.search='';$('#agent-search').value='';renderProjects();renderTeam()}
  state.selected=id;state.inspectorMode='agent';$('.inspector-top .eyebrow').textContent='AT THEIR DESK';state.selectedProject=a.project;sceneApi?.setSelectedProject?.(a.project)
  $('#office').classList.remove('inspector-collapsed')
  $('#agent-inspector').classList.add('mobile-open')
  if(state.tab==='live')sceneApi?.selectAgent(id)
  if(focus){if(state.tab!=='live')setTab('live',{then:()=>{sceneApi?.selectAgent(id);setCamera('focus')}});else setCamera('focus')}
  renderInspector();$$('.team-member').forEach(el=>el.classList.toggle('selected',el.dataset.select===id));renderedMarkup.delete($('#agent-list'))
  closeDirectory()
}
function inspectedAgent(){const agents=shownAgents();return agents.find(a=>a.id===state.selected)||agents[0]}
function renderInspector(){if(state.inspectorMode==='project'){renderProjectInspector();return}const a=inspectedAgent();if(!a){renderMarkup('#inspector-content','<div class="inspector-portrait"><span class="pixel-face" style="--agent:#a3b98d"></span></div><h2>A quiet floor.</h2><p class="empty-state">Open a coding session and your local agents will appear here.</p>');return}const p=provider(a.agent),project=projectInfo(a.project),s=status(a);if(renderMarkup('#inspector-content',`<button class="back-to-project" data-inspect-project="${esc(a.project)}">← ${esc(a.project)}</button><div class="inspector-portrait" style="--portrait-bg:${color(p.color)}18">${face(a)}</div><div class="inspector-name-row"><h2>${esc(a.name)}</h2><span class="agent-provider">${esc(p.label)}</span></div><p class="inspector-status">${dot(a)} ${esc(stateLabel(a))}</p>${a.title?`<div class="detail-field"><h3>SESSION</h3><p>${esc(a.title)}</p></div>`:''}<div class="detail-field"><h3>HOME PROJECT</h3><span class="project-pill" style="--project:${color(project?.color)}"><i></i>${esc(a.project)}</span></div><div class="detail-field"><h3>${s.verb.toUpperCase()}</h3><p>${esc(a.doing||a.task)}</p></div><div class="detail-field"><h3>ACTIVE SESSION TIME</h3><p>${a.minutesAvailable===false||a.minutes==null?'Not measured for this session':minutesLabel(a.minutes)}</p></div>${agentExtras(a)}${a.kind==='asking'||a.status==='waiting'?`<p class="inspector-note">${esc(a.question||a.waitingReason||'This session needs your input. Reply in its coding tool.')}</p>`:''}<button class="button button-outline inspector-action" id="focus-agent">${icon('focus')} Find in the office</button><button class="text-button" id="copy-task">${icon('copy')} Copy task</button>`)){$('#focus-agent').addEventListener('click',()=>{const current=inspectedAgent();if(current){setView('office');selectAgent(current.id,{focus:true})}});$('#copy-task').addEventListener('click',()=>{const current=inspectedAgent();if(current)copyText(`${current.name} · ${current.project}\n${current.title||current.task}`)})}}
function relativeTime(time){const ms=Date.now()-Date.parse(time);if(!Number.isFinite(ms))return 'Recorded';if(ms<60000)return 'Just now';if(ms<3600000)return `${Math.floor(ms/60000)}m ago`;if(ms<86400000)return `${Math.floor(ms/3600000)}h ago`;return new Date(time).toLocaleDateString(undefined,{month:'short',day:'numeric'})}
function renderActivity(){
  const items=state.snapshot.activity.filter(a=>(!state.project||a.project===state.project)&&(state.activityFilter==='all'||a.status===state.activityFilter))
  renderMarkup('#activity-feed',items.length?items.map(a=>{
    const isCommit=a.kind==='commit'||a.agent===null,p=provider(a.agent)
    const name=isCommit?'Commit':state.snapshot.agents.find(s=>s.id===a.sessionId)?.name||p.name
    const artwork=isCommit?`<span class="commit-symbol" aria-hidden="true">${icon('commit')}</span>`:face({agent:a.agent,color:p.color})
    return `<article class="activity-item">${artwork}<div><p><strong>${esc(name)}</strong> ${esc(a.text)}</p><small>${esc(a.project)}${!isLocal?' · Sample activity':''}</small></div><time datetime="${esc(a.time)}">${esc(relativeTime(a.time))}</time></article>`
  }).join(''):'<p class="empty-state">A quiet moment. No activity matches this view.</p>')
}
function renderInsights(){
  const snapshot=state.snapshot,scoped=state.project?projectInfo(state.project):null
  const projects=scoped?[scoped]:snapshot.projects,totals=scoped?{minutes:scoped.minutes,commits:scoped.commits,sessions:scoped.sessions??snapshot.agents.filter(a=>a.project===scoped.name).length}:snapshot.totals
  // the page's own days when it has more than a week of them (a month page), else the last seven
  const pageDays=snapshot.period?.days??[],long=pageDays.length>7
  const daily=long?(scoped?.days||snapshot.days?.map(d=>d.minutes)||[]):(scoped?.daily||snapshot.daily||[]),dailyDates=long?pageDays:(scoped?.dailyDates||snapshot.dailyDates),range=snapshot.range
  const sessionLabel=scoped&&scoped.sessions==null?'LIVE SESSIONS':'CODING SESSIONS'
  const page=snapshot.period?.label||range
  $('#insights-period').textContent=isLocal?page||'LOCAL ACTIVITY':page||'SAMPLE WEEK'
  $('#insights-scope').textContent=`${scoped?scoped.name:'All projects'} · ${page||'This week'}`
  renderMarkup('#insights-stats',[{v:minutesLabel(totals.minutes),l:'COMBINED AGENT TIME'},{v:totals.commits||0,l:'COMMITS SHIPPED'},{v:totals.sessions||0,l:sessionLabel}].map(s=>`<div class="insight-stat"><strong>${esc(s.v)}</strong><span>${s.l}</span></div>`).join(''))
  $('#insights-title').textContent=state.tab==='today'?'Today':state.tab==='month'?'Monthly':'Weekly'
  $('#weekly-chart-card').hidden=pageDays.length===1
  $('#weekly-chart').classList.toggle('long',long)
  const max=Math.max(...daily,1),defaults=['M','T','W','T','F','S','S']
  const chartLabels=[]
  renderMarkup('#weekly-chart',daily.map((n,i)=>{const date=dailyDates?.[i],label=date?(long?String(Number(date.slice(8))):new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short'})):defaults[i];chartLabels.push(`${label}: ${minutesLabel(n)}`);return `<div class="chart-column"><b>${long?'':n>0?minutesLabel(n):'–'}</b><i style="height:${Math.max(n/max*100,1)}%" title="${esc(label)}: ${minutesLabel(n)}"></i><span>${esc(label)}</span></div>`}).join(''))
  $('#weekly-chart').setAttribute('aria-label',`Combined agent time. ${chartLabels.join('. ')}`)
  const total=projects.reduce((a,p)=>a+p.minutes,0)||1
  renderMarkup('#project-insights',projects.length?projects.map(p=>`<div class="project-insight" style="--project:${color(p.color)}"><div><button data-inspect-project="${esc(p.name)}">${esc(p.name)} ↗</button><span>${minutesLabel(p.minutes)} · ${p.commits||0} commits</span></div><div class="project-insight-track"><i style="width:${Math.min(p.minutes/total*100,100)}%"></i></div></div>`).join(''):'<p class="empty-state">Projects will appear as your agents work.</p>')
  renderMarkup('#department-insights',workRows(scoped?.work||snapshot.work||[]))
  renderMarkup('#crew-insights',crewRows(scoped?.crew||snapshot.crew||[]))
  const hours=scoped?.hourly||snapshot.hourly||[],peak=Math.max(...hours,1)
  renderMarkup('#hourly-chart',hours.map((minutes,h)=>`<span title="${String(h).padStart(2,'0')}:00 · ${minutesLabel(minutes)}"><i style="height:${Math.max(minutes/peak*100,1)}%"></i>${h%3===0?`<small>${String(h).padStart(2,'0')}</small>`:''}</span>`).join(''))
  $('#hourly-chart').setAttribute('aria-label',hours.map((minutes,h)=>`${h}:00 ${minutesLabel(minutes)}`).join('. '))
}
// the sky of the hour (night, dawn, day, dusk) until a shift is picked by hand
const skyOf=hour=>hour>=20||hour<6?'night':hour<8?'dawn':hour<18?'day':'dusk'
function autoTheme(){if(!state.themeAuto)return;const hour=Number.isInteger(state.snapshot?.now?.hour)?state.snapshot.now.hour:new Date().getHours(),sky=skyOf(hour),theme=sky==='night'?'night':'day';if(theme!==state.theme||sky!==state.sky)setTheme(theme,sky)}
function renderAll(){autoTheme();if(!state.snapshot.projects.some(p=>p.name===state.selectedProject))state.selectedProject=state.snapshot.projects[0]?.name||null;if(state.project&&!projectInfo(state.project))state.project=null;if(!state.snapshot.agents.some(a=>a.id===state.selected))state.selected=state.snapshot.agents[0]?.id||null;renderProjects();renderStatus();renderActivity();renderInsights();syncSceneSnapshot();renderTeam();renderBuildingDashboard();renderPeriod()}
function setView(view,{navigate=false}={}){
  state.view=view;$('#office').dataset.view=view;closeDirectory()
  $('#activity-panel').hidden=false;$('#insights-panel').hidden=false
  if(view==='activity')renderActivity()
  else if(view==='insights')renderInsights()
  if(navigate)$(view==='office'?'#scene-wrap':view==='activity'?'#activity-panel':'#insights-panel').scrollIntoView({behavior:'instant',block:'start'})
}

// ---------------------------------------------------------------- the tabs and their pages
const BADGES={live:'LIVE FLOOR',today:'TIME CLOCK',week:'WEEK TOWER',month:'WALL CALENDAR',work:'DEPARTMENTS',timelapse:'TIMELAPSE'}
function renderTabs(){$('#view-badge').textContent=BADGES[state.tab]??'THE OFFICE';$$('button[data-tab]').forEach(b=>{const selected=b.dataset.tab===state.tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1});$('#scene-wrap').setAttribute('aria-labelledby',`tab-${state.tab}`);document.body.dataset.tab=state.tab;$('#quiet-toggle').hidden=state.tab!=='live'}
function renderPeriod(){
  const unit=UNITS[state.tab],strip=$('#period-strip'),lapse=$('#lapse-bar')
  strip.hidden=!unit;lapse.hidden=state.tab!=='timelapse'
  if(unit){
    const back=state.backs[state.tab]??0,today=state.snapshot.now?.date??new Date().toISOString().slice(0,10)
    $('#period-label').textContent=state.snapshot.period?.label&&back?state.snapshot.period.label:pageName(unit,back,today)
    renderMarkup('#period-ticks',pageTicks(unit,back,today).map(t=>`<button class="period-tick${t.isOn?' on':''}${t.isFuture?' future':''}" ${t.isFuture?'disabled':''} data-back="${t.back}" title="${esc(t.name)}">${esc(t.mark)}</button>`).join(''))
    strip.querySelector('[data-page="newer"]').disabled=back===0;strip.querySelector('[data-page="now"]').disabled=back===0
  }
  $('#period-export').hidden=state.tab!=='month'
  if(state.tab==='timelapse')$$('[data-range]').forEach(b=>b.classList.toggle('selected',b.dataset.range===state.range))
  $('#scene-caption-text').textContent=state.tab==='live'?'BUILT FROM THE ORIGINAL PIXELS.':`${(VIEWS.find(v=>v.id===state.tab)?.label||'').toUpperCase()} · ${(state.snapshot.period?.label||'').toUpperCase()}`
}
let afterLoad=null
// The month's stats as a file (the pixel office's Month Export, stats): a row a day, a column a project's agent-hours, then totals
function monthStats(){
  const s=state.snapshot,days=s.period?.days??[],projects=(s.projects??[]).filter(p=>(p.minutes??0)>0)
  const cell=v=>{const t=String(v??'');return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t}
  const hours=m=>Math.round((m??0)/6)/10
  const rows=[['date','agent-hours','commits',...projects.map(p=>p.name)],...days.map((date,i)=>[date,hours(s.days?.[i]?.minutes),s.days?.[i]?.commits??0,...projects.map(p=>hours(p.days?.[i]))]),['total',hours(s.totals?.minutes),s.totals?.commits??0,...projects.map(p=>hours(p.minutes))]]
  return rows.map(r=>r.map(cell).join(',')).join('\n')+'\n'
}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);notify(`${name} is saved to your downloads.`)}
function exportMonth(kind){const s=state.snapshot,slug=(s.period?.days?.length?`${s.period.days[0]}-to-${s.period.days.at(-1)}`:'month');if(kind==='csv')download(`month-${slug}-stats.csv`,monthStats(),'text/csv');else download(`month-${slug}-stats.json`,JSON.stringify({period:s.period,totals:s.totals,days:s.days,projects:(s.projects??[]).map(p=>({name:p.name,minutes:p.minutes,commits:p.commits,sessions:p.sessions,days:p.days})),crew:s.crew,work:s.work,source:s.source},null,2),'application/json')}
function setTab(tab,{then=null}={}){
  if(!TABS.includes(tab))return
  const changed=tab!==state.tab
  state.tab=tab;savePreferences();renderTabs();afterLoad=then
  if(changed&&state.inspectorMode==='agent'&&tab!=='live'){state.inspectorMode='project'}
  loadView()
  if(changed)window.scrollTo({top:Math.min(window.scrollY,$('#scene-wrap').getBoundingClientRect().top+window.scrollY-8),behavior:'instant'})
}
function page(delta){const unit=UNITS[state.tab];if(!unit)return;const back=Math.max(0,(state.backs[state.tab]??0)+delta);if(back===state.backs[state.tab])return;state.backs[state.tab]=back;if(state.tab==='week'||state.tab==='work'){state.backs.week=back;state.backs.work=back}loadView()}
function pageTo(back){const unit=UNITS[state.tab];if(!unit)return;state.backs[state.tab]=Math.max(0,back);if(state.tab==='week'||state.tab==='work'){state.backs.week=state.backs[state.tab];state.backs.work=state.backs[state.tab]}loadView()}
function loadView(){
  if(isLocal){$('#period-strip').classList.add('loading');clearTimeout(refreshTimer);refreshController?.abort();refreshController=null;refreshPending=false;refreshLocal();return}
  state.snapshot=demoSnapshot({view:state.tab,back:state.backs[state.tab]??0,range:state.range});renderAll();afterLoad?.();afterLoad=null
}

function filterProject(name){
  state.project=name||null;state.inspectorMode='project';state.selectedProject=name||state.snapshot.projects[0]?.name||null
  renderProjects();renderTeam();renderActivity();renderInsights();renderBuildingDashboard();closeDirectory()
  sceneApi?.setSelectedProject?.(state.selectedProject)
  if(name){$('#office').classList.remove('inspector-collapsed');$('#agent-inspector').classList.add('mobile-open')}
}
async function copyText(value){try{await navigator.clipboard.writeText(value);notify('Copied. Ready when you are.')}catch{notify('Copy is unavailable in this browser. Select the command to copy it.')}}
function setCamera(view){
  $$('[data-floor]').forEach(button=>button.classList.remove('selected'))
  state.camera=view;state.overview=view==='overview';$('#overview-setting').checked=state.overview;sceneApi?.setView(view)
  $('#camera-select').value=view
  $$('[data-camera]').forEach(b=>{b.classList.toggle('selected',b.dataset.camera===view);b.setAttribute('aria-pressed',String(b.dataset.camera===view))})
  if(view==='front')requestAnimationFrame(sceneScroll)
}
$('#explode-floors').addEventListener('click',()=>{state.exploded=!state.exploded;sceneApi?.setExploded(state.exploded);$('#explode-floors').setAttribute('aria-pressed',String(state.exploded));$('#explode-floors').classList.toggle('selected',state.exploded)})
function closeDirectory(){$('#office').classList.remove('directory-open');$('#directory-toggle').setAttribute('aria-expanded','false')}
$('#directory-toggle').addEventListener('click',()=>{const opened=$('#office').classList.toggle('directory-open');$('#directory-toggle').setAttribute('aria-expanded',String(opened));if(opened){$('#office').classList.add('inspector-collapsed');$('#agent-inspector').classList.remove('mobile-open');$('#directory-close').focus()}})
$('#directory-close').addEventListener('click',()=>{closeDirectory();$('#directory-toggle').focus()})
$('#camera-select').addEventListener('change',e=>setCamera(e.target.value))
$('#pixel-setting').addEventListener('change',e=>{state.pixelScale=Number(e.target.value);sceneApi?.setPixelScale?.(state.pixelScale);savePreferences()})
$('#facade-toggle').addEventListener('click',()=>{state.facade=!state.facade;sceneApi?.setFacade?.(state.facade);$('#facade-toggle').classList.toggle('selected',state.facade);$('#facade-toggle').setAttribute('aria-pressed',String(state.facade));$('#facade-toggle').setAttribute('aria-label',state.facade?'Open the brick facade':'Show the brick facade')})
function setQuiet(value){state.quiet=Boolean(value);savePreferences();sceneApi?.setQuiet?.(state.quiet);for(const id of ['#quiet-toggle','#information-toggle']){$(id).classList.toggle('selected',state.quiet);$(id).setAttribute('aria-pressed',String(state.quiet))}$('#office').classList.toggle('quiet-information',state.quiet)}
const typing = e => e.target.closest?.('input,textarea,select,[contenteditable]')
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&$('#agent-inspector').classList.contains('mobile-open')){$('#office').classList.add('inspector-collapsed');$('#agent-inspector').classList.remove('mobile-open')}
  if(e.key==='Escape'&&document.body.dataset.cinema==='true'){document.body.dataset.cinema='false';$('#fullscreen-button').setAttribute('aria-label','Enlarge the building')}
  if(e.key==='Escape'&&$('#office').classList.contains('directory-open')){closeDirectory();$('#directory-toggle').focus()}
  // the pixel office's keys: 1–6 the tabs, p/n/c the pages, q Quiet, space the replay
  if(e.metaKey||e.ctrlKey||e.altKey||typing(e)||document.body.dataset.mode!=='app'||$('dialog[open]'))return
  const view=VIEWS.find(v=>v.key===e.key);if(view){e.preventDefault();setTab(view.id);return}
  if(e.key==='p'){page(1);return}if(e.key==='n'){page(-1);return}if(e.key==='c'){pageTo(0);return}
  if(e.key==='q'&&state.tab==='live'){setQuiet(!state.quiet);return}
  if(e.key===' '&&state.tab==='timelapse'){e.preventDefault();toggleLapse()}
})
const commands={browser:'npm install\nnpm run build:voxel\nnpm run voxel:live',editor:'npm install\nnpm run build:voxel\nnpm run package:voxel\ncode --install-extension dist/theoffice-voxel-1.0.0.vsix',agent:'npm install\nnpm run build:voxel\nnpm run package:voxel\nclaude --plugin-dir ./dist/theoffice-voxel-plugin'}
function installTab(tab){$('#install-panel').setAttribute('aria-labelledby',`install-tab-${tab}`);$$('[data-install-tab]').forEach(b=>{const selected=b.dataset.installTab===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1});$('#install-code').textContent=commands[tab];$('#install-explanation').textContent=tab==='browser'?'Run from the repository checkout with Node.js 24+. A token-protected local office opens using your actual saved activity.':tab==='editor'?'Builds an independent VS Code / Cursor extension. Then run “The Office / Voxel: Open Live Office” from the command palette. For Cursor, use “Install from VSIX…” with the same file.':'The build also produces a standalone agent plugin ZIP and extracted directory. In Claude, open a new session with this plugin directory and run /theoffice-voxel:office-voxel.'}
function openDialog(id){$(id).showModal()}
document.addEventListener('click',e=>{const projectOffice=e.target.closest('[data-inspect-project]');if(projectOffice){inspectProject(projectOffice.dataset.inspectProject);return}const floor=e.target.closest('[data-floor]');if(floor){focusFloor(floor.dataset.floor);return}const tabButton=e.target.closest('button[data-tab]');if(tabButton){if(document.body.dataset.mode!=='app')setMode(true);setTab(tabButton.dataset.tab);return}const pageButton=e.target.closest('[data-page]');if(pageButton){pageButton.dataset.page==='older'?page(1):pageButton.dataset.page==='newer'?page(-1):pageTo(0);return}const tick=e.target.closest('[data-back]');if(tick){pageTo(Number(tick.dataset.back));return}const exporting=e.target.closest('[data-export]');if(exporting){exportMonth(exporting.dataset.export);return}const range=e.target.closest('[data-range]');if(range){state.range=range.dataset.range;savePreferences();loadView();return}const speed=e.target.closest('[data-speed]');if(speed){sceneApi?.setLapse?.({speed:Number(speed.dataset.speed)});$$('[data-speed]').forEach(b=>b.classList.toggle('selected',b===speed));return}const select=e.target.closest('[data-select]');if(select){if(document.body.dataset.mode!=='app')setMode(true);setView('office');selectAgent(select.dataset.select);return}const launch=e.target.closest('[data-launch]');if(launch){setMode(true);return}if(e.target.closest('[data-install]')){installTab('browser');openDialog('#install-dialog');return}const close=e.target.closest('[data-close-dialog]');if(close){close.closest('dialog').close();return}if(e.target.closest('[data-settings]')){openDialog('#settings-dialog');return}const project=e.target.closest('[data-project]');if(project){filterProject(project.dataset.project);return}const camera=e.target.closest('[data-camera]');if(camera){setCamera(camera.dataset.camera);return}const view=e.target.closest('button[data-view]');if(view){setView(view.dataset.view,{navigate:true});return}const filter=e.target.closest('[data-activity-filter]');if(filter){state.activityFilter=filter.dataset.activityFilter;$$('[data-activity-filter]').forEach(b=>b.classList.toggle('selected',b===filter));renderActivity();return}const tab=e.target.closest('[data-install-tab]');if(tab){installTab(tab.dataset.installTab);return}const copy=e.target.closest('[data-copy]');if(copy)copyText(copy.dataset.copy)})
$('#theme-toggle').addEventListener('click',()=>{state.themeAuto=false;setTheme(state.theme==='day'?'night':'day')})
$('#night-setting').addEventListener('change',e=>{state.themeAuto=false;setTheme(e.target.checked?'night':'day')})
$('#motion-setting').addEventListener('change',e=>setPlaying(e.target.checked))
$('#overview-setting').addEventListener('change',e=>{state.overview=e.target.checked;setCamera(state.overview?'overview':'front');savePreferences()})
$('#pause-button').addEventListener('click',()=>setPlaying(!state.playing))
$('#quiet-toggle').addEventListener('click',()=>setQuiet(!state.quiet))
$('#information-toggle').addEventListener('click',()=>setQuiet(!state.quiet))
$('#building-focus-button').addEventListener('click',()=>$('#fullscreen-button').click())
$('#fullscreen-button').addEventListener('click',()=>{if(document.body.dataset.mode!=='app'){setMode(true);$('#fullscreen-button').setAttribute('aria-label','Enlarge the building')}else{const active=document.body.dataset.cinema!=='true';document.body.dataset.cinema=String(active);$('#building-focus-button').firstChild.textContent=active?'Back to workspace ':'Focus on building ';$('#fullscreen-button').setAttribute('aria-label',active?'Exit immersive view':'Enlarge the building')}})
$('#leave-office').addEventListener('click',()=>setMode(false))
$$('.brand').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();setMode(false)}))
$('#close-inspector').addEventListener('click',()=>{$('#office').classList.add('inspector-collapsed');$('#agent-inspector').classList.remove('mobile-open')})
$('#agent-search').addEventListener('input',e=>{state.search=e.target.value.trim().toLowerCase();renderTeam()})
$('#depth-toggle').addEventListener('click',()=>{const enabled=$('#depth-toggle').getAttribute('aria-pressed')!=='true';$('#depth-toggle').setAttribute('aria-pressed',String(enabled));$('#depth-toggle').classList.toggle('selected',enabled);$('#office').classList.toggle('is-exploring',enabled);sceneApi?.setExploration?.(enabled);if(enabled&&state.camera==='front')setCamera('office');if(!enabled){if(state.exploded){state.exploded=false;sceneApi?.setExploded(false);$('#explode-floors').setAttribute('aria-pressed','false');$('#explode-floors').classList.remove('selected')}setCamera('front')}})
let sceneOnScreen=true
const sceneVisibility=new IntersectionObserver(entries=>{sceneOnScreen=entries[0].isIntersecting;sceneApi?.setVisible?.(sceneOnScreen&&!document.hidden)},{rootMargin:'80px'})
sceneVisibility.observe($('#scene-wrap'))
document.addEventListener('visibilitychange',()=>sceneApi?.setVisible?.(!document.hidden&&sceneOnScreen))
$('#reset-camera').addEventListener('click',()=>{state.overview=false;$('#overview-setting').checked=false;setCamera('front');savePreferences()})
$('#zoom-in').addEventListener('click',()=>sceneApi?.zoomBy(1.2))
$('#zoom-out').addEventListener('click',()=>sceneApi?.zoomBy(1/1.2))
$('#copy-install').addEventListener('click',()=>copyText($('#install-code').textContent))
$('#screenshot-button').addEventListener('click',()=>{if(!sceneApi){notify('The Office is still opening.');return}try{const capture=sceneApi.screenshot();$('#capture-image').src=capture;$('#capture-download').href=capture;$('#capture-dialog').showModal()}catch{notify('This browser could not save the canvas.')}})
$$('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}}))
$$('[role=tablist]').forEach(list=>list.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;const tabs=[...list.querySelectorAll('[role=tab]')];const index=tabs.indexOf(document.activeElement);if(index<0)return;e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)+tabs.length)%tabs.length;tabs[next].focus();tabs[next].click()}))
window.addEventListener('popstate',()=>{const mode=new URLSearchParams(location.search).get('mode');setMode(isLocal?mode!=='website':mode==='demo',false)})
$('#crew-cards').innerHTML=Object.entries(PROVIDERS).map(([id,p])=>`<button class="crew-card" data-crew="${id}" aria-label="Meet ${esc(p.name)}, ${esc(p.label)}">${face({agent:id,color:p.color})}<strong>${esc(p.name)}</strong><small>${esc(p.label)}</small></button>`).join('')
$$('[data-crew]').forEach(b=>b.addEventListener('click',()=>{const a=state.snapshot.agents.find(a=>a.agent===b.dataset.crew);setMode(true);setView('office');if(a)selectAgent(a.id,{focus:true});else notify(`${provider(b.dataset.crew).label} will appear when a local session is open.`)}))
// A request owns the slot through JSON decoding. Returning to the tab queues
// one replacement if an aborted request has not finished settling yet.
async function refreshLocal(){
  clearTimeout(refreshTimer)
  if(stopped||document.hidden)return
  if(refreshController){refreshPending=true;return}
  refreshPending=false
  const controller=new AbortController()
  refreshController=controller
  let timedOut=false
  const url=snapshotUrl()
  const requestTimeout=setTimeout(()=>{if(!controller.signal.aborted){timedOut=true;controller.abort()}},120000)
  try{
    const response=await fetch(url,{cache:'no-store',signal:controller.signal})
    if(stopped||document.hidden)return
    if(timedOut)throw new Error('Local activity timed out')
    if(controller.signal.aborted)return
    if(!response.ok)throw new Error('Could not read local activity')
    const snapshot=await response.json()
    if(stopped||document.hidden)return
    if(timedOut)throw new Error('Local activity timed out')
    if(controller.signal.aborted)return
    if(!Array.isArray(snapshot.agents)||!Array.isArray(snapshot.projects)||!Array.isArray(snapshot.activity))throw new Error('Invalid snapshot')
    // a page turned while this one was read: read the new one instead
    if(url!==snapshotUrl()){refreshPending=true;return}
    state.snapshot=snapshot;renderAll();$('#data-source').textContent='Local activity';$('#source-description').textContent=`${snapshot.agents.length} local sessions. Another shift at The Office.`;$('#period-strip')?.classList?.remove('loading');if(typeof afterLoad==='function'){afterLoad();afterLoad=null}
  }catch(error){
    if(!stopped&&!document.hidden&&(timedOut||!controller.signal.aborted)){$('#data-source').textContent='Refresh unavailable';$('#source-description').textContent='Could not refresh. Retrying in 10 seconds.';notify('Local activity is taking a moment. The office will retry.')}
  }finally{
    clearTimeout(requestTimeout)
    // a request a page turn replaced leaves the polling to its replacement
    const mine=refreshController===controller
    if(mine)refreshController=null
    if(mine&&!stopped&&!document.hidden){
      const every=refreshEvery()
      if(refreshPending)refreshLocal()
      else if(every||(!state.snapshot||state.snapshot.view!==(state.tab||'live')))refreshTimer=setTimeout(refreshLocal,every||10000)
    }
  }
}
function localVisibilityChanged(){
  if(!isLocal||stopped)return
  clearTimeout(refreshTimer)
  if(document.hidden){refreshPending=false;refreshController?.abort()}
  else if(refreshController)refreshPending=true
  else refreshLocal()
}
// The live floor is read every ten seconds; a page as it runs now every minute; a page of the past and a replay once.
function snapshotUrl(){const tab=state.tab||'live';let url=`./api/snapshot?token=${encodeURIComponent(token)}`;if(tab!=='live'){url+=`&view=${tab}`;if(tab==='timelapse')url+=`&range=${state.range||'week'}`;else if(state.backs?.[tab])url+=`&back=${state.backs[tab]}`}return url}
function refreshEvery(){const tab=state.tab||'live';if(tab==='live')return 10000;if(tab==='timelapse'||state.backs?.[tab])return 0;return 60000}
// Make the workspace interactive before loading and evaluating the 3D renderer.
function hover(hit){const a=hit?.id&&state.snapshot.agents.find(a=>a.id===hit.id);const text=a?`${a.title||a.name} · ${a.doing||stateLabel(a)} · ${a.project}`:hit?.text;hoverTooltip.hidden=!text;if(text){hoverTooltip.textContent=text;const r=$('#scene-stage').getBoundingClientRect();hoverTooltip.style.left=`${Math.max(8,Math.min(hit.clientX-r.left+14,r.width-275))}px`;hoverTooltip.style.top=`${Math.max(8,Math.min(hit.clientY-r.top-40,r.height-45))}px`}}
function layout({pages=1,floors=[]}={}){$('#scene-wrap').style.setProperty('--scene-pages',String(Math.max(1,Math.round(pages*1000)/1000)));renderMarkup('#floor-buttons',[...floors].sort((a,b)=>b-a).map(n=>`<button data-floor="${n}" aria-label="Inspect floor ${n}">${n}F</button>`).join('')+'<button data-floor="1" aria-label="Inspect the street lobby">G</button>');requestAnimationFrame(sceneScroll)}
async function startScene(){if(sceneStarting||stopped)return;sceneStarting=true;$('#scene-error').hidden=true;$('#scene-loading').hidden=false;try{const {createOfficeScene}=await import('./scene.js');if(stopped)return;sceneApi=await createOfficeScene($('#scene'),{onSelect:(id,project)=>{if(document.body.dataset.mode!=='app')setMode(true);if(id)selectAgent(id);else if(project)inspectProject(project)},onHover:hover,onLayout:layout,onReady:({backend,revision})=>{$('#renderer-label').textContent=`${backend.toUpperCase()} / r${revision}`},lapse:lapseEvents});if(stopped){sceneApi.dispose();return}sceneApi.setTheme(state.theme,{sky:state.sky});sceneApi.setPlaying(state.playing);sceneApi.setQuiet?.(state.quiet);syncSceneSnapshot();sceneApi.setPixelScale?.(state.pixelScale);sceneApi.setExploration?.($('#depth-toggle').getAttribute('aria-pressed')==='true');sceneApi.setFacade?.(state.facade);sceneApi.setExploded(state.exploded);if(state.tab==='live')sceneApi.selectAgent(state.inspectorMode==='agent'?state.selected:null);sceneApi.setVisible?.(sceneOnScreen&&!document.hidden);if(state.camera==='project'&&state.selectedProject)focusProject(state.selectedProject);else sceneApi.setView(state.overview?'overview':state.camera);$('#scene-loading').hidden=true;document.body.dataset.sceneReady='true';renderTeam();sceneScroll()}catch(error){$('#scene-loading').hidden=true;$('#scene-error').hidden=false;$('#scene-error-message').textContent='This browser could not start the 3D renderer. Open the prototype in a recent Chrome, Edge, or Safari with graphics acceleration enabled.';console.error('Voxel office renderer:',error)}finally{sceneStarting=false}}
function syncSceneSnapshot(){
  if(!state.snapshot)return
  // a snapshot of another tab (a reply still on its way) never reaches the scene
  if(state.snapshot.view&&state.snapshot.view!==state.tab&&!(state.snapshot.view==='live'&&!isLocal))return
  sceneApi?.setSnapshot?.(state.snapshot,{tab:state.tab})
  sceneApi?.setSelectedProject?.(state.selectedProject)
}
function sceneScroll(){const wrap=$('#scene-wrap'),stage=$('#scene-stage');if(!wrap||!stage)return;const r=wrap.getBoundingClientRect(),range=r.height-stage.offsetHeight;sceneApi?.setScroll?.(range>1?Math.min(1,Math.max(0,-r.top/range)):0)}
window.addEventListener('scroll',()=>requestAnimationFrame(sceneScroll),{passive:true})
// ---------------------------------------------------------------- the replay's controls
let lapseState={playing:true,at:0,slots:1,label:'—',lanes:null}
// The reel of the whole replay, as the pixel replay's: three lanes (sessions at work, interns, commits), each to its own scale, the playhead in gold
function drawReel(){const canvas=$('#lapse-reel'),lanes=lapseState.lanes;if(!canvas)return;const w=canvas.width=Math.max(300,Math.round(canvas.clientWidth*(devicePixelRatio||1))),h=canvas.height=Math.max(40,Math.round(canvas.clientHeight*(devicePixelRatio||1)));const g=canvas.getContext('2d');g.clearRect(0,0,w,h);if(!lanes)return;const rows=[['sessions','#9ab86a'],['interns','#8fb0ff'],['commits','#b5d67f']],lh=h/3;rows.forEach(([key,color],r)=>{const values=lanes[key]||[],max=Math.max(1,...values),n=values.length||1;g.fillStyle='#1f1a14';g.fillRect(0,r*lh+lh-1,w,1);g.fillStyle=color;values.forEach((v,i)=>{if(!v)return;const bh=Math.max(1,(v/max)*(lh-3));g.fillRect(Math.floor(i/n*w),Math.round(r*lh+lh-1-bh),Math.max(1,Math.ceil(w/n)),Math.ceil(bh))})});const x=Math.round(lapseState.at/Math.max(1,lapseState.slots-1)*(w-2));g.fillStyle='#ffcf2e';g.fillRect(x,0,2,h)}
function lapseEvents({playing,at,slots,label,lanes}={}){lapseState={...lapseState,...(playing!=null?{playing}:{}),...(at!=null?{at}:{}),...(slots!=null?{slots}:{}),...(label!=null?{label}:{}),...(lanes?{lanes}:{})};$('#lapse-clock').textContent=lapseState.label;const scrub=$('#lapse-scrub');if(document.activeElement!==scrub)scrub.value=String(Math.round(lapseState.at/Math.max(1,lapseState.slots-1)*1000));$('#lapse-play').textContent=lapseState.playing?'❚❚':'▶';$('#lapse-play').setAttribute('aria-label',lapseState.playing?'Pause the replay':'Play the replay');if(state.tab==='timelapse')drawReel();if(lapseRecorder&&lapseState.at>=lapseState.slots-1)setTimeout(()=>lapseRecorder?.state==='recording'&&lapseRecorder.stop(),900)}
// One loop of the replay saved as a video, recorded from the canvas in this browser (the pixel replay's Save video)
let lapseRecorder=null
function recordLapse(){
  const canvas=$('#scene canvas')
  if(lapseRecorder){lapseRecorder.stop();return}
  if(!canvas?.captureStream||typeof MediaRecorder==='undefined'){notify('This browser cannot record the canvas.');return}
  const type=['video/webm;codecs=vp9','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t))
  if(!type){notify('This browser cannot record a video.');return}
  const chunks=[],recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:type,videoBitsPerSecond:8e6})
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)}
  recorder.onstop=()=>{lapseRecorder=null;$('#lapse-video').classList.remove('recording');$('#lapse-video').textContent='⤓ Video';const blob=new Blob(chunks,{type:type.split(';')[0]}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`the-office-timelapse-${state.range}.${type.includes('mp4')?'mp4':'webm'}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);notify('The replay is saved to your downloads.')}
  lapseRecorder=recorder;$('#lapse-video').classList.add('recording');$('#lapse-video').textContent='● Stop'
  sceneApi?.setLapse?.({at:0,playing:true});recorder.start(250)
}
function toggleLapse(){sceneApi?.setLapse?.({playing:!lapseState.playing});lapseEvents({playing:!lapseState.playing})}
$('#lapse-play').addEventListener('click',toggleLapse)
$('#lapse-video').addEventListener('click',recordLapse)
$('#lapse-scrub').addEventListener('input',e=>sceneApi?.setLapse?.({at:Number(e.target.value)/1000*Math.max(1,lapseState.slots-1),playing:false}))
function renderBuildingDashboard(){
  const snapshot=state.snapshot,totals={...snapshot.totals,waiting:snapshot.agents.filter(a=>['asking','error','stopped','done'].includes(a.kind)||(!a.kind&&a.status==='waiting')).length}
  $('#building-hud-range').textContent=state.project?state.project:'THE WHOLE BUILDING'
  $('#building-hud-source').textContent=isLocal?'LOCAL ACTIVITY':'SAMPLE DATA'
  renderMarkup('#building-hud-metrics',summaryMetrics(state.project?{...projectInfo(state.project),waiting:snapshot.agents.filter(a=>a.project===state.project&&a.status==='waiting').length}:totals))
  $('#building-hud-footer').textContent=state.project?`${snapshot.agents.filter(a=>a.project===state.project).length} live sessions · ${projectInfo(state.project)?.sessions||0} recorded · ${projectInfo(state.project)?.subagents||0} helpers`:`${totals.projects||snapshot.projects.length} projects · ${snapshot.agents.length} at their desks · ${totals.interns||0} interns`
}
function renderProjectInspector(){
  const project=projectInfo(state.selectedProject)||state.snapshot.projects[0]
  const changed=renderMarkup('#inspector-content',projectPanel(project,state.snapshot,face))
  $('.inspector-top .eyebrow').textContent='PROJECT DIRECTORY'
  if(changed)$('#focus-project')?.addEventListener('click',()=>focusProject(project.name))
}
function focusProject(name){
  if(state.tab!=='live'){setTab('live',{then:()=>focusProject(name)});return}
  if(sceneApi?.focusProject?.(name)===false){setCamera('front');notify('No live office for this project. Its recorded work is in the directory.');return}
  state.camera='project';state.overview=false;$('#overview-setting').checked=false;$('#camera-select').value='project'
  $$('[data-floor]').forEach(button=>button.classList.remove('selected'))
  $$('[data-camera]').forEach(button=>{button.classList.remove('selected');button.setAttribute('aria-pressed','false')})
}
function inspectProject(name){
  if(!projectInfo(name))return
  if(document.body.dataset.mode!=='app')setMode(true)
  state.inspectorMode='project';state.selectedProject=name;setView('office')
  const first=state.snapshot.agents.find(a=>a.project===name)
  if(first)state.selected=first.id
  sceneApi?.selectAgent(null);sceneApi?.setSelectedProject?.(name)
  $('#office').classList.remove('inspector-collapsed');$('#agent-inspector').classList.add('mobile-open')
  renderProjectInspector();closeDirectory()
}
function focusFloor(floor){
  setView('office');closeDirectory()
  if(floor==='all'){setCamera('front');return}
  state.camera='floor';state.overview=false;$('#camera-select').value='floor'
  $$('[data-camera]').forEach(button=>{button.classList.remove('selected');button.setAttribute('aria-pressed','false')})
  $$('[data-floor]').forEach(button=>button.classList.toggle('selected',button.dataset.floor===String(floor)))
  sceneApi?.focusFloor?.(Number(floor))
}
metricsTimer=setInterval(()=>{
  if(document.hidden||!$('#settings-dialog').open||!$('.performance-details').open)return
  const metrics=sceneApi?.getMetrics?.();if(!metrics)return
  $('#performance-readout').textContent=`${metrics.backend} · ${Math.round(metrics.fps||0)} fps\n${metrics.geometries||0} geometries · ${metrics.instances||0} instance batches · ${metrics.labels||0} labels\nDisplay DPR ${metrics.nativeDpr||1} · render DPR ${metrics.dpr||1}\n${metrics.bufferWidth||0} × ${metrics.bufferHeight||0} pixels\n${metrics.ao||'off'}${metrics.aoSamples?` · ${metrics.aoSamples} samples · ${metrics.aoResolutionScale}×`:''}\nBloom ${metrics.postProcessing?'on':'off'}${metrics.postProcessing?` · threshold ${metrics.bloomThreshold}`:''}`
},1000)
$('#retry-scene').addEventListener('click',()=>{sceneApi?.dispose();$('#scene').replaceChildren();startScene()})
setMode(isLocal?params.get('mode')!=='website':params.get('mode')==='demo',false)
setTheme(state.theme);setPlaying(state.playing);setQuiet(state.quiet);$('#overview-setting').checked=state.overview;$('#pixel-setting').value=String(state.pixelScale);setCamera(state.overview?'overview':state.camera);setView('office');renderTabs();if(state.snapshot)renderAll();startScene()
if(isLocal)refreshLocal()
else demoTimer=setInterval(()=>{if(!state.playing||document.hidden)return;renderActivity()},30000)
document.addEventListener('visibilitychange',()=>{sceneApi?.setPlaying(!document.hidden&&state.playing);localVisibilityChanged()})
window.addEventListener('pagehide',()=>{stopped=true;refreshPending=false;refreshController?.abort();clearTimeout(refreshTimer);clearInterval(demoTimer);clearInterval(metricsTimer);sceneVisibility.disconnect();sceneApi?.dispose()})

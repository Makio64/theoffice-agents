import { deskWords, statusOfKind } from '../../plugin/lib/voxel-model.mjs'
import { pageDays, pageLabel, pageName } from '../../plugin/lib/period.mjs'
import { AGENT_IDS, CAST } from '../../plugin/lib/cast.mjs'

const SAMPLE_PROVIDERS = {
  claude: { label: 'Claude', name: 'Clawd', color: '#d77757', description: 'Thoughtful by nature. Always building.' },
  codex: { label: 'Codex', name: 'Dex', color: '#7f9df8', description: 'Tidy diffs. A very untidy desk.' },
  gemini: { label: 'Gemini', name: 'Gem', color: '#b49cf6', description: 'Big ideas. A little sparkle.' },
  cursor: { label: 'Cursor', name: 'Caret', color: '#8fd8e8', description: 'Quietly making everything click.' },
  kimi: { label: 'Kimi', name: 'Mooni', color: '#6fb2ff', description: 'Curious mind. Excellent coffee.' },
  grok: { label: 'Grok', name: 'Rok', color: '#e5e7ef', description: 'Fresh angles on familiar problems.' },
}
// every character of the cast: the sample's six as written above, the rest (Ocho, Ompa, Copi…) from CAST itself
export const PROVIDERS = Object.fromEntries(AGENT_IDS.map(a => [a, SAMPLE_PROVIDERS[a] ?? { label: CAST[a].name, name: CAST[a].who, color: CAST[a].hex.dark, description: CAST[a].trait }]))
export const STATUS = {
  working: { label: 'In the zone', color: '#9ab86a', verb: 'Working on' },
  waiting: { label: 'Needs a little help', color: '#e07a61', verb: 'Waiting on' },
  idle: { label: 'Taking a breather', color: '#55c5b1', verb: 'Last working on' },
  done: { label: 'All wrapped up', color: '#7d9da8', verb: 'Finished' },
}
/** The office's views, as the pixel office's tabs: what each one is called, its key and the unit its pages turn by. */
export const VIEWS = [
  { id: 'live', label: 'Live', key: '1', unit: null },
  { id: 'today', label: 'Today', key: '2', unit: 'day' },
  { id: 'week', label: 'Week', key: '3', unit: 'week' },
  { id: 'month', label: 'Month', key: '4', unit: 'month' },
  { id: 'work', label: 'What they did', key: '5', unit: 'week' },
  { id: 'timelapse', label: 'Timelapse', key: '6', unit: null },
]
const WORK = [
  ['coding','Writing code'],['reading','Reading code'],['terminal','Terminal commands'],['testing','Tests'],['web','Web research'],
  ['delegating','Delegation'],['planning','Planning'],['talking','Questions and messages'],['design','Design'],['tools','Other tools'],
]
const DAY = 86_400_000
const sum = values => values.reduce((total, value) => total + value, 0)
function distribute(total, weights) {
  const weight = sum(weights) || 1
  const values = weights.map(value => Math.floor(total * value / weight))
  const order = weights.map((value, index) => ({ value, index })).sort((a,b) => b.value - a.value)
  for (let remaining = total - sum(values), index = 0; remaining > 0; remaining--, index++) values[order[index % order.length].index]++
  return values
}
// A repeatable pseudo-random number in [0, 1) for a name, so every page of the sample says the same thing each visit
function noise(key) { let h = 2166136261; for (const char of String(key)) h = Math.imul(h ^ char.codePointAt(0), 16777619) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967296 }
const pad = n => String(n).padStart(2, '0')
const localDay = time => { const d = new Date(time); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function demoLive(agents) {
  return { desks:agents.length,working:agents.filter(a=>a.status==='working').length,waiting:agents.filter(a=>a.status==='waiting').length,
    idle:agents.filter(a=>a.status==='idle').length,done:agents.filter(a=>a.status==='done').length,
    interns:sum(agents.map(a=>a.interns.length)),meetings:sum(agents.map(a=>a.meetings.length)) }
}
// The sample's projects: name, color (the pixel office's palette), the week's agent-time, commits, sessions, helpers,
// workflows, prompts, tool calls and files edited
const SPECS = [
  ['little-studio','#9ab86a',1340,18,8,12,2,45,1820,32],['garden-api','#d4a94f',890,12,6,7,1,32,1135,27],
  ['portfolio','#c58fd8',720,9,5,6,1,28,936,21],['weekend-project','#7fd6e8',540,7,4,4,0,18,688,18],
  ['voxel-engine','#eec96f',1260,21,7,10,2,51,1650,38],['docs-kit','#6f91dc',450,6,3,3,0,17,704,14],
  ['api-gateway','#e08fc0',980,16,6,8,1,39,1412,29],['design-system','#55c5b1',810,11,5,9,2,34,1189,26],
]
const COMMIT_SUBJECTS = ['Build the roof sign and entrance','Add the seed import endpoint','Polish portfolio responsive layout','Finish the search index','Pack voxel instances by material','Document local plugin setup','Cover webhook retry routes','Tune project nameplate contrast']
// The sample's desks: id, character, agent, project, class (model.mjs deskClass), session title, what it is at (its
// label: a file, a command, the question it asks), the kind of work, the tool, agent-time, minutes in its state, minutes
// since it sat down
const DESKS = [
  ['clawd','Clawd','claude','little-studio','working','Voxel roofline pass','roof.js','coding','Edit',87,3,95],
  ['dex','Dex','codex','little-studio','working','Floor label alignment','labels.js','coding','apply_patch',64,2,70],
  ['caret-2','Caret','cursor','little-studio','break','Component architecture notes','','reading','Read',28,12,40],
  ['gem','Gem','gemini','garden-api','asking','Garden database','PostgreSQL or SQLite for the garden database?','talking','AskUserQuestion',42,4,50],
  ['mooni','Mooni','kimi','garden-api','dozing','API documentation pass','','reading','Read',36,75,160],
  ['clawd-3','Clawd','claude','garden-api','working','Seed import check','npm run seed','terminal','Bash',51,1,60],
  ['caret','Caret','cursor','portfolio','working','Portfolio on small screens','gallery.css','coding','Edit',51,2,55],
  ['clawd-2','Clawd','claude','portfolio','thinking','Contact form tests','','thinking',null,23,3,30],
  ['rok','Rok','grok','weekend-project','working','A better data index','index plan','planning','TodoWrite',58,1,65],
  ['dex-2','Dex','codex','weekend-project','done','New search experience','','coding',null,32,6,40],
  ['dex-3','Dex','codex','voxel-engine','working','Instanced voxel buffers','buffers.ts','coding','apply_patch',96,1,110],
  ['gem-2','Gem','gemini','voxel-engine','working','Camera bounds on every floor','npm test','testing','Bash',48,2,55],
  ['clawd-4','Clawd','claude','voxel-engine','asking','Tile size','Use a 16-voxel or 32-voxel tile size?','talking','AskUserQuestion',31,8,40],
  ['mooni-2','Mooni','kimi','docs-kit','working','Renderer migration notes','MIGRATION.md','reading','Read',45,1,50],
  ['clawd-5','Clawd','claude','docs-kit','done','Local setup guide','','coding',null,27,9,35],
  ['caret-3','Caret','cursor','api-gateway','working','Route migration checks','npm run check:routes','terminal','Bash',72,3,80],
  ['dex-4','Dex','codex','api-gateway','waiting','Webhook retry review','route-review','delegating','Workflow',61,4,70],
  ['rok-2','Rok','grok','api-gateway','error','Request routing notes','usage limit reached','reading','Read',33,18,45],
  ['gem-3','Gem','gemini','design-system','working','Window and nameplate palette','palette.css','design','Artifact',54,2,60],
  ['mooni-3','Mooni','kimi','design-system','asking','Focus rings','Keep the high-contrast focus rings on by default?','talking','AskUserQuestion',26,7,30],
]
const INTERNS = {
  clawd: [{id:'sample-intern-1',type:'Explore',job:'researcher',description:'Check the entrance proportions'},{id:'sample-intern-2',type:'general-purpose',job:'generalist',description:'Verify the floor labels'}],
  'dex-3': [{id:'sample-intern-3',type:'code-reviewer',job:'reviewer',description:'Review the instance buffer layout'}],
  'caret-3': [{id:'sample-intern-4',type:'Explore',job:'researcher',description:'Trace the retry route'}],
}
const MEETINGS = {
  'dex-4': [{id:'sample-workflow-1',name:'webhook-retry-review',phase:'Review',running:3,done:4,failed:0,total:9,labels:['review:retries','review:backoff','review:dead-letters']}],
}

function demoAgents(now) {
  return DESKS.map(([id,name,agent,project,kind,title,label,activityKind,tool,minutes,sinceMinutes,shiftMinutes]) => {
    const status = statusOfKind(kind), asking = kind === 'asking'
    const since = new Date(now - sinceMinutes * 60000).toISOString(), startedAt = new Date(now - shiftMinutes * 60000).toISOString()
    const interns = INTERNS[id] ?? [], meetings = MEETINGS[id] ?? []
    const words = deskWords(kind, { label, tool, activityKind, idleReason: kind === 'break' ? 'break' : kind === 'error' ? 'error' : kind === 'dozing' || kind === 'done' ? 'done' : null, interns, meetings, startedAt, since, lastSeen: since })
    return {
      id,name,agent,project,status,kind,task:label||title,activityKind,tool,minutes,minutesAvailable:true,color:PROVIDERS[agent].color,
      title,state:asking?'asking':status==='working'?'working':'idle',since,startedAt,updatedAt:since,elapsedMinutes:sinceMinutes,elapsedLabel:'Time in current state',
      question:asking?label:null,waitingReason:asking?label:null,idleReason:kind==='break'?'break':kind==='error'?'error':status==='done'?'done':status==='idle'?'break':null,
      branch:'main',model:null,account:null,interns,meetings,...words,
    }
  })
}

/** Agent-time of a project on a day off the sample's week: a weekday rhythm, quiet weekends, a day off now and then. */
function dayMinutes(index, date, weekly) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(), roll = noise(`${index}:${date}`)
  if (roll < (weekday === 0 || weekday === 6 ? .45 : .12)) return 0
  const base = weekly / 7 * (weekday === 0 || weekday === 6 ? .55 : 1.12)
  return Math.round(base * (.45 + roll * 1.1))
}
// The sample's hours: a morning and an afternoon, a little late night work
const HOUR_SHAPE = [1,1,0,0,0,0,0,2,7,9,8,7,4,9,10,9,8,6,4,2,1,1,0,0]

/** A replay of the sample: its sessions coming and going over the range, slot by slot (types OfficeTimeline). */
function demoTimeline(range, now) {
  const kind = ['yesterday','week','month'].includes(range) ? range : 'week'
  const slotMinutes = kind === 'yesterday' ? 15 : kind === 'week' ? 60 : 240, perDay = 1440 / slotMinutes
  const today = localDay(now), nDays = kind === 'yesterday' ? 1 : kind === 'week' ? 7 : 30
  const last = kind === 'yesterday' ? new Date(now - DAY) : new Date(now)
  const days = Array.from({ length: nDays }, (_, i) => localDay(last.getTime() - (nDays - 1 - i) * DAY))
  const nowSlot = kind === 'yesterday' ? perDay * nDays : (nDays - 1) * perDay + Math.floor((new Date(now).getHours() * 60 + new Date(now).getMinutes()) / slotMinutes) + 1
  const desks = [], meetings = [], commits = []
  const agents = ['claude','codex','claude','gemini','cursor','claude','kimi','grok']
  let serial = 0
  days.forEach((date, day) => {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(), quiet = weekday === 0 || weekday === 6
    SPECS.forEach(([project], p) => {
      const sessions = quiet ? Math.floor(noise(`${date}:${p}:n`) * 2.4) : 1 + Math.floor(noise(`${date}:${p}:n`) * 4)
      for (let s = 0; s < sessions; s++) {
        const startHour = 8 + Math.floor(noise(`${date}:${p}:${s}:h`) * 10), length = 2 + Math.floor(noise(`${date}:${p}:${s}:l`) * 5)
        const from = day * perDay + Math.floor(startHour * 60 / slotMinutes), to = Math.min(nowSlot, from + Math.max(1, Math.round(length * 60 / slotMinutes)))
        if (to <= from) continue
        const id = `lapse-${serial++}`, runs = [[from, to]]
        const interns = noise(`${id}:i`) < .25 ? [[from + Math.floor((to - from) / 3), 1 + Math.floor(noise(`${id}:k`) * 2)], [Math.max(from + Math.floor((to - from) / 3) + 1, to - 1), 0]] : undefined
        desks.push({ id, project, agent: agents[(p + s + day) % agents.length], title: `${project} · session ${s + 1}`, account: null, runs, ...(interns ? { interns } : {}) })
        if (noise(`${id}:c`) < .55) commits.push({ project, slot: Math.max(from, to - 1), n: 1 + Math.floor(noise(`${id}:cn`) * 3) })
        if (noise(`${id}:m`) < .12) meetings.push({ project, name: `${project}-review`, from, to: Math.min(to, from + Math.max(1, Math.round(60 / slotMinutes))), agents: 2 + Math.floor(noise(`${id}:ma`) * 3) })
      }
    })
  })
  desks.sort((a, b) => a.runs[0][0] - b.runs[0][0] || a.project.localeCompare(b.project))
  meetings.sort((a, b) => a.from - b.from)
  commits.sort((a, b) => a.slot - b.slot || a.project.localeCompare(b.project))
  const label = nDays === 1 ? pageLabel('day', 0, days[0]) : `${pageLabel('day', 0, days[0])} → ${pageLabel('day', 0, days.at(-1))}`
  return { kind, label, days, slotMinutes, perDay, slots: Math.max(1, Math.min(nowSlot, nDays * perDay)), start: 0, more: 0, desks: desks.slice(0, 600), meetings, commits, today }
}

/**
 * The illustrative office for a view and page (`back`), or a replay (`range`): consistent sample figures, never local
 * activity. Its live floor is always the same twenty desks; the week as it runs now keeps the sample's fixed totals.
 */
export function demoSnapshot({ view = 'live', back = 0, range = 'week', now = Date.now() } = {}) {
  const generatedAt = new Date(now).toISOString(), today = localDay(now)
  const unit = view === 'today' ? 'day' : view === 'month' ? 'month' : 'week'
  const page = view === 'live' || view === 'timelapse' ? 0 : Math.max(0, Math.floor(back) || 0)
  const days = pageDays(unit, page, today)
  const dailyDates = days.length >= 7 ? days.slice(-7) : Array.from({ length: 7 }, (_, i) => localDay(Date.parse(`${days.at(-1)}T12:00:00`) - (6 - i) * DAY))
  const fixedWeek = unit === 'week' && page === 0
  // All names, tasks and figures below are illustrative sample data, independent of local activity.
  const agents = demoAgents(now)
  const hour = new Date(now).getHours()
  const projects = SPECS.map(([name,color,weekMinutes,weekCommits,weekSessions,weekSubagents,weekWorkflows,weekPrompts,weekToolCalls,weekFiles],index) => {
    const assigned = agents.filter(agent=>agent.project===name)
    let perDay
    if (fixedWeek) perDay = distribute(weekMinutes, [7,12,14,10,16,9,6].map((value,i)=>value+(index+i)%4))
    else {
      perDay = days.map(date => date > today ? 0 : dayMinutes(index, date, weekMinutes))
      // the day as it runs now: the hours so far
      if (unit === 'day' && page === 0) perDay = [Math.round(weekMinutes / 7 * Math.min(1, (hour + 1) / 19))]
    }
    const minutes = sum(perDay), scale = minutes / weekMinutes
    const scaled = value => Math.round(value * scale)
    const commits = fixedWeek ? weekCommits : scaled(weekCommits), sessions = fixedWeek ? weekSessions : Math.max(minutes ? 1 : 0, scaled(weekSessions))
    const subagents = fixedWeek ? weekSubagents : scaled(weekSubagents), workflows = fixedWeek ? weekWorkflows : scaled(weekWorkflows)
    const prompts = fixedWeek ? weekPrompts : scaled(weekPrompts), toolCalls = fixedWeek ? weekToolCalls : scaled(weekToolCalls), filesEdited = fixedWeek ? weekFiles : scaled(weekFiles)
    const shape = unit === 'day' && page === 0 ? HOUR_SHAPE.map((w, h) => h <= hour ? w : 0) : HOUR_SHAPE
    const hourly = distribute(minutes, sum(shape) ? shape : HOUR_SHAPE)
    const daily = fixedWeek ? perDay : dailyDates.map(date => { const i = days.indexOf(date); return i < 0 ? 0 : perDay[i] })
    const dayWeights = perDay.map(v => v || 0)
    const dayCommits = distribute(commits, sum(dayWeights) ? dayWeights : dayWeights.map(() => 1)), daySessions = distribute(sessions, sum(dayWeights) ? dayWeights : dayWeights.map(() => 1))
    const daySubagents = distribute(subagents, sum(dayWeights) ? dayWeights : dayWeights.map(() => 1)), dayPrompts = distribute(prompts, sum(dayWeights) ? dayWeights : dayWeights.map(() => 1))
    const kinds = distribute(toolCalls,[28+index%3,23,14,12,5,4,5,3,3+index%2,3]),work = WORK.map(([kind,label],i)=>({kind,label,calls:kinds[i]}))
    const ids = [...new Set(assigned.map(agent=>agent.agent))],shares = distribute(minutes,ids.map(id=>sum(assigned.filter(a=>a.agent===id).map(a=>a.minutes)))),sessionShares = distribute(sessions,ids.map(id=>assigned.filter(a=>a.agent===id).length))
    const crew = ids.map((agent,i)=>({agent,name:PROVIDERS[agent].name,label:PROVIDERS[agent].label,color:PROVIDERS[agent].color,minutes:shares[i],sessions:sessionShares[i],live:assigned.filter(a=>a.agent===agent).length}))
    const statsOf = date => { const i = days.indexOf(date); return i < 0 ? { date, minutes: 0, commits: 0, sessions: 0, subagents: 0, prompts: 0 } : { date, minutes: perDay[i], commits: dayCommits[i], sessions: daySessions[i], subagents: daySubagents[i], prompts: dayPrompts[i] } }
    return {name,color,minutes,commits,sessions,subagents,workflows,prompts,toolCalls,filesEdited,additions:filesEdited*37+index*13,deletions:filesEdited*8+index*3,
      daily,hourly,dailyDates:[...dailyDates],dayStats:dailyDates.map(statsOf),days:[...perDay],dayCommits:[...dayCommits],
      work,crew,live:demoLive(assigned),titles:assigned.map(a=>a.title),recentCommits:[{sha:`${(0xabc1234+index*179).toString(16)}`,subject:COMMIT_SUBJECTS[index],time:new Date(now-(30+index*12)*60000).toISOString()}],
    }
  }).sort((a, b) => fixedWeek ? 0 : b.minutes - a.minutes)
  const live=demoLive(agents),totals={minutes:sum(projects.map(p=>p.minutes)),commits:sum(projects.map(p=>p.commits)),sessions:sum(projects.map(p=>p.sessions)),
    toolCalls:sum(projects.map(p=>p.toolCalls)),filesEdited:sum(projects.map(p=>p.filesEdited)),additions:sum(projects.map(p=>p.additions)),deletions:sum(projects.map(p=>p.deletions)),
    prompts:sum(projects.map(p=>p.prompts)),workflows:sum(projects.map(p=>p.workflows)),subagents:sum(projects.map(p=>p.subagents)),projects:projects.length,
    interns:live.interns,working:live.working,waiting:live.waiting,idle:live.idle,done:live.done}
  const crew=Object.entries(PROVIDERS).map(([agent,p])=>({agent,name:p.name,label:p.label,color:p.color,minutes:sum(projects.flatMap(project=>project.crew.filter(row=>row.agent===agent).map(row=>row.minutes))),
    sessions:sum(projects.flatMap(project=>project.crew.filter(row=>row.agent===agent).map(row=>row.sessions))),live:agents.filter(a=>a.agent===agent).length})).sort((a,b)=>b.minutes-a.minutes)
  const work=WORK.map(([kind,label])=>({kind,label,calls:sum(projects.map(p=>p.work.find(row=>row.kind===kind).calls))}))
  const activity=[...agents.map(a=>({id:`sample-session-${a.id}`,sessionId:a.id,agent:a.agent,project:a.project,text:a.task,time:a.updatedAt,status:a.status,kind:a.activityKind})),
    ...projects.flatMap(p=>p.recentCommits.map(c=>({id:`sample-commit-${c.sha}`,agent:null,project:p.name,text:c.subject,time:c.time,status:'done',kind:'commit'})))].sort((a,b)=>Date.parse(b.time)-Date.parse(a.time))
  const daily=dailyDates.map((_,index)=>sum(projects.map(p=>p.daily[index]))),hourly=Array.from({length:24},(_,index)=>sum(projects.map(p=>p.hourly[index])))
  const dayRow = (date, i) => ({ date, minutes: sum(projects.map(p => p.days[i])), commits: sum(projects.map(p => p.dayCommits[i])), sessions: sum(projects.map(p => p.dayStats.find(s => s.date === date)?.sessions ?? 0)), subagents: 0, prompts: 0, workflows: 0 })
  // a page as it runs now is named by what it is ('Today', 'Oct → now'), a page of the past by its dates (period.mjs)
  const label = page === 0 && unit === 'week' ? 'Sample week' : page === 0 ? pageName(unit, 0, today) : pageLabel(unit, page, today)
  return {source:'demo',view,generatedAt,range:label,agents,projects,totals,live,work,crew,activity,daily,dailyDates,hourly,projectsMore:0,
    dayStats:dailyDates.map((date,index)=>({date,minutes:daily[index],commits:sum(projects.map(p=>p.dayStats[index].commits)),sessions:sum(projects.map(p=>p.dayStats[index].sessions)),subagents:sum(projects.map(p=>p.dayStats[index].subagents)),prompts:sum(projects.map(p=>p.dayStats[index].prompts))})),
    now:{date:today,time:`${pad(hour)}:${pad(new Date(now).getMinutes())}`,hour,night:hour>=20||hour<7,weekday:new Date(now).toLocaleDateString('en-US',{weekday:'short'})},
    period:{kind:view==='live'?'week':unit==='day'?'today':unit,label,days,back:page,past:days.at(-1)<today},
    days:days.map(dayRow),
    left:[{title:'Exporter cleanup',project:'docs-kit',agent:'claude',leftAt:new Date(now-9*60000).toISOString()}],
    visitors:[{tool:'aider',project:'weekend-project',title:'Refactor the search form'}],
    interns:[{job:'consultant',n:Math.round(totals.subagents*.6)},{job:'generalist',n:Math.round(totals.subagents*.25)},{job:'researcher',n:Math.round(totals.subagents*.15)}].filter(row=>row.n>0),
    timeline:view==='timelapse'?demoTimeline(range,now):null,
  }
}
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])) }
export function minutesLabel(value) { const parsed=Number(value);const n=Number.isFinite(parsed)?Math.max(0,Math.round(parsed)):0; return n>=60?`${Math.floor(n/60)}h${n%60?` ${n%60}m`:''}`:`${n}m` }

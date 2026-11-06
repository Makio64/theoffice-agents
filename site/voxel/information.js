import { escapeHtml as esc, minutesLabel, PROVIDERS, STATUS } from './data.js'

const finite = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
const count = value => new Intl.NumberFormat(undefined, {notation: finite(value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits:1}).format(finite(value))
const ink = value => /^#[\da-f]{3,8}$/i.test(value || '') ? value : '#9ab86a'
export function summaryMetrics(totals = {}) {
  return `<div class="building-metric"><strong>${finite(totals.minutes)>=60?`${(finite(totals.minutes)/60).toFixed(1)}h`:minutesLabel(totals.minutes)}</strong><span>AGENT TIME</span></div><div class="building-metric"><strong>${count(totals.commits)}</strong><span>COMMITS</span></div><div class="building-metric"><strong>${count(totals.toolCalls)}</strong><span>TOOL CALLS</span></div><div class="building-metric attention-metric"><strong>${count(totals.waiting)}</strong><span>NEED YOU</span></div>`
}

export function activityBars(values = [], dates = []) {
  const max = Math.max(...values.map(finite), 1)
  return values.map((value, i) => {
    const label = dates[i] ? new Date(`${dates[i]}T12:00:00`).toLocaleDateString(undefined, {weekday:'short'}) : ['M','T','W','T','F','S','S'][i]
    return `<span class="mini-day" title="${esc(label)} · ${minutesLabel(value)}"><i style="height:${Math.max(finite(value)/max*100,2)}%"></i><small>${esc(label)}</small></span>`
  }).join('')
}

export function workRows(work = [], limit = 10) {
  const rows = work.filter(row => finite(row.calls) > 0).sort((a,b)=>b.calls-a.calls).slice(0,limit)
  const total = work.reduce((sum,row)=>sum+finite(row.calls),0) || 1
  const colors = {coding:'#9ab86a',testing:'#eec96f',reading:'#7fd6e8',terminal:'#b48ead',search:'#6f91dc',management:'#c678dd'}
  return rows.length ? rows.map(row=>`<div class="work-row"><div><span>${esc(row.label || row.kind)}</span><b>${count(row.calls)}</b></div><span class="work-track"><i style="width:${Math.max(finite(row.calls)/total*100,1)}%;background:${colors[row.kind]||'#9ab86a'}"></i></span></div>`).join('') : '<p class="detail-empty">No measured tool calls in this range.</p>'
}

export function crewRows(crew = []) {
  const rows = crew.filter(row=>finite(row.minutes)>0 || finite(row.sessions)>0 || finite(row.live)>0)
  const total = rows.reduce((sum,row)=>sum+finite(row.minutes),0) || 1
  return rows.length ? rows.map(row=>`<div class="crew-share"><div><span><i style="background:${ink(row.color || PROVIDERS[row.agent]?.color)}"></i>${esc(PROVIDERS[row.agent]?.label || row.name || row.agent)}</span><b>${row.minutes==null?'Not measured':minutesLabel(row.minutes)}</b></div>${row.minutes!=null?`<span class="work-track"><i style="width:${Math.max(finite(row.minutes)/total*100,1)}%;background:${ink(row.color || PROVIDERS[row.agent]?.color)}"></i></span>`:''}<small>${row.sessions==null?'Sessions not attributed':`${count(row.sessions)} sessions`}${row.live?` · ${count(row.live)} live`:''}</small></div>`).join('') : '<p class="detail-empty">Agent time has not been attributed yet.</p>'
}

export function projectPanel(project, snapshot, face) {
  if (!project) return '<h2 class="project-inspector-title">The building directory</h2><p class="detail-empty">Choose a project name on the building to see its work, sessions and history.</p>'
  const agents = snapshot.agents.filter(agent=>agent.project===project.name)
  const live = project.live || {}
  const waiting = agents.filter(agent=>agent.status==='waiting')
  const commits = project.recentCommits || []
  return `<div class="project-inspector-banner" style="--project:${ink(project.color)}"><span>PROJECT OFFICE</span><h2 class="project-inspector-title">${esc(project.name)}</h2><p>${agents.length} live sessions · ${waiting.length} waiting for you</p></div>
    <div class="project-quick-stats"><div><strong>${minutesLabel(project.minutes)}</strong><span>AGENT TIME</span></div><div><strong>${count(project.commits)}</strong><span>COMMITS</span></div><div><strong>${count(project.toolCalls)}</strong><span>TOOL CALLS</span></div><div><strong>${count(project.sessions)}</strong><span>SESSIONS</span></div></div>
    ${waiting.length?`<div class="project-attention"><h3>NEEDS YOUR INPUT</h3>${waiting.map(agent=>`<button data-select="${esc(agent.id)}"><b>${esc(agent.name)}</b><span>${esc(agent.question || agent.task)}</span></button>`).join('')}</div>`:''}
    <div class="detail-field"><h3>THIS WEEK AT A GLANCE</h3><div class="project-week">${activityBars(project.daily || snapshot.daily,project.dailyDates || snapshot.dailyDates)}</div></div>
    <div class="detail-field"><h3>AT THEIR DESKS</h3><div class="project-session-list">${agents.length?agents.map(agent=>`<button data-select="${esc(agent.id)}">${face(agent)}<span><b>${esc(agent.name)}</b><small>${esc(agent.task)}</small></span><i style="background:${STATUS[agent.status]?.color||'#9ab86a'}" title="${esc(STATUS[agent.status]?.label||agent.status)}"></i></button>`).join(''):'<p class="detail-empty">No open sessions in this project.</p>'}</div></div>
    <div class="detail-field"><h3>WHAT THEY DID</h3>${workRows(project.work || [],5)}</div>
    <div class="detail-field"><h3>THE CREW</h3>${crewRows(project.crew || [])}</div>
    <div class="detail-field"><h3>THE CHANGES</h3><div class="change-counts"><span class="added">+${count(project.additions)}</span><span class="removed">−${count(project.deletions)}</span><span>${count(project.filesEdited)} files</span></div><p class="project-small-print">${count(project.prompts)} prompts · ${count(project.subagents)} helpers · ${count(project.workflows)} workflows</p>${live.interns?`<p class="project-small-print">${count(live.interns)} interns active right now.</p>`:''}</div>
    <div class="detail-field"><h3>RECENT COMMITS</h3>${commits.length?commits.slice(0,4).map(commit=>`<div class="commit-detail"><code>${esc(String(commit.sha||'').slice(0,7))}</code><p>${esc(commit.subject)}</p></div>`).join(''):'<p class="detail-empty">No recorded commits in this range.</p>'}</div>
    <button class="button button-outline inspector-action" id="focus-project">Find this office ↗</button>`
}

export function agentExtras(agent) {
  const details = []
  if (agent.activityKind || agent.tool) details.push(`<div class="detail-field"><h3>CURRENT WORK</h3><p>${esc(agent.activityKind || 'Working')}${agent.tool?` · ${esc(agent.tool)}`:''}</p>${agent.since?`<p class="project-small-print">${minutesLabel(agent.elapsedMinutes)} in this state</p>`:''}</div>`)
  if (agent.branch || agent.model || agent.account) details.push(`<div class="detail-field"><h3>SESSION DETAILS</h3>${agent.branch?`<p>Branch · ${esc(agent.branch)}</p>`:''}${agent.model?`<p>Model · ${esc(agent.model)}</p>`:''}${agent.account?`<p>Account · ${esc(agent.account)}</p>`:''}</div>`)
  if (agent.interns?.length) details.push(`<div class="detail-field"><h3>${agent.interns.length} HELPERS</h3>${agent.interns.slice(0,8).map(intern=>`<p>${esc(intern.description || intern.type || 'Helper at work')}</p>`).join('')}</div>`)
  if (agent.meetings?.length) details.push(`<div class="detail-field"><h3>MEETINGS & WORKFLOWS</h3>${agent.meetings.slice(0,5).map(meeting=>`<p>${esc(meeting.name || 'Workflow')} · ${count(meeting.done)}/${count(meeting.total)} done</p>`).join('')}</div>`)
  return details.join('')
}

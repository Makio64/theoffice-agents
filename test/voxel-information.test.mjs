import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crewRows, projectPanel, agentExtras, workRows } from '../site/voxel/information.js'

test('crew information distinguishes unavailable attribution from a measured zero', () => {
  const live = crewRows([{agent:'claude',minutes:null,sessions:null,live:1}])
  assert.match(live,/Not measured/)
  assert.match(live,/Sessions not attributed/)
  assert.doesNotMatch(live,/>0 sessions/)
  const historical = crewRows([{agent:'codex',minutes:null,sessions:5,live:0}])
  assert.match(historical,/Codex/)
  assert.match(historical,/5 sessions/)
  assert.match(historical,/Not measured/)
  const measured = crewRows([{agent:'gemini',minutes:0,sessions:0,live:1}])
  assert.match(measured,/>0m</)
  assert.match(measured,/0 sessions/)
})

test('rich project details keep local names, questions and commit subjects as text', () => {
  const hostile = '<img src=x onerror="boom">'
  const project = {name:hostile,minutes:60,commits:1,work:[],crew:[],recentCommits:[{sha:'abc1234',subject:hostile}],daily:[0,0,0,0,0,0,60]}
  const snapshot = {agents:[{id:hostile,project:hostile,name:hostile,status:'waiting',question:hostile,task:hostile}],daily:[]}
  const html = projectPanel(project,snapshot,()=>'<span>sprite</span>')
  assert.doesNotMatch(html,/<img/)
  assert.match(html,/&lt;img/)
  assert.match(html,/1 live sessions/)
  assert.match(html,/NEEDS YOUR INPUT/)
  assert.match(html,/RECENT COMMITS/)
  assert.match(html,/1h/)
})

test('agent state duration and work counts do not substitute for active session time', () => {
  const html = agentExtras({activityKind:'Reading code',since:'2026-11-04T10:00:00Z',elapsedMinutes:90,branch:'<script>',interns:[{description:'<img>'}]})
  assert.match(html,/1h 30m in this state/)
  assert.doesNotMatch(html,/<script>|<img>/)
  assert.match(html,/&lt;script&gt;/)
  assert.match(workRows([]),/No measured tool calls/)
  const work = workRows([{kind:'testing',label:'Tests',calls:8},{kind:'coding',label:'Writing code',calls:12}])
  assert.ok(work.indexOf('Writing code')<work.indexOf('Tests'))
  assert.match(work,/width:60%/)
})

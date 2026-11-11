// The MONTH scene (lib/svg-month.mjs): the wall calendar and the building directory, drawn through renderSvg's
// `month` view on the sample, a real-shaped month, the empty office and the stress office, at the pane's widths.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { fmtHours, fmtInt } from '../plugin/lib/format.mjs'
import { HEAD_WINDOWS, SPRITE_CLASHES } from '../plugin/lib/svg-kit.mjs'
import { sceneMonth } from '../plugin/lib/svg-month.mjs'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { SAMPLE, clone, emptyFacts, monthFacts, stressFacts } from './helpers/facts.mjs'

// ---------------------------------------------------------------- facts

/** monthFacts with every project active across the 30 days, as the collector reports a real month. */
function realMonth() {
  const f = monthFacts()
  f.projects.forEach((p, i) => {
    p.per_day = Object.fromEntries(f.range.days.map((d, j) => [d, { minutes: (j * (i + 3) * 37) % 400, sessions: 1, subagents: 2, commits: j % 3 }]))
  })
  return f
}

/** The stress office over a month: 40 hostile project names, every day of every project busy, huge counters. */
function stressMonth() {
  const f = stressFacts()
  const m = monthFacts()
  f.range = m.range
  const big = { sessions: 12345, subagents: 67890, workflows: 999, commits: 123456 }
  f.per_day = Object.fromEntries(m.range.days.map((d, i) => [d, { minutes: 100 + ((i * 997) % 5000), ...big }]))
  for (const p of f.projects) p.per_day = Object.fromEntries(m.range.days.map((d, i) => [d, { minutes: 1 + ((i * 7919) % 2000), commits: 9 }]))
  f.projects.forEach((p, i) => Object.assign(p, { agent_minutes: 999_999 - i, commits: 123_456 }))
  return f
}

const SETS = () => [
  ['sample (week)', clone(SAMPLE)], ['real month', realMonth()], ['empty', emptyFacts()], ['stress', stressFacts()], ['stress month', stressMonth()],
]

// ---------------------------------------------------------------- checks

// A small XML well-formedness check: balanced tags, quoted attributes, no stray < > or bare & in text.
function xmlProblem(svg) {
  const stack = []
  const re = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g
  const bareAmp = /&(?!(?:amp|lt|gt|quot|#39);)/
  let last = 0
  let m
  while ((m = re.exec(svg))) {
    const between = svg.slice(last, m.index)
    if (/[<>]/.test(between)) return `stray < or > before ${m.index}`
    if (bareAmp.test(between) || bareAmp.test(m[3])) return `bare & near ${m.index}`
    last = re.lastIndex
    if (m[1]) {
      if (stack.pop() !== m[2]) return `mismatched </${m[2]}> at ${m.index}`
    } else if (!m[4]) stack.push(m[2])
  }
  if (svg.slice(last)) return 'trailing text'
  return stack.length ? `unclosed <${stack.at(-1)}>` : ''
}

const ids = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
const month = (f, opts = {}) => renderSvg(f, { view: 'month', ...opts })
// The day squares carry their tooltips: `<path fill="…" d="Mx yh…"><title>Mon 5 Oct · …</title>`.
const squares = (svg) => [...svg.matchAll(/<path fill="#[0-9a-f]{6}" d="M([\d.]+) ([\d.]+)h[^"]*"><title>([^<]*)<\/title>/g)]
  .map((m) => ({ x: Number(m[1]), y: Number(m[2]), tip: m[3] }))

// ---------------------------------------------------------------- tests

describe('month scene', () => {
  test('renders every facts set at 480 / 640 / 960: well-formed, safe, alone in its view', () => {
    assert.deepEqual(SPRITE_CLASHES, [])
    for (const [label, f] of SETS()) {
      for (const width of [480, 640, 960]) {
        for (const animate of [true, false]) {
          const at = `${label} @${width}${animate ? '' : ' static'}`
          const svg = month(f, { width, animate })
          assert.ok(svg.startsWith('<svg ') && svg.endsWith('</svg>'), at)
          assert.equal(xmlProblem(svg), '', at)
          assert.doesNotMatch(svg, /<script|<foreignObject|<image|<iframe|\son[a-z]+\s*=|javascript:/i, at)
          assert.doesNotMatch(svg, /(?:href|src)="(?!#)|url\((?!#)/, `${at}: external reference`)
          assert.equal(new Set(ids(svg)).size, ids(svg).length, `${at}: duplicate ids`)
          for (const ref of svg.matchAll(/(?:href="#|url\(#)([^")]+)/g)) assert.ok(ids(svg).includes(ref[1]), `${at}: dangling #${ref[1]}`)
          assert.match(svg, /aria-label="The Office, the (?:month|week) on the wall calendar[^"]*"/, at)
          assert.match(svg, />WALL CALENDAR</, at)
          assert.match(svg, />BUILDING DIRECTORY</, at)
          if (!animate) assert.doesNotMatch(svg, /<animate|<set\b|<animateMotion/, at)
          else if (label !== 'empty') assert.match(svg, /<animate/, at)
        }
      }
    }
  })

  test('the calendar: Monday-first squares, today framed, the busiest day crowned, the numbers from per_day', () => {
    const f = realMonth()
    const svg = month(f)
    const sq = squares(svg)
    assert.equal(sq.length, 30, 'one square per day of the range')
    const at = (name) => sq.find((s) => s.tip.startsWith(name))
    // 27 Sep 2026 is a Sunday: last column of the first row; Monday 28 starts the next row in the first column
    assert.ok(at('Sun 27 Sep').x > at('Mon 28 Sep').x && at('Sun 27 Sep').y < at('Mon 28 Sep').y)
    assert.equal(at('Mon 28 Sep').x, at('Mon 5 Oct').x)
    assert.match(at('Mon 26 Oct').tip, /\(today\)/)
    // the busiest day: crowned in its tooltip and named under the calendar with its agent-time
    const best = f.range.days.reduce((a, d) => (f.per_day[d].minutes > f.per_day[a].minutes ? d : a))
    const bestTip = sq.find((s) => s.tip.includes('busiest day'))
    assert.match(bestTip.tip, new RegExp(`${fmtHours(f.per_day[best].minutes)} agent-time`))
    assert.match(svg, new RegExp(`busiest day [A-Z][a-z]{2} \\d+ [A-Z][a-z]{2} · ${fmtHours(f.per_day[best].minutes)} agent-time`))
    // every lit square shows its own agent-time, every empty one shows none
    for (const d of f.range.days) {
      const m = f.per_day[d].minutes
      if (m) assert.match(svg, new RegExp(`>${fmtHours(m)}</tspan>`), d)
    }
    const empty = f.range.days.filter((d) => !f.per_day[d].minutes).length
    assert.equal(sq.filter((s) => s.tip.includes('no agent-time')).length, empty)
    assert.match(svg, new RegExp(`worked ${30 - empty} of 30 days`))
  })

  test('the page: its month\'s picture, gold stars on the top days, the months around faded; the portrait grows with the wall', () => {
    const f = realMonth()
    const svg = month(f, { animate: false })
    // a range that ends in October: an autumn picture, the mascot in a pile of leaves beside jack-o'-lanterns; one that
    // ends in any other month: a scene of its own, its mascot at its own pastime and none of the others'
    for (const s of ['mo-bigmaple', 'mo-mound', 'mo-jack', 'mo-leaves-claude']) assert.ok(svg.includes(`href="#to-${s}"`), s)
    const ending = (day, opts = { animate: false }) => {
      const g = realMonth()
      const end = Date.parse(`${day}T00:00:00Z`)
      g.range.days = g.range.days.map((_, i) => new Date(end - (29 - i) * 864e5).toISOString().slice(0, 10))
      g.per_day = Object.fromEntries(g.range.days.map((d, i) => [d, { minutes: (i * 37) % 300 }]))
      return month(g, opts)
    }
    const scenes = [
      ['2026-01-20', 'skate', ['mo-bigpine', 'mo-pond']], ['2026-02-20', 'snowman', ['mo-bigpine', 'mo-snowclawd']],
      ['2026-03-20', 'kite', ['mo-bigbud', 'mo-kite', 'mo-daffs']], ['2026-04-15', 'rain', ['mo-bigbloom', 'mo-brolly', 'mo-rainbow', 'mo-drops']],
      ['2026-05-20', 'garden', ['mo-bigleafy', 'mo-tulipbed', 'mo-can', 'mo-fly']], ['2026-06-20', 'fishing', ['mo-lake', 'mo-fish']],
      ['2026-07-10', 'beach', ['mo-castle', 'mo-shade', 'mo-crab']], ['2026-08-20', 'sunflowers', ['mo-sunflower', 'mo-bee']],
      ['2026-09-20', 'apples', ['mo-bigturning', 'mo-appletree', 'mo-basket']], ['2026-10-26', 'leaves', ['mo-mound', 'mo-jack']],
      ['2026-11-20', 'campfire', ['mo-bigbare', 'mo-fir', 'mo-logs', 'mo-flame', 'mo-geese']], ['2026-12-20', 'xmas', ['mo-bigpine', 'mo-star']],
    ]
    const pastimes = new RegExp(`href="#to-mo-(${scenes.map((c) => c[1]).join('|')})-[a-z]+"`, 'g')
    for (const [day, pastime, sprites] of scenes) {
      const other = ending(day)
      for (const s of sprites) assert.ok(other.includes(`href="#to-${s}"`), `${day}: ${s}`)
      assert.deepEqual([...new Set([...other.matchAll(pastimes)].map((m) => m[1]))], [pastime], day)
      // alive when animated: something in the picture moves
      const live = ending(day, {})
      const pic = live.slice(live.indexOf('<clipPath id="to-mo-pic">'), live.indexOf('<text', live.indexOf('<clipPath id="to-mo-pic">')))
      assert.match(pic, /<animateTransform/, `${day}: moving`)
    }
    // the rooms' windows look out on the picture's season (its sky by day, its night after dark), never the kit's plain
    // glass: alike in October, December, April and July, alternating two ways, two at each header's right end
    // (svg-kit HEAD_WINDOWS), the calendar's and the directory's
    const wins = (s) => [...s.matchAll(/href="#to-(mo-win[dn]-[a-z]+[01]|w[dn])"/g)].map((m) => m[1])
    for (const [day, season] of [['2026-10-26', 'autumn'], ['2026-12-20', 'winter'], ['2026-04-15', 'spring'], ['2026-07-10', 'summer']]) {
      for (const night of [false, true]) {
        const g = realMonth()
        g.now.is_night = night
        const end = Date.parse(`${day}T00:00:00Z`)
        g.range.days = g.range.days.map((_, i) => new Date(end - (29 - i) * 864e5).toISOString().slice(0, 10))
        const w = wins(month(g, { animate: false }))
        assert.equal(w.length, 2 * HEAD_WINDOWS, `${day}: ${w.length} windows`)
        assert.deepEqual(new Set(w), new Set([0, 1].map((k) => `mo-win${night ? 'n' : 'd'}-${season}${k}`)), `${day} ${night ? 'night' : 'day'}`)
      }
    }
    // every day on the top step of the scale but the busiest wears a gold star, and its tooltip says so
    const max = Math.max(...f.range.days.map((d) => f.per_day[d].minutes))
    const top = f.range.days.filter((d) => Math.ceil(Math.sqrt(f.per_day[d].minutes / max) * 4) === 4)
    assert.equal(squares(svg).filter((s) => s.tip.endsWith('a gold-star day')).length, top.length - 1)
    // Sun 27 Sep starts the range: the squares before it show 21–26 Sep, those after Mon 26 Oct show 27 Oct–1 Nov, faded
    const faded = /<g color="#ab9e84">(.*?)<\/g>/.exec(svg)?.[1] ?? ''
    assert.equal(faded.match(/<use /g)?.length, 6 * 2 + 5 * 2 + 1)
    // the employee of the month: ×1.5 from the pane's narrow widths (the wall column is the crew's width), larger as the
    // wall beside the calendar widens, ×1 when the wall is short (the narrowest drawing)
    const scaleOf = (s) => Number(/<title>employee of the [^<]*<\/title><g transform="translate\([^)]*\)(?: scale\(([\d.]+)\))?"/.exec(s)?.[1] ?? 1)
    assert.deepEqual([320, 480, 960, 1600, 2400].map((width) => scaleOf(month(f, { width }))), [1, 1.5, 1.5, 2, 2.5])
  })

  test('a page in the past (the Month tab\'s previous page) edges no today, keys no today, and says its own last day', () => {
    // `month --back 1`: the 30 days before the last 30, while now stays now
    const pastOf = (minutes) => {
      const f = realMonth()
      const end = Date.parse('2026-09-26T00:00:00Z')
      f.range = { ...f.range, days: f.range.days.map((_, i) => new Date(end - (29 - i) * 864e5).toISOString().slice(0, 10)), label: 'Fri 28 Aug → Sat 26 Sep' }
      f.per_day = Object.fromEntries(f.range.days.map((d, i) => [d, { minutes: minutes(i), commits: 1 }]))
      for (const p of f.projects) p.per_day = Object.fromEntries(f.range.days.map((d, i) => [d, { minutes: minutes(i) }]))
      return f
    }
    const svg = month(pastOf((i) => (i * 37) % 300), { width: 1600 })
    assert.match(svg, /AUGUST – SEPTEMBER 2026/)
    assert.ok(squares(svg).length > 0 && !squares(svg).some((s) => s.tip.includes('(today)')), 'no square is today')
    assert.ok(svg.includes('>top day<') && !/>today( ·)?</.test(svg), 'the key keeps its star and leaves today out')
    assert.ok(svg.includes('30 days → 26 Sep') && !svg.includes('days → today'), 'the directory runs to its last day')
    assert.match(svg, />\d+ commits that month</)
    const bare = pastOf(() => 0)
    for (const pd of Object.values(bare.per_day)) pd.commits = 0
    assert.match(month(bare, { width: 1600 }), /no agent-time that month</)
    // this month keeps today: in its key, at the end of the directory's days, under the street
    const now = month(realMonth(), { width: 1600 })
    assert.ok(now.includes('>today ·<') && now.includes('days → today') && /> ?\d+ commits this month</.test(now))
  })

  test('a page with no agent-time on record tints the days its sessions or commits say were worked, and counts them', () => {
    // January 2026: Claude Code's cleanup took its transcripts, its old index and git still say when work was done
    const january = (minutes) => {
      const f = realMonth()
      const days = Array.from({ length: 31 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
      f.range = { ...f.range, back: 9, days, label: 'January 2026' }
      f.per_day = Object.fromEntries(days.map((d, i) => [d, { minutes: minutes(i), sessions: i % 3 === 0 ? 2 : 0, commits: i % 5 === 0 ? 1 : 0 }]))
      for (const p of f.projects) Object.assign(p, { per_day: {}, agent_minutes: 0 })
      return f
    }
    const fillOf = (svg) => {
      const fills = new Map([...svg.matchAll(/<path fill="(#[0-9a-f]{6})" d="M[^"]*"><title>(\w{3} \d+ \w{3})[^<]*<\/title>/g)].map((m) => [m[2], m[1]]))
      return (day) => fills.get(day)
    }
    const svg = month(january(() => 0), { width: 1600 })
    const worked = Array.from({ length: 31 }, (_, i) => i).filter((i) => i % 3 === 0 || i % 5 === 0).length
    assert.ok(svg.includes(`>${worked} of 31 days worked<`) && svg.includes(`worked ${worked} of 31 days`))
    assert.match(svg, />no agent-time that month</)
    assert.match(svg, />sessions or commits, no agent-time</, 'the key says what the tint is')
    const fill = fillOf(svg)
    const tint = fill('Thu 1 Jan')
    assert.deepEqual([fill('Sun 4 Jan'), fill('Sat 10 Jan'), fill('Sun 11 Jan')], [tint, tint, tint], 'a session or a commit, weekday or weekend: one tint')
    assert.notEqual(fill('Fri 2 Jan'), tint, 'a day with neither stays paper')
    assert.ok(!/per day (worked|with agent-time)/.test(svg), 'no agent-time to share out')
    // the key says it at the narrowest pane too
    assert.match(month(january(() => 0), { width: 320 }), />sessions or commits, no agent-time</)
    // a page of the past with a few days of agent-time (another agent's, kept) tints its other days of work all the same
    const mixed = month(january((i) => (i === 3 ? 120 : 0)), { width: 1600 })
    const mf = fillOf(mixed)
    assert.ok(mixed.includes(`>${worked} of 31 days worked<`), 'its day of agent-time and its tinted days')
    assert.deepEqual([mf('Thu 1 Jan'), mf('Wed 7 Jan')], [tint, tint])
    assert.ok(![tint, undefined].includes(mf('Sun 4 Jan')), 'its day of agent-time keeps its green')
    assert.ok(/busiest day Sun 4 Jan/.test(mixed) && mixed.includes(`${fmtHours(120)} per day with agent-time`))
    assert.match(mixed, />sessions or commits, no agent-time</)
    // the month of now keeps its days of commits alone on paper, as it always was, and keys no tint
    const now = realMonth()
    now.per_day['2026-10-05'] = { minutes: 0, sessions: 0, commits: 3 }
    const nowSvg = month(now, { width: 1600 })
    assert.notEqual(fillOf(nowSvg)('Mon 5 Oct'), tint)
    assert.ok(!/>(sessions or commits, )?no agent-time<\/text>/.test(nowSvg), 'no tint, no key of one')
  })

  test('the header and the directory carry the facts: totals, top projects, agent-time and commits', () => {
    const f = realMonth()
    const svg = month(f, { width: 960 })
    const t = f.totals
    assert.match(svg, new RegExp(`${fmtHours(t.agent_minutes)} agent-time`))
    for (const [n, w] of [[t.sessions, 'session'], [t.subagents, 'intern'], [t.workflows, 'meeting'], [t.commits, 'commit']]) {
      assert.match(svg, new RegExp(`>${n} ${w}s?<`), w)
    }
    const listed = f.projects.slice(0, 10)
    for (const p of listed) {
      assert.match(svg, new RegExp(`>${p.name}</tspan>`), p.name)
      assert.match(svg, new RegExp(`>${fmtHours(p.agent_minutes)}</tspan>`), `${p.name} hours`)
      assert.match(svg, new RegExp(`>${fmtInt(p.commits)}</tspan>`), `${p.name} commits`)
    }
    const more = f.projects.length - listed.length + (f.projects_more || 0)
    if (more) assert.match(svg, new RegExp(`\\+${more} more tenants?`))
    // the employee of the month is the busiest project
    assert.match(svg, new RegExp(`employee of the month: ${f.projects[0].name} · ${fmtHours(f.projects[0].agent_minutes)} agent-time`))
  })

  test('the crew: a line per AI on the calendar\'s wall, busiest first, its agent-time and share, its agents in its tooltip', () => {
    const f = realMonth()
    f.totals.agents = { claude: 600, codex: 1200, gemini: 30 }
    // an AI's sessions are its accounts' together
    f.accounts = [['claude', null, 7], ['codex', 'main', 3], ['codex', 'work', 2], ['gemini', null, 1]]
      .map(([agent, label, sessions]) => ({ agent, label, minutes: 1, sessions, live: 0 }))
    const svg = month(f, { width: 960, animate: false })
    const tips = [...svg.matchAll(/<title>(\w+) \(\w+\): ([^<]*)<\/title>/g)].map((m) => [m[1], m[2]])
    assert.deepEqual(tips, [
      ['Codex', '5 agents (sessions) · 20h agent-time · 66% of the month&#39;s agent-time'],
      ['Claude', '7 agents (sessions) · 10h agent-time · 33% of the month&#39;s agent-time'],
      ['Gemini', '1 agent (sessions) · 30m agent-time · 2% of the month&#39;s agent-time'],
    ])
    for (const s of ['>THE CREW<', '>3 AIs<', '>20h<', '>10h<', '>30m<', '>66%<', '>33%<', '>2%<']) assert.ok(svg.includes(s), s)
    assert.match(svg, /aria-label="[^"]*; the crew: Codex 5 agents 20h, Claude 7 agents 10h, Gemini 1 agent 30m"/)
    // no room of its own: it hangs on the calendar's wall, under the employee of the month, right of the page; left of
    // the directory beside it (960), above the directory under it (640)
    assert.doesNotMatch(svg, /one badge per AI/)
    const at = (s, name) => new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${name}<`).exec(s).slice(1, 3).map(Number)
    assert.ok(at(svg, 'THE CREW')[0] < at(svg, 'BUILDING DIRECTORY')[0], 'left of the directory')
    assert.ok(svg.indexOf('<title>employee of the month') < svg.indexOf('>THE CREW<'), 'under the portrait')
    const narrow = month(f, { width: 640, animate: false })
    assert.ok(at(narrow, 'THE CREW')[1] < at(narrow, 'BUILDING DIRECTORY')[1], 'above the directory')
    assert.ok(at(narrow, 'THE CREW')[0] > at(narrow, 'WALL CALENDAR')[0] + 150, 'right of the page')
    // facts that say nothing of agents nor accounts: one line, Clawd's, with all the sessions and agent-time
    const sample = month(clone(SAMPLE), { animate: false })
    assert.match(sample, new RegExp(`<title>Claude \\(Clawd\\): ${SAMPLE.totals.sessions} agents \\(sessions\\) · ${fmtHours(SAMPLE.totals.agent_minutes)} agent-time · 100%`))
    assert.equal([...sample.matchAll(/ agents \(sessions\)/g)].length, 1)
    const empty = month(emptyFacts())
    assert.match(empty, />THE CREW<[\s\S]*>nobody yet</)
    assert.doesNotMatch(empty, /agents \(sessions\)/)
  })

  test('a box held upright (tall) keeps the directory under the calendar at any width; a narrow drawing is what it was', () => {
    const f = realMonth()
    const at = (s, name) => new RegExp(`<text x="([\\d.]+)" y="([\\d.]+)"[^>]*>${name}<`).exec(s).slice(1, 3).map(Number)
    const high = (s) => Number(/viewBox="0 0 \d+ (\d+)"/.exec(s)[1])
    for (const width of [960, 1200, 1600]) {
      const wide = month(f, { width, animate: false })
      const stood = month(f, { width, animate: false, tall: true })
      assert.equal(at(wide, 'BUILDING DIRECTORY')[1], at(wide, 'WALL CALENDAR')[1], `${width}: side by side as it is drawn wide`)
      assert.ok(at(wide, 'BUILDING DIRECTORY')[0] > at(wide, 'WALL CALENDAR')[0] + 150)
      assert.ok(at(stood, 'BUILDING DIRECTORY')[1] > at(stood, 'WALL CALENDAR')[1] + 150, `${width}: the directory under the calendar`)
      assert.equal(at(stood, 'BUILDING DIRECTORY')[0], at(stood, 'WALL CALENDAR')[0])
      assert.ok(high(stood) > high(wide) + 100, `${width}: ${high(stood)} rows stood, ${high(wide)} wide`)
      assert.equal(xmlProblem(stood), '')
      assert.equal(new Set(ids(stood)).size, ids(stood).length)
      assert.ok(stood.length <= 78_000, `${width}: ${stood.length} chars`)
      // the same rooms, the same words: only where they hang
      for (const s of ['>THE CREW<', '>EMPLOYEE OF<', 'data-view="month"']) assert.equal(stood.includes(s), wide.includes(s), s)
    }
    for (const width of [320, 640, 880]) assert.equal(month(f, { width, animate: false, tall: true }), month(f, { width, animate: false }), `${width}: one over the other already`)
  })

  test('a week range draws its 7 days; empty facts draw an empty page without a crown', () => {
    const week = month(clone(SAMPLE))
    assert.equal(squares(week).length, 7)
    assert.ok(squares(week)[0].tip.startsWith('Tue 20 Oct'))
    assert.match(week, /the week:/)
    const empty = month(emptyFacts())
    assert.equal(squares(empty).filter((s) => s.tip.includes('no agent-time')).length, 7)
    assert.doesNotMatch(empty, /busiest day|employee of the/)
    assert.match(empty, /no tenants yet/)
  })

  test('hostile strings are escaped everywhere they are drawn', () => {
    const f = realMonth()
    const evil = '<script>alert(1)</script>"><g onload="x">&amp'
    f.projects[0].name = evil
    f.projects[0].titles = [evil]
    f.range.label = evil
    const svg = month(f, { width: 960 })
    assert.equal(xmlProblem(svg), '')
    assert.doesNotMatch(svg, /<script|\sonload="/)
    assert.match(svg, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&quot;&gt;&lt;g onload=&quot;x&quot;&gt;&amp;amp/)
  })

  test('animate:false emits no SMIL; the drawing is deterministic', () => {
    for (const [label, f] of SETS()) {
      const svg = month(f, { animate: false })
      assert.doesNotMatch(svg, /<animate|<set\b/, label)
      assert.equal(svg, month(f, { animate: false }), label)
    }
  })

  test('size: the stress office stays under 72 000 chars at every width, a full stress month at the pane widths', () => {
    // the scene (the calendar's picture, its stickers and the portrait take about 14 000 of it; the rooftop sign, its
    // neon's glow and the day's skyline about 10 000 more than the one-row board they replaced; the crew's list beside
    // the calendar about 1 000, a line and a mini figure per AI; the Office's street front under the rooms about 9 000,
    // its windows, its entrance, its trees and the agents going around), and the commits line under its street (svg-street.mjs:
    // under 7 000 at pane widths, 9 000 at 2400); a full month's 31 squares add the rest, and a crew of all six
    // characters a few hundred more per AI
    for (const width of [240, 480, 640, 960, 2400]) {
      const n = month(stressFacts(), { width }).length
      assert.ok(n <= 72_000, `stress @${width}: ${n}`)
    }
    const six = stressMonth()
    six.totals.agents = { claude: 9e5, codex: 5e5, gemini: 2e5, cursor: 9e4, kimi: 5e3, grok: 30 }
    six.accounts = Object.keys(six.totals.agents).map((agent, i) => ({ agent, label: null, minutes: 1, sessions: 99_999 - i, live: 0 }))
    for (const width of [480, 640, 960]) {
      const n = month(stressMonth(), { width }).length
      assert.ok(n <= 78_000, `stress month @${width}: ${n}`)
      const m = month(six, { width }).length
      assert.ok(m <= 82_000, `six AIs @${width}: ${m}`)
    }
  })

  test('a month past 1000 agent-hours keeps its unit: 2239h agent-time, never a bare 2.2k beside the counts', () => {
    const f = realMonth()
    f.totals.agent_minutes = 134_381
    const svg = month(f, { width: 960, animate: false })
    assert.ok(svg.includes('>2239h agent-time<'), 'header')
    assert.match(svg, /aria-label="The Office, the month on the wall calendar: 2239h agent-time, /)
    assert.doesNotMatch(svg, />2\.2k agent-time/)
  })

  test('never throws on odd facts and always paints a positive integer height', () => {
    const ninety = Array.from({ length: 90 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))
    const odd = [
      null, {}, { range: { days: 'nope' }, per_day: [] },
      { range: { days: ['2026-02-30', 'x', 7, null] }, per_day: { '2026-02-28': { minutes: 'lots' } } },
      { range: { days: ['2026-10-26'] }, per_day: { '2026-10-26': { minutes: -5 } }, projects: [{ name: null, per_day: 'x', agent_minutes: NaN }, {}] },
      { range: { kind: 'month', days: ninety } },
      { ...emptyFacts(), totals: null, per_day: null, projects: Array.from({ length: 40 }, (_, i) => ({ name: `p${i}`, agent_minutes: 40 - i })) },
    ]
    for (const f of odd) {
      for (const width of [240, 640, 2400]) {
        const svg = month(f, { width })
        assert.equal(xmlProblem(svg), '', JSON.stringify(f)?.slice(0, 60))
        const [, h] = /viewBox="0 0 \d+ (\d+)"/.exec(svg)
        assert.ok(Number(h) > 0)
      }
    }
    // the 90-day range keeps its last 62 days (two months of 31: the most the Month of now holds)
    assert.equal(squares(month(odd[5])).length, 62)
    // called directly (as svg.mjs does), the slice height is an integer
    const ctx = { f: { projects: [], contractors: [], live: { desks: [], recently_left: [] } }, W: 320, px: 640, animate: false, id: 'to-',
      now: 0, night: false, color: () => '#55c5b1', desks: [], view: 'month', caps: { level: 0 }, defs: new Map(), brick: false }
    const r = sceneMonth(ctx, 0)
    assert.ok(Number.isInteger(r.h) && r.h > 0 && r.svg.length > 0)
  })
})

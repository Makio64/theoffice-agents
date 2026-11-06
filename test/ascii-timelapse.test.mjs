// lib/ascii-timelapse.mjs: the text timelapse (the backup of the pixel replay in a terminal and the CLI). Pins its
// invariants over every range, width and frame (widths, 7-bit, no control chars, deterministic, one line count per
// replay), the pace (frames a loop, the playhead walking and wrapping), that its cells say what the facts say
// (a project's peak, the busiest slot, who was at work), that a project keeps the color the week view gives it, and that
// no timeline, an empty one or a broken one still draws.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { TEXT_FRAME_MS, renderTimelapseText, timelapseFrameSlot, timelapseFrames } from '../plugin/lib/ascii-timelapse.mjs'
import { ROLE_ANSI, renderOffice, toPlain } from '../plugin/lib/ascii.mjs'
import { displayWidth } from '../plugin/lib/format.mjs'
import { cropTimeline, lapseSlot, readFacts } from '../plugin/lib/model.mjs'
import { SAMPLE, clone, timelapseFacts } from './helpers/facts.mjs'

const KINDS = ['yesterday', 'week', 'month']
const WIDTHS = [20, 40, 60, 80, 100, 140]
/** The fixture with its desks spread over 25 long-named projects: more than fit, so the quiet ones fold into `+N more`. */
function crowdedFacts(kind) {
  const f = timelapseFacts(kind)
  f.timeline.desks.forEach((d, i) => { d.project = `project-${String.fromCharCode(97 + (i % 25))}-with-a-long-name` })
  return f
}

const VARIANTS = {
  mixed: (kind) => timelapseFacts(kind), claudeOnly: (kind) => timelapseFacts(kind, { claudeOnly: true }),
  heavy: (kind) => timelapseFacts(kind, { heavy: true }), crowded: crowdedFacts,
}
const LEVEL = [' ', '░', '▒', '▓', '█']
const rows = (facts, opts) => toPlain(renderTimelapseText(facts, opts)).split('\n')

/** Desks at work per slot, from the facts themselves (one project, or all of them). */
function atWork(t, project = null) {
  const at = new Array(t.slots).fill(0)
  for (const d of t.desks) if (project == null || d.project === project) for (const [a, b] of d.runs) for (let i = a; i < b; i++) at[i]++
  return at
}

const firstMax = (at) => at.reduce((b, v, i) => (v > at[b] ? i : b), 0)
/** The timeline as the replay plays it: cut to where something happened (model.mjs cropTimeline). */
const cut = (facts) => cropTimeline(facts.timeline)

/**
 * Slots per column, read off the ruler (`2h a column`); how many slots of the replay's first column lie before it (a
 * cut range starting off the clock's grid: `off`, so slot i is in column floor((i + off) / k)); and where the strips
 * start: the playhead's column at frame 0, less the first slot's column (a cut range's first mark may sit columns in).
 */
function grid(facts, width, t) {
  const head = rows(facts, { width })[1]
  const m = head.match(/^(\d+)([mhd]) a column/)
  assert.ok(m, `ruler head: ${head}`)
  const k = (Number(m[1]) * { m: 1, h: 60, d: 1440 }[m[2]]) / t.slot_min
  const off = (t.start ?? 0) % k
  return { k, off, x0: markCol(rows(facts, { width, frame: 0 })) - Math.floor(off / k) }
}

/** Index of the playhead mark on the row under the strips. */
const markCol = (lines) => {
  const row = lines.findIndex((l) => /^ *[▲^]$/.test(l))
  assert.ok(row > 0, 'a playhead mark row')
  return lines[row].length - 1
}

// ---------------------------------------------------------------- sweep

describe('text timelapse sweep', () => {
  for (const [variant, make] of Object.entries(VARIANTS)) {
    test(`${variant}: every range × width × still and frames × ascii keeps the invariants`, () => {
      for (const kind of KINDS) {
        const facts = make(kind)
        const last = timelapseFrames(facts) - 1
        for (const width of WIDTHS) {
          for (const ascii of [false, true]) {
            for (const frame of [null, 0, 7, last]) {
              const where = `${variant} ${kind} @${width}${ascii ? ' ascii' : ''} f${frame}`
              const lines = renderTimelapseText(facts, { width, ascii, frame })
              assert.ok(lines.length >= 6, `${where}: draws strips`)
              const txt = toPlain(lines)
              assert.ok(txt.startsWith('THE OFFICE'), `${where}: line 1 starts with THE OFFICE`)
              assert.ok(!txt.includes('\x1b'), `${where}: no ANSI`)
              txt.split('\n').forEach((l, i) => {
                assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(l), `${where}: control char on line ${i + 1}`)
                assert.ok(displayWidth(l) <= width, `${where}: line ${i + 1} is ${displayWidth(l)} wide: ${l}`)
                assert.ok(!/ $/.test(l), `${where}: line ${i + 1} has trailing spaces`)
                for (const ch of l) {
                  if (ascii) assert.ok(/[\x20-\x7e]/.test(ch), `${where}: non 7-bit ${JSON.stringify(ch)} on line ${i + 1}`)
                  else assert.equal(displayWidth(ch), 1, `${where}: ${JSON.stringify(ch)} is not one column (line ${i + 1})`)
                }
              })
              for (const l of lines) for (const [, r] of l) assert.ok(r === null || r in ROLE_ANSI, `${where}: unknown role ${r}`)
              assert.deepEqual(renderTimelapseText(clone(facts), { width, ascii, frame }), lines, `${where}: deterministic`)
              assert.ok(lines.length <= (width < 60 ? 16 : 24), `${where}: ${lines.length} lines`)
              // the strips start on one column and the counts end on one: every strip row is as wide as the others
              if (width >= 40) {
                const strips = txt.split('\n').slice(2, frame == null ? -1 : -2).map(displayWidth)
                assert.ok(strips.every((w) => w === strips[0]), `${where}: strip rows of widths ${strips}`)
              }
            }
          }
        }
      }
    })
  }

  test('every frame of one replay has the same line count, and the narrow form lists at most 8 projects', () => {
    for (const kind of KINDS) {
      const facts = timelapseFacts(kind)
      for (const width of [20, 60, 100]) {
        const n = renderTimelapseText(facts, { width, frame: 0 }).length
        for (let frame = 1; frame < timelapseFrames(facts); frame++) {
          assert.equal(renderTimelapseText(facts, { width, frame }).length, n, `${kind} @${width} f${frame}`)
        }
      }
      const narrow = rows(facts, { width: 40 })
      const strips = narrow.slice(2).filter((l) => !/^(all|int|mtg|ship|busiest|\+)/.test(l) && !/^\d/.test(l))
      assert.ok(strips.length <= 8, `${kind} @40: ${strips.length} project rows`)
    }
  })

  test('widths outside 20..140 clamp, and options left out draw the still at 100', () => {
    const facts = timelapseFacts('week')
    for (const l of rows(facts, { width: 5 })) assert.ok(displayWidth(l) <= 20)
    for (const l of rows(facts, { width: 400 })) assert.ok(displayWidth(l) <= 140)
    assert.deepEqual(renderTimelapseText(facts), renderTimelapseText(facts, { width: 100, frame: null, ascii: false }))
  })
})

// ---------------------------------------------------------------- pace

describe('text timelapse pace', () => {
  test('one loop: ceil(slots / 48) slots a frame up to the last slot of the cut range, held 4 frames, under a minute at the frame clock', () => {
    assert.equal(TEXT_FRAME_MS, 700)
    // yesterday's 96 quarters cut to the 69 from 06:45, the week's 163 hours to 160 from 03:00; the month worked from
    // its first slot to its last, uncut
    const want = { yesterday: 39, week: 45, month: 50 }
    const cutTo = { yesterday: 69, week: 160, month: 179 }
    for (const kind of KINDS) {
      const facts = timelapseFacts(kind)
      const S = cut(facts).slots
      assert.equal(S, cutTo[kind], kind)
      const step = Math.ceil(S / 48)
      const N = timelapseFrames(facts)
      assert.equal(N, want[kind], kind)
      const secs = (N * TEXT_FRAME_MS) / 1000
      assert.ok(secs >= 20 && secs <= 50, `${kind}: a loop is ${secs} s`)
      assert.equal(timelapseFrameSlot(facts, 0), 0)
      assert.equal(timelapseFrameSlot(facts, 1), step)
      for (let f = N - 5; f < N; f++) assert.equal(timelapseFrameSlot(facts, f), S - 1, `${kind} f${f} holds the last slot`)
    }
  })

  test('the playhead walks right frame by frame, wraps after timelapseFrames frames, and lights its column on every strip', () => {
    for (const kind of KINDS) {
      const facts = timelapseFacts(kind)
      const t = cut(facts)
      const N = timelapseFrames(facts)
      for (const width of [20, 60, 100, 140]) {
        let prev = -1
        for (let frame = 0; frame < N; frame++) {
          const lines = renderTimelapseText(facts, { width, frame })
          const plain = toPlain(lines).split('\n')
          const col = markCol(plain)
          assert.ok(col >= prev, `${kind} @${width} f${frame}: the playhead went back (${prev} → ${col})`)
          prev = col
          // every strip row has its playhead cell in the accent role
          for (const l of lines.slice(2, lines.length - 2)) {
            let x = 0
            const span = l.find(([s]) => (x += displayWidth(s)) > col)
            assert.equal(span?.[1], 'accent', `${kind} @${width} f${frame}: ${toPlain([l])}`)
          }
        }
        if (width >= 60) {
          const { k, off, x0 } = grid(facts, width, t)
          assert.equal(prev, x0 + Math.floor((t.slots - 1 + off) / k), `${kind} @${width}: the last frame is on the last slot`)
        }
        assert.deepEqual(renderTimelapseText(facts, { width, frame: N }), renderTimelapseText(facts, { width, frame: 0 }), `${kind} @${width}: wraps`)
        assert.deepEqual(renderTimelapseText(facts, { width, frame: 2 * N + 7 }), renderTimelapseText(facts, { width, frame: 7 }))
      }
    }
  })
})

// ---------------------------------------------------------------- what the cells say

describe('text timelapse content', () => {
  test('the title names the range, and while it plays the replayed time at its right end', () => {
    const facts = timelapseFacts('week')
    assert.equal(rows(facts, { width: 100 })[0], 'THE OFFICE · timelapse · this week · Tue 20 Oct → Mon 26 Oct')
    assert.equal(rows(timelapseFacts('yesterday'), { width: 100 })[0], 'THE OFFICE · timelapse · yesterday · Sun 25 Oct')
    const slot = timelapseFrameSlot(facts, 20)
    const head = rows(facts, { width: 100, frame: 20 })[0]
    assert.ok(head.startsWith('THE OFFICE · timelapse · this week'), head)
    assert.ok(head.endsWith(`▶ ${lapseSlot(cut(facts), slot).label}`), head)
    assert.equal(displayWidth(head), 100)
    assert.ok(rows(facts, { width: 100, frame: 20, ascii: true })[0].endsWith(`> ${lapseSlot(cut(facts), slot).label}`))
  })

  test('the ruler marks days over a week or a month and hours over yesterday', () => {
    const week = rows(timelapseFacts('week'), { width: 100 })[1]
    assert.match(week, /Tu20 +We21 +Th22 +Fr23 +Sa24 +Su25 +Mo26$/)
    // yesterday from 06:45, its first desk in at 08:00: no hour before 07
    assert.match(rows(timelapseFacts('yesterday'), { width: 100 })[1], /^15m a column +07 .* 12 .* 18 .* 23$/)
    assert.doesNotMatch(rows(timelapseFacts('yesterday'), { width: 100 })[1], / 0[0-6] /)
    assert.match(rows(timelapseFacts('month'), { width: 100 })[1], /Su27 .*Sa24$/)
    // today's mark in the accent, the others dim
    const spans = renderTimelapseText(timelapseFacts('week'), { width: 100 })[1]
    assert.deepEqual(spans.find(([t]) => t.includes('Mo26')), ['Mo26', 'accent'])
    assert.equal(spans.find(([t]) => t.includes('Tu20'))?.[1], 'dim')
  })

  test('a cut range keeps its columns on the clock: a day a column is still midnight to midnight, and a sliver of a day takes no mark', () => {
    // the month cut to start at Sun 27 04:00 (slot 1): two sessions on Monday, at 00:00 and 20:00, share Monday's column
    const f = timelapseFacts('month')
    f.timeline.desks = [{ id: 'm', project: 'monday', runs: [[6, 7], [11, 12]] }, { id: 'z', project: 'later', runs: [[170, 172]] }]
    f.timeline.meetings = []
    f.timeline.commits = []
    const t = cut(f)
    assert.equal(t.start, 1)
    const lines = rows(f, { width: 60 })
    assert.match(lines[1], /^1d a column/)
    const { k, off, x0 } = grid(f, 60, t)
    assert.deepEqual([k, off], [6, 1])
    const row = [...lines.find((l) => l.startsWith('monday '))].slice(x0)
    assert.deepEqual(row.slice(0, 3).map((ch) => ch !== ' '), [false, true, false], `Sunday empty, Monday lit: ${lines.join('\n')}`)
    // the month cut to start in the afternoon of Fri 16 (its first desk Sat 17 08:00): Friday's sliver takes no mark,
    // and every day after it keeps its own
    const g = timelapseFacts('month')
    g.timeline.desks = g.timeline.desks.map((d) => ({ ...d, runs: d.runs.filter(([a]) => a >= 122) })).filter((d) => d.runs.length)
    g.timeline.meetings = g.timeline.meetings.filter((m) => m.from >= 122)
    g.timeline.commits = g.timeline.commits.filter((c) => c.slot >= 122)
    for (const width of [100, 140]) {
      const ruler = rows(g, { width })[1]
      assert.doesNotMatch(ruler, /Fr16/, ruler)
      for (const day of ['Sa17', 'Mo19', 'We21', 'Fr23', 'Su25']) assert.ok(ruler.includes(day), `${width}: ${day} in ${ruler}`)
    }
  })

  test("a project's cell at its busiest slot shows its peak, and nothing in its row is darker", () => {
    for (const kind of KINDS) {
      for (const opts of [{}, { heavy: true }]) {
        const facts = timelapseFacts(kind, opts)
        const t = cut(facts)
        const lines = rows(facts, { width: 140 })
        const { k, off, x0 } = grid(facts, 140, t)
        const names = [...new Set(t.desks.map((d) => d.project))]
        let checked = 0
        for (const name of names) {
          const row = lines.find((l) => l.startsWith(`${name} `))
          if (!row) continue
          const at = atWork(t, name)
          const peak = firstMax(at)
          const cells = [...row].slice(x0, x0 + Math.ceil((t.slots + off) / k))
          assert.equal(cells[Math.floor((peak + off) / k)], LEVEL[Math.min(4, at[peak])], `${kind} ${name}: peak ${at[peak]} at slot ${peak}`)
          for (const ch of cells) assert.ok(LEVEL.indexOf(ch) <= LEVEL.indexOf(LEVEL[Math.min(4, at[peak])]), `${kind} ${name}: ${ch} is darker than its peak`)
          checked++
        }
        assert.ok(checked >= 5, `${kind}: ${checked} projects checked`)
        if (opts.heavy) assert.ok(lines.find((l) => l.startsWith('island-tour-3d ')).includes('█'), `${kind}: 30 at once is a full block`)
      }
    }
  })

  test('the still closes on its busiest slot, the first with the most desks at work', () => {
    for (const kind of KINDS) {
      const facts = timelapseFacts(kind)
      const at = atWork(facts.timeline)
      const b = firstMax(at)
      const last = rows(facts, { width: 100 }).at(-1)
      assert.ok(last.startsWith(`busiest: ${lapseSlot(facts.timeline, b).label}, ${at[b]} at work`), `${kind}: ${last}`)
      assert.ok(last.endsWith(' · desks at once: ░=1 ▒=2 ▓=3 █=4+'), last)
      assert.ok(rows(facts, { width: 100, ascii: true }).at(-1).endsWith(' . desks at once: .=1 :=2 +=3 #=4+'))
      // narrower, the busiest slot keeps its words and the legend goes
      assert.ok(rows(facts, { width: 60 }).at(-1).startsWith(`busiest: ${lapseSlot(facts.timeline, b).label}, ${at[b]} at work`))
    }
  })

  test('under the playhead: the time, who was at work then per project with their heads, interns and meetings', () => {
    for (const kind of KINDS) {
      const facts = timelapseFacts(kind)
      const t = cut(facts)
      for (let frame = 0; frame < timelapseFrames(facts); frame += 5) {
        const slot = timelapseFrameSlot(facts, frame)
        const n = atWork(t)[slot]
        const now = rows(facts, { width: 140, frame }).at(-1)
        assert.ok(now.startsWith(`${lapseSlot(t, slot).label} · ${n ? `${n} at work` : 'nobody at work'}`), `${kind} f${frame}: ${now}`)
        const top = t.desks.filter((d) => d.runs.some(([a, b]) => a <= slot && slot < b)).map((d) => d.project)
        for (const p of new Set(top)) {
          if (now.includes(`${p} ×`)) assert.ok(now.includes(`${p} ×${top.filter((x) => x === p).length}`), `${kind} f${frame} ${p}: ${now}`)
        }
        const meetings = t.meetings.filter((m) => m.from <= slot && slot < m.to).length
        if (meetings) assert.ok(now.includes(`${meetings} meeting`), `${kind} f${frame}: ${now}`)
      }
    }
    // the heavy office's crowd: a head per character, one of each first, in its own role
    const heavy = timelapseFacts('week', { heavy: true })
    const line = renderTimelapseText(heavy, { width: 140, frame: 7 }).at(-1)
    assert.ok(toPlain([line]).includes('island-tour-3d ×'), toPlain([line]))
    const cast = new Set(line.map(([, r]) => r).filter((r) => ['clawd', 'codex', 'gemini', 'cursor', 'kimi', 'grok'].includes(r)))
    assert.ok(cast.size >= 2, `heads of several characters: ${toPlain([line])}`)
    assert.ok(line.some(([s, r]) => s.includes('▛█▜') && r === 'clawd'), 'Clawd is in the clawd role')
  })

  test('past the rows that fit, the quiet projects fold into one `+N more` row that keeps their sessions', () => {
    const facts = crowdedFacts('week')
    for (const [width, shown] of [[100, 15], [40, 7]]) {
      const lines = rows(facts, { width })
      const at = lines.findIndex((l) => /^\+\d+/.test(l))
      assert.equal(at - 2, shown, `@${width}: ${shown} project rows before the fold`)
      assert.equal(Number(lines[at].match(/^\+(\d+)/)[1]), 25 - shown, lines[at])
      const count = (l) => Number(l.match(/(\d+)$/)[1])
      const listed = lines.slice(2, at).reduce((s, l) => s + count(l), 0)
      assert.equal(count(lines[at]), facts.timeline.desks.length - listed, `@${width}: ${lines[at]}`)
      assert.equal(count(lines[at + 1]), facts.timeline.desks.length, `@${width}: the all row counts every session`)
    }
  })

  test('a project has the role the week view gives it (model.mjs readFacts order)', () => {
    for (const kind of KINDS) {
      const facts = timelapseFacts(kind)
      const colors = readFacts(facts).colors
      const week = new Map()
      for (const l of renderOffice(facts, { view: 'week', width: 140 })) for (const [t, r] of l) if (/^p\d$/.test(r ?? '')) week.set(t.trim(), r)
      const lines = renderTimelapseText(facts, { width: 140 })
      let checked = 0
      for (const name of new Set(facts.timeline.desks.map((d) => d.project))) {
        const row = lines.find((l) => toPlain([l]).startsWith(`${name} `))
        if (!row) continue
        assert.equal(row[0][1], colors.get(name), `${kind} ${name}`)
        if (week.has(name)) assert.equal(row[0][1], week.get(name), `${kind} ${name} as in the week tower`)
        checked++
      }
      assert.ok(checked >= 5, `${kind}: ${checked} projects compared`)
    }
  })
})

// ---------------------------------------------------------------- nothing to replay

describe('text timelapse with nothing to replay', () => {
  test('facts without a timeline, an empty timeline and no facts at all draw two lines that say so', () => {
    const none = rows(SAMPLE, { width: 80 })
    assert.equal(none.length, 2)
    assert.ok(none[0].startsWith('THE OFFICE · timelapse'), none[0])
    assert.equal(none[1], 'nothing to replay: no timeline in these facts')
    const empty = timelapseFacts('week')
    empty.timeline = { ...empty.timeline, desks: [], meetings: [], commits: [] }
    assert.deepEqual(rows(empty, { width: 80, frame: 3 }), [
      'THE OFFICE · timelapse · this week · Tue 20 Oct → Mon 26 Oct', 'nothing to replay: nobody worked this week',
    ])
    for (const f of [null, undefined, {}, empty]) {
      for (const width of WIDTHS) for (const ascii of [false, true]) {
        const lines = rows(f, { width, ascii, frame: 1 })
        assert.equal(lines.length, 2)
        assert.ok(lines[0].startsWith('THE OFFICE'))
        for (const l of lines) assert.ok(displayWidth(l) <= width, l)
      }
      assert.equal(timelapseFrames(f), 1)
      assert.equal(timelapseFrameSlot(f, 4), null)
    }
  })

  test('a broken timeline draws instead of throwing', () => {
    const base = timelapseFacts('week')
    const broken = [
      { slots: 'x', desks: 'nope' },
      {
        kind: 'decade', slots: 1e9, slot_min: 0, days: [],
        desks: [null, 7, { runs: 'x' }, { project: '🚀\x1b[31mred', runs: [[5, 2], [3, 9], 'y', [-4, 2]], interns: [[2, 99], 'z', [1e9, 1]] }],
      },
      {
        ...base.timeline,
        desks: [...base.timeline.desks, { project: null, agent: 'hal', runs: [[0, 1e6]], interns: [[0, 3]] }],
        meetings: [{ from: 'a' }, null, { from: 4, to: 2 }], commits: [{ slot: -1, n: 3 }, { slot: 2, n: 'x' }, null],
      },
    ]
    for (const timeline of broken) {
      const f = { ...clone(base), timeline }
      for (const width of [20, 60, 140]) for (const frame of [null, 0, 99]) {
        const lines = rows(f, { width, frame })
        assert.ok(lines[0].startsWith('THE OFFICE'))
        for (const l of lines) {
          assert.ok(displayWidth(l) <= width, l)
          assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(l), l)
        }
      }
      assert.ok(timelapseFrames(f) >= 1)
    }
  })
})

// lib/ascii.mjs: sweep invariants (width, glyphs, 7-bit, frames) over every view, plus structure checks of the sheets
// every view draws, laid out as Today's timesheet (sample facts, now = Mon 26 Oct 01:40 local, night).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { ROLE_ANSI, ROLE_ANSI_16, ROLE_HEX, ROLE_TERM, VIEWS, renderOffice, renderStatus, toAnsi, toPlain } from '../plugin/lib/ascii.mjs'
import { displayWidth } from '../plugin/lib/format.mjs'
import { CLAWD_HEX, CLAWD_SPRITE, CLAWD_TERM, deskClass } from '../plugin/lib/model.mjs'
import { ROOT, SAMPLE, clone, emptyFacts, idleFacts, monthFacts, stressFacts, todayFacts } from './helpers/facts.mjs'

const FACTS = { sample: SAMPLE, empty: emptyFacts(), stress: stressFacts() }
const WIDTHS = [20, 40, 54, 60, 72, 80, 100, 120, 140] // under 60: the narrow list
const plain = (facts, opts) => toPlain(renderOffice(facts, opts))

// ---------------------------------------------------------------- sweep

describe('ascii sweep', () => {
  for (const [name, facts] of Object.entries(FACTS)) {
    test(`${name}: every view × width × ascii × frames keeps the invariants`, () => {
      for (const view of VIEWS) {
        for (const width of WIDTHS) {
          for (const ascii of [false, true]) {
            let base
            for (let frame = 0; frame <= 2; frame++) {
              const where = `${name} ${view} @${width}${ascii ? ' ascii' : ''} f${frame}`
              const lines = renderOffice(facts, { view, width, ascii, frame })
              const txt = toPlain(lines)
              assert.ok(txt.startsWith('THE OFFICE'), `${where}: first line starts with THE OFFICE`)
              assert.ok(!/[\x00-\x09\x0b-\x1f\x7f-\x9f]/.test(txt), `${where}: control char`)
              assert.ok(!txt.includes('`'), `${where}: backtick`)
              const rows = txt.split('\n')
              rows.forEach((l, i) => {
                assert.ok(displayWidth(l) <= width, `${where}: line ${i + 1} is ${displayWidth(l)} wide: ${l}`)
                assert.ok(!/ $/.test(l), `${where}: line ${i + 1} has trailing spaces`)
                for (const ch of l) {
                  if (ascii) assert.ok(/[\x20-\x7e]/.test(ch), `${where}: non 7-bit ${JSON.stringify(ch)} on line ${i + 1}`)
                  else assert.equal(displayWidth(ch), 1, `${where}: ${JSON.stringify(ch)} is not one column (line ${i + 1})`)
                }
              })
              for (const l of lines) for (const sp of l) assert.ok(sp[1] === null || sp[1] in ROLE_ANSI, `${where}: unknown role ${sp[1]}`)
              const widths = rows.map((l) => displayWidth(l)).join(',')
              if (frame === 0) base = widths
              else assert.equal(widths, base, `${where}: frames changed line count or widths`)
            }
          }
        }
      }
    })
  }

  test('line budgets per view (sample, stress) at 72 and 100', () => {
    const cap = { live: 47, all: 50, week: 40, today: 40, month: 46, work: 30 }
    for (const facts of [SAMPLE, FACTS.stress, monthFacts(), todayFacts()]) {
      for (const view of VIEWS) for (const width of [72, 100]) {
        const n = renderOffice(facts, { view, width }).length
        assert.ok(n <= cap[view], `${view} @${width}: ${n} lines > ${cap[view]}`)
      }
    }
  })

  test('partial or odd facts never throw', () => {
    for (const f of [{}, null, { live: { desks: [null, { state: 'working' }] } }, { projects: [{ name: 'x' }], range: { days: [] } }, { now: { iso: 'nope' }, live: { desks: [{ title: 5, interns: 'x', meetings: [{}] }] } }]) {
      for (const view of VIEWS) {
        const txt = plain(f, { view, width: 80 })
        assert.ok(txt.startsWith('THE OFFICE'), view)
      }
      assert.ok(renderStatus(f).length > 0)
    }
  })
})

// ---------------------------------------------------------------- golden structure

// the one-row figures a desk line starts with (the legend's poses, and thinking)
const FIGURES = ['▛▛█ ', '█▜▜°', '▄▛█▜', '▛█▜?', '▛█▜!', '▛█▜■', '▛█▜✓', '▄▄▄z', '▛█▜c']
const deskLines = (rows, indent = 4) => rows.filter((l) => FIGURES.includes([...l].slice(indent, indent + 4).join('')))

/** The columns where a word starts after two spaces on every one of `rows`: the sheet's aligned columns. */
function sharedColumns(rows) {
  const starts = rows.map((l) => {
    const ch = [...l]
    return new Set(ch.flatMap((x, i) => (i >= 2 && x !== ' ' && ch[i - 1] === ' ' && ch[i - 2] === ' ' ? [i] : [])))
  })
  return [...starts[0]].filter((i) => starts.every((s) => s.has(i)))
}

describe('golden structure: live', () => {
  test('live @ 100: the floor as the timesheet draws a day, a row per room and a line per desk', () => {
    const rows = plain(SAMPLE, { view: 'live', width: 100 }).split('\n')
    assert.match(rows[0], /^THE OFFICE · live · Mon 26 Oct · 01:40 · night shift +[·*( ]+$/)
    assert.equal(rows[1], '10 desks █████▒?░░░ 5 working · 1 in a meeting · 1 hand up · 2 on break · 1 done · +2 interns')
    assert.equal(rows[2], '')
    assert.ok(rows[3].startsWith('── the floor · room by room, desk by desk ──'))
    // each room in the timesheet's columns (live mark, name, the now strip, its counts), then its desks: the figure,
    // the title, what it is doing, how long, a break included (it stays in its room)
    assert.equal(rows[4], '• island-tour-3d      ███?░░  3 working · 1 hand up · 1 on break · 1 done')
    assert.equal(rows[5], "    ▄▄▄z Fresques d'Hélène et Apollon au m…  dozing at the desk                            idle 1h32")
    const txt = rows.join('\n')
    for (const part of [
      "    ▛█▜? Wizard's cape shoulder positioning  asks: Which cape anchor?                    hand up 25m",
      '    ▛█▜c Lava Cavern camera positioning      on break                                       idle 37m',
      '    ▛▛█  Coconut drum rhythm puzzle          edit rhythm-drums.js                         shift 1h37',
      '• glyph-atlas-webgpu  ▒░      1 in a meeting · 1 on break',
      '    ▄▛█▜ Final arcade world design           meeting arcade-finale-brief                  shift 1h41',
      '• theoffice-agents    █ii     1 working · 2 interns',
      '    ▛▛█  Clawd desk sprites in pixel art     read office-notes.md · 2 interns             shift 1h32',
      // the meeting room, as a room: its row, then the whiteboard of each meeting with how far along it is
      '  meeting room                1 running · 3 in the room',
      '    ✓✓✓✓✓ooo·    arcade-finale-brief  5/9 done · 3 running · 1 to go  design: arcade-angle',
    ]) assert.ok(txt.includes(part), `floor has ${part}`)
    for (const art of ['╔', '║', '┌───┐', '▀▀▀▀', 'KITCHEN', '\\|/']) assert.ok(!txt.includes(art), `no floor plan left: ${art}`)
    assert.deepEqual(rows.slice(rows.indexOf('', 3)), [
      '',
      'lights off: harborledger · webgl-swatch-demos · csv-batch-importer · recipe-chat · +27 more',
      'coat rack ─┼─ gizmo3d "Exporter cleanup" left 9m ago',
      // the basement, as the pixel Office draws it: what they did, busiest first, in one line
      'what they did: server room/terminal 39% · typing pool/coding 14% · library/reading 13% +7 more',
      '▛▛█ working  ▄▛█▜ waiting on helpers  ▛█▜? hand up  ▛█▜✓ done  ▄▄▄z dozing  ▛█▜c on break',
    ])
  })

  test('the floor keeps its columns: every desk line is as wide as the view, its work and its time in one column', () => {
    for (const [name, facts] of [['sample', SAMPLE], ['idle', idleFacts()], ['stress', FACTS.stress]]) {
      for (const width of [72, 100, 140]) {
        const desks = deskLines(plain(facts, { view: 'live', width }).split('\n'))
        assert.ok(desks.length >= 3, `${name} @${width}: ${desks.length} desks`)
        for (const l of desks) assert.equal(displayWidth(l), width, `${name} @${width}: ${l}`)
        assert.ok(sharedColumns(desks).length >= 1, `${name} @${width}: what the desks do starts in one column`)
      }
    }
  })

  test('Clawd is always Claude orange: his glyphs only ever carry the clawd role', () => {
    const QUAD = /[▖▗▘▙▚▛▜▝▞▟]/
    for (const [name, facts] of Object.entries(FACTS)) {
      for (const view of ['live', 'all']) for (const width of [40, 72, 100, 140]) {
        const lines = renderOffice(facts, { view, width })
        for (const l of lines) for (const [t, r] of l) if (QUAD.test(t)) assert.equal(r, 'clawd', `${name} ${view} @${width}: "${t}" is ${r}`)
      }
    }
    const spans = renderOffice(SAMPLE, { view: 'live', width: 100 }).flat()
    assert.ok(spans.some(([t, r]) => r === 'clawd' && t.includes('▛▛█')), 'working Clawds are drawn in the clawd role')
  })

  test('the shared Clawd glyphs (model.mjs): one column each, 7-bit forms as wide as the unicode ones', () => {
    assert.equal(CLAWD_SPRITE.length, 10)
    for (const row of CLAWD_SPRITE) assert.match(row, /^[CE.]{17}$/)
    const pairs = []
    const walk = (o) => (Array.isArray(o) && typeof o[0] === 'string' ? pairs.push(o) : Object.values(o).forEach(walk))
    walk(CLAWD_TERM)
    assert.ok(pairs.length >= 14)
    for (const [u, a] of pairs) {
      assert.equal([...u].length, a.length, `${u} / ${a}`)
      for (const ch of u) assert.equal(displayWidth(ch), 1, ch)
      assert.match(a, /^[\x20-\x7e]+$/)
      assert.ok(!a.includes('`'))
    }
    assert.equal(ROLE_HEX.clawd.dark, CLAWD_HEX.dark)
    assert.equal(ROLE_HEX.clawd.light, CLAWD_HEX.light)
  })

  test('every running meeting gets a whiteboard (or a "+N more" row), never only the first', () => {
    const f = clone(SAMPLE)
    const second = { ...clone(f.live.desks[1].meetings[0]), id: 'wf_second', name: 'second-meeting-run', agents_running: 2 }
    const desk = f.live.desks.find((d) => d.project === 'md2epub')
    Object.assign(desk, { state: 'waiting_on_agents', meetings: [second] })
    for (const width of [72, 80, 100, 120, 140]) {
      const txt = plain(f, { view: 'live', width })
      assert.ok(txt.includes('arcade-finale-brief') && txt.includes('second-meeting-run'), `both meetings @${width}`)
    }
    f.live.desks.forEach((d, i) => { if (i > 1 && i < 6) Object.assign(d, { state: 'waiting_on_agents', meetings: [{ ...second, id: `wf_${i}`, name: `meeting-${i}` }] }) })
    for (const width of [72, 100]) {
      const txt = plain(f, { view: 'live', width })
      assert.match(txt, /\+\d more meetings \(\d+ agents\)/, `overflow row @${width}`)
    }
  })

  test('word joiners and other invisible chars in titles never move a column', () => {
    const f = clone(SAMPLE)
    const wj = (t) => [...t].join('\u2060')
    for (const d of f.live.desks) { d.title = wj(d.title); d.project = `${d.project}\u2061` }
    f.now.local_time = '01:40\u202e'
    for (const width of [72, 100]) {
      const rows = plain(f, { view: 'live', width }).split('\n')
      const desks = deskLines(rows)
      assert.equal(desks.length, 10)
      for (const l of desks) assert.equal(displayWidth(l), width, l)
      assert.ok(sharedColumns(desks).length >= 1)
      assert.ok(!/[\u2060-\u206f\u202a-\u202e]/.test(rows.join('\n')))
    }
  })

  test('live @ 72 wraps the glance under its first group and narrows the columns', () => {
    const rows = plain(SAMPLE, { view: 'live', width: 72 }).split('\n')
    assert.equal(rows[1], '10 desks █████▒?░░░ 5 working · 1 in a meeting · 1 hand up · 2 on break')
    assert.equal(rows[2], '                    1 done · +2 interns')
    assert.ok(rows[4].startsWith('── the floor · room by room ─'))
    assert.equal(rows[5], '• island-tour-3d  ███?░░  3 working · 1 hand up · 1 on break · 1 done')
    const txt = rows.join('\n')
    for (const part of ["    ▛█▜? Wizard's cape should…  asks: Which cape anchor?     hand up 25m", '• glyph-atlas-w…  ▒░      1 in a meeting · 1 on break',
      '    ▛▛█  Clawd desk sprites i…  read office-no… · 2 interns   shift 1h32', '  meeting room            1 running · 3 in the room']) {
      assert.ok(txt.includes(part), `@72 has ${part}`)
    }
  })

  test('live --ascii @ 100 is the same sheet in 7-bit', () => {
    const rows = plain(SAMPLE, { view: 'live', width: 100, ascii: true }).split('\n')
    assert.match(rows[0], /^THE OFFICE \. live \. Mon 26 Oct \. 01:40 \. night shift/)
    assert.equal(rows[1], '10 desks #####+?::: 5 working . 1 in a meeting . 1 hand up . 2 on break . 1 done . +2 interns')
    assert.ok(rows[3].startsWith('-- the floor . room by room, desk by desk --'))
    assert.equal(rows[4], '* island-tour-3d      ###?::  3 working . 1 hand up . 1 on break . 1 done')
    const txt = rows.join('\n')
    // the tiny boxy Clawd: a face with two eyes, and his mark
    for (const part of ["    [-]z Fresques d'Helene et Apollon au m~  dozing at the desk", '    ["]? Wizard', '    ["]c Lava Cavern camera positioning',
      '    ["]  Coconut drum rhythm puzzle', '    _["] Final arcade world design', '    vvvvvooo.    arcade-finale-brief  5/9 done . 3 running . 1 to go',
      'coat rack -+-']) {
      assert.ok(txt.includes(part), `ascii has ${part}`)
    }
    assert.equal(rows.at(-1), '["] working  _["] waiting on helpers  ["]? hand up  ["]v done  [-]z dozing  ["]c on break')
    const unicode = plain(SAMPLE, { view: 'live', width: 100 }).split('\n')
    assert.deepEqual(rows.map((l) => l.length), unicode.map((l) => [...l].length), 'every fold is one column')
  })

  test('animation swaps one glyph in place: the thinking bubble grows, the snore comes and goes; the sheets hold still', () => {
    const f = clone(SAMPLE)
    Object.assign(f.live.desks.find((d) => d.title.startsWith('Coconut')), { state: 'busy', activity: { kind: 'thinking', since: f.now.iso } })
    const frames = [0, 1, 2].map((frame) => plain(f, { view: 'live', width: 100, frame }).split('\n'))
    for (const fr of frames.slice(1)) {
      assert.equal(fr.length, frames[0].length)
      fr.forEach((l, i) => assert.equal([...l].length, [...frames[0][i]].length, `line ${i + 1}`))
    }
    assert.notDeepEqual(frames[0], frames[1])
    for (const [i, part] of [[0, '▄▄▄z Fresques'], [1, '▄▄▄Z Fresques'], [2, '▄▄▄  Fresques'], [0, '█▜▜° Coconut'], [1, '█▜▜o Coconut'], [2, '█▜▜O Coconut']]) {
      assert.ok(frames[i].join('\n').includes(part), `frame ${i} has ${part}`)
    }
    assert.equal(plain(f, { view: 'live', width: 100, frame: 3 }), frames[0].join('\n'), 'the floor loops every 3 frames')
    assert.equal(frames[2].at(-1), frames[0].at(-1), 'the legend holds still')
    for (const view of ['today', 'week', 'month', 'work']) {
      assert.equal(plain(f, { view, width: 100, frame: 1 }), plain(f, { view, width: 100, frame: 0 }), `${view} holds still`)
    }
  })

  test('empty office at night: the cat in charge, the rooms lit today, who left last', () => {
    const f = clone(SAMPLE)
    f.live.desks = []
    const rows = plain(f, { view: 'live', width: 100 }).split('\n')
    assert.match(rows[0], /^THE OFFICE · live · Mon 26 Oct · 01:40 · lights off/)
    assert.equal(rows[1], '0 desks · everyone clocked out · the office cat is in charge')
    assert.ok(rows[3].startsWith('── the floor · lights off ──'))
    assert.deepEqual(rows.slice(4, 8), ['  island-tour-3d      4h37 agent-time today', '  glyph-atlas-webgpu  4h08 agent-time today',
      '  theoffice-agents    1h35 agent-time today', '  md2epub             59m agent-time today'])
    const txt = rows.join('\n')
    for (const part of ['coat rack ─┼─ last one out: gizmo3d "Exporter cleanup" 9m ago', 'what they did: server room/terminal 39%', 'today so far: 11h19 agent-time']) {
      assert.ok(txt.includes(part), `empty office has ${part}`)
    }
    assert.ok(rows.length <= 14)
    const day = clone(f)
    day.now = { ...day.now, local_time: '14:05', hour: 14, is_night: false }
    const d = plain(day, { view: 'live', width: 100 }).split('\n')
    assert.match(d[0], /^THE OFFICE · live · Mon 26 Oct · 14:05 · nobody in +.*-O-/)
    assert.equal(d[1], '0 desks · everyone stepped out · the desks are tidy')
    assert.ok(d[3].startsWith('── the floor · nobody in ──'))
    assert.ok(!d.join('\n').includes('office cat'))
  })
})

// a timesheet room row: live mark or a blank, a name, then the strip and the numbers
const sheetRows = (rows) => {
  const head = rows.findIndex((l) => l.startsWith('  room '))
  const end = rows.findIndex((l, i) => i > head && l.startsWith('  all rooms'))
  return rows.slice(head + 1, end).filter((l) => /^[• ] \S/.test(l))
}

describe('golden structure: history views', () => {
  test('week @ 100: totals, the timesheet day by day, departments, staff, visitors, awards', () => {
    const rows = plain(SAMPLE, { view: 'week', width: 100 }).split('\n')
    assert.match(rows[0], /^THE OFFICE · week · Tue 20 Oct → Mon 26 Oct · as of Mon 01:40/)
    assert.equal(rows[1], '528h agent-time (95h35 at desks) · 163 sessions · 657 interns · 25 meetings · 595 commits +107k -24k')
    assert.ok(rows[3].startsWith('── timesheet · day by day ──'))
    assert.equal(rows[4], '  room                now     Tu We Th Fr Sa Su Mo  agent-h                      interns ships')
    assert.equal(rows[5], '  harborledger        ·       ▅▅ ▄▄ ██ ██ ██ ▃▃ ··     321h ████████████████████     312    64')
    // under each room what was on its desk and the last thing it shipped, under the strip
    assert.ok(rows[6].startsWith(`${' '.repeat(30)}Speed up invoice PDF batch exporting · shipped "feat: speed up invoic`))
    assert.ok(rows.includes('• island-tour-3d      ███?░░  ▂▂ ▂▂ ▃▃ ▃▃ ▃▃ ▃▃ ▂▂      43h ██▋                       44    77'), 'live strip in now')
    const rooms = sheetRows(rows)
    assert.equal(rooms.length, 8)
    for (const l of rooms) assert.match([...l].slice(30, 50).join(''), /^(?:[▁-█·]{2} ){6}[▁-█·]{2}$/, `the days line up: ${l}`)
    assert.match(rows.find((l) => l.startsWith('  all rooms')), /^ {2}all rooms {11}10 {6}(?:[▁-█·]{2} ){6}[▁-█·]{2} +528h +657 +595$/)
    assert.ok(rows.includes('  +27 more rooms · 22h agent-time'))
    const txt = rows.join('\n')
    assert.ok(!txt.includes('║') && !txt.includes('╔'), 'no tower left')
    assert.ok(txt.includes('── what they did · 51k tool calls'))
    // the chart says what it shows: the columns are named, every department says its kind of work
    const head = rows.findIndex((l) => l.startsWith('── what they did'))
    assert.equal(rows[head + 1], 'department · kind of work · share of tool calls · calls')
    assert.ok(rows[head + 2].startsWith('server room   terminal       █████████ 39%    20k  internet café web            █▎         5%   2.7k'))
    assert.ok(txt.includes('phone booth   talking to you'))
    assert.ok(txt.includes('interns: 559 consultants, 79 generalists, 19 researchers   staff: opus-5-5 ×141, fable-5-1 ×22'))
    assert.ok(txt.includes('visitors: codex 3h00 @ harborledger (other agents, via novi)'))
    const awards = rows.filter((l) => l.startsWith('★'))
    assert.ok(awards.length >= 1 && awards.length <= 3)
    assert.ok(awards[0].startsWith('★ employee of the week harborledger (321h agent-time)   ★ busiest day Thu 22 (145h agent-time)'))
    assert.ok(txt.includes('★ shipping dept webgl-swatch-demos (208 commits)'))
    assert.ok(!txt.includes('busiest floor'), 'the award names a day')
    assert.ok(!txt.includes('busiest desk'), 'no live awards in week')
  })

  test('week @ 72: narrower names, no interns column, no bar', () => {
    const rows = plain(SAMPLE, { view: 'week', width: 72 }).split('\n')
    assert.equal(rows[1], '528h agent-time · 163 sessions · 657 interns · 25 meetings · 595 commits')
    assert.ok(rows[3].startsWith('── timesheet · day by day ─'))
    assert.equal(rows[4], '  room            now     Tu We Th Fr Sa Su Mo  agent-h            ships')
    assert.ok(rows.includes('• glyph-atlas-w…  ▒░      ▂▂ ▃▃ ▃▃ ▃▃ ▃▃ ▂▂ ▂▂      49h █▌           131'))
    assert.ok(rows.some((l) => l.startsWith('  all rooms       10      ')))
  })

  test('all @ 100: the floor, then this week\'s timesheet, a departments sentence, awards, ≤ 50 lines', () => {
    const rows = plain(SAMPLE, { view: 'all', width: 100 }).split('\n')
    assert.ok(rows.length <= 50)
    assert.match(rows[0], /^THE OFFICE · live · week · what they did · Mon 26 Oct · 01:40 · night shift/)
    const txt = rows.join('\n')
    assert.ok(txt.includes('── the floor · room by room, desk by desk') && txt.includes('  meeting room '))
    assert.ok(!txt.includes('lights off:') && !txt.includes('▛▛█ working'), 'no lights-off line and no legend in all')
    const week = rows.findIndex((l) => l.startsWith('── this week · Tue 20 Oct → Mon 26 Oct ─'))
    assert.ok(week > 0)
    assert.equal(rows[week + 1], '528h agent-time (95h35 at desks) · 163 sessions · 657 interns · 25 meetings · 595 commits +107k -24k')
    assert.equal(rows[week + 2], '  room                now     Tu We Th Fr Sa Su Mo  agent-h                      interns ships')
    assert.equal(sheetRows(rows.slice(week)).length, 8)
    // what they did names the kind of work next to each department, and what the shares are of
    const dep = rows.findIndex((l) => l.startsWith('what they did (share of 51k tool calls): '))
    assert.ok(rows[dep].endsWith('server room/terminal 39% · typing pool/coding 14%'), rows[dep])
    assert.ok(rows[dep + 1].startsWith('library/reading 13% · gadget shop/other tools 10% · whiteboard/planning 6%'), rows[dep + 1])
    assert.match(rows[dep + 1], / \+\d more$/, 'the smallest departments that do not fit are counted')
    const awards = rows.filter((l) => l.startsWith('★'))
    assert.ok(awards[0].startsWith('★ busiest desk "Final arcade world design" (3 helpers)'))
    assert.equal(awards.join(' ').split('★').length - 1, 6)
  })

  test('stress all @ 100 degrades: the floor in its budget, rooms on their row alone, fewer rooms in the week', () => {
    const rows = plain(FACTS.stress, { view: 'all', width: 100 }).split('\n')
    assert.ok(rows.length <= 50)
    const floor = rows.slice(rows.findIndex((l) => l.startsWith('── the floor')) + 1, rows.findIndex((l) => l.startsWith('── this week')))
    assert.ok(floor.length <= 18 + 2, `floor is ${floor.length} lines`)
    assert.ok(rows.includes('• gizmo3d             ██      2 working'), 'a room past the budget keeps its row')
    const week = rows.slice(rows.findIndex((l) => l.startsWith('── this week')))
    assert.ok(sheetRows(week).length >= 3)
    assert.ok(week.some((l) => /^ {2}\+\d+ more rooms · /.test(l)))
    const txt = rows.join('\n')
    assert.ok(!/[\u3040-\u9fff\uac00-\ud7a3]/u.test(txt), 'CJK replaced')
    assert.ok(!/\p{Extended_Pictographic}/u.test(txt), 'emoji replaced')
  })

  test('a long floor folds its quiet desks, and the narrow list keeps the one-row figure and its mark', () => {
    // 16 desks: the all view's 18-line floor folds a room's quiet desks, then gives the last rooms their row alone
    const f = clone(SAMPLE)
    f.live.desks = Array.from({ length: 16 }, (_, i) => ({ ...clone(SAMPLE.live.desks[i % 10]), id: `x${i}`, project: ['island-tour-3d', 'md2epub', 'glyph-atlas-webgpu', 'recipe-chat'][i % 4] }))
    const rows = plain(f, { view: 'all', width: 100 }).split('\n')
    for (const part of ['    ▛▛█  Coconut drum rhythm puzzle', '    ▄▛█▜ Final arcade world design', '    ▛█▜c Lava Cavern camera positioning',
      '• recipe-chat         ██▒░    2 working · 1 in a meeting · 1 done', '• island-tour-3d      ██?░ii  2 working · 1 hand up · 1 on break · 2 interns']) {
      assert.ok(rows.some((l) => l.startsWith(part)), `crowded floor has ${part}`)
    }
    const many = clone(f)
    for (const d of many.live.desks.slice(0, 8)) Object.assign(d, { state: 'idle', idle_reason: 'done', meetings: [], interns: [] })
    assert.match(plain(many, { view: 'all', width: 100 }), /\n {4}\+\d more: (?:\d (?:done|dozing|on break)(?: · )?)+\n/, 'quiet desks fold into one line')
    const narrow = plain(SAMPLE, { view: 'live', width: 54 }).split('\n')
    for (const part of ["  ▄▄▄z Fresques d'Hélène e… dozing 1h32", "  ▛█▜? Wizard's cape shoul… asks: Which cape anchor?", '  ▛▛█  Playtest notes and…  test Run difficulty curve…',
      '  ▄▛█▜ Final arcade world…  meeting arcade-finale-bri…', '  ▛█▜c Lava Cavern camera…  on break 37m', '• island-tour… ███?░░ 3 working · 1 hand up']) {
      assert.ok(narrow.includes(part), `narrow has ${part}`)
    }
  })

  test('today @ 100: timesheet with the 24 h strip and the now marker', () => {
    const rows = plain(todayFacts(), { view: 'today', width: 100 }).split('\n')
    assert.match(rows[0], /^THE OFFICE · today · Mon 26 Oct · 01:40 · night shift/)
    assert.ok(rows[2].startsWith('10 desks █████▒?░░░'))
    assert.ok(rows.some((l) => l.startsWith('── timesheet · since midnight · ▕ now 01:40 ─')))
    const head = rows.find((l) => l.startsWith('  room'))
    assert.ok(head.includes('now     00    06    12    18') && head.trimEnd().endsWith('interns ships'))
    const island = rows.find((l) => l.startsWith('• island-tour-3d'))
    assert.match(island, /^• island-tour-3d {6}███\?░░ {2}[▁-█·]{2}▕ +\S+ █+/)
    assert.ok(rows.some((l) => l.startsWith('  all rooms           10      ')))
    assert.ok(rows.filter((l) => l.startsWith('★')).length <= 3)
    const ascii = plain(todayFacts(), { view: 'today', width: 100, ascii: true })
    assert.ok(ascii.includes('| now 01:40') && !ascii.includes('▕'))
  })

  test('work @ 100 and @ 72: what they did, explained: named columns, kinds of work, a legend of every department', () => {
    const wide = plain(SAMPLE, { view: 'work', width: 100 }).split('\n')
    assert.match(wide[0], /^THE OFFICE · what they did · Tue 20 Oct → Mon 26 Oct · as of Mon 01:40/)
    assert.equal(wide[1], '528h agent-time (95h35 at desks) · 163 sessions · 657 interns · 25 meetings · 595 commits +107k -24k')
    assert.ok(wide[3].startsWith('── what they did · 51k tool calls ──'))
    assert.equal(wide[4], 'department · kind of work · share of tool calls · calls')
    assert.equal(wide.filter((l) => /^(server room|typing pool|library|gadget shop|whiteboard) {2,}\S/.test(l)).length, 5, 'two columns of five')
    const legend = wide.slice(wide.findIndex((l) => l.startsWith('── the departments · every tool call an agent made, by kind of work'))).join(' · ')
    for (const part of ['server room = terminal commands', 'QA lab = running tests', 'library = reading code', 'typing pool = writing code',
      'internet café = browsing the web', 'gadget shop = other tools', 'whiteboard = planning', 'phone booth = talking to you',
      'management = delegating to helpers', 'art studio = design tools']) assert.ok(legend.includes(part), part)

    const narrow = plain(SAMPLE, { view: 'work', width: 72 }).split('\n')
    const rows = narrow.filter((l) => /^(server room|typing pool|library|gadget shop|whiteboard|internet café) .*█/.test(l))
    assert.equal(rows.length, 6, 'one column of the six busiest')
    assert.ok(rows[0].startsWith('server room   terminal       ████'))
    assert.ok(narrow.includes('+4 more: QA lab 5% · management 3% · phone booth 2% · art studio 2%'))
    assert.deepEqual(plain(emptyFacts(), { view: 'work', width: 100 }).split('\n').filter((l) => l.includes('no tool calls')), ['no tool calls in this range yet'])
  })

  test('departments: false leaves what they did to the page that draws it under its own picture', () => {
    for (const view of ['week', 'today', 'month']) {
      const without = plain(SAMPLE, { view, width: 100, departments: false })
      assert.ok(plain(SAMPLE, { view, width: 100 }).includes('── what they did'), view)
      assert.ok(!without.includes('── what they did') && !without.includes('staff: '), view)
      assert.ok(without.includes('★'), `${view}: the awards stay`)
    }
    assert.equal(plain(SAMPLE, { view: 'work', width: 100, departments: false }), plain(SAMPLE, { view: 'work', width: 100 }))
  })

  test('month @ 100 and @ 72: the timesheet a column a day, the dates of its Mondays over the strip', () => {
    for (const [W, at] of [[100, 30], [72, 26]]) {
      const rows = plain(monthFacts(), { view: 'month', width: W }).split('\n')
      assert.match(rows[0], /^THE OFFICE · month · Sun 27 Sep → Mon 26 Oct · as of Mon 01:40/)
      assert.ok(rows[3].startsWith('── timesheet · day by day'))
      // Sun 27 Sep is the first day: the Mondays 28 Sep, 5, 12 and 19 Oct are dated over their own column
      const head = [...rows[4]]
      for (const [day, t] of [[1, '28'], [8, '5 '], [15, '12'], [22, '19']]) assert.equal(head.slice(at + day, at + day + 2).join(''), t, `@${W} ${t}`)
      const rooms = sheetRows(rows)
      assert.equal(rooms.length, 8)
      for (const l of rooms) assert.match([...l].slice(at, at + 30).join(''), /^[▁-█·]{30}$/, `@${W} 30 days: ${l}`)
      assert.ok(rows.includes('  +27 more rooms · 22h31 agent-time'))
      assert.ok(rows.some((l) => l.startsWith('★ employee of the month harborledger')))
      assert.ok(!rows.join('\n').includes('┌'), 'no calendar boxes')
    }
  })
})

// ---------------------------------------------------------------- status, filter, output helpers

describe('a turn that is over', () => {
  test('an idle desk is classed by why: an error, a stop (or gone quiet), a break, else done; done or on a break for an hour, it dozes', () => {
    const now = Date.parse('2026-10-26T00:40:00.000Z')
    const idle = (idle_reason, min) => ({ state: 'idle', idle_reason, activity: { kind: 'idle', since: new Date(now - min * 60e3).toISOString() } })
    const got = [['done', 5], ['done', 61], [undefined, 5], ['break', 5], ['break', 61], ['stopped', 61], ['stalled', 5], ['error', 120]]
      .map(([r, m]) => deskClass(idle(r, m), now))
    assert.deepEqual(got, ['done', 'dozing', 'done', 'break', 'dozing', 'stopped', 'stopped', 'error'])
  })

  test('each way a turn ends has its mark, words, time and count, the unfinished ones first; a break stays in its room', () => {
    const f = idleFacts()
    const rows = plain(f, { view: 'live', width: 100 }).split('\n')
    assert.equal(rows[1], '12 desks █████▒?!■░░░ 5 working · 1 in a meeting · 1 hand up · 1 error · 1 stopped · 1 on break')
    assert.equal(rows[2], '                      2 done · +2 interns')
    assert.equal(rows[5], '• island-tour-3d      ███?!+  3 working · 1 hand up · 1 error · 1 stopped · 2 done')
    const txt = rows.join('\n')
    for (const part of ['    ▛█▜■ Shader warmup pass                  stopped by you                                idle 2h00',
      '    ▛█▜✓ Lava Cavern camera positioning      done, your turn                                idle 37m',
      "    ▛█▜! Volcano particles                   error: You've hit your session limit          idle 2h00",
      '    ▄▄▄z Fresques', '    ▛█▜c Atlas glyph edge cleanup            on break']) assert.ok(txt.includes(part), `floor has ${part}`)
    // the legend names an error and a stop only when a desk shows one
    assert.equal(rows.at(-1), '▛▛█ working  ▄▛█▜ waiting on helpers  ▛█▜? hand up  ▛█▜! error  ▛█▜■ stopped  ▛█▜✓ done  ▄▄▄z dozing')
    const narrow = plain(f, { view: 'live', width: 54 }).split('\n')
    for (const part of ['  ▛█▜■ Shader warmup pass   stopped 2h00', '  ▛█▜✓ Lava Cavern camera…  done 37m', "  ▛█▜! Volcano particles    error: You've hit your se…"]) {
      assert.ok(narrow.includes(part), `narrow has ${part}`)
    }
    const ascii = plain(f, { view: 'live', width: 100, ascii: true })
    for (const part of ['["]x Shader warmup pass', '["]v Lava Cavern', '["]! Volcano particles', '#####+?!x:::', '["]! error  ["]x stopped  ["]v done']) assert.ok(ascii.includes(part), `ascii has ${part}`)
    assert.equal(renderStatus(f, { width: 120 }), '🏢 1 hand up · 1 error · 5 working · 1 in a meeting · 1 stopped · 1 on break · 2 done · 2 interns')
    assert.equal(renderStatus(f, { width: 30 }), '🏢 1 hand up · 1 error', 'an error needs the human: it goes first with the hands up')
  })
})

describe('status line, project filter, output', () => {
  test('status line wording, priority order and width', () => {
    assert.equal(renderStatus(SAMPLE), '🏢 1 hand up · 5 working · 1 in a meeting · 2 on break · 1 done · 2 interns')
    assert.equal(renderStatus(SAMPLE, { width: 41 }), '🏢 1 hand up · 5 working · 1 in a meeting')
    assert.equal(renderStatus(SAMPLE, { width: 40 }), '🏢 1 hand up · 5 working')
    assert.equal(renderStatus(SAMPLE, { ascii: true, width: 90 }), '[office] 1 hand up . 5 working . 1 in a meeting . 2 on break . 1 done . 2 interns')
    const empty = clone(SAMPLE)
    empty.live.desks = []
    assert.equal(renderStatus(empty), '🏢 office empty · lights off · 11h19 agent-time today')
    empty.now = { ...empty.now, hour: 14, is_night: false }
    assert.equal(renderStatus(empty), '🏢 office empty · nobody in yet · 11h19 agent-time today')
  })

  test('--project filters desks, projects and rebuilds totals', () => {
    const live = plain(SAMPLE, { view: 'live', width: 100, project: 'ISLAND' })
    assert.match(live, /^THE OFFICE · live · island · Mon 26 Oct/i)
    assert.ok(live.includes('6 desks') && !live.includes('md2epub') && !live.includes('meeting room'))
    const week = plain(SAMPLE, { view: 'week', width: 100, project: 'island' }).split('\n')
    const island = SAMPLE.projects.find((p) => p.name === 'island-tour-3d')
    assert.ok(week[1].startsWith(`43h`), week[1])
    assert.ok(week[1].includes(`${island.sessions} sessions`))
    assert.deepEqual(sheetRows(week).map((l) => l.slice(0, 16)), ['• island-tour-3d'])
    assert.ok(!week.join('\n').includes('more room'))
  })

  test('toAnsi colors by role: 16-color SGR, Clawd in 256-color orange (16-color fallback on request); stripping it gives toPlain', () => {
    const lines = renderOffice(SAMPLE, { view: 'all', width: 100 })
    const ansi = toAnsi(lines)
    assert.ok(ansi.startsWith('\x1b[1;33mTHE OFFICE\x1b[0m'))
    const codes = new Set([...ansi.matchAll(/\x1b\[([\d;]*)m/g)].map((m) => m[1]))
    for (const c of codes) assert.ok(c === '0' || Object.values(ROLE_ANSI).includes(c), `unexpected SGR ${c}`)
    for (const c of codes) assert.ok(c === '38;5;173' || /^\d+(;\d+)?$/.test(c) && !c.startsWith('38;'), `only Clawd uses 256 colors: ${c}`)
    assert.ok(ansi.includes('\x1b[38;5;173m▛▛█\x1b[0m'), 'Clawd is Claude orange (256-color 173)')
    assert.equal(ansi.replace(/\x1b\[[\d;]*m/g, ''), toPlain(lines))
    const ansi16 = toAnsi(lines, { colors: 16 })
    assert.ok(!ansi16.includes('38;5;') && ansi16.includes('\x1b[33m▛▛█\x1b[0m'), '16-color fallback')
    assert.equal(ansi16.replace(/\x1b\[[\d;]*m/g, ''), toPlain(lines))
    for (const r of Object.keys(ROLE_ANSI)) assert.ok(r in ROLE_ANSI_16 && !ROLE_ANSI_16[r].startsWith('38;'), r)
  })

  test('ROLE_HEX has a dark and a light hex for every role', () => {
    assert.deepEqual(Object.keys(ROLE_HEX).sort(), Object.keys(ROLE_ANSI).sort())
    for (const r of Object.keys(ROLE_ANSI)) {
      assert.match(ROLE_HEX[r].dark, /^#[0-9a-f]{6}$/)
      assert.match(ROLE_HEX[r].light, /^#[0-9a-f]{6}$/)
    }
  })

  test('every role has a terminal look for the desktop pane: theme keys and basic names, never a hex', () => {
    assert.deepEqual(Object.keys(ROLE_TERM).sort(), Object.keys(ROLE_ANSI).sort())
    for (const [r, look] of Object.entries(ROLE_TERM)) {
      assert.ok(look.dimColor === true || /^[a-z][A-Za-z]+$/.test(look.color), `${r}: ${JSON.stringify(look)}`)
    }
    assert.equal(ROLE_TERM.title.color, 'text', 'titles follow the theme: dark on a light terminal')
    assert.equal(ROLE_TERM.clawd.color, 'claude', 'Clawd is Claude orange in every theme')
  })

  test('the renderer is pure: no node:* imports in it or in what it imports', () => {
    for (const f of ['ascii.mjs', 'model.mjs', 'format.mjs', 'activity.mjs', 'cast.mjs']) {
      const src = fs.readFileSync(path.join(ROOT, 'plugin', 'lib', f), 'utf8')
      assert.ok(!/require\(|\bimport\s*\(/.test(src), `${f}: no require() and no dynamic import()`)
      // every specifier, bare ones too (`from 'fs'` would break the desktop mod as surely as `from 'node:fs'`)
      for (const m of src.matchAll(/(?:^|\s)(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)) {
        const spec = m[1] ?? m[2]
        assert.ok(['./format.mjs', './activity.mjs', './model.mjs', './cast.mjs'].includes(spec), `${f} imports ${spec}`)
      }
    }
  })
})

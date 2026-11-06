// The cast (lib/cast.mjs): every character's pixel sprites and text glyphs, and how the drawings seat them.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_IDS, CAST, agentId } from '../plugin/lib/cast.mjs'
import { displayWidth } from '../plugin/lib/format.mjs'
import { CAST_ROLES, ROLE_HEX, agentShares, castRole, normalizeFacts } from '../plugin/lib/model.mjs'
import { ROLE_ANSI, ROLE_ANSI_16, ROLE_TERM, renderOffice, renderStatus, toPlain } from '../plugin/lib/ascii.mjs'
import { FIGURE_EYES, POSES, SPRITES, castFigure, castPicker, pose } from '../plugin/lib/svg-kit.mjs'
import { renderSvg } from '../plugin/lib/svg.mjs'
import { SAMPLE, clone } from './helpers/facts.mjs'

/** The sample office with a desk for every agent of the cast, and two Claude accounts. */
function castOffice() {
  const f = clone(SAMPLE)
  const plan = [['codex', null], ['gemini', null], ['claude', 'work'], ['cursor', null], ['kimi', null], ['grok', null], ['claude', 'main']]
  f.live.desks.forEach((d, i) => {
    const [agent, account] = plan[i % plan.length]
    Object.assign(d, { agent, account })
    for (const it of d.interns) it.agent = agent
  })
  f.totals.agents = { claude: 900, codex: 400, gemini: 200, cursor: 60, kimi: 40, grok: 30 }
  f.accounts = [{ agent: 'claude', label: 'main', minutes: 600, sessions: 20, live: 1 }, { agent: 'claude', label: 'work', minutes: 300, sessions: 8, live: 1 }]
  return f
}

describe('the cast', () => {
  test('six characters, Clawd first, each with its own name, tag and colors', () => {
    assert.deepEqual(AGENT_IDS, ['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok'])
    assert.deepEqual(AGENT_IDS.map((a) => CAST[a].who), ['Clawd', 'Dex', 'Gem', 'Caret', 'Mooni', 'Rok'])
    assert.equal(new Set(AGENT_IDS.map((a) => CAST[a].tag)).size, AGENT_IDS.length)
    assert.equal(new Set(AGENT_IDS.map((a) => CAST[a].hex.dark)).size, AGENT_IDS.length, 'no two characters share a color')
    assert.equal(agentId('codex'), 'codex')
    for (const v of [undefined, null, '', 'gpt', 'constructor', 7]) assert.equal(agentId(v), 'claude', String(v))
  })

  test("every sprite is on Clawd's skeleton: 17 × 10 (mini 11 × 6, micro 7 × 5), drawn only in its legend, two eyes", () => {
    for (const a of AGENT_IDS) {
      const ch = CAST[a]
      const known = new Set(['.', ...Object.keys(ch.legend), ...ch.eyes])
      for (const [name, rows, w, h] of [['sprite', ch.sprite, 17, 10], ['mini', ch.mini, 11, 6], ['micro', ch.micro, 7, 5]]) {
        assert.equal(rows.length, h, `${a} ${name} rows`)
        for (const row of rows) {
          assert.equal(row.length, w, `${a} ${name}: "${row}"`)
          for (const c of row) assert.ok(known.has(c), `${a} ${name}: '${c}' has no color`)
        }
      }
      for (const e of ch.eyes) assert.ok(Object.hasOwn(ch.legend, e), `${a}: eye ${e} needs the color behind it`)
      const eyePixels = ch.sprite.join('').split('').filter((c) => ch.eyes.includes(c)).length
      assert.ok(eyePixels >= 2, `${a} has eyes`)
      // the skeleton: arms only on rows 4–5, legs only on rows 8–9, nothing outside the body's columns elsewhere
      ch.sprite.forEach((row, y) => {
        for (const x of [0, 1, 15, 16]) if (row[x] !== '.') assert.ok(y === 4 || y === 5, `${a}: (${x}, ${y}) is not an arm`)
      })
      for (const hex of [...Object.values(ch.legend), ch.eye, ...[].concat(ch.arm)]) assert.match(hex, /^#[0-9a-f]{6}$/, a)
    }
  })

  test('every character has every pose, its intern and its micro figure as a sprite', () => {
    for (const a of AGENT_IDS) {
      for (const p of [...Object.keys(POSES), 'I0', 'I1', 'M', 'Mw']) assert.ok(SPRITES[pose(a, p)], `${a} ${p}`)
    }
    assert.equal(pose('claude', 'T0'), 'cT0', "Clawd's sprites keep their names")
    assert.equal(pose('nobody', 'L'), 'cL')
  })

  test("Dex's eyes stay on its screen, whichever way a pose looks (its reach is 1 px)", () => {
    const rects = (svg, fill) => [...svg.matchAll(new RegExp(`<path fill="${fill}" d="([^"]+)"`, 'g'))]
      .flatMap((m) => [...m[1].matchAll(/M(-?\d+) (-?\d+)h(\d+)v(\d+)/g)].map((r) => r.slice(1).map(Number)))
    const { legend, eye } = CAST.codex
    for (const p of Object.keys(POSES)) {
      const svg = SPRITES[pose('codex', p)]({ id: 't-', animate: false, defs: new Map() })
      const screen = rects(svg, legend.K)
      const eyes = rects(svg, eye)
      assert.ok(screen.length && eyes.length >= 2, p)
      for (const [x, y, w, h] of eyes) {
        assert.ok(screen.some(([sx, sy, sw, sh]) => x >= sx && y >= sy && x + w <= sx + sw && y + h <= sy + sh), `${p}: an eye at (${x}, ${y}) is off the screen`)
      }
    }
  })

  test("on the live floors too: Dex's eyes stay on its screen in every eye frame, sunk or risen with its body", () => {
    const rects = (svg, fill) => [...svg.matchAll(new RegExp(`<path fill="${fill}" d="([^"]+)"`, 'g'))]
      .flatMap((m) => [...m[1].matchAll(/M(-?\d+) (-?\d+)h(\d+)v(\d+)/g)].map((r) => r.slice(1).map(Number)))
    const ctx = { id: 't-', animate: false, night: true, defs: new Map() }
    const screen = rects(SPRITES['dx-lit'](ctx), CAST.codex.legend.K)
    // the eye sprites Dex's frames use (its own shape: its reach is 1 px)
    const shape = /href="#t-eye(\d+)-/.exec(castFigure(ctx, 'codex', 'look', 'k', 0, 0))[1]
    assert.ok(screen.length)
    for (const [name, spec] of Object.entries(FIGURE_EYES)) {
      const eyes = rects(SPRITES[`eye${shape}-${name}`](ctx), 'currentColor')
      const sink = spec.sink ?? 0
      assert.ok(eyes.length >= 2, name)
      for (const [x, y, w, h] of eyes) {
        assert.ok(screen.some(([sx, sy, sw, sh]) => x >= sx && y >= sy + sink && x + w <= sx + sw && y + h <= sy + sink + sh), `${name}: an eye at (${x}, ${y}) is off the screen`)
      }
    }
  })

  test('text heads: one column per char, the 7-bit forms as wide; every character has a role in every palette', () => {
    for (const a of AGENT_IDS) {
      for (const [u, ascii] of Object.values(CAST[a].face)) {
        assert.equal([...u].length, ascii.length, `${a}: ${u} / ${ascii}`)
        for (const ch of u) assert.equal(displayWidth(ch), 1, `${a}: ${ch}`)
        assert.match(ascii, /^[\x20-\x7e]+$/)
      }
    }
    assert.deepEqual(CAST_ROLES, ['clawd', 'codex', 'gemini', 'cursor', 'kimi', 'grok'])
    for (const r of CAST_ROLES) {
      assert.ok(ROLE_HEX[r] && ROLE_ANSI[r] && ROLE_ANSI_16[r] && ROLE_TERM[r], r)
      assert.match(ROLE_ANSI_16[r], /^(?:1;)?(?:3[0-7]|9[0-7])$/, `${r} is a basic color in 16-color mode`)
    }
    assert.equal(castRole('claude'), 'clawd')
    assert.equal(castRole('grok'), 'grok')
  })
})

describe('facts: agents and accounts', () => {
  test('a desk without an agent is Claude\'s; an unknown agent is Claude\'s; accounts are cleaned like any title', () => {
    const f = clone(SAMPLE)
    f.live.desks[0].agent = 'gpt-9'
    f.live.desks[1].account = 'w\x1b[31mork'
    f.projects[0].agents = { claude: 10, codex: '5', bogus: 3, gemini: -1 }
    const n = normalizeFacts(f)
    assert.equal(n.live.desks[0].agent, 'claude')
    assert.equal(n.live.desks[2].agent, 'claude')
    assert.equal(n.live.desks[1].account, 'work', 'the escape sequence is gone, whole')
    assert.deepEqual(n.projects[0].agents, { claude: 10, codex: 5 })
  })

  test('agentShares: busiest first, zeros out, an office with no split is all Claude', () => {
    assert.deepEqual(agentShares({ codex: 5, claude: 10, kimi: 0 }), [['claude', 10], ['codex', 5]])
    assert.deepEqual(agentShares(undefined, 42), [['claude', 42]])
    assert.deepEqual(agentShares({}, 0), [])
  })

  test('castPicker seats the cast by agent-time, deterministically; one agent fills every seat', () => {
    const pick = castPicker({ totals: { agents: { claude: 80, codex: 20 } } })
    const seats = Array.from({ length: 20 }, (_, i) => pick(i))
    assert.equal(seats.filter((a) => a === 'codex').length, 4)
    assert.equal(seats[0], 'claude', 'the busiest takes the first seat')
    assert.deepEqual(Array.from({ length: 40 }, (_, i) => pick(i)), [...seats, ...seats])
    assert.equal(castPicker({ totals: { agents: { gemini: 3 } } })(7), 'gemini')
    assert.equal(castPicker(null)(3), 'claude')
  })
})

describe('the office with every agent in it', () => {
  test('the pixel art seats each desk\'s own character, its interns and its account, and says who is who', () => {
    const svg = renderSvg(castOffice(), { view: 'live', width: 1100, animate: false })
    for (const tag of ['c', 'dx', 'gm', 'cu', 'km', 'gk']) assert.match(svg, new RegExp(`id="to-${tag}(?:-f-\\w+|T0|T1|L|R|H|D|B|A|Z|K0|K1)"`), `a ${tag} figure is drawn`)
    assert.match(svg, /id="to-kmI[01]"/, "Mooni's interns are minis of Mooni")
    for (const t of ['Dex · Codex', 'Gem · Gemini', 'Caret · Cursor', 'Mooni · Kimi', 'Rok · Grok', '@work', '@main']) assert.ok(svg.includes(t), t)
    assert.ok(svg.length <= 120_000)
  })

  test('an office of Claude alone draws as it always did: no legend of the cast, no account', () => {
    const svg = renderSvg(SAMPLE, { view: 'live', width: 1100, animate: false })
    assert.ok(!svg.includes('Dex') && !svg.includes('Clawd · Claude') && !svg.includes('accounts:'))
    assert.doesNotMatch(svg, /id="to-(?:dx|gm|cu|km|gk)/)
  })

  test('the text office: every head in its own role, quadrants only in a cast role, the account on the caption', () => {
    const f = castOffice()
    for (const width of [72, 100, 140]) {
      const lines = renderOffice(f, { view: 'live', width })
      const spans = lines.flat()
      for (const [t, r] of spans) if (/[▖▗▘▙▚▛▜▝▞▟]/.test(t)) assert.ok(CAST_ROLES.includes(r), `@${width} "${t}" is ${r}`)
      for (const [a, head] of [['codex', '▐>▌'], ['gemini', '▐*▌'], ['cursor', '▐│▌'], ['kimi', '▐(▌'], ['grok', '▐/▌']]) {
        assert.ok(spans.some(([t, r]) => r === a && t.includes(head)), `@${width} ${a} ${head}`)
      }
      const txt = toPlain(lines)
      assert.ok(txt.includes('@work') && txt.includes('@main'), `@${width} accounts`)
      if (width >= 100) assert.match(txt, /Dex\/Codex .*Rok\/Grok/, `@${width} who is who`)
    }
    const ascii = toPlain(renderOffice(f, { view: 'live', width: 100, ascii: true }))
    assert.match(ascii, /^[\x20-\x7e\n]*$/)
    assert.ok(ascii.includes('[>]') && ascii.includes('[/]'))
  })

  test('the history views name the crew by agent-time and the accounts; the status line counts the characters', () => {
    const txt = toPlain(renderOffice(castOffice(), { view: 'week', width: 120 }))
    assert.match(txt, /crew: Claude 15h00 · Codex 6h40 · Gemini 3h20 · Cursor 1h00 · Kimi 40m · Grok 30m/)
    assert.match(txt, /accounts: claude@main 10h00 · claude@work 5h00/)
    assert.ok(!toPlain(renderOffice(SAMPLE, { view: 'week', width: 120 })).includes('crew:'), 'Claude alone has no crew line')
    assert.match(renderStatus(castOffice(), { width: 200 }), /3 Clawd · 2 Dex · 2 Gem · 1 Caret · 1 Mooni · 1 Rok$/)
  })

  test('the month draws the crew as a table: a row per AI, busiest first, its agents (sessions) and agent-time', () => {
    const f = castOffice()
    const rows = toPlain(renderOffice(f, { view: 'month', width: 100 })).split('\n')
    const at = rows.indexOf('── the crew · 6 AIs · an agent is one session ──────────────────────────────────────────────────────')
    assert.ok(at > rows.findIndex((l) => l.startsWith('── what they did')), 'under what they did')
    assert.ok(at < rows.findIndex((l) => l.startsWith('★ ')), 'over the awards')
    assert.equal(rows[at + 1], '  AI              agents agent-h  share')
    assert.match(rows[at + 2], /^ {2}Claude {2}Clawd {7}28 {3}15h00 {2}█{20} {2}55%$/)
    // only Claude's accounts say how many sessions: the others' agents are unknown, and so is the total
    assert.deepEqual(rows.slice(at + 3, at + 8).map((l) => l.replace(/ +[█▉▊▋▌▍▎▏]+ +/, ' ').trim()),
      ['Codex   Dex          ·    6h40 25%', 'Gemini  Gem          ·    3h20 12%', 'Cursor  Caret        ·    1h00 4%', 'Kimi    Mooni        ·     40m 2%', 'Grok    Rok          ·     30m 2%'])
    assert.equal(rows[at + 8], '  all AIs              ·   27h10')
    const txt = rows.join('\n')
    assert.ok(!txt.includes('crew: ') && txt.includes('accounts: claude@main'), 'the table takes the crew line, the accounts stay')
    f.accounts.push({ agent: 'codex', label: null, minutes: 400, sessions: 5, live: 0 })
    for (const a of ['gemini', 'cursor', 'kimi', 'grok']) f.accounts.push({ agent: a, label: null, minutes: 1, sessions: 1, live: 0 })
    assert.ok(toPlain(renderOffice(f, { view: 'month', width: 100 })).includes('  all AIs             37   27h10'), 'every AI known: the agents add up')
    const narrow = toPlain(renderOffice(f, { view: 'month', width: 40 })).split('\n')
    const n = narrow.indexOf('── the crew · 6 AIs ────────────────────')
    assert.ok(n > 0 && narrow[n + 2].startsWith('  Claude       28   15h00  █'), 'the narrow list has it too, without the characters')
    assert.ok(narrow.every((l) => displayWidth(l) <= 40))
    assert.ok(!toPlain(renderOffice(f, { view: 'week', width: 100 })).includes('── the crew'), 'the week keeps its crew line')
  })
})

// PURE: the roof's props, the pixel art the skyline every building shares picks from (svg-kit skyline): its landmarks,
// which stand at the outer ends of the roof (a wind turbine, a flagpole, a cell tower, a lattice antenna, the water
// tower); its structures (the stair bulkhead, a greenhouse, a solar rack, a satellite dish, a planter garden); its life
// (loungers under a parasol, party lights, a grill, a telescope, a pigeon coop, the AC unit, vents, a chimney); the lean
// roof's bare mast and the pigeons on the coping. Each is registered here by name with its box and its kind (svg-kit
// defineRoofProps) and drawn as char maps lit from the upper left, its lamps, LEDs and beacons lit at night only; the
// blades, the flag, the smoke and the twinkles move only when the drawing animates. Lib/svg.mjs imports this file. No
// node:* imports (the desktop mod loads lib/svg.mjs, which imports this file).
import { aO, aT, defineRoofProps, mapRects, paint, sprite } from './svg-kit.mjs'

const rows = (n, row) => Array(n).fill(row)

// ---------------------------------------------------------------- the landmarks
// a point light w × h at (x, y): at night lit with a soft cross-shaped halo (and blinking when `dur`), by day an unlit lens
const lamp = (c, x, y, w, h, on, off, dur) => c.night
  ? `<g>${paint([[x - 1, y, w + 2, h, `${on}/.45`], [x, y - 1, w, h + 2, `${on}/.45`], [x, y, w, h, on]])}${dur ? aO(c, '1;.15', dur) : ''}</g>`
  : paint([[x, y, w, h, off]])
// a red aviation beacon
const beacon = (c, x, y, w, h, dur = 1.6) => lamp(c, x, y, w, h, '#ff5a4a', '#9a4a40', dur)
// two frames in turn (blades, a ripple): static renders show the first
const flip = (c, a, b, dur) => c.animate ? `<g>${a}${aO(c, '1;0', dur)}</g><g opacity="0">${b}${aO(c, '0;1', dur)}</g>` : a

// The wind turbine (13 × 24): a white tube mast (a service door at its foot) on a concrete pad, the grey nacelle on top
// with its aviation light, the spinner facing front-left and the three blades turning in front of it: an upside-down Y
// (the static frame), then a Y, every 0.25 s.
const TURB = [
  '', '', '', '', '', '',
  '.......nnnn', '.......nnnnN', '.......NNNd', '.........ws..', '.........ws..', '.........ws..', '.........ws..',
  '.........ws', '.........ws', '.........ws', '.........ws', '.........ws', '.........ds', '.........ds',
  '........fwsF.', '.......ffffFF', '.......ffffFF', '.......ffffFF',
]
const TURB_LEG = { n: '#c3c9d0', N: '#959ca5', w: '#d3d8de', s: '#a3aab3', d: '#767d86', f: '#b29d7d', F: '#8a765c' }
const BLADE_L = ['......W', '......W', '......W', '......W', '......W', '......W', '', '', '.....W.W', '....W...W', '...W.....W', '..W.......W', '.W.........W']
const BLADE_Y = ['', '', '.W.........W', '..W.......W', '...W.....W', '....W...W', '.....W.W', '', '', '......W', '......W', '......W', '......W', '......W', '......s']
const HUB = ['', '', '', '', '', '', '......W', '.....WWs', '......s']
const BLADE_LEG = { W: '#f6f7f8', s: '#a3aab3' }

// The flagpole (12 × 22): a gilt ball finial, a slim pole, the office's flag (neon yellow over coral) rippling in two
// frames; a little floodlight clamped to the pole shines up at it at night.
const POLE = ['.G', 'Ggh', '.h', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.p', '.pdd', '.p', '.p', '.p', '.p']
const POLE_LEG = { G: '#fff0a0', g: '#e7b934', h: '#a8801e', p: '#b4bac2', d: '#5d6168' }
const FLAG_A = ['', '', '', '..YLY...LYy', '..YLYyyYLYyy', '..YLYyyYLYyy', '..CCCyyYCCcy', '..CCCccCCCcc', '..CCCccCCCcc', '.....ccC...c']
const FLAG_B = ['', '', '', '..Y..LYY..LY', '..YyyLYYyyLY', '..YyyLYYyyLY', '..CyyCCCyyCC', '..CccCCCccCC', '..CccCCCccCC', '...cc...cc']
const FLAG_LEG = { Y: '#ffcf2e', y: '#d9a21c', L: '#ffe680', C: '#ff7448', c: '#d4532e' }

// The cell tower (13 × 26): a monopole, three white panel antennas on a frame around its top, a microwave dish lower
// down, an equipment cabinet at its foot whose status light glows green at night.
const CELL = [
  '', '......Pq', '.Ws...Pq..ws', '.Ws..WWs..ws', 'kWskkWWskkwsk', '.Ws..WWs..ws', '.Ws..WWs..ws',
  'kWskkWWskkwsk', '.dd..WWs..dd', '.....ddd', '.....Ppq', '.....Ppq', '.....Ppq', '.....Ppq..WW',
  '.....PpqqWWWs', '.....PpqqWwws', '.....Ppq..ss', '.....Ppq', '.....Ppq', '.....Ppq.bbbb', '.....Ppq.bBBB',
  '.....Ppq.bBBB', '.....Ppq.bBBB', '....kPpqkbBBB', '....kPpqkbBBB', '....kPpqkbBBB',
]
const CELL_LEG = { P: '#a4a9b0', p: '#8a8f96', q: '#6d7279', W: '#eef0f2', w: '#d3d8de', s: '#a9b0b8', d: '#5d6168', k: '#4a4e55', b: '#b8b2a4', B: '#8f897d' }

// The lattice antenna (7 × 23): its beacon on a whip with two dipoles, over a lattice tapering in three sections (lit left
// leg, shaded right leg, rungs and diamond braces), painted in aviation bands, one per section: coral, white, coral.
const ANT = [
  '', '...M', '...m', 'aaAm', '...m', '...mAaa', '...m',
  '..OOo', '..O.o', '..Oxo', '..O.o', '..Oxo', '.E.z.e', '.E...e', '.Ez.ze', '.E...e', '.E.z.e',
  'O.x.x.o', 'O.....o', 'Ox...xo', 'O.x.x.o', 'O..x..o', 'OOOOOOo',
]
const ANT_LEG = { M: '#a4a9b0', m: '#8a8f96', a: '#6d7279', A: '#8a8f96', O: '#e0603f', o: '#a8452c', x: '#b9502f', E: '#ece6da', e: '#b5ad9f', z: '#a49c8e' }

const LANDMARKS = {
  turbine: {
    w: 13, h: 24, kind: 'tall',
    draw: (c) => sprite(TURB, TURB_LEG) + flip(c, sprite(BLADE_L, BLADE_LEG), sprite(BLADE_Y, BLADE_LEG), 0.5) + sprite(HUB, BLADE_LEG) + beacon(c, 10, 5, 1, 1, 1.2),
  },
  flag: {
    w: 12, h: 22, kind: 'tall',
    draw: (c) => sprite(POLE, POLE_LEG) + lamp(c, 2, 16, 2, 1, '#fff3c0', '#8a8f96') + flip(c, sprite(FLAG_A, FLAG_LEG), sprite(FLAG_B, FLAG_LEG), 0.8),
  },
  cell: {
    w: 13, h: 26, kind: 'tall',
    draw: (c) => sprite(CELL, CELL_LEG) + beacon(c, 6, 0, 2, 1) + lamp(c, 10, 20, 1, 1, '#7dff9a', '#3e6b4a'),
  },
  antenna: {
    w: 7, h: 23, kind: 'tall',
    draw: (c) => sprite(ANT, ANT_LEG) + beacon(c, 3, 0, 1, 1, 1.6),
  },
}

// ---------------------------------------------------------------- the structures

const WARM = '#ffd98a'
const HOT = '#fff3c0'
const layers = (maps, leg, extra = []) => paint([...maps.flatMap((m) => mapRects(m, leg)), ...extra])
// a light's halo: translucent rects in its color, drawn over it
const glow = (fill, rects) => paint(rects.map(([x, y, w, h]) => [x, y, w, h, fill]))

// The greenhouse (17 × 17). A white frame and a stone knee wall; the glass, its right panes in shade; the mullions, a lamp
// hung from the ridge, a tomato vine, a round bush and seedlings in flower. At night (h) the lamp lights the glass round
// it; by day (s) the glass catches two streaks of sky.
const GREENHOUSE = [
  [
    '........w', '.......www', '......wwwww', '.....wwwwwww', '....wwwwwwwww', '...wwwwwwwwwww', '..wwwwwwwwwwwww', '.wwwwwwwwwwwwwww',
    'wwwwwwwwwwwwwwwww', '.wwwwwwwwwwwwwww', '.wwwwwwwwwwwwwww', '.wwwwwwwwwwwwwww', '.wwwwwwwwwwwwwww', 'ccccccccccccccccc',
    '.BBBBBBBBBBBBBBB', '.BBBBBBBBBBBBBBB', '.BBBBBBBBBBBBBBB',
  ],
  [
    '', '', '.......GGG', '......GGGGG', '.....GGGGGGG', '....GGGGGGGGg', '...GGGGGGGGGgg', '..GGGGGGGGGGggg', '',
    '..GGGGGGGGGGggg', '..GGGGGGGGGGggg', '..GGGGGGGGGGggg', '..BBBBBBBBBBBBB',
  ],
  [
    '', '', '', '.......mmm', '.....m..o..m', '.....m.s...m', '...p.ms....m', '..pppm.....m', '.....m.....m',
    '..pppm.ppp.m.s', '..pppmpppppms.p', '..pppmpppppmppp',
  ],
  ['', '', '', '', '......hhhhh', '.......hhh', '...P', '..P.r', '', '..r....PP', '...P..P..P', '..r.........y.y'],
]
const greenhouseLeg = (night) => ({
  w: '#e6e1d6', c: '#b29d7d', B: '#5a4334', m: '#cfc9bc',
  ...(night
    ? { G: WARM, g: '#efbf63', h: HOT, o: HOT, p: '#4f3a22', P: '#9a6c34' }
    : { G: '#a9e0ea', g: '#86c6d8', s: '#e8f8fb', o: '#a4a9b0', p: '#4f7f34', P: '#9ab86a', r: '#e0503c', y: '#ffcf2e' }),
})

// The solar rack (24 × 14). An aluminium frame tilted toward the sun, its bottom edge and its side in shade, legs on a
// ground rail, an inverter under it; then its cells, deep blue; then the light grid between them, the inverter's LED and
// (by day, s) the sky's reflection on the top cells.
const SOLAR = [
  [
    '', '.......fffffffffffffffff', '......fffffffffffffffffu', '.....fffffffffffffffffu', '....fffffffffffffffffu',
    '...fffffffffffffffffu.l', '..fffffffffffffffffu.l', '.FFFFFFFFFFFFFFFFFu..l', '...l....iii....l.....l', '...l....iiI....l.....l',
    '...l....iII....l.....l', '.lllllllllllllllllllllll', '.lllllllllllllllllllllll', '.lllllllllllllllllllllll',
  ],
  ['', '', '.......bbbbbbb.bbbbbbb', '......bbbbbbb.bbbbbbb', '.....ggggggg.ggggggg', '....bbbbbbb.bbbbbbb', '...bbbbbbb.bbbbbbb'],
  ['', '', '.......ss.g.......g', '......s..g.......g', '', '.......g.......g', '......g.......g', '', '', '.........e'],
]
const solarLeg = (night) => ({
  f: '#a4a9b0', F: '#5d6168', u: '#3a3d44', l: '#6d7279', i: '#8a8f96', I: '#5d6168',
  ...(night ? { b: '#1c2f63', g: '#3a5a9a', e: '#7dff9a' } : { b: '#2a4a9a', g: '#8fb4e8', e: '#3f6a3a', s: '#d8efff' }),
})

// The satellite dish (18 × 18). The bowl's back, a dark crescent; its rim, lit; its inside, in shade toward the upper
// left; then the arm holding the receiver out at its focus (up and to the right), the post on its foot with a yellow
// service tag.
const DISH = [
  ['', '', '', '.kkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk', 'kkkkkk', '.kkkkk', '..kkkkk', '..kkkkkkk', '....kkkkkk', '.....kkkk'],
  ['', '...rrrrr', '..rrrrrrr', '..rrrrrrrr', '..rrrrrrrrr', '..rrrrrrrrrr', '..rrrrrrrrrr', '...rrrrrrrrr', '....rrrrrrrr', '.....rrrrrrr', '......rrrrr'],
  ['', '', '...IIIII', '...IIIIii', '...IIIiiii', '...IIiiiiii', '...Iiiiiiii', '....iiiiiii', '.....iiiiii', '......iiiii'],
  [
    '', '.............nn', '............aIA', '...........a', '..........a', '.........a', '........a', '', '', '', '', '', '',
    '......aA', '......yA', '....aaaAAA', '....aaaAAA', '....aaaAAA',
  ],
]
const DISH_LEG = { k: '#5d6168', r: '#eef0f2', I: '#9aa0a8', i: '#c9cdd3', n: '#9aa0a8', a: '#6d7279', A: '#4a4e55', y: '#ffcf2e' }

// The garden (20 × 14). A round little tree, its trunk, the soil, the planter's lit rim and its two planks (its right side
// in shade); then the canopy's light and shade; then a tulip, a daisy, a sprig of lavender and the garden lantern.
const GARDEN = [
  [
    '...lllll', '..lllllll', '.lllllllll', '.lllllllll', '.lllllllll', '..lllllll', '....tt', '....tt',
    '.kkkkkkkkkkkkkkkkkk', 'wwwwwwwwwwwwwwwwwwwk', 'WWWWWWWWWvWWWWWWWWWk', 'WWWWWWWWWvWWWWWWWWWk', 'WWWWWWWWWvWWWWWWWWWk', 'WWWWWWWWWvWWWWWWWWWk',
  ],
  ['...LL', '..LLL', '.LL......d', '.L...L...d', '........dd', '..ddddddd'],
  [
    '', '', '', '..........r.r....hhh', '..........rrr....hHh', '...........l..y..hHh', '.......p...l.yty..h',
    '.......p...l..y...h', '.......l...l..l...h',
  ],
]
const gardenLeg = (night) => ({
  l: '#4f7f34', t: '#6b5032', k: '#4b382c', w: '#a37c4b', W: '#8a6840', v: '#6b5032', L: '#9ab86a', d: '#3a5f28',
  r: '#e0503c', y: '#ffcf2e', p: '#a77fe0', h: '#3a5f28', H: night ? HOT : '#a4a9b0',
})

const STRUCTURES = {
  greenhouse: {
    w: 17, h: 17, kind: 'mid',
    // at night its lamp lights the glass, the plants dark against it, and a warm glow hugs it (breathing when animated)
    draw: (c) => (c.night ? `<g>${glow(`${WARM}/.18`, [[-1, 7, 19, 7], [2, 4, 13, 3], [5, 1, 7, 3]])}${aO(c, '1;.5', 2.6)}</g>` : '') +
      layers(GREENHOUSE, greenhouseLeg(c.night)),
  },
  solar: {
    w: 24, h: 14, kind: 'mid',
    // by day a sparkle of sun glints on it now and then (when animated); at night the inverter's LED blinks green
    draw: (c) => layers(SOLAR, solarLeg(c.night)) + (c.night
      ? `<g>${glow('#7dff9a/.35', [[8, 9, 3, 1], [9, 8, 1, 3]])}${aO(c, '1;.2', 1.6)}</g>`
      : c.animate ? `<g opacity="0">${paint([[8, 0, 1, 5, '#fff'], [6, 2, 5, 1, '#fff']])}${aO(c, '0;0;0;0;1;0', 4)}</g>` : ''),
  },
  dish: {
    w: 18, h: 18, kind: 'mid',
    // at night a red LED glows on the receiver (blinking when animated)
    draw: (c) => layers(DISH, DISH_LEG) + (c.night ? `<g>${glow('#ff5a4a/.35', [[12, 2, 3, 1], [13, 1, 1, 3]])}${paint([[13, 2, 1, 1, '#ff8a70']])}${aO(c, '1;1;0', 1.5)}</g>` : ''),
  },
  garden: {
    w: 20, h: 14, kind: 'mid',
    // at night the lantern glows and, when animated, a firefly blinks by the tree
    draw: (c) => layers(GARDEN, gardenLeg(c.night)) + (c.night ? glow(`${WARM}/.25`, [[16, 4, 5, 2], [17, 3, 3, 4]]) : '') +
      (c.night && c.animate ? `<g>${paint([[11, 1, 1, 1, '#e8ff7a']])}${aO(c, '0;1;0;1;1', 2.2)}</g>` : ''),
  },
}

// ---------------------------------------------------------------- the roof's life

// A light's glow: a soft plus around a 1 × n bulb at (x, y) (its sides and the pixel under it), cheaper and rounder
// than a box.
const halo = (x, y, n, f) => [[x - 1, y, 3, n, f], [x, y + n, 1, 1, f]]

// (1) Two loungers under a coral-and-cream parasol (20 × 14): the canopy lit from the left, a scalloped valance, a steel
// pole; teal canvas on wooden frames, their backs raised at the outer ends. A little lantern hangs from a rib: unlit
// glass by day, a warm glow at night.
const CHAIRS = [
  '.........k..........',
  '......RRCCCrr.......',
  '....CCRRCCCrrcc.....',
  '...RCCRRCCCrrccr....',
  '...r..rr.p.rr.kr....',
  '.........p....n.....',
  '.........p..........',
  'C........p.........C',
  'Aa.......p........aA',
  '.Aa......p.......aA.',
  '..Aaaaaa.p..aaaaaaA.',
  '.wwwwwwW.p..Wwwwwwww',
  '.w....W..p...W....w.',
  '........ppp.........',
]
const CHAIRS_LEG = {
  k: '#6b5032', R: '#e8735f', r: '#b9503f', C: '#f6ead0', c: '#d6c5a3', p: '#a4a9b0', n: '#4a4e55',
  a: '#4fb3aa', A: '#2f7f7a', w: '#a37c4b', W: '#6b5032',
}
const chairs = (c) => sprite(CHAIRS, CHAIRS_LEG) +
  paint(c.night ? [...halo(14, 6, 2, '#ffd98a/.3'), [14, 6, 1, 1, '#ffd98a'], [14, 7, 1, 1, '#fff3c0']] : [[14, 6, 1, 2, '#c9c2ad']])

// (2) A string of bulbs sagging between two thin poles (22 × 12). Each bulb is 1 × 2 under the wire: by day tinted
// glass, by night lit warm, coral, mint and sky with a soft glow; two of them sparkle in turn.
const LIGHTS = [
  'P....................P',
  'pkk................kkp',
  'p..kk............kk..p',
  'p....kkk......kkk....p',
  'p.......kkkkkk.......p',
  ...Array(7).fill('p....................p'),
]
const LIGHTS_LEG = { P: '#a4a9b0', p: '#6d7279', k: '#3a3d44' }
// each bulb: x, the wire's row above it, its color (an index into the lit, halo and day lists)
const BULBS = [[3, 2, 0], [6, 3, 1], [9, 4, 2], [12, 4, 0], [15, 3, 3], [18, 2, 1]]
const BULB_LIT = ['#ffd98a', '#ff8a70', '#8ee8b0', '#86ccff']
const BULB_HALO = ['#ffd98a/.3', '#ffd98a/.3', '#9ee8e0/.3', '#9ee8e0/.3']
const BULB_DAY = ['#d6bb7e', '#d38f80', '#8fc2a2', '#8fb3cf']
function lights(c) {
  const halos = []
  const lit = []
  for (const [x, w, k] of BULBS) {
    if (c.night) halos.push(...halo(x, w + 1, 2, BULB_HALO[k]))
    lit.push([x, w + 1, 1, 2, (c.night ? BULB_LIT : BULB_DAY)[k]])
  }
  // the sparkle: a hot white core in turn on two bulbs
  const spark = (x, y, v, d) => `<g opacity="0">${paint([[x, y, 1, 2, '#fff3c0']])}${aO(c, v, d)}</g>`
  return sprite(LIGHTS, LIGHTS_LEG) + paint([...halos, ...lit]) +
    (c.night && c.animate ? spark(6, 4, '0;1;0;0', 1.9) + spark(15, 4, '0;0;0;1', 1.5) : '')
}

// (3) A red kettle grill on three legs (9 × 14): a domed lid with a wooden handle, a steel rim, the bowl with an ash
// vent; by night its embers glow through the vent (flickering), and a wisp of smoke rises from the lid.
const GRILL = [
  '.........',
  '.........',
  '...kkk...',
  '..HHRRr..',
  '.HRRRRRr.',
  'RRRRRRRrr',
  'ggggggggg',
  'RRRRRRRrr',
  '.rRlllRr.',
  '..rrrrr..',
  '..l.l.l..',
  '.l..l..l.',
  '.l..l..l.',
  'l...l...l',
]
const GRILL_LEG = { k: '#6b5032', H: '#ee8a72', R: '#c4463a', r: '#8f2f28', g: '#a4a9b0', l: '#4a4e55' }
function grill(c) {
  let s = sprite(GRILL, GRILL_LEG)
  if (c.night) {
    const embers = paint([[2, 7, 5, 3, '#ff8a3a/.35'], [3, 8, 3, 1, '#ffc23a']])
    s += c.animate ? `<g>${embers}${aO(c, '1;.6;1;.8', 1.1)}</g>` : embers
  }
  const wisp = paint([[5, 1, 1, 1, c.night ? '#9aa0a8' : '#fff'], [6, 0, 1, 1, c.night ? '#9aa0a8' : '#fff']])
  return s + (c.animate
    ? `<g>${wisp}${aT(c, '0 0;0 -1;-1 -2;-1 -3', 2)}${aO(c, '.8;.6;.35;0', 2)}</g>`
    : `<g opacity=".6">${wisp}</g>`)
}

// (4) A brass telescope on a wooden tripod (13 × 13), aimed up and right; by night a star twinkles where it points
// (just above its box).
const SCOPE = [
  '..........BB.',
  '........HHLBb',
  '......HHmmBb.',
  '....HHmmDDb..',
  '..HHmmDD.....',
  'emmmDD.......',
  'eDD..s.......',
  '.....s.......',
  '....w.W......',
  '...w..W.W....',
  '..w...W..W...',
  '.w....W...W..',
  'w.....W....W.',
]
const SCOPE_LEG = {
  H: '#f2d27a', m: '#d9a441', D: '#9a6f22', B: '#b07f2a', b: '#7d5a1e', L: '#3a4a5e', e: '#4a4e55', s: '#5d6168',
  w: '#a37c4b', W: '#6b5032',
}
function scope(c) {
  const s = sprite(SCOPE, SCOPE_LEG)
  if (!c.night) return s
  const star = paint([[11, -3, 3, 1, '#fff3c0/.45'], [12, -4, 1, 3, '#fff3c0/.45'], [12, -3, 1, 1, '#fff3c0']])
  return s + (c.animate ? `<g>${star}${aO(c, '1;.25;1;1', 1.8)}</g>` : star)
}

// (5) A wooden pigeon coop on legs (14 × 14): a gable roof in weathered green, a plank front with a wire-mesh window and
// a dark hole over a landing board. A pigeon perches on the roof's left slope, looking out (animated, it bobs its head).
const COOP = [
  '..............',
  '..............',
  '..Nggg........',
  '..gnnnoRR.....',
  '...TTTTRRRR...',
  '.TTTTTTRRRRRR.',
  '..WWWWWWWWWW..',
  '..wnonowwoowW.',
  '..wnonowwoowW.',
  '..WWWWWWpppppp',
  '...W......W...',
  '...W......W...',
  '...W......W...',
  '...W......W...',
]
const COOP_LEG = {
  N: '#6fa59a', g: '#aab0be', n: '#7c8292', o: '#2e2620', T: '#6aa486', R: '#3f6a56', w: '#a37c4b', W: '#6b5032',
  p: '#c4a06a',
}
function coop(c) {
  // the head and beak, apart so they can bob
  const head = paint([[1, 1, 2, 1, '#7c8292'], [1, 2, 1, 1, '#7c8292'], [0, 2, 1, 1, '#2e2620']])
  return sprite(COOP, COOP_LEG) + (c.animate ? `<g>${head}${aT(c, '0 0;0 0;0 0;-1 1;0 0', 1.8)}</g>` : head)
}

const LIFE = {
  chairs: { w: 20, h: 14, kind: 'small', draw: chairs },
  lights: { w: 22, h: 12, kind: 'small', draw: lights },
  grill: { w: 9, h: 14, kind: 'small', draw: grill },
  telescope: { w: 13, h: 13, kind: 'small', draw: scope },
  coop: { w: 14, h: 14, kind: 'small', draw: coop },
}

// ---------------------------------------------------------------- the roof's own props, redrawn

// The water tower (16 × 24). Wood first: the staves (lit left, grooved, shaded right) under the eave's shadow, the deck.
// Then the steel: a slate cone lit from the left with a ball finial and a hatch, the brim, two hoops, a ladder up to the
// hatch, the legs with knee braces up to the riser pipe between them.
const TOWER_WOOD = [...rows(8, ''), '.vvvvvvvvvvvvvk.', ...rows(7, '.wLLvwwvWWvWkkk.'), 'vvvvvvvvvvvvvvvk']
const TOWER_STEEL = [
  '.......Ff.......', '......Aabb......', '.....Aaabbb.....', '....Aaaabbbb....', '...Aaaaabbbbb...', '..Aaaaaabbboob..',
  '.Aaaaaaabbbeebb.', 'eeeeeeeeeeeeeeee', '...........q.q..', '...........qQq..', '.hHHhhhhhhhqgqg.', '...........q.q..',
  '...........qQq..', '...........q.q..', '.hHHhhhhhhhqgqg.', '...........qQq..', '................', '.eeeeeeeeeeeeee.',
  '..qg..xrRx..qg..', '..qg.x.rR.x.qg..', '..qgx..rR..xqg..', '..qg...rR...qg..', '..qg...rR...qg..', '..qg...rR...qg..',
]
const TOWER_LEG = {
  w: '#a37c4b', L: '#bf955c', W: '#8a6840', v: '#6b5032', k: '#4b3a2c', F: '#c4c9cf', f: '#6d7279', A: '#8a8f96',
  a: '#6d7279', b: '#4a4e55', o: '#5d6168', e: '#2b2e33', H: '#a4a9b0', h: '#6d7279', g: '#4a4e55', q: '#8a8f96',
  Q: '#c4c9cf', x: '#4a4e55', r: '#6d7279', R: '#4a4e55',
}

// The stair bulkhead (22 × 18). Base: a stack on the roof, the stone cap (lit top, its face, its shadow on the wall), the
// brick wall lit on the left. Then the dark parts (door frame, the vent's slots, a few darker bricks), the steel (door
// leaf, the lamp's hood and cage, louvres), and the lights (the lamp's bulb, the door's window) with a brass handle.
const HUT_BASE = [
  '...............ttts...', '................pP....', '................pP....', 'SSSSSSSSSSSSSSSSSSSSSc', 'cccccccccccccccccccccC',
  '.mmmmmmmmmmmmmmmmmmmm.', ...rows(12, '.lbbbbbbbbbbbbbbbbbbm.'),
]
const HUT_DARK = [
  ...rows(7, ''), '...BB............BB...', '', ...rows(2, '......ffffff..........'),
  '..BB..ffffff...ffff...', ...rows(2, '......ffffff...ffff...'), '......ffffff......BB..', '..BB..ffffff..BB......',
  ...rows(2, '......ffffff..........'),
]
const HUT_STEEL = [...rows(6, ''), '.......hhhh...........', '.......h..h...........', '........hh............', '',
  '.......Oooo....GGGG...', '.......Oooo...........',
  '.......Oooo....GGGG...', ...rows(5, '.......Oooo...........')]
const HUT_LIT = [...rows(7, ''), '........YY............', ...rows(3, ''), '........nn............', '........nn............', '..........k...........']
const HUT_LEG = {
  t: '#8a8f96', s: '#4a4e55', p: '#6d7279', P: '#4a4e55', S: '#c4b08e', c: '#8a765c', C: '#5c4c3b', m: '#3a2b22',
  l: '#6b5040', b: '#5a4334', B: '#4b382c', g: '#26282c', f: '#26282c', h: '#5d6168', O: '#7d828a', o: '#5d6168',
  G: '#7d828a', k: '#c9a26b',
}

// The AC unit (15 × 10): a steel box (a lit lid, a lit left edge, a shaded side), a round fan grille and a louvre
// block, a copper line out of its side and down to the roof; the fan spins (two frames), a power LED glows at night.
const AC_BASE = [
  'TTTTTTTTTTTTt..', ...rows(2, 'aAAAAAAAAAAAs..'), 'aAAAAAAAAAAAscC', ...rows(3, 'aAAAAAAAAAAAs.c'), 'ddddddddddddd.c',
  ...rows(2, '.d.........d..c'),
]
const AC_SLOT = ['', '', '..vvv..vvvvv', '.vvvvv.vvvvv', '.vvvvv.vvvvv', '.vvvvv.vvvvv', '..vvv..vvvvv']
const AC_TOP = ['', '', '', '..kkk..uuuuu', '..kkk', '..kkk..uuuuu']
const AC_LEG = {
  T: '#c4c9cf', t: '#8a8f96', a: '#a4a9b0', A: '#8a8f96', s: '#6d7279', d: '#5d6168', c: '#c27c45', C: '#8a5228',
  v: '#4a4e55', k: '#2b2e33', u: '#b4b9c0',
}

// A mushroom vent (5 × 8): a galvanized dome lit on its crown, its mesh gap, the pipe.
const VENT = ['.TAa.', 'TAaab', 'bbbbd', '.kmk.', '.LPd.', '.LPd.', '.LPd.', '.LPd.']
const VENT_LEG = { T: '#dde1e6', A: '#a4a9b0', a: '#8a8f96', b: '#6d7279', d: '#4a4e55', k: '#2b2e33', m: '#5d6168', L: '#a4a9b0', P: '#7d828a' }

// A gooseneck vent (7 × 10): a pipe painted teal, bent over, its flared mouth and screen looking down at the roof.
const GOOSE = ['.TTTt..', 'Tpddpd.', 'Lp..pd.', 'Lp.Mppd', 'Lp.dkkd', 'Lp.....', 'Lp.....', 'cCc....', 'Lp.....', 'Lp.....']
const GOOSE_LEG = { T: '#a8d0c2', t: '#7aa596', L: '#7aa596', p: '#5a8577', d: '#3d5f55', M: '#a8d0c2', k: '#1e2826', c: '#6d7279', C: '#4a4e55' }

// The chimney (7 × 14): a terracotta pot on a stone cap; a brick shaft lit on the left, shaded on the right, dark
// courses and a few lighter bricks over it.
const CHIMNEY_BASE = ['..rrO..', '..oOO..', 'SSSSSSc', 'ccccccC', '.mmmmm.', ...rows(9, '.bbbbb.')]
const CHIMNEY_OVER = [
  ...rows(5, ''), '.l...d.', '.l.B.d.', '.ddddd.', '.lB..d.', '.l...d.', '.ddddd.', '.l..Bd.', '.l...d.', '.ddddd.',
]
const CHIMNEY_LEG = {
  r: '#e09a6a', o: '#b8693f', O: '#8a4a2c', S: '#c4b08e', c: '#8a765c', C: '#5c4c3b', m: '#3a2b22', b: '#6a4a38',
  l: '#7a5642', B: '#7a5642', d: '#47342a',
}

const REWORKED = {
  tower: { w: 16, h: 24, kind: 'tall', draw: () => layers([TOWER_WOOD, TOWER_STEEL], TOWER_LEG) },
  hut: {
    w: 22, h: 18, kind: 'mid',
    draw: (c) => {
      // the lamp and the door's window: lit at night under a soft, rounded halo, grey glass by day
      const lit = c.night ? { Y: '#fff3c0', n: '#ffd98a' } : { Y: '#b9bec4', n: '#3d4a5a' }
      const s = layers([HUT_BASE, HUT_DARK, HUT_STEEL, HUT_LIT], { ...HUT_LEG, ...lit })
      return s + (c.night ? paint([[6, 6, 6, 3, '#ffd98a/.25'], [7, 5, 4, 5, '#ffd98a/.25'], [5, 9, 8, 7, '#ffd98a/.08']]) : '')
    },
  },
  ac: {
    w: 15, h: 10, kind: 'small',
    draw: (c) => {
      const fan = '#8a8f96'
      const plus = paint([[3, 3, 1, 3, fan], [2, 4, 3, 1, fan]])
      const cross = paint([[2, 3, 1, 1, fan], [4, 3, 1, 1, fan], [3, 4, 1, 1, fan], [2, 5, 1, 1, fan], [4, 5, 1, 1, fan]])
      const spin = c.animate && c.roof !== 2 ? `<g>${plus}${aO(c, '1;0', 0.3)}</g><g opacity="0">${cross}${aO(c, '0;1', 0.3)}</g>` : plus
      const led = c.night ? paint([[11, 1, 1, 1, '#c8ffd4'], [10, 1, 3, 1, '#7dff9a/.35'], [11, 0, 1, 3, '#7dff9a/.35']]) : paint([[11, 1, 1, 1, '#3c6b48']])
      return layers([AC_BASE, AC_SLOT, AC_TOP], AC_LEG) + spin + led
    },
  },
  vent: { w: 5, h: 8, kind: 'small', twice: true, draw: () => sprite(VENT, VENT_LEG) },
  gooseneck: { w: 7, h: 10, kind: 'small', draw: () => sprite(GOOSE, GOOSE_LEG) },
  chimney: {
    w: 7, h: 14, kind: 'small',
    draw: (c) => {
      // a puff rising from the pot a pixel at a time, drifting left and thinning out
      const smoke = c.night ? '#9aa0a8' : '#ffffff'
      const puff = `<g opacity="0">${paint([[3, -3, 2, 1, smoke], [2, -2, 3, 1, smoke], [3, -1, 1, 1, smoke]])}` +
        `${aT(c, '0 0;0 -1;-1 -2;-1 -3;-2 -4;-2 -5;-3 -6', 2.8)}${aO(c, '.8;.8;.7;.5;.35;.2;0', 2.8)}</g>`
      return layers([CHIMNEY_BASE, CHIMNEY_OVER], CHIMNEY_LEG) + (c.animate ? puff : '')
    },
  },
}

// ---------------------------------------------------------------- the lean roof, the coping

// The lean roof's antenna (7 × 14): a bare mast on its foot, as wide as the lattice one, its beacon at the tip.
const mast = (c) => paint([[3, 2, 1, 10, '#8a8f96'], [1, 12, 5, 2, '#5d6168']]) + beacon(c, 3, 0, 1, 2, 1.6)
// A pigeon on the coping (6 × 4), facing left: grey, an iridescent neck, a dark tail.
const PIGEON = ['.nn...', 'eNggg.', '..gGgt', '...yy.']
const PIGEON_LEG = { n: '#8a90a0', N: '#6fa59a', e: '#2e2620', g: '#9aa0ae', G: '#7a8090', t: '#4a4e5a', y: '#c0705a' }

defineRoofProps({
  ...LANDMARKS, ...STRUCTURES, ...LIFE, ...REWORKED,
  mast: { w: 7, h: 14, kind: 'lean', draw: mast },
  pigeon: { w: 6, h: 4, kind: 'perch', draw: () => sprite(PIGEON, PIGEON_LEG) },
})

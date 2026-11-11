// PURE: the MONTH scene of the SVG office: the range's days as a paper wall calendar hung in the office, Clawd tapping
// it with a pointer under the "employee of the month" portrait, and the building directory (the top projects, a bar per
// day in the project's color, agent-hours and commits). The calendar is a real one, hung by a wire coil: the month's
// picture on top (a landscape of its own for each month, where the office's mascot is at the month's pastime: skating,
// flying a kite, fishing, by a campfire…), the month on a band of its own color, then one square per day, greener =
// more agent-time, a gold star on the best days, a crown on the busiest, today's square edged in soft gold with a
// little Clawd hopping on it. The portrait hangs under a picture light in a gilt frame: the busiest project's agent
// flexing, a medal on its chest, on the wall beside the calendar; under it the crew, a line per AI that worked (Claude,
// Codex, Gemini…): its character's mini figure, its agent-time and its share of the range's. The portrait takes what
// wall the crew leaves it.
// No node:* imports (the desktop mod loads lib/svg.mjs, which imports this file).
import { clip, fmtAgentTime, fmtHours, fmtInt } from './format.mjs'
import { IDLE_CLASSES, crewRows, dayInfo, restMinutes, seeded } from './model.mjs'
import {
  AGENT_IDS, CAST, CLAWD_15, CLOUD, HEAD, K, ROLE, SKY, SLAB, aO, aT, castPicker, ceilingLight, clamp, clawd, dayOf, defineSprites, esc, figure,
  fit, fitGroups, footing, hitArea, ledClock, lineSpans, miniLegend, mix, num0 as num, paint, pixRuns, plural, pose, r1, roomHeader, sceneHeader, spans,
  sprite, steadyMinutes, textW, txt, use,
} from './svg-kit.mjs'

// ---------------------------------------------------------------- palette (the paper calendar, the felt board)

const PAPER = '#f8f3e7'
const PAPER_WE = mix(PAPER, '#6f91dc', 0.13) // weekend columns: a cool tint, as on a printed calendar
const BLANK = '#d8cdb6' // squares outside the range, their numbers faded
const TRACE = mix(PAPER, '#e8957a', 0.38) // a day with no agent-time on record whose sessions or commits say it was worked
const FADED = '#ab9e84'
const GRID = '#a3957b'
const PAGE = '#ece4d2' // the page around the squares
const EDGE = '#857760' // the page's outline
const INK = '#3a2a20'
const INK_SA = '#3a63b0' // Saturday's numbers blue, Sunday's red: as printed calendars do
const INK_SU = '#c23b2c'
const HONEY = '#dcaa4e' // the soft gold edge around today's square
// agent-time, a quiet day to the busiest (ROLE.busy's family): four steps, so the legend's swatches are exact
const GREENS = ['#d5ecae', '#acd977', '#7ec04e', '#57a333']
const FELT = '#1d1916'
const BRASS = '#c9a26b'
const BRASS_D = '#8f6d43'
const SOCKET = '#3a322b'
const GILT = { o: '#6b4716', d: '#a8792a', b: '#d9a640', h: '#f7d47c' } // the portrait's frame: outline, shade, body, light
const RIBBON = '#d23c3c'
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
// the band under the picture, one color per month, January first
const MONTH_BAND = ['#3c68ae', '#ad4570', '#3b8656', '#4b945c', '#a94f86', '#c4861f', '#2a80ba', '#cc6a2c', '#ad6c33', '#c0512a', '#894530', '#a52f39']
const WD2 = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

/**
 * A day's agent-time in 4 steps on a square-root scale (the busiest day = 4, a quiet day still shows), 0 for none.
 * Steps, not a continuous ramp, so the legend's swatches (paper + 4 greens) are exact; 4 also earns a gold star.
 */
const LEVELS = 4
const levelOf = (m, max) => (m > 0 && max > 0 ? clamp(Math.ceil(Math.sqrt(m / max) * LEVELS), 1, LEVELS) : 0)
const tileFill = (m, max, weekend) => GREENS[levelOf(m, max) - 1] ?? (weekend ? PAPER_WE : PAPER)

// ---------------------------------------------------------------- the month's picture

// The picture on top of the page shows the range's last month as a landscape with depth: the sky top down (four bands,
// dithered into each other), the sun, the far range (the sea in summer), the hills and their small trees, the ground
// with its lit edge and tufts, a big tree framing each side, and in front the mascot at the month's pastime while
// leaves, snow, petals or rain fall. Each month takes its season's paint (northern: the rooms' windows show that
// season too) and repaints what its own scene needs. A season's paint: its sky, its sun (where it stands, as a share of
// the width and a row) and cloud, the far range (snow-capped or not), the hills, the ground, its big and small trees,
// what falls (flakes sway less than leaves; autumn's leaves are 2 wide) and its birds.
const SEASON_OF = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter']
const SEASONS = {
  winter: {
    sky: ['#46599a', '#5b70b1', '#7c92ca', '#a8bbe1'], orb: '#fff4d6', sun: [0.3, 3], cloud: '', range: '#b7c6e4', snowy: true, hills: '#dbe5f4',
    ground: '#f2f6fc', edge: '#ffffff', turf: '#c3d2ec', big: 'mo-bigpine', small: ['mo-pine', 11], fall: ['#ffffff', '#dfe8f6'], flakes: true, birds: '',
  },
  spring: {
    sky: ['#64b4e6', '#80c4ed', '#a2d6f3', '#c6e8f8'], orb: '#ffe27a', sun: [0.72, 3], cloud: 'mo-cloud', range: '#a3c4b8', hills: '#8ccb6a',
    ground: '#69aa48', edge: '#8fcf63', turf: '#4e8d39', big: 'mo-bigbloom', small: ['mo-bloom', 10], fall: ['#f8bcd6', '#fde1ed'], birds: '',
  },
  summer: {
    sky: ['#2b8ad6', '#45a2e3', '#68baed', '#97d0f4'], orb: '#fff27a', sun: [0.72, 3], cloud: 'mo-cloud', range: '', hills: '', ground: '#ead597',
    edge: '#f7e9b6', turf: '#d3b86d', big: 'mo-bigleafy', small: null, fall: [], birds: '#ffffff',
  },
  autumn: {
    sky: ['#d5734d', '#e28d5b', '#eca96d', '#f4c68b'], orb: '#ffe7a3', sun: [0.64, 10], cloud: 'mo-cloud', range: '#c3876a', hills: '#a6633b',
    ground: '#7e4a2a', edge: '#ab6431', turf: '#9e5a2e', big: 'mo-bigmaple', small: ['mo-maple', 10], fall: ['#e8742f', '#f4b23e', '#c8432b'],
    fallW: 2, birds: '#5a3a2a',
  },
}
// The countryside of high summer, for the months away from the beach: a hazy range, green hills, grass.
const MEADOW = { range: '#a3c4b8', hills: '#86c860', ground: '#5ea343', edge: '#86c95b', turf: '#4a8a36', small: ['mo-leafy', 10] }
// Each month's scene, January first: its pastime (PASTIMES; the mascot's sprites are `mo-${pastime}-${who}`) and what
// it paints otherwise than its season. The year goes from buds (March) to blossom in the rain (April) to full leaf
// (May), from the lake to the beach to the sunflowers, from the first yellow leaves (September) to a pile of them
// (October) to bare boughs at dusk (November).
const MONTH_PIC = [
  { pastime: 'skate' },
  { pastime: 'snowman', sun: [0.68, 2] },
  { pastime: 'kite', sun: [0.4, 2], hills: '#9fd673', ground: '#78b94d', edge: '#9dd669', turf: '#5c9a3c', big: 'mo-bigbud', small: ['mo-bud', 10], fall: [] },
  { pastime: 'rain', sky: ['#7d93ad', '#90a6bd', '#a6bacd', '#bfd0de'], orb: '', cloud: 'mo-raincloud', rainbow: true, rain: true, fall: [] },
  { pastime: 'garden', big: 'mo-bigleafy', small: ['mo-leafy', 10], fall: [] },
  { pastime: 'fishing', ...MEADOW },
  { pastime: 'beach' },
  { pastime: 'sunflowers', ...MEADOW, range: '#9dbfd6', hills: '#e2c35a', ground: '#8fb24a', edge: '#b5d468', turf: '#6f9a3a' },
  {
    pastime: 'apples', sky: ['#4f9bd6', '#6eb0df', '#93c5e6', '#bcdbea'], orb: '#fff0a0', sun: [0.7, 3], range: '#9fb8a8', hills: '#a3bf57',
    ground: '#76a443', edge: '#9cc95a', turf: '#5d8a35', big: 'mo-bigturning', small: ['mo-turning', 10], fall: ['#e8c43f', '#d88a2e'], birds: '',
  },
  { pastime: 'leaves' },
  {
    pastime: 'campfire', sky: ['#4b3f6e', '#7a4f78', '#b8686c', '#e39a72'], orb: '#ffcf7a', sun: [0.72, 11], cloud: '', range: '#6d4d63',
    hills: '#6e5238', ground: '#5a4030', edge: '#7a5638', turf: '#4a3324', big: 'mo-bigbare', small: ['mo-fir', 11], fall: ['#a0643a', '#c08040'],
    birds: '',
  },
  { pastime: 'xmas', sky: ['#34437f', '#475a99', '#6378b3', '#8aa0d2'], sun: [0.8, 2] },
]
// The month's paint: its season's, with its own on top.
const paintOf = (month) => ({ ...SEASONS[SEASON_OF[month]], ...MONTH_PIC[month] })
// What the mascot does in each month (its pose, a figure of 25 × 15 standing on the ground) and wears over it: it skates
// with its arms out in earmuffs and a striped scarf, blades under its feet; tosses a snowball beside its snow-Clawd in a
// red beanie; holds a kite's string up in a scarf the wind takes; holds an umbrella in yellow boots; waters the tulips
// under a crown of flowers; fishes from the bank in a bucket hat; lounges on the beach in sunglasses; holds up an ice
// cream under a straw hat; holds up an apple it picked; throws leaves in the air in a teal scarf (an orange Clawd still
// stands out among the leaves); roasts a marshmallow in a green beanie; carries a present in a Santa hat.
const PASTIME = {
  skate: { arms: ['point', 'point'], look: [2, 0], legs: true, blinkAt: -1.1 },
  snowman: { arms: ['raise', 'point'], look: [2, 0], legs: true, blinkAt: -1.9 },
  kite: { arms: ['out', 'raise'], look: [2, -2], legs: true, blinkAt: -0.4 },
  rain: { arms: ['out', 'up'], look: [-1, -2], legs: true, blinkAt: -2.2 },
  garden: { arms: ['point', 'out'], look: [-2, 1], legs: true, blinkAt: -2.6 },
  fishing: { arms: ['out', 'point'], look: [2, 1], legs: true, blinkAt: -1.5 },
  beach: { arms: ['up', 'up'], legs: true, blinkAt: -1.2 },
  sunflowers: { arms: ['out', 'up'], look: [2, -1], legs: true, blinkAt: -3.1 },
  apples: { arms: ['out', 'raise'], look: [2, -2], legs: true, blinkAt: -0.9 },
  leaves: { arms: ['high', 'high'], look: [0, -2], legs: true, blinkAt: -0.7 },
  campfire: { arms: ['out', 'point'], look: [2, 1], legs: true, blinkAt: -2.4 },
  xmas: { arms: ['out', 'out'], look: [2, -1], legs: true, blinkAt: -1.6 },
}
const GEAR = {
  skate: [[4, -2, 17, 1, '#6a6f80'], [3, -1, 1, 2, '#6a6f80'], [21, -1, 1, 2, '#6a6f80'], [1, 0, 3, 4, '#f07aa0'], [21, 0, 3, 4, '#f07aa0'],
    [1, 0, 1, 1, '#f9b3cb'], [21, 0, 1, 1, '#f9b3cb'], [3, 8, 19, 2, '#3a6fc0'], [7, 8, 1, 2, '#8fb4ec'], [12, 8, 1, 2, '#8fb4ec'],
    [17, 8, 1, 2, '#8fb4ec'], [3, 10, 3, 3, '#3a6fc0'], [2, 15, 6, 1, '#9aa3b4'], [17, 15, 6, 1, '#9aa3b4']],
  snowman: [[6, -4, 13, 1, '#c93a32'], [5, -3, 15, 2, '#d8433a'], [8, -3, 1, 2, '#f08a80'], [12, -3, 1, 2, '#f08a80'], [16, -3, 1, 2, '#f08a80'],
    [4, -1, 17, 2, '#f4f4f4'], [11, -6, 3, 2, '#f4f4f4'], [3, 8, 19, 2, '#d8433a'], [17, 10, 3, 3, '#d8433a']],
  kite: [[3, 8, 19, 2, '#f2b443'], [8, 8, 1, 2, '#e5463c'], [14, 8, 1, 2, '#e5463c'], [16, 10, 3, 3, '#f2b443']],
  rain: [[3, 12, 4, 3, '#f2c230'], [18, 12, 4, 3, '#f2c230'], [3, 12, 4, 1, '#f8dc6a'], [18, 12, 4, 1, '#f8dc6a']],
  garden: [5, 10, 15, 20].flatMap((x, i) => [[x - 1, -2, 3, 1, ['#f58fb7', '#ffffff', '#c99ae8', '#f58fb7'][i]],
    [x, -3, 1, 3, ['#f58fb7', '#ffffff', '#c99ae8', '#f58fb7'][i]], [x, -2, 1, 1, '#ffd84a'], [x + 2, -1, 1, 1, '#5aa23c']]),
  fishing: [[7, -4, 11, 1, '#7a9a4a'], [5, -3, 15, 2, '#7a9a4a'], [5, -1, 15, 1, '#c9a26b'], [2, 0, 21, 1, '#5d7a35']],
  beach: [[5, 3, 6, 3, '#17120e'], [14, 3, 6, 3, '#17120e'], [11, 3, 3, 1, '#17120e'], [3, 3, 2, 1, '#17120e'], [20, 3, 2, 1, '#17120e'],
    [6, 3, 2, 1, '#7d9cc4'], [15, 3, 2, 1, '#7d9cc4']],
  sunflowers: [[8, -5, 9, 1, '#e6c56a'], [6, -4, 13, 2, '#e6c56a'], [6, -2, 13, 1, '#d0453a'], [2, -1, 21, 1, '#d4b052'], [22, -3, 4, 1, '#d9a55a'], [22, -2, 4, 1, '#c08840'],
    [23, -1, 2, 2, '#d9a55a'], [22, -6, 4, 3, '#f59ab8'], [23, -7, 2, 1, '#f59ab8'], [22, -6, 1, 1, '#fbd0e0']],
  apples: [[22, -6, 3, 3, '#d8342c'], [22, -6, 1, 1, '#f07a6a'], [23, -7, 1, 1, '#5d7a2a']],
  leaves: [[3, 8, 19, 2, '#2f8a78'], [6, 8, 1, 2, '#6cc4ad'], [11, 8, 1, 2, '#6cc4ad'], [16, 8, 1, 2, '#6cc4ad'], [16, 10, 3, 3, '#2f8a78'],
    [16, 13, 1, 1, '#2f8a78'], [18, 13, 1, 1, '#2f8a78']],
  campfire: [[6, -3, 13, 1, '#3f7a5a'], [5, -2, 15, 2, '#4a8a66'], [4, 0, 17, 1, '#2f6048'], [11, -5, 3, 2, '#e8d6a0'], [3, 8, 19, 2, '#d99a3a'],
    [16, 10, 3, 3, '#d99a3a']],
  xmas: [[3, -1, 19, 2, '#f4f4f4'], [5, -3, 15, 2, '#d23c3c'], [5, -2, 15, 1, '#b52e2e'], [8, -5, 10, 2, '#d23c3c'], [14, -6, 6, 1, '#d23c3c'],
    [20, -7, 3, 3, '#f4f4f4'], [7, 7, 11, 6, '#3a6fc0'], [12, 7, 1, 6, '#f4c542'], [7, 9, 11, 1, '#f4c542'], [10, 6, 2, 1, '#f4c542'],
    [13, 6, 2, 1, '#f4c542']],
}

/**
 * A big tree's char rows (w × h): leaf clumps (discs [cx, cy, r]) lit from the top left (L light, M mid, D shade), each
 * over the ones before it, on a trunk (T, its left edge t) 3 wide from row `ty` down, its roots spread on the last row.
 */
function bigTree(w, h, discs, tx, ty) {
  const g = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => {
    const root = y === h - 1 ? 1 : 0
    return y >= ty && x >= tx - root && x <= tx + 2 + root ? (x <= tx ? 't' : 'T') : '.'
  }))
  for (const [cx, cy, r] of discs) {
    for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
        const [dx, dy] = [x - cx, y - cy]
        if (dx * dx + dy * dy > r * r + r / 2) continue
        const lit = -(dx + dy) / r
        g[y][x] = lit > 0.55 ? 'L' : lit < -0.45 ? 'D' : 'M'
      }
    }
  }
  return g.map((row) => row.join(''))
}
const BIG_TREE = bigTree(20, 27, [[10, 5, 5], [4, 11, 4], [16, 10, 4], [10, 13, 6]], 8, 15)
const bigTreeOf = (L, M, D) => () => sprite(BIG_TREE, { L, M, D, T: '#6b4226', t: '#4f3019' })
// A big snowy pine (15 × 27): four tiers widening downward, snow on each tier's left rim and the summit, a trunk.
const BIG_PINE = (() => {
  const g = Array.from({ length: 27 }, () => Array(15).fill('.'))
  for (const [top, th, hw] of [[0, 7, 3], [5, 7, 4], [10, 7, 5], [15, 8, 7]]) {
    for (let i = 0; i < th; i++) {
      const half = Math.round((hw * (i + 1)) / th)
      for (let x = 7 - half; x <= 7 + half; x++) g[top + i][x] = x <= 8 - half && i >= th - 4 ? 'W' : x >= 6 + half ? 'D' : 'G'
    }
  }
  g[0][7] = 'W'
  for (let y = 23; y < 27; y++) for (let x = 6; x <= 8; x++) g[y][x] = 'T'
  return g.map((row) => row.join(''))
})()
// The far range (64 × 12, seamless: distances wrap), flat in the haze: summits [x, height] with one-pixel slopes, the
// high ground's top rows its cap (S: snow in winter, the range's own color otherwise).
const RANGE = (() => {
  const rows = Array.from({ length: 12 }, () => Array(64).fill('.'))
  for (let x = 0; x < 64; x++) {
    const top = Math.min(...[[10, 12], [30, 8], [47, 11]].map(([px, ph]) => 12 - ph + Math.min(Math.abs(x - px), 64 - Math.abs(x - px))))
    for (let y = Math.max(0, top); y < 12; y++) rows[y][x] = y < top + 3 && top < 6 ? 'S' : 'M'
  }
  return rows.map((row) => row.join(''))
})()
// Rolling hills, 48 wide and seamless (both waves repeat in 48 px), in currentColor.
const hillH = (i) => clamp(Math.round(3 + 1.4 * Math.sin((i / 48) * 2 * Math.PI) + 1.1 * Math.sin((i / 16) * 2 * Math.PI + 0.7)), 1, 6)
const HILLS = Array.from({ length: 6 }, (_, r) => Array.from({ length: 48 }, (_, i) => (hillH(i) >= 6 - r ? 'H' : '.')).join(''))
// The small trees on the hills: a round one (10 × 10) in each season's colors, a snowy pine (9 × 11).
const TREE = ['...LLLL...', '..LLLLMM..', '.LLLMMMMM.', 'LLLMMMMMMD', 'LLMMMMMMDD', '.MMMMMMDDD', '..MMMDDD..', '....TT....', '....TT....', '...TTTT...']
const tree = (L, M, D) => () => sprite(TREE, { L, M, D, T: '#6b4226' })
const PINE = ['....W....', '...WGG...', '..WGGGD..', '.WWWGGDD.', '..WGGGD..', '.WGGGGGD.', 'WWWWGGGDD', '.WGGGGGD.', 'WGGGGGGGD', '....T....', '....T....']
// The pastimes' props: jack-o'-lanterns and the pile of leaves (33 × 8) October's mascot stands in; the snow-Clawd
// (Clawd in snow: coal eyes, a carrot, stick arms, a top hat); a tulip bed and a watering can; a sandcastle, a beach
// towel and a parasol. Tufts on the ground, the sun with its halo, birds (currentColor).
const PUMPKIN = ['...g...', '.ooOoo.', 'oyoOoyo', 'ooyyyoo', '.ooOoo.']
const PUMPKIN_LEG = { g: '#5d7a2a', o: '#e8742f', O: '#c95a2a', y: '#ffd75a' }
const MOUND = Array.from({ length: 8 }, (_, y) => Array.from({ length: 33 }, (_, x) => {
  const half = 16 * Math.sqrt(Math.max(0, 1 - ((7.5 - y) / 8) ** 2))
  return Math.abs(x - 16) > half ? '.' : y === 7 ? 'O' : 'o'
}).join(''))
// the pile's leaves that catch the eye, [x, y, color]: yellow and red among the orange
const MOUND_LEAVES = [[12, 1, 'y'], [18, 1, 'r'], [8, 3, 'r'], [15, 3, 'y'], [22, 3, 'y'], [4, 5, 'y'], [11, 5, 'r'], [19, 5, 'r'], [26, 5, 'y'],
  [2, 6, 'r'], [14, 6, 'y'], [29, 6, 'r']]
const SNOWCLAWD = ['.........hhhhhhh.........', '.........hhhhhhh.........', '.........rrrrrrr.........', '.......hhhhhhhhhhh.......',
  ...CLAWD_15.slice(0, 12).map((row) => `...${row.slice(3, 18).replaceAll('C', 'W')}${row.slice(18, 22).replaceAll('C', 'S')}...`.replaceAll('E', 'k')),
  '...SSSSSSSSSSSSSSSSSSS...', '..SSSSSSSSSSSSSSSSSSSSS..', '.SSSSSSSSSSSSSSSSSSSSSSS.']
const TULIPBED = ['.r...p...y...r.', 'rrr.ppp.yyy.rrr', 'rrr.ppp.yyy.rrr', '.g...g...g...g.', '.gg..g..gg...g.', '.g..gg...g..gg.', 'GGGGGGGGGGGGGGG']
const CAN = ['.....hhh..', '....h...h.', 's...BBBBBh', '.s.BBBBBBh', '..sBBBBBB.', '...BBBBBB.']
const CASTLE = ['.f.......f.', '.ff......ff', '.p.......p.', 'TTT.....TTT', 'TwT.TTT.TwT', 'TTTTTwTTTTT', 'TTTTTTTTTTT', 'TTTTTddTTTT', 'TTTTTddTTTT']
const SHADE = ['.......rrr.......', '....WWWrrrWWW....', '..rrWWWrrrWWWrr..', '.rrrWWWrrrWWWrrr.', 'rrrrWWWrrrWWWrrrr', '........t........',
  '........t........', '........t........', '........t........', '........t........', '........t........', '........t........', '........t........']
const TURF = ['..c.........c.........c.......c........c..........c.........c...', '.c.c.......c.c.......c.c.....c.c......c.c........c.c.......c.c..',
  '................................................................', '......c...............c..............c...............c..........',
  '.....c.c.............c.c............c.c.............c.c.........']
const ORB = ['...ccc...', '.ccccccc.', '.ccccccc.', 'ccccccccc', 'ccccccccc', 'ccccccccc', '.ccccccc.', '.ccccccc.', '...ccc...']
const BIRDS = ['k.k........', '.k..k.k....', '.....k..k.k', '.........k.']
// An oval of rows of these half-widths, `ink(y)` its char on each row: January's pond (69 × 8) of ice, lit on its far
// edge, shaded on its near one; June's smaller lake of water.
const oval = (halves, ink) => {
  const m = Math.max(...halves)
  return halves.map((hw, y) => Array.from({ length: 2 * m + 1 }, (_, x) => (Math.abs(x - m) <= hw ? ink(y) : '.')).join(''))
}
const shore = (y) => (y === 0 ? 'h' : y >= 6 ? 'd' : 'i')
const POND = oval([22, 29, 33, 34, 34, 33, 29, 22], shore)
const LAKE = oval([16, 21, 24, 25, 25, 24, 21, 16], shore)
// March: a diamond kite (7 × 7) on its cross spars, its tail of bows; daffodils (9 × 6).
const KITE = ['...k...', '..rky..', '.rrkyy.', 'kkkkkkk', '.bbkgg.', '..bkg..', '...k...']
const KITE_TAIL = [[3, 7, 1, 2, '#f4f4f4'], [1, 9, 3, 1, '#e5463c'], [2, 10, 1, 2, '#f4f4f4'], [3, 12, 3, 1, '#ffd447'], [4, 13, 1, 1, '#f4f4f4']]
const DAFFS = ['.y.....y.', 'yoy...yoy', '.g..y..g.', '.g.yoy.g.', 'gg..g..gg', '.g..g..g.']
// April: an umbrella (31 × 7) of yellow panels, its hem scalloped; a puddle (13 × 3); the rain, a tile (32 × 12) of
// drops that repeats as it falls; a rainbow's top (45 × 10, four bands round a center 22 rows under it).
const BROLLY = Array.from({ length: 7 }, (_, y) => Array.from({ length: 31 }, (_, x) => {
  if (Math.abs(x - 15) > [0, 6, 10, 12, 14, 15, 15][y]) return '.'
  if (y === 0) return 'k'
  if (y === 6 && x % 5 === 0) return '.'
  return Math.floor((x + 3) / 6) % 2 ? 'S' : 'Y'
}).join(''))
const PUDDLE = ['..hhhhhhhhh..', 'ppppppppppppp', '.ppppppppppp.']
const DROPS = [[2, 0], [9, 5], [16, 9], [22, 2], [28, 7]]
const RAINBOW = Array.from({ length: 10 }, (_, y) => Array.from({ length: 45 }, (_, x) => 'rygb'[Math.floor(22.5 - Math.hypot(x - 22, y - 22))] ?? '.')
  .join(''))
// May: a butterfly, its wings open and shut (5 × 3).
const FLY = ['pp.pp', 'ppkpp', '.p.p.']
const FLY_SHUT = ['.p.p.', '..k..', '..k..']
// June: a fish jumping (6 × 3). July: a crab (7 × 4). August: a sunflower (7 × 13), a bee (3 × 2).
const FISH = ['O.ooo.', 'OOooko', 'O.ooo.']
const CRAB = ['R.k.k.R', 'RrrrrrR', '.rrrrr.', 'r.r.r.r']
const SUNFLOWER = ['..y.y..', '.yyyyy.', 'yybbbyy', '.ybbby.', 'yybbbyy', '.yyyyy.', '...g...', '...g...', '.ggg...', '...g...', '...ggg.', '...g...',
  '...g...']
const BEE = ['.w.', 'yky']
// September: a basket of apples (9 × 6), the apples on the apple tree.
const BASKET = ['..hhhhh..', '.h.....h.', '.rrRrrRr.', 'bbbbbbbbb', 'BBBBBBBBB', '.bbbbbbb.']
const APPLES = [[5, 9], [13, 4], [16, 10], [9, 12], [12, 16], [4, 13], [15, 14], [8, 5]]
// November: a bare tree (20 × 27: boughs from the trunk, thicker near it, a few leaves left), crossed logs (11 × 4) on
// a ring of stones, a flame (7 × 8), geese in a V (9 × 5).
const BARE = (() => {
  const g = Array.from({ length: 27 }, () => Array(20).fill('.'))
  for (let y = 12; y < 27; y++) for (let x = 8; x <= 10; x++) g[y][x] = x === 8 ? 't' : 'T'
  g[26][7] = 't'
  g[26][11] = 'T'
  const bough = [[9, 12, 9, 1], [8, 13, 2, 5], [10, 12, 17, 4], [9, 7, 5, 2], [9, 6, 13, 1], [5, 9, 1, 9], [14, 8, 19, 8], [4, 7, 3, 2], [15, 6, 16, 1],
    [12, 10, 15, 12], [7, 11, 4, 13]]
  for (const [x0, y0, x1, y1] of bough) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
    for (let i = 0; i <= n; i++) {
      const [x, y] = [Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]
      g[y][x] = 'T'
      if (i < n / 2) g[y + 1][x] = 't'
    }
  }
  return g.map((row) => row.join(''))
})()
const BARE_LEAVES = [[2, 5, '#c8742f'], [17, 4, '#a0643a'], [13, 1, '#c8742f'], [19, 8, '#a0643a'], [1, 9, '#c8742f']]
const LOGS = ['LL.......LL', '.LLL...LLL.', '...LLLLL...', 'ss.sss.sss.']
const FLAME = ['...r...', '..rr...', '..ror..', '.roor.r', '.royorr', 'roooyor', 'royyyor', '.ryyyr.']
const GEESE = ['.......kk', '....kk...', 'kk.......', '....kk...', '.......kk']
// December: the decorated tree's baubles and its two strings of lights, which blink in turn (on the big pine's pixels).
const BAUBLES = [[6, 5, '#e8434f'], [9, 9, '#f4c542'], [5, 11, '#6aa8e8'], [8, 14, '#e8434f'], [4, 16, '#f4c542'], [11, 16, '#6aa8e8'],
  [2, 21, '#e8434f'], [10, 21, '#f4c542'], [6, 20, '#6aa8e8']]
const LIGHTS = [[[7, 3], [5, 8], [10, 11], [3, 15], [9, 18], [13, 21], [5, 22]], [[8, 6], [4, 12], [9, 13], [7, 17], [12, 19], [1, 22], [8, 22]]]
// The ornaments either side of the month's name, one per season (7 × 7, currentColor): a maple leaf, a snowflake, a
// tulip, a sun.
const ORNAMENT = {
  autumn: ['...c...', '.c.c.c.', '.ccccc.', 'ccccccc', '.ccccc.', '..ccc..', '...c...'],
  winter: ['...c...', '.c.c.c.', '..ccc..', 'ccc.ccc', '..ccc..', '.c.c.c.', '...c...'],
  spring: ['.c.c.c.', '.ccccc.', '.ccccc.', '..ccc..', '...c...', 'c..c..c', '.ccccc.'],
  summer: ['c..c..c', '.c.c.c.', '..ccc..', 'ccc.ccc', '..ccc..', '.c.c.c.', 'c..c..c'],
}

// The rooms' clerestory windows (svg-kit roomHeader's 18 × 9: a frame, two panes, the sill) look out on the page's
// season, so the glass and the picture show one sky: by day the picture's own bands top down, a cloud or birds in one
// pane and what falls in the other; at night that sky gone dark (each season its own night, a plum afterglow in
// autumn), under the stars. In winter it snows, day and night, and the snow lies on the sill. Two of each: the windows
// alternate.
const WIN_NIGHT = {
  winter: ['#111933', '#172146', '#1f2b58', '#2b3a69'],
  spring: ['#121b3a', '#18264c', '#21345c', '#2d466b'],
  summer: ['#0e1838', '#14234b', '#1b2e5e', '#263c6f'],
  autumn: ['#1c1634', '#271d42', '#3a264d', '#553152'],
}
const winCloud = (x, y) => [[x + 1, y, 3, 1, '#ffffff'], [x, y + 1, 5, 1, '#ffffff']]
const winBird = (x, y, c) => [[x, y, 1, 1, c], [x + 2, y, 1, 1, c], [x + 1, y + 1, 1, 1, c]]
const winDots = (pts, c) => pts.map(([x, y]) => [x, y, 1, 1, c])
const WIN_DAY = {
  winter: [[...winDots([[3, 2], [6, 5], [12, 3], [15, 6]], '#ffffff'), ...winDots([[2, 7], [13, 7]], '#dfe8f6')],
    [...winDots([[2, 4], [7, 2], [11, 6], [14, 3]], '#ffffff'), ...winDots([[5, 7], [16, 1]], '#dfe8f6')]],
  spring: [[...winCloud(2, 2), ...winDots([[12, 3], [14, 6]], '#f8bcd6')], [...winDots([[3, 4], [6, 6]], '#f8bcd6'), ...winCloud(11, 2)]],
  summer: [[...winCloud(2, 2), ...winBird(11, 4, '#ffffff')], [...winBird(3, 4, '#ffffff'), ...winCloud(11, 2)]],
  autumn: [[...winCloud(2, 2), [12, 4, 2, 1, '#c8432b'], [14, 6, 2, 1, '#f4b23e']],
    [...winBird(3, 3, '#5a3a2a'), [2, 6, 2, 1, '#e8742f'], [11, 2, 2, 1, '#f4b23e'], [13, 5, 2, 1, '#c8432b']]],
}
const WIN_STARS = [[[3, 2, 1, 1, K.star], [6, 5, 1, 1, K.starDim], [12, 5, 1, 1, K.starDim]],
  [[5, 3, 1, 1, K.starDim], [13, 2, 1, 1, K.star], [15, 5, 1, 1, K.starDim]]]

function seasonWindow(season, night, k) {
  const sky = night ? WIN_NIGHT[season] : SEASONS[season].sky
  const snow = season === 'winter'
  const glass = [[1, 2, 0], [3, 2, 1], [5, 2, 2], [7, 1, 3]].flatMap(([y, h, b]) => [[1, y, 8, h, sky[b]], [10, y, 7, h, sky[b]]])
  const deco = night && !snow ? WIN_STARS[k] : WIN_DAY[season][k]
  return paint([[0, 0, 18, 9, '#5c4f44'], ...glass, ...deco, [0, 8, 18, 1, snow ? '#e6edf7' : '#7a6a5a']])
}

/** The rooms' windows (roomHeader's `windows`): the season's, the night's or the day's glass, alternating. */
const seasonWindows = (ctx, season, y) => (xs) => xs.map((wx, i) => use(ctx, `mo-win${ctx.night ? 'n' : 'd'}-${season}${i % 2}`, wx, y + 2)).join('')

// ---------------------------------------------------------------- sprites

// The crown on the busiest day (7 × 5): gold with a blue jewel, the darker band at the bottom.
const CROWN = ['g..g..g', 'gg.g.gg', 'ggggggg', 'gGgjgGg', 'GGGGGGG']
const CROWN_LEG = { g: '#eec96f', G: '#c8963a', j: '#6f91dc' }
// The gold star stuck on a top day (5 × 5), outlined so it shows on paper and on green.
const STAR = ['..o..', '.oso.', 'ossso', '.oso.', '.o.o.']
const STAR_LEG = { o: '#c98a14', s: '#ffd85a' }
// The rosette pinned to the portrait's frame (7 × 7): a red ribbon around a gold button, two tails.
const ROSETTE = ['.rrrrr.', 'rrGGGrr', 'rGhGGGr', 'rrGGGrr', '.rrrrr.', '.rr.rr.', '.r...r.']
// Clawd's pointer, from the pointing hand up and to the left (pixel stairs), the tip dark.
const STICK = [[-4, 4], [-5, 3], [-6, 2], [-7, 1], [-8, 0], [-9, -1], [-10, -2]].map(([x, y]) => [x, y, 1, 1, '#e8d2a0'])
// The corners of the gilt frame (37 × 25): a light cross with a dark heart.
const ROSES = [[1, 1], [33, 1], [1, 21], [33, 21]].flatMap(([x, y]) => [[x + 1, y, 1, 3, GILT.h], [x, y + 1, 3, 1, GILT.h], [x + 1, y + 1, 1, 1, GILT.o]])

defineSprites({
  // pixel-font digits in currentColor (merged runs), and at 2× for big squares: a day number is two <use>s instead of
  // ~25 rects
  ...Object.fromEntries([...'0123456789'].flatMap((d) => [[`mo-${d}`, () => paint(pixRuns(d, 0, 0, 'cur'))],
    [`mo-${d}x2`, () => paint(pixRuns(d, 0, 0, 'cur').map(([x, y, w, h, f]) => [2 * x, 2 * y, 2 * w, 2 * h, f]))]])),
  'mo-crown': () => sprite(CROWN, CROWN_LEG),
  'mo-star': () => sprite(STAR, STAR_LEG),
  // a 4-point twinkle (3 × 3), for what sparkles: the crown, the portrait
  'mo-twinkle': () => paint([[1, 0, 1, 3, '#fff6c8'], [0, 1, 3, 1, '#fff6c8']]),
  // Clawd standing by the calendar, looking at it, tapping it with a pointer
  'mo-clawd': (c) => clawd(c, { look: [-2, -1], arms: ['point', 'out'], legs: true, blinkAt: -1.4 }) +
    `<g>${paint([...STICK, [-11, -3, 1, 1, INK]])}${aT(c, '0 0;0 0;-1 -1;0 0', 1.6, -0.3)}</g>`,
  // the picture's scenery: the sun in its halo, a cloud (the picture's own: the sky over the roof keeps 'cloud'), the
  // range (snow-capped in winter), the hills, tufts, birds
  'mo-cloud': () => sprite(CLOUD, { c: '#ffffff', s: '#dce7f2' }),
  'mo-orb': () => paint([[2, -2, 5, 13, '#fff/.2'], [-2, 2, 13, 5, '#fff/.2'], [0, -1, 9, 11, '#fff/.2'], [-1, 0, 11, 9, '#fff/.2']]) +
    sprite(ORB, { c: 'cur' }),
  'mo-range': () => sprite(RANGE.map((row) => row.replaceAll('S', 'M')), { M: 'cur' }),
  'mo-range-snow': () => sprite(RANGE, { M: 'cur', S: '#f4f8ff' }),
  'mo-hills': () => sprite(HILLS, { H: 'cur' }),
  'mo-turf': () => sprite(TURF, { c: 'cur' }),
  'mo-birds': () => sprite(BIRDS, { k: 'cur' }),
  // the trees: big ones framing the picture, small ones on the hills
  'mo-bigmaple': bigTreeOf('#f9c75c', '#ee8d36', '#c4552a'),
  'mo-bigbloom': bigTreeOf('#fff0f6', '#f7b8d4', '#dc84ad'),
  'mo-bigleafy': bigTreeOf('#a8de6e', '#68b943', '#3f8d31'),
  'mo-bigpine': () => sprite(BIG_PINE, { W: '#ffffff', G: '#2f6e4c', D: '#1f4d36', T: '#6b4226' }),
  'mo-maple': tree('#f8c45a', '#ee8d36', '#c75a2b'),
  'mo-bloom': tree('#fde4ef', '#f6b3d0', '#de86ae'),
  'mo-leafy': tree('#a3db6c', '#6cbd45', '#469634'),
  'mo-pine': () => sprite(PINE, { W: '#ffffff', G: '#2f6e4c', D: '#1f4d36', T: '#6b4226' }),
  // March's buds, September's first yellow, November's bare boughs and its firs
  'mo-bigbud': bigTreeOf('#d6f29a', '#9ed664', '#64aa3e'),
  'mo-bud': tree('#cdee8e', '#94d05c', '#62a83e'),
  'mo-bigturning': bigTreeOf('#efd86c', '#b2c44c', '#77a13c'),
  'mo-turning': tree('#ecd468', '#a9c24a', '#6f9a3a'),
  'mo-bigbare': () => sprite(BARE, { T: '#6b4226', t: '#4f3019' }) + paint(BARE_LEAVES.map(([x, y, c]) => [x, y, 1, 1, c])),
  'mo-fir': () => sprite(PINE, { W: '#3f7d58', G: '#2f6e4c', D: '#1f4d36', T: '#6b4226' }),
  // the pastimes' props, January to December
  'mo-pond': () => sprite(POND, { h: '#eaf6fe', i: '#cfe6f7', d: '#b4d3ec' }) +
    paint([[20, 2, 4, 1, '#ffffff'], [44, 3, 3, 1, '#ffffff'], [12, 4, 2, 1, '#ffffff'], [52, 5, 3, 1, '#ffffff'], [30, 6, 5, 1, '#ffffff']]),
  'mo-kite': () => sprite(KITE, { k: '#5a3a2a', r: '#e5463c', y: '#ffd447', b: '#4a8fd8', g: '#5aa23c' }),
  'mo-daffs': () => sprite(DAFFS, { y: '#ffd447', o: '#f29a2a', g: '#5aa23c' }),
  'mo-raincloud': () => sprite(CLOUD, { c: '#e4e9ef', s: '#b4bfcc' }),
  'mo-rainbow': () => sprite(RAINBOW, { r: '#ef6a5a', y: '#f6c94a', g: '#86cc62', b: '#6aa8e8' }),
  'mo-drops': () => paint(DROPS.map(([x, y]) => [x, y, 1, 2, '#eef4fb/.8'])),
  'mo-brolly': () => sprite(BROLLY, { k: '#5a3a2a', Y: '#f6c431', S: '#e0a020' }),
  'mo-puddle': () => sprite(PUDDLE, { h: '#b9d4ea', p: '#7fa6c8' }),
  'mo-fly': () => sprite(FLY, { p: '#f6b23a', k: '#3a2a20' }),
  'mo-flyshut': () => sprite(FLY_SHUT, { p: '#f6b23a', k: '#3a2a20' }),
  'mo-lake': () => sprite(LAKE, { h: '#9fd3f2', i: '#4a9bd6', d: '#3a84c2' }),
  'mo-fish': () => sprite(FISH, { o: '#f08a3a', O: '#d0642a', k: '#2b2b33' }),
  'mo-crab': () => sprite(CRAB, { r: '#e5463c', R: '#c93a32', k: '#2b2b33' }),
  'mo-sunflower': () => sprite(SUNFLOWER, { y: '#f6c431', b: '#6b3d1e', g: '#4f8f34' }),
  'mo-bee': () => sprite(BEE, { w: '#e8f4ff', y: '#f6c431', k: '#2b2b33' }),
  'mo-appletree': () => sprite(BIG_TREE, { L: '#a8de6e', M: '#68b943', D: '#3f8d31', T: '#6b4226', t: '#4f3019' }) +
    paint(APPLES.flatMap(([x, y]) => [[x, y, 2, 2, '#d8342c'], [x, y, 1, 1, '#f07a6a']])),
  'mo-basket': () => sprite(BASKET, { h: '#7a5226', r: '#d8342c', R: '#b02a22', b: '#b07a3e', B: '#8a5a2a' }),
  'mo-jack': () => sprite(PUMPKIN, PUMPKIN_LEG),
  'mo-mound': () => sprite(MOUND, { o: '#e8742f', O: '#9a3a22' }) +
    paint(MOUND_LEAVES.map(([x, y, c]) => [x, y, 2, 1, c === 'y' ? '#f4b23e' : '#c8432b'])),
  'mo-snowclawd': () => sprite(SNOWCLAWD, { h: '#24242c', r: '#c93a32', W: '#f7fbff', S: '#c5d4ec', k: '#2b2b33' }) +
    paint([[12, 9, 3, 1, '#f08a2a'], [12, 12, 1, 1, '#2b2b33'], [12, 14, 1, 1, '#2b2b33'], [2, 10, 1, 1, '#6b4226'], [1, 9, 1, 1, '#6b4226'],
      [0, 8, 1, 1, '#6b4226'], [22, 10, 1, 1, '#6b4226'], [23, 9, 1, 1, '#6b4226'], [24, 8, 1, 1, '#6b4226']]),
  'mo-tulipbed': () => sprite(TULIPBED, { r: '#e8434f', p: '#f07cb5', y: '#ffd447', g: '#3f8a3a', G: '#4e8d39' }),
  'mo-can': () => sprite(CAN, { B: '#5a9bd4', h: '#3f78ad', s: '#3f78ad' }),
  'mo-castle': () => sprite(CASTLE, { T: '#e2c27a', w: '#b8955a', d: '#a8854a', p: '#7a5236', f: '#e5463c' }),
  'mo-shade': () => sprite(SHADE, { r: '#e5463c', W: '#fff8ec', t: '#7a5236' }),
  'mo-logs': () => sprite(LOGS, { L: '#7a4a26', s: '#8a8290' }),
  'mo-flame': () => sprite(FLAME, { r: '#d83a22', o: '#f08a2a', y: '#ffd75a' }),
  'mo-geese': () => sprite(GEESE, { k: 'cur' }),
  ...Object.fromEntries(Object.entries(ORNAMENT).map(([k, rows]) => [`mo-orn-${k}`, () => sprite(rows, { c: 'cur' })])),
  // the rooms' windows on the page's season, day and night, two of each
  ...Object.fromEntries(Object.keys(SEASONS).flatMap((s) => [0, 1].flatMap((k) => [[`mo-wind-${s}${k}`, () => seasonWindow(s, false, k)],
    [`mo-winn-${s}${k}`, () => seasonWindow(s, true, k)]]))),
  // the mascot at each month's pastime, every character of the cast
  ...Object.fromEntries(AGENT_IDS.flatMap((a) => Object.entries(PASTIME).map(([k, o]) => [`mo-${k}-${a}`, (c) => figure(c, a, o)]))),
  // "employee of the month": a gilt frame (37 × 25) round a dark backdrop tinted with the project's color (as the crew's
  // badge photos are: every character reads on it, whatever the color), a soft spotlight behind the sitter, a lit floor
  'mo-frame': () => paint([[1, 1, 37, 25, '#000/.35'], [0, 0, 37, 25, GILT.o], [1, 1, 35, 23, GILT.b], [1, 1, 35, 1, GILT.h], [1, 1, 1, 23, GILT.h],
    [2, 23, 34, 1, GILT.d], [35, 2, 1, 22, GILT.d], [3, 3, 31, 19, GILT.o], [4, 4, 29, 17, 'cur'], ...ROSES]) +
    paint([[4, 4, 29, 17, `${FELT}/.7`], [9, 4, 19, 1, '#fff/.07'], [7, 5, 23, 12, '#fff/.07'], [9, 17, 19, 1, '#fff/.07'], [4, 19, 29, 2, '#fff/.1']]),
  // the brass picture light over the frame, its glow falling on the gilt
  'mo-lamp': () => paint([[17, -3, 3, 3, BRASS_D], [10, -5, 17, 2, BRASS], [10, -5, 17, 1, '#ead1a0'], [11, -3, 15, 1, '#6e5233']]) +
    paint([[11, -2, 15, 2, '#fff2c0/.2'], [9, 0, 19, 3, '#fff2c0/.12'], [7, 3, 23, 3, '#fff2c0/.07']]),
  'mo-rosette': () => sprite(ROSETTE, { r: RIBBON, G: GILT.b, h: GILT.h }),
  // the sitter: every character of the cast flexing for the portrait, head to feet (arms up, eyes on you)
  ...Object.fromEntries(AGENT_IDS.map((a) => [`mo-flex-${a}`, (c) => figure(c, a, { arms: ['up', 'up'], legs: true, blinkAt: -2.1 })])),
  // the crew's list: every character of the cast as its mini figure (the intern bench's), standing still
  ...Object.fromEntries(AGENT_IDS.map((a) => [`mo-mini-${a}`, () => sprite(CAST[a].mini, miniLegend(a))])),
})

// ---------------------------------------------------------------- facts helpers

const YMD = /^\d{4}-\d{2}-\d{2}$/
const ymd = (dt) => dt.toISOString().slice(0, 10)
const isDay = (d) => typeof d === 'string' && YMD.test(d) && ymd(dayOf(d)) === d
// the day whose month the page shows (its picture, its band, the season out of the windows): the range's last, else
// today; the month, April when there is neither
const pageDay = (f, days) => days.at(-1) ?? (isDay(f.now?.local_date) ? f.now.local_date : '')
const monthOf = (d) => (d ? dayOf(d).getUTCMonth() : 3)
// a page that ends before today (the Month tab's previous page, `month --back 1`): no today on it, nothing "yet"
const isPast = (f, days) => days.length > 0 && isDay(f.now?.local_date) && days.at(-1) < f.now.local_date

/**
 * The calendar's days: range.days (else the per_day keys, else today), sorted, made contiguous and capped to the last
 * 62 (the Month of now: last month and this one so far), so a week range draws its 7 days and garbage draws an empty
 * page rather than throwing.
 */
function rangeDays(f) {
  let list = (Array.isArray(f.range?.days) ? f.range.days : []).filter(isDay)
  if (!list.length && f.per_day && typeof f.per_day === 'object') list = Object.keys(f.per_day).filter(isDay)
  if (!list.length && isDay(f.now?.local_date)) list = [f.now.local_date]
  if (!list.length) return []
  list.sort()
  const last = dayOf(list.at(-1)).getTime()
  const first = Math.max(dayOf(list[0]).getTime(), last - 61 * 864e5)
  const out = []
  for (let t = first; t <= last; t += 864e5) out.push(ymd(new Date(t)))
  return out
}

/** The month in numbers: the busiest day, days worked, the longest run of worked days, weekend agent-time. */
function monthStats(days, mins) {
  const st = { max: 0, best: '', active: 0, streak: 0, weekend: 0, total: 0, traced: 0 }
  let run = 0
  for (const d of days) {
    const m = mins(d)
    st.total += m
    if (m > st.max) [st.max, st.best] = [m, d]
    if (m > 0) {
      st.active++
      st.streak = Math.max(st.streak, ++run)
    } else run = 0
    if (dayInfo(d).wdi >= 5) st.weekend += m
  }
  return st
}

const dayName = (d) => {
  const i = dayInfo(d)
  return `${i.wd} ${i.d} ${i.mon}`
}

/** 'OCTOBER 2026', 'SEPTEMBER – OCTOBER 2026' or a shorter form, whichever fits the band (bold 6 px, letter-spaced). */
function monthTitle(days, maxW) {
  const w = (s) => s.length * (6 * 0.62 + 0.5)
  if (!days.length) return 'THE MONTH'
  const a = dayOf(days[0])
  const b = dayOf(days.at(-1))
  const [ya, ma, yb, mb] = [a.getUTCFullYear(), a.getUTCMonth(), b.getUTCFullYear(), b.getUTCMonth()]
  const [A, B] = [MONTH_NAMES[ma], MONTH_NAMES[mb]]
  const [a3, b3] = [A.slice(0, 3), B.slice(0, 3)]
  const opts = ya === yb && ma === mb ? [`${A} ${ya}`, A, a3]
    : ya === yb ? [`${A} – ${B} ${yb}`, `${a3} – ${b3} ${yb}`, `${a3}–${b3}`]
      : [`${a3} ${ya} – ${b3} ${yb}`, `${a3}–${b3} ${yb}`, `${a3}–${b3}`]
  return opts.find((s) => w(s) <= maxW) ?? ''
}

// ---------------------------------------------------------------- the month's picture

/**
 * Something drifting down (a leaf, a snowflake, a petal, a drop) or up (smoke, when `fall` is negative): from (px, py)
 * `fall` pixels in 2-px steps, swaying by `zig`, `k0` steps into its loop; a still drawing keeps it there, mid-air.
 */
function drifting(ctx, px, py, fall, zig, k0, col, w = 1, step = 0.42) {
  const steps = Math.max(2, Math.floor(Math.abs(fall) / 2))
  const at = (k) => `${zig[k % zig.length]} ${k * Math.sign(fall) * 2}`
  const vals = Array.from({ length: steps }, (_, k) => at((k0 + k) % steps)).join(';')
  return `<g transform="translate(${at(k0 % steps)})">${paint([[px, py, w, 1, col]])}${aT(ctx, vals, r1(steps * step))}</g>`
}

// The mascot (`who`, the office's busiest character) at its month's pastime, its box at `mx` and its feet on the
// picture's row 31, and what it wears over it.
const wearing = (ctx, pastime, who, mx) => use(ctx, `mo-${pastime}-${who}`, mx, 17) +
  paint(GEAR[pastime].map(([dx, dy, w, h, f]) => [mx + dx, 17 + dy, w, h, f]))
const SWAY = [0, 1, 1, 0, -1, -1]
// Two frames in turn every `dur` (a still drawing keeps the first): a butterfly's wings, a flame and its mirror, the
// two strings of lights on a tree.
const turns = (ctx, a, b, dur) => (ctx.animate ? `<g>${a}${aO(ctx, '1;0', dur)}</g><g opacity="0">${b}${aO(ctx, '0;1', dur)}</g>` : a)
// A line of 1-px dots from (x0, y0) to (x1, y1), one per column or row, whichever is longer: a kite's string, a rod.
const dots = (x0, y0, x1, y1, col) => {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  return Array.from({ length: n + 1 }, (_, i) => [Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), 1, 1, col])
}

/**
 * Each month's pastime around the picture's middle `cx`, in its own pixels, and what moves in it:
 * - January: skating to and fro across a frozen pond.
 * - February: tossing a snowball beside its snow-Clawd and a few snowballs.
 * - March: flying a kite over the daffodils, the kite bobbing and its tail swaying, gusts blowing by.
 * - April: under an umbrella in a shower beside two puddles, rings spreading on them (the rain is the picture's).
 * - May: watering a tulip bed, the drops falling, a butterfly flitting over the flowers.
 * - June: fishing from the bank of a lake, the float bobbing, a fish jumping now and then beside the lily pads.
 * - July: on a beach towel between a sandcastle and a parasol, a crab scuttling by (the tide is the picture's).
 * - August: an ice cream among sunflowers that nod in the breeze, bees about them.
 * - September: picking apples under an apple tree, one falling, a basket of them beside it.
 * - October: waist-deep in a pile of leaves beside jack-o'-lanterns, the leaves it throws fluttering down.
 * - November: roasting a marshmallow over a campfire, its flames flickering, its glow breathing, smoke rising, geese
 *   flying south.
 * - December: carrying a present to the decorated tree, its two strings of lights blinking in turn, its star
 *   twinkling, presents under it.
 */
const PASTIMES = {
  skate: (ctx, cx, who) => {
    const glide = Array.from({ length: 24 }, (_, k) => `${k < 12 ? k - 6 : 18 - k} 0`).join(';')
    return use(ctx, 'mo-pond', cx - 34, 25) + `<g>${wearing(ctx, 'skate', who, cx - 12)}${aT(ctx, glide, 6)}</g>`
  },
  snowman: (ctx, cx, who) => wearing(ctx, 'snowman', who, cx - 27) + use(ctx, 'mo-snowclawd', cx + 2, 13) +
    paint([[cx + 30, 29, 3, 2, '#ffffff'], [cx + 33, 30, 3, 2, '#e3ebf7'], [cx + 31, 28, 2, 1, '#ffffff']]) +
    `<g>${paint([[cx - 27, 11, 2, 2, '#ffffff'], [cx - 26, 12, 1, 1, '#d5e1f2']])}${aT(ctx, '0 0;0 -2;0 -4;0 -5;0 -5;0 -4;0 -2;0 0', 2)}</g>`,
  kite: (ctx, cx, who) => {
    const mx = cx - 16
    const gust = (gx, gy, b) => `<g>${paint([[gx, gy, 5, 1, '#fff/.6']])}${aT(ctx, '0 0;3 0;6 0;9 0;12 0;15 0', 1.5, b)}${aO(ctx, '0;1;1;1;0;0', 1.5, b)}</g>`
    const tail = paint(KITE_TAIL.map(([dx, dy, w, h, f]) => [cx + 22 + dx, 1 + dy, w, h, f]))
    return use(ctx, 'mo-daffs', cx - 38, 25) + use(ctx, 'mo-daffs', cx + 26, 26) + wearing(ctx, 'kite', who, mx) +
      paint(dots(mx + 24, 13, cx + 24, 8, '#f4f4f4')) +
      `<g>${use(ctx, 'mo-kite', cx + 22, 1)}<g>${tail}${aT(ctx, '0 0;1 0;0 0;-1 0', 1)}</g>${aT(ctx, '0 0;1 -1;1 0;0 1', 3)}</g>` +
      gust(cx - 30, 8, 0) + gust(cx - 6, 4, -0.75)
  },
  rain: (ctx, cx, who) => {
    const mx = cx - 12
    const puddle = (px, py, b) => use(ctx, 'mo-puddle', px, py) + `<g>${paint([[px + 4, py + 1, 5, 1, '#e8f2fa']])}${aO(ctx, '0;1;0', 1.5, b)}</g>`
    return puddle(cx - 38, 29, 0) + puddle(cx + 22, 30, -0.75) + wearing(ctx, 'rain', who, mx) + use(ctx, 'mo-brolly', mx + 3, 5) +
      paint(dots(mx + 19, 12, mx + 22, 17, '#5a3a2a'))
  },
  garden: (ctx, cx, who) => {
    const [bx, by] = [cx + 22, 17]
    const wings = turns(ctx, use(ctx, 'mo-fly', bx, by), use(ctx, 'mo-flyshut', bx, by), 0.5)
    return use(ctx, 'mo-tulipbed', cx - 37, 26) + use(ctx, 'mo-tulipbed', cx + 21, 26) + wearing(ctx, 'garden', who, cx - 8) +
      use(ctx, 'mo-can', cx - 21, 20) + [0, 1, 2].map((k0, i) => drifting(ctx, cx - 22 - i, 23, 6, [0], k0, '#9fd4f7', 1, 0.25)).join('') +
      `<g>${wings}${aT(ctx, '0 0;2 -1;4 -3;6 -2;8 -4;10 -3;12 -5;10 -6;7 -4;5 -5;3 -3;1 -2', 6)}</g>`
  },
  fishing: (ctx, cx, who) => {
    const mx = cx - 38
    const jump = '0 0;0 0;0 0;0 0;0 0;0 0;0 0;2 -4;4 -6;6 -6;8 -4;10 0'
    return use(ctx, 'mo-lake', cx - 15, 25) + paint([[cx + 26, 30, 4, 1, '#5fae43'], [cx + 27, 29, 2, 1, '#5fae43'], [cx + 28, 29, 1, 1, '#f6a6c8'],
      [cx - 6, 31, 3, 1, '#5fae43'], [cx + 35, 21, 1, 4, '#4a8a36'], [cx + 37, 22, 1, 3, '#4a8a36'], [cx + 35, 19, 1, 2, '#7a5236'],
      [cx + 37, 20, 1, 2, '#7a5236']]) +
      wearing(ctx, 'fishing', who, mx) + paint([...dots(mx + 27, 22, cx, 14, '#8a5a2e'), ...dots(cx, 15, cx + 4, 26, '#eef4fa/.7')]) +
      `<g>${paint([[cx + 4, 27, 2, 1, '#e5463c'], [cx + 4, 28, 2, 1, '#ffffff']])}${aT(ctx, '0 0;0 0;0 1;0 1', 2)}</g>` +
      `<g opacity="0">${use(ctx, 'mo-fish', cx + 18, 26)}${aT(ctx, jump, 6)}${aO(ctx, '0;0;0;0;0;0;0;1;1;1;1;0', 6)}</g>` +
      `<g opacity="0">${paint([[cx + 26, 28, 2, 1, '#ffffff'], [cx + 31, 28, 2, 1, '#ffffff'], [cx + 28, 27, 3, 1, '#ffffff']])}` +
      `${aO(ctx, '1;0;0;0;0;0;0;0;0;0;0;1', 6)}</g>`
  },
  beach: (ctx, cx, who) => paint([[cx - 16, 31, 33, 2, '#3f8fd0'], ...Array.from({ length: 8 }, (_, k) => [cx - 14 + 4 * k, 31, 2, 2, '#fff8ec'])]) +
    wearing(ctx, 'beach', who, cx - 12) + use(ctx, 'mo-castle', cx - 36, 24) + use(ctx, 'mo-shade', cx + 14, 19) +
    `<g>${use(ctx, 'mo-crab', cx + 30, 29)}${aT(ctx, '0 0;1 0;2 0;3 0;4 0;5 0;6 0;5 0;4 0;3 0;2 0;1 0', 3)}</g>`,
  sunflowers: (ctx, cx, who) => {
    const row = (xs, b) => `<g>${xs.map(([dx, dy]) => use(ctx, 'mo-sunflower', cx + dx, dy)).join('')}${aT(ctx, '0 0;1 0;0 0;-1 0', 3, b)}</g>`
    const bee = (bx, by, path, b) => `<g>${use(ctx, 'mo-bee', bx, by)}${aT(ctx, path, 3, b)}</g>`
    return row([[-38, 17], [-30, 15], [-22, 18]], 0) + row([[17, 16], [25, 18], [33, 15]], -1.5) + wearing(ctx, 'sunflowers', who, cx - 12) +
      bee(cx - 31, 12, '0 0;2 -1;4 0;5 2;3 3;1 2', 0) + bee(cx + 27, 11, '0 0;-2 1;-3 3;-1 4;1 2;1 0', -1)
  },
  apples: (ctx, cx, who) => use(ctx, 'mo-appletree', cx + 2, 7) + use(ctx, 'mo-basket', cx - 40, 27) +
    paint([[cx + 6, 32, 2, 2, '#d8342c'], [cx + 18, 31, 2, 2, '#b02a22']]) + wearing(ctx, 'apples', who, cx - 26) +
    `<g>${paint([[cx + 13, 19, 2, 2, '#d8342c']])}${aT(ctx, '0 0;0 0;0 0;0 0;0 1;0 3;0 6;0 10;0 12;0 12;0 12;0 12', 3)}</g>`,
  leaves: (ctx, cx, who) => {
    const thrown = [[-15, 1, '#f4b23e'], [13, 4, '#e8742f'], [-2, 2, '#c8432b']]
      .map(([dx, k0, col]) => drifting(ctx, cx + dx, 12, 14, SWAY, k0, col, 2, 0.3)).join('')
    return use(ctx, 'mo-jack', cx - 37, 27) + use(ctx, 'mo-jack', cx - 29, 28) + use(ctx, 'mo-jack', cx + 27, 28) + wearing(ctx, 'leaves', who, cx - 12) +
      use(ctx, 'mo-mound', cx - 16, 26) + thrown
  },
  campfire: (ctx, cx, who) => {
    const fx = cx + 3
    const flame = turns(ctx, use(ctx, 'mo-flame', fx, 21), use(ctx, 'mo-flame', 0, 0, ` transform="translate(${fx + 7} 21) scale(-1 1)"`), 0.5)
    const glow = `<g>${paint([[fx - 10, 29, 27, 4, '#ffb050/.08'], [fx - 7, 27, 21, 6, '#ffb050/.08'], [fx - 4, 25, 15, 8, '#ffb050/.1']])}` +
      `${aO(ctx, '1;.6;1;.8', 1)}</g>`
    const smoke = [0, 2, 4].map((k0, i) => drifting(ctx, fx + 3 - i, 18, -12, SWAY, k0, '#b8aab4/.6', 2, 0.5)).join('')
    const south = Array.from({ length: 12 }, (_, k) => `${-k} 0`).join(';')
    return glow + use(ctx, 'mo-logs', fx - 2, 29) + flame + smoke + wearing(ctx, 'campfire', who, cx - 24) +
      paint([...dots(cx + 4, 21, cx + 6, 19, '#8a5a2e'), [cx + 7, 18, 2, 1, '#fff8ec'], [cx + 7, 19, 2, 1, '#d9a55a']]) +
      `<g color="#2e2438">${use(ctx, 'mo-geese', cx + 14, 3)}${aT(ctx, south, 6)}</g>`
  },
  xmas: (ctx, cx, who) => {
    const tx = cx + 2
    const bulbs = (k, col) => paint(LIGHTS[k].map(([x, y]) => [tx + x, 7 + y, 1, 1, col]))
    return use(ctx, 'mo-bigpine', tx, 7) + paint(BAUBLES.map(([x, y, c]) => [tx + x, 7 + y, 1, 1, c])) + turns(ctx, bulbs(0, '#fff1a8'), bulbs(1, '#ffc2d4'), 1) +
      use(ctx, 'mo-star', tx + 5, 3) + `<g>${use(ctx, 'mo-twinkle', tx + 9, 1)}${aO(ctx, '0;0;1;0', 2)}</g>` +
      paint([[tx - 3, 28, 7, 5, '#e8434f'], [tx, 28, 1, 5, '#f4c542'], [tx - 3, 30, 7, 1, '#f4c542'], [tx + 10, 29, 6, 4, '#5aa23c'],
        [tx + 12, 29, 1, 4, '#e8434f'], [tx + 16, 30, 4, 3, '#f4c542'], [tx + 17, 30, 1, 3, '#ffffff']]) +
      wearing(ctx, 'xmas', who, cx - 26)
  },
}

// July's sea laps at the sand: the shallows and their foam come up the beach and go back.
const tide = (ctx, lw) => `<g>${paint([[0, 22, lw, 4, '#7cc0ea']])}<path stroke="#fff8ec" stroke-dasharray="3 2" d="M0 26.5h${lw}"/>` +
  `${aT(ctx, '0 0;0 1;0 2;0 1', 3)}</g>`
// April's shower: rows of the drops' tile, one under the other, falling a row's height (12) a second, then again.
function rainfall(ctx, lw) {
  let s = ''
  for (let ty = -12; ty < PIC; ty += 12) for (let tx = 0; tx < lw; tx += 32) s += use(ctx, 'mo-drops', tx, ty)
  return `<g>${s}${aT(ctx, '0 0;0 3;0 6;0 9', 1)}</g>`
}

/**
 * The picture at the top of the page from (x, y), `w` wide and PIC × `z` tall: drawn PIC tall at `z` × (a larger
 * page prints its picture larger, not busier), clipped to its frame. Back to front: the month's sky dithered from band
 * to band, the sun, a rainbow, a cloud (two rain clouds in April), birds; the far range (the sea, glittering, in July);
 * the hills and their small trees; the ground (the tide on the beach); a big tree framing each side; the rain; the
 * mascot at its pastime; what falls. `month` (0…11) picks the scene; `key` seeds where things stand, so a month keeps
 * its picture.
 */
function picture(ctx, x, y, w, z, month, key) {
  const S = paintOf(month)
  const rnd = seeded(`mo-pic ${key}`)
  const lw = r1(w / z)
  const cx = Math.floor(lw / 2)
  const tile = (name, size, col, ty, off) => {
    let t = ''
    for (let tx = -off; tx < lw; tx += size) t += use(ctx, name, tx, ty)
    return `<g color="${col}">${t}</g>`
  }
  // the sky in four bands, each seam dithered: a checkerboard row of the other color on either side of it
  let s = paint(S.sky.map((c, i) => [0, i * 6, lw, i === 3 ? PIC - 18 : 6, c]))
  for (let i = 1; i < 4; i++) {
    s += `<path stroke="${S.sky[i]}" stroke-dasharray="1 1" d="M0 ${i * 6 - 0.5}h${lw}"/>` +
      `<path stroke="${S.sky[i - 1]}" stroke-dasharray="1 1" d="M1 ${i * 6 + 0.5}h${lw}"/>`
  }
  // the sun where the month has it (low in autumn, setting behind the range in November, behind the clouds in April),
  // the rainbow, a cloud drifting by (a second one in the rain), birds flying over
  if (S.orb) s += use(ctx, 'mo-orb', Math.round(lw * S.sun[0]), S.sun[1], ` color="${S.orb}"`)
  if (S.rainbow) s += `<g opacity=".75">${use(ctx, 'mo-rainbow', Math.round(lw * 0.68) - 22, 8)}</g>`
  if (S.cloud) s += use(ctx, S.cloud, Math.round(lw * 0.18 + rnd() * 10), 2, '', aT(ctx, '0 0;1 0;2 0;1 0', 8))
  if (S.rain) s += use(ctx, S.cloud, Math.round(lw * 0.56 + rnd() * 10), 4, '', aT(ctx, '0 0;-1 0;-2 0;-1 0', 6))
  if (S.birds) s += `<g color="${S.birds}">${use(ctx, 'mo-birds', Math.round(lw * 0.4), 4)}${aT(ctx, '0 0;-1 0;-2 0;-3 0;-4 0;-5 0;-6 0;-7 0', 6.4)}</g>`
  // far away: the range, or the sea and its glitter; the hills and a few small trees on them
  if (S.range) s += tile(S.snowy ? 'mo-range-snow' : 'mo-range', 64, S.range, 12, Math.floor(rnd() * 64))
  else {
    s += paint([[0, 15, lw, 9, '#3b8dc5'], [0, 15, lw, 1, '#a9d8f0'], [0, 16, lw, 1, '#5aa6d6'], [0, 20, lw, 4, '#3480b6']])
    for (let i = 0; i < 4; i++) s += `<g>${paint([[Math.round(lw * (0.15 + i * 0.22)), 18 + (i % 2) * 3, 2, 1, '#ffffff']])}${aO(ctx, '1;0;0', 1.5, -i * 0.5)}</g>`
  }
  // the small trees stand on the hills in pairs from both ends, every other one set back behind their crest
  const [back, front] = [[], []]
  if (S.small) {
    const [name, th] = S.small
    for (let i = 0, tx = 15 + Math.floor(rnd() * 3); tx + 10 <= cx - 38; i++, tx += 12) {
      for (const at of [tx, lw - tx - 10]) (i % 2 ? back : front).push(use(ctx, name, at, (i % 2 ? 21 : 23) - th))
    }
  }
  s += back.join('') + (S.hills ? tile('mo-hills', 48, S.hills, 18, 5) : '') + front.join('')
  // near: the ground with its lit edge and tufts (the tide on it by the sea), a big tree framing each side, the rain
  s += paint([[0, 24, lw, PIC - 24, S.ground], [0, 24, lw, 1, S.edge]]) + tile('mo-turf', 64, S.turf, 26, 9)
  if (!S.range) s += tide(ctx, lw)
  const bigW = S.big === 'mo-bigpine' ? 15 : 20
  s += use(ctx, S.big, -Math.round(bigW * 0.35), 7) + use(ctx, S.big, 0, 0, ` transform="translate(${r1(lw + bigW * 0.35)} 7) scale(-1 1)"`)
  if (S.rain) s += rainfall(ctx, lw)
  // the mascot at its pastime, and what falls through the whole picture
  s += PASTIMES[S.pastime](ctx, cx, ctx.pick ? ctx.pick(0) : 'claude')
  const n = S.fall.length ? clamp(Math.round(lw / 36), 3, 5) : 0
  for (let i = 0; i < n; i++) {
    s += drifting(ctx, 2 + Math.floor(rnd() * (lw - 4)), 0, PIC - 2, S.flakes ? [0, 0, 1, 1] : SWAY, Math.floor(rnd() * 16),
      S.fall[i % S.fall.length], S.fallW ?? 1)
  }
  const id = `${ctx.id}mo-pic`
  return `<g transform="translate(${x} ${y})${z === 1 ? '' : ` scale(${z})`}"><clipPath id="${id}"><path d="M0 0h${lw}v${PIC}h${-lw}z"/></clipPath>` +
    `<g clip-path="url(#${id})">${s}</g></g>`
}

// ---------------------------------------------------------------- the wall calendar

// The wall column right of the calendar at its narrowest (the portrait, Clawd under it), and the portrait at ×1: the
// frame's width and the whole block's height, from its picture light (5 over the frame) to the name under it. The
// picture's height before its scale. The column holds the crew's list under the portrait, so it is never narrower than
// the list needs (CREW_COL: a mini figure, a name, an agent-time).
const COL = 44
const PW = 37
const PBLOCK = 47
const PIC = 34
const CREW_COL = 56

/**
 * The page's plan from the room width: the portrait's scale (×1 on a narrow wall, up to ×2.5 on a wide one: else it is
 * a stamp beside a big page) and its column (at least the crew's list wide), then squares 18…44 wide in what is left (a
 * day number, a sticker and an hours label fit), about 2:3 tall; big squares (`z` 2) print their number and stickers
 * at 2×, and the picture grows with them (about a third of the page). From the top of the page: the margin the binding
 * goes through (4), the picture (ph), the month band (10), the weekday row (8), the squares.
 */
function calendarGeometry(roomW, days) {
  const scale = roomW >= 600 ? 2.5 : roomW >= 380 ? 2 : roomW >= 230 ? 1.5 : 1
  const colW = Math.max(COL - 4, Math.ceil(PW * scale), CREW_COL)
  const cw = clamp(Math.floor((roomW - 21 - colW) / 7), 18, 44)
  const ch = clamp(Math.round(cw * 0.68), 18, 28)
  const pz = cw >= 36 ? 1.5 : 1
  const ph = PIC * pz
  const top = 4 + ph + 10 + 8
  const lead = days.length ? dayInfo(days[0]).wdi : 0
  const rows = Math.max(1, Math.ceil((lead + days.length) / 7))
  return { cw, ch, z: cw >= 34 ? 2 : 1, pz, ph, top, lead, rows, scale, colW, calW: 7 * cw + 5, calH: top + rows * ch + 4 }
}

/**
 * Today's soft edge on a box (x, y, w, h): a 1 px honey line with its corners cut, and a fainter line inside it, a
 * glow rather than a mark.
 */
const glowEdge = (x, y, w, h) => [[x + 1, y, w - 2, 1], [x + 1, y + h - 1, w - 2, 1], [x, y + 1, 1, h - 2], [x + w - 1, y + 1, 1, h - 2]]
  .map((r) => [...r, HONEY])
  .concat([[x + 1, y + 1, w - 2, 1], [x + 1, y + h - 2, w - 2, 1], [x + 1, y + 2, 1, h - 4], [x + w - 2, y + 2, 1, h - 4]].map((r) => [...r, `${HONEY}/.35`]))

/** A sprite at `z` × (z 1: a plain use()), placed by a transform instead of x and y. */
const useAt = (ctx, name, x, y, z, attrs = '') => (z === 1 ? use(ctx, name, x, y, attrs) : use(ctx, name, 0, 0, ` transform="translate(${x} ${y}) scale(${z})"${attrs}`))

/**
 * The binding over the page's top edge at (x, y), `w` wide: a wire coil, a loop every 5 px from a punched hole up over
 * the edge and down behind the page, each part one dashed stroke for every loop (the hole, the wire in front, its
 * glint, the arch, the wire going behind); the coil parts in the middle for the hanger, a wire up to a nail.
 */
function binding(x, y, w) {
  const mid = x + Math.floor(w / 2)
  const loops = (from, to) => {
    const n = Math.floor((to - from) / 5) + 1
    if (n < 1) return ''
    const dash = (dx, dy, len, sw, col) =>
      `<path stroke="${col}" stroke-width="${sw}" stroke-dasharray="${len} ${5 - len}" d="M${from + dx} ${y + dy}h${(n - 1) * 5 + len}"/>`
    return dash(0, 2, 2, 2, '#3b2f27') + dash(0, 0.5, 1, 3, '#c9ced8') + dash(0, -0.5, 1, 1, '#f4f6f9') + dash(1, -1.5, 2, 1, '#e3e7ee') +
      dash(3, 0, 1, 2, '#7d828c')
  }
  const left = x + 5
  const right = left + Math.ceil((mid + 6 - left) / 5) * 5
  const hook = [-5, -4, -3, -2, -1].flatMap((d, i) => [[mid + d, y - 1 - i, 1, 1, '#7d828c'], [mid - d, y - 1 - i, 1, 1, '#9da2ac']])
  return loops(left, mid - 10) + loops(right, x + w - 9) + paint([...hook, [mid - 1, y - 7, 3, 2, '#8a8f96'], [mid - 1, y - 7, 1, 1, '#d7dbe2']])
}

// The page: the pad of pages under it, the binding, the month's picture, its band with the season's ornaments, the
// weekday initials, then a square per day (blank squares outside the range), lit from above, with its stickers.
function drawCalendar(ctx, x, y, g, days, st, mins, traced = new Set()) {
  const { cw, ch, z, pz, ph, top, lead, rows, calW, calH } = g
  const { f } = ctx
  const today = f.now?.local_date
  const anchor = pageDay(f, days)
  const month = monthOf(anchor)
  const who = ctx.pick ? ctx.pick(0) : 'claude'
  let s = paint([[x + 2, y + 2, calW, calH + 2, '#000/.3'], [x + 1, y + calH, calW - 2, 1, '#cbbd9f'], [x + 2, y + calH + 1, calW - 4, 1, '#a99a7d'],
    [x, y, calW, calH, EDGE], [x + 1, y + 1, calW - 2, calH - 2, PAGE]])
  s += binding(x, y, calW)
  // the month's picture, its band in the month's color (the season's ornament either side of the name when it fits),
  // the weekday initials (Saturday blue, Sunday red)
  s += picture(ctx, x + 2, y + 4, calW - 4, pz, month, anchor.slice(0, 7))
  const by = y + 4 + ph
  const title = monthTitle(days, calW - 10)
  const tw = Math.ceil(textW(title, 6) + title.length * 0.5)
  s += paint([[x + 2, by, calW - 4, 10, MONTH_BAND[month]], [x + 2, by, calW - 4, 1, '#fff/.22'], [x + 2, by + 9, calW - 4, 1, '#000/.3']])
  s += txt(x + calW / 2, by + 7.5, title, 6, '#fff8e8', ' font-weight="bold" text-anchor="middle" letter-spacing=".5"')
  if (title && tw + 26 <= calW - 8) {
    const orn = `mo-orn-${SEASON_OF[month]}`
    s += `<g color="#ffe9c4">${use(ctx, orn, Math.round(x + (calW - tw) / 2 - 11), by + 2)}${use(ctx, orn, Math.round(x + (calW + tw) / 2 + 4), by + 2)}</g>`
  }
  const gx = x + 2
  const gy = y + top
  const heads = WD2.map((w, i) => `<tspan x="${gx + i * cw + cw / 2 + 0.5}"${i === 5 ? ` fill="${INK_SA}"` : i === 6 ? ` fill="${INK_SU}"` : ''}>${w}</tspan>`)
  s += `<text y="${gy - 2}" font-size="${z === 1 ? 4.5 : 5}" font-weight="bold" fill="#6b5d4a" text-anchor="middle">${heads.join('')}</text>`
  const tiles = [[gx, gy, 7 * cw + 1, rows * ch + 1, GRID]]
  const digits = new Map([[INK, ''], [INK_SA, ''], [INK_SU, ''], [FADED, '']])
  const number = (ink, n, tx, ty) => String(n).split('').forEach((c, i) => {
    digits.set(ink, digits.get(ink) + use(ctx, z === 1 ? `mo-${c}` : `mo-${c}x2`, tx + 1 + z + i * 4 * z, ty + 1 + z))
  })
  let labels = ''
  let tips = ''
  let flair = ''
  for (let k = 0; k < rows * 7; k++) {
    const tx = gx + (k % 7) * cw + 1
    const ty = gy + Math.floor(k / 7) * ch + 1
    const d = days[k - lead]
    if (!d) {
      // a square outside the range: the day of the month before or after, faded, as a printed page shows it
      tiles.push([tx, ty, cw - 1, ch - 1, BLANK])
      if (days.length) number(FADED, new Date(dayOf(days[0]).getTime() + (k - lead) * 864e5).getUTCDate(), tx, ty)
      continue
    }
    const m = mins(d)
    const info = dayInfo(d)
    number(info.wdi === 5 ? INK_SA : info.wdi === 6 ? INK_SU : INK, info.d, tx, ty)
    if (m) labels += `<tspan x="${tx + cw - 3}" y="${ty + ch - 3}">${esc(fmtHours(m))}</tspan>`
    const isToday = d === today
    const isBest = d === st.best
    const gold = !isBest && levelOf(m, st.max) === LEVELS
    // the corner sticker: the busiest day's crown (it sparkles), else today's Clawd, else a top day's gold star
    const right = tx + cw - 2
    if (isBest) {
      flair += useAt(ctx, 'mo-crown', right - 7 * z, ty + 1, z) +
        `<g>${useAt(ctx, 'mo-twinkle', right - 2 * z, ty - z, z)}${aO(ctx, '0;0;0;1;0', 1.6)}</g>`
    } else if (gold && !isToday) flair += useAt(ctx, 'mo-star', right - 5 * z, ty + 1, z)
    if (isToday) {
      // today: its square edged in soft gold over the grid line, and a little Clawd hopping on it
      flair += paint(glowEdge(tx - 1, ty - 1, cw + 1, ch + 1))
      flair += useAt(ctx, pose(who, 'Mw'), right - 7 * z, ty + 1 + (isBest ? 5 : 1) * z, z)
    }
    const pd = f.per_day?.[d] ?? {}
    const tip = [`${dayName(d)}${isToday ? ' (today)' : ''}`, m ? `${fmtHours(m)} agent-time` : 'no agent-time',
      num(pd.sessions) && plural(num(pd.sessions), 'session'), num(pd.subagents) && plural(num(pd.subagents), 'intern'),
      num(pd.workflows) && plural(num(pd.workflows), 'meeting'), num(pd.commits) && plural(num(pd.commits), 'commit'),
      isBest ? 'busiest day' : gold && 'a gold-star day']
    // the square itself carries the day's tooltip (what sits on it lets the pointer through)
    tips += `<path fill="${traced.has(d) ? TRACE : tileFill(m, st.max, info.wdi >= 5)}" d="M${tx} ${ty}h${cw - 1}v${ch - 1}h${1 - cw}z">` +
      `<title>${esc(tip.filter(Boolean).join(' · '))}</title></path>`
  }
  // every square lit from above: a light top row and a shaded bottom row, one dashed stroke each for the whole grid
  const bevel = (dy, col, op) => `<path stroke="${col}" stroke-opacity="${op}" stroke-dasharray="${cw - 1} 1" d="` +
    `${Array.from({ length: rows }, (_, r) => `M${gx + 1} ${gy + r * ch + dy}h${7 * cw - 1}`).join('')}"/>`
  s += paint(tiles) + tips + `<g pointer-events="none">${bevel(1.5, '#fff', 0.55)}${bevel(ch - 0.5, '#000', 0.12)}`
  for (const [ink, uses] of digits) if (uses) s += `<g color="${ink}">${uses}</g>`
  if (labels) s += `<text font-size="${z === 1 ? 4.5 : 5.5}" fill="${INK}" text-anchor="end">${labels}</text>`
  s += `${flair}</g>`
  if (!days.length) s += txt(gx + (7 * cw) / 2, gy + ch / 2 + 2, 'no days to show', 5, INK, ' text-anchor="middle"')
  return s
}

// The "employee of the month" portrait, top-left of its frame at (x, y), drawn at `k` × (its picture light 5 over it):
// the busiest project's busiest character flexing head to feet in a gilt frame, on a dark backdrop tinted with the
// project's color (nothing on its body: on a Clawd a medal read as a mouth), a rosette on the frame, sparkles around
// it; under it 'EMPLOYEE OF / THE MONTH' and the name in the project's color, fitted to `maxW` (the column's width,
// unscaled).
function drawPortrait(ctx, x, y, k, p, unit, maxW) {
  const name = String(p.name ?? '?')
  const col = ctx.color(p.name)
  const who = castPicker({ totals: { agents: p.agents } })(0)
  const tip = `employee of the ${unit}: ${clip(name, 50)}${who === 'claude' ? '' : ` (${CAST[who].who})`} · ${fmtHours(num(p.agent_minutes))} agent-time`
  const twinkle = (tx, ty, b) => `<g>${use(ctx, 'mo-twinkle', tx, ty)}${aO(ctx, '0;0;1;.4;0', 2.4, b)}</g>`
  let s = use(ctx, 'mo-frame', 0, 0, ` color="${col}"`) + use(ctx, 'mo-lamp') + use(ctx, `mo-flex-${who}`, 6, 5)
  s += use(ctx, 'mo-rosette', 31, 19) + twinkle(-3, 3, 0) + twinkle(36, 9, -0.8) + twinkle(-2, 17, -1.6)
  s += `<g font-size="3.5" fill="${ROLE.dim}" text-anchor="middle"><text x="18.5" y="30.5">EMPLOYEE OF</text>` +
    `<text x="18.5" y="35">THE ${esc(unit.toUpperCase())}</text></g>`
  s += txt(18.5, 41.5, fit(name, maxW / k, 4.5), 4.5, col, ' text-anchor="middle"')
  return `<g><title>${esc(tip)}</title><g transform="translate(${x} ${y})${k === 1 ? '' : ` scale(${k})`}">${s}</g></g>`
}

// ---------------------------------------------------------------- the building directory

/** Board height for `rows` tenants (+ a line for the ones not listed). */
const boardH = (rows, more) => 13 + Math.max(1, rows) * 9 + (more ? 9 : 0) + 2

// A directory board: brass frame, dark felt, one line per tenant (live lamp, name, a bar per day, agent-time,
// commits). The three text columns are one <text> each (a tspan per row) and the bars are strokes: it stays a few kB.
function drawDirectory(ctx, x, y, w, days, list, more, restMin) {
  const { f } = ctx
  const n = Math.max(1, days.length)
  const bh = boardH(list.length, more)
  let s = paint([[x + 1, y + 1, w, bh, '#000/.3'], [x, y, w, bh, BRASS_D], [x + 1, y + 1, w - 2, bh - 2, BRASS], [x + 2, y + 2, w - 4, bh - 4, FELT],
    [x + 2, y + 2, w - 4, 1, '#000/.5']])
  const ix = x + 4
  const shipsR = x + w - 5
  const hoursR = shipsR - 24
  const sparkEnd = hoursR - 32
  const nameX = ix + 5
  // the names get what they need (up to 110 px), the bars the rest: 1 to 4 px per day (up to 8 for a week's few)
  const nameNeed = clamp(Math.max(0, ...list.map((p) => textW(String(p.name ?? '?'), 5))) + 3, 34, 110)
  const sp = clamp(Math.floor((sparkEnd - nameX - nameNeed) / n), 1, Math.max(4, Math.floor(56 / n)))
  const bw = sp >= 2 ? sp - 1 : 1
  const sx = sparkEnd - n * sp
  const nameW = sx - 4 - nameX
  const end = ' text-anchor="end"'
  const hy = y + 9
  const last = dayInfo(days.at(-1))
  const to = isPast(f, days) ? `${last.d} ${last.mon}` : 'today'
  const span = fit(n * sp >= 44 ? `${n} days → ${to}` : `${n} days`, n * sp + 20, 4.5)
  s += txt(nameX, hy, 'tenant', 4.5, ROLE.dim) + txt(sx, hy, span, 4.5, ROLE.dim)
  s += txt(hoursR, hy, 'agent-time', 4.5, ROLE.dim, end) + txt(shipsR, hy, 'commits', 4.5, ROLE.dim, end)
  const ti = days.indexOf(f.now?.local_date)
  // the header rule, a faint column behind today, and one baseline per row (the bars stand on it)
  const under = [[ix, y + 11, w - 8, 1, SOCKET]]
  if (ti >= 0 && list.length) under.push([sx + ti * sp, y + 12, bw, list.length * 9, '#eec96f/.14'])
  const lamps = { on: [], idle: [], off: [] }
  const bars = new Map()
  const cols = { names: '', hours: '', ships: '' }
  let tips = ''
  const tsp = (tx, ty, t, fill) => `<tspan x="${tx}" y="${ty}" fill="${fill}">${esc(t)}</tspan>`
  list.forEach((p, i) => {
    const base = y + 19 + i * 9
    const col = ctx.color(p.name)
    const live = ctx.desks.filter((d) => d.project === p.name)
    const awake = live.some((d) => !IDLE_CLASSES.has(d.cls))
    const lamp = awake ? 'on' : live.length ? 'idle' : 'off'
    lamps[lamp].push([ix, base - 4, 2, 2, lamp === 'on' ? ROLE.busy : lamp === 'idle' ? ROLE.idle : SOCKET])
    under.push([sx, base, n * sp - (sp - bw), 1, SOCKET])
    // a bar per day, on the row's own scale (the shape of its month; the hours column gives the size)
    const vals = days.map((d) => num(p.per_day?.[d]?.minutes))
    const max = Math.max(1, ...vals)
    let d = bars.get(col) ?? ''
    let px = null
    vals.forEach((v, j) => {
      const h = v > 0 ? Math.max(1, Math.round((v / max) * 6)) : 0
      if (!h) return
      const bx = sx + j * sp + bw / 2
      d += px === null ? `M${bx} ${base + 1 - h}v${h}` : `m${bx - px} ${-h}v${h}`
      px = bx
    })
    bars.set(col, d)
    const am = num(p.agent_minutes)
    const cm = num(p.commits)
    cols.names += tsp(nameX, base, fit(String(p.name ?? '?'), nameW, 5), col)
    cols.hours += tsp(hoursR, base, am ? fmtHours(am) : '·', am ? ROLE.title : ROLE.dim)
    cols.ships += tsp(shipsR, base, fmtInt(cm), cm ? ROLE.ship : ROLE.dim)
    const tip = [clip(String(p.name ?? '?'), 50), `${fmtHours(am)} agent-time`, plural(num(p.sessions), 'session'),
      plural(num(p.subagents), 'intern'), plural(cm, 'commit'), live.length && `${live.length} at a desk now`,
      p.titles?.[0] && clip(String(p.titles[0]), 60)].filter(Boolean).join(' · ')
    tips += hitArea(x + 2, base - 7, w - 4, 9, tip)
  })
  s += paint([...under, ...lamps.off, ...lamps.idle])
  for (const [col, d] of bars) if (d) s += `<path stroke="${col}" stroke-width="${bw}" d="${d}"/>`
  if (lamps.on.length) s += `<g>${paint(lamps.on)}${aO(ctx, '1;1;.4', 1.6)}</g>`
  if (list.length) s += `<text font-size="5">${cols.names}</text><text font-size="5"${end}>${cols.hours}${cols.ships}</text>`
  else s += txt(x + w / 2, y + 19, 'no tenants yet', 5, ROLE.dim, ' text-anchor="middle"')
  if (more) {
    const base = y + 19 + list.length * 9
    s += txt(nameX, base, fit(`+${plural(more, 'more tenant')}`, sparkEnd - nameX, 5), 5, ROLE.dim)
    if (restMin) s += txt(hoursR, base, fmtHours(restMin), 5, ROLE.dim, end)
  }
  return s + tips
}

/** How many tenants the board lists at the size budget's level; the rest share its last line. */
const boardCap = (ctx) => [10, 8, 6][ctx.caps?.level ?? 0] ?? 6

/**
 * The directory board for another building, top-left at (x, y), `w` wide, over `days`: `(ctx, x, y, w, days) →
 * { svg, h }`, the range's busiest tenants as the month's lobby lists them (lent as ctx.floors.directory: the week
 * tower hangs it under its street).
 */
export function directoryBoard(ctx, x, y, w, days) {
  const { f } = ctx
  const list = f.projects.slice(0, boardCap(ctx))
  const more = f.projects.length - list.length + num(f.projects_more)
  return { svg: drawDirectory(ctx, x, y, w, days, list, more, more ? restMinutes(f, list.length) : 0), h: boardH(list.length, more) }
}

// The colour key under the calendar: 'one square = one day · less ▢▢▢▢▢ more agent-time · ▢ today · ★ top day', the
// longest variant that fits (SVG drops leading spaces in a <text>, so every gap is a position, not a space). A page in
// the past has no today to edge: its key leaves today out.
function legend(ctx, x, y, w, past, traced = false) {
  const variants = past
    ? [['one square = one day · less', 'more agent-time ·', '', 'top day'], ['one square = one day · less', 'more agent-time', '', ''],
      ['less', 'more agent-time', '', ''], ['less', 'more', '', '']]
    : [['one square = one day · less', 'more agent-time ·', 'today ·', 'top day'], ['one square = one day · less', 'more agent-time ·', 'today', ''],
      ['less', 'more agent-time ·', 'today', ''], ['less', 'more agent-time', '', ''], ['less', 'more', '', '']]
  // a tinted day's key goes first, the longest that fits: nothing else on the page says what the tint is
  const tints = traced ? ['sessions or commits, no agent-time', 'no agent-time', ''] : ['']
  for (const e of tints) {
    for (const [a, b, c, d] of variants) {
      const tail = e ? textW('·', 5) + 9 + textW(e, 5) : 0
      if (textW(a, 5) + 29 + textW(b, 5) + (c ? 9 + textW(c, 5) : 0) + (d ? 9 + textW(d, 5) : 0) + tail > w) continue
      let cx = Math.round(x + textW(a, 5) + 3)
      let s = txt(x, y, a, 5, ROLE.dim)
      s += paint([PAPER, ...GREENS].map((fill, k) => [cx + k * 5, y - 4, 4, 4, fill]))
      cx += 26
      s += txt(cx, y, b, 5, ROLE.dim)
      cx = Math.round(cx + textW(b, 5) + 3)
      if (c) {
        s += paint([[cx, y - 5, 5, 5, PAPER], ...glowEdge(cx - 1, y - 6, 7, 7)]) + txt(cx + 7, y, c, 5, ROLE.dim)
        cx = Math.round(cx + 7 + textW(c, 5) + 3)
      }
      if (d) {
        s += use(ctx, 'mo-star', cx, y - 5) + txt(cx + 7, y, d, 5, ROLE.dim)
        cx = Math.round(cx + 7 + textW(d, 5) + 3)
      }
      if (e) {
        s += txt(cx, y, '·', 5, ROLE.dim)
        cx = Math.round(cx + textW('·', 5) + 3)
        s += paint([[cx, y - 4, 4, 4, TRACE]]) + txt(cx + 6, y, e, 5, ROLE.dim)
      }
      return s
    }
  }
  return ''
}

// ---------------------------------------------------------------- scene

// The wall calendar room: nameplate, the calendar hung at Clawd's height, on the wall beside it the employee-of-the-month
// portrait over the crew (the portrait as large as the wall leaves it), the clock on the wall above a short page, Clawd
// pointing at the page, plants; on its slab the busiest day and the key.
function calendarRoom(ctx, P) {
  const { f } = ctx
  const { IX0, top, BH1, calRoomW, g, calX, colX, colW, days, st, mins, traced, unit, worked, season, crew } = P
  const floor1 = top + BH1
  const past = isPast(f, days)
  // the calendar hangs at Clawd's height (its page ends 9 px over the floor, the pad under it in that gap); a taller
  // room (the directory beside it is longer than a week's page) leaves wall above it for the clock
  const calY = floor1 - 9 - g.calH
  const wallTop = top + HEAD
  const plate = days.length ? [[`${st.active + st.traced} of ${plural(days.length, 'day')} worked`]] : []
  let s = roomHeader(ctx, { name: 'WALL CALENDAR', color: ROLE.busy }, IX0, top, calRoomW, plate, null, null, seasonWindows(ctx, season, top))
  s += drawCalendar(ctx, calX, calY, g, days, st, mins, traced)
  // the portrait over the crew, one block centered on the wall between the nameplate band and Clawd's head: the
  // portrait at the plan's scale (×1.5 at least: the column is the crew's width), or smaller when the wall is short
  const wall = floor1 - 17 - (wallTop + 8)
  const listH = crewH(crew)
  const k = [2.5, 2, 1.5, 1].find((v) => v <= Math.max(g.scale, 1.5) && PBLOCK * v + 8 + listH <= wall && PW * v <= colW)
  const star = f.projects.find((p) => num(p.agent_minutes) > 0)
  const framed = Boolean(star && k)
  let by = wallTop + 8 + Math.max(0, Math.floor((wall - (framed ? Math.round(PBLOCK * k) + 8 : 0) - listH) / 2))
  if (framed) {
    s += drawPortrait(ctx, colX + Math.floor((colW - PW * k) / 2), by + Math.round(5 * k), k, star, unit, colW)
    by += Math.round(PBLOCK * k) + 8
  }
  s += crewList(ctx, colX, by, colW, crew, unit)
  if (calY - 3 - wallTop >= 16) s += ledClock(ctx, calX + Math.floor(g.calW / 2) - 12, wallTop + Math.floor((calY - 3 - wallTop - 10) / 2))
  const clX = calX + g.calW + 7
  if (clX + 22 <= IX0 + calRoomW) s += `<g><title>${esc(`Clawd checks the calendar: ${worked}`)}</title>${use(ctx, 'mo-clawd', clX, floor1 - 15)}</g>`
  if (calX - IX0 >= 18) s += use(ctx, 'plant', IX0 + 4, floor1 - 12)
  if (IX0 + calRoomW - (clX + 25) >= 18) s += use(ctx, 'plant', IX0 + calRoomW - 14, floor1 - 12)
  // slab captions: the busiest day under its crown, then the key
  const capW = calRoomW - 6
  if (st.max > 0) {
    s += use(ctx, 'mo-crown', IX0 + 3, floor1 + 4)
    s += txt(IX0 + 13, floor1 + 9, fit(`busiest day ${dayName(st.best)} · ${fmtHours(st.max)} agent-time`, capW - 10, 5.5), 5.5, ROLE.accent)
  } else s += txt(IX0 + 3, floor1 + 9, fit(past ? `no agent-time that ${unit}` : `no agent-time this ${unit} yet`, capW, 5.5), 5.5, ROLE.dim)
  return s + legend(ctx, IX0 + 3, floor1 + 16, capW, past, traced.size > 0)
}

// The building directory room: nameplate, the board of tenants, plants and (with wall to spare) a lobby bench where
// two interns wait; on its slab what the board lists and its key.
function directoryRoom(ctx, P) {
  const { f } = ctx
  const t = f.totals ?? {}
  const { IX0, IW, side, dirX, dirRoomW, top2, BH2, days, list, more, bw, bh, unit, season } = P
  const tenants = f.projects.length + num(f.projects_more)
  let s = roomHeader(ctx, { name: 'BUILDING DIRECTORY', color: ROLE.accent }, dirX, top2, dirRoomW, [[plural(tenants, 'tenant')]], null, null,
    seasonWindows(ctx, season, top2))
  const bx = dirX + Math.floor((dirRoomW - bw) / 2)
  s += drawDirectory(ctx, bx, top2 + HEAD + 5, bw, days, list, more, more ? restMinutes(f, list.length) : 0)
  const floor2 = top2 + BH2
  if (bx - dirX >= 16) s += use(ctx, 'plant', dirX + 3, floor2 - 12) + use(ctx, 'plant', dirX + dirRoomW - 13, floor2 - 12)
  if (floor2 - (top2 + HEAD + 5 + bh) >= 24 && bw >= 90) {
    // room to spare under the board: a lobby bench (two interns wait on it when the range hired any), a plant
    const bench = bx + 6
    const tip = `${plural(num(t.subagents), 'intern')} hired this ${unit}`
    s += use(ctx, 'plant', bx + bw - 14, floor2 - 12)
    s += paint([[bench, floor2 - 7, 30, 2, BRASS], [bench, floor2 - 5, 30, 1, BRASS_D], [bench + 2, floor2 - 4, 2, 4, '#6e5233'],
      [bench + 26, floor2 - 4, 2, 4, '#6e5233']])
    const interns = use(ctx, 'cI0', bench + 4, floor2 - 13) + use(ctx, 'cI0', bench + 16, floor2 - 13)
    if (num(t.subagents)) s += `<g><title>${esc(tip)}</title>${interns}</g>`
  }
  const dx = side ? dirX + 3 : IX0 + 3
  const dw = side ? dirRoomW - 6 : IW - 6
  const dirLine = tenants ? `one line per project, busiest first${more ? ` · top ${list.length} of ${tenants}` : ''}` : 'no projects yet'
  s += txt(dx, floor2 + 9, fit(dirLine, dw, 5.5), 5.5, ROLE.title)
  const key = [['bars: agent-time per day', ROLE.dim], ['lamp: at a desk now', ROLE.busy]]
  if (list.length) s += spans(dx, floor2 + 16, 5, fitGroups(key, dw, 5))
  return s
}

// ---------------------------------------------------------------- the crew

/**
 * The crew of the range, busiest first (model.mjs crewRows: `{ a, min, n, share }`, its agent-time from the exact
 * totals, its agents its sessions), each with `shown`, its agent-time in steps on a live drawing (steadyMinutes, as the
 * header's total).
 */
function crewOf(ctx) {
  return crewRows(ctx.f, (ctx.exact ?? ctx.f).totals).map((r) => ({ ...r, shown: ctx.liveClock ? steadyMinutes(r.min) : r.min }))
}

// A line of the crew's list, and the list's height: its heading, then a line per AI
const CREW_ROW = 14
const crewH = (crew) => 9 + Math.max(1, crew.length) * CREW_ROW - 2

/**
 * The crew, top-left at (x, y), `w` wide, on the wall beside the calendar under the employee of the month: THE CREW and
 * how many AIs, then a line per AI that worked in the range (busiest first): its mini figure, its character's name,
 * its agent-time in its color, then a bar of its share of the agent-time and the share. A line's tooltip adds its agents
 * (sessions). The names, the hours and the shares are one <text> each (a tspan per line).
 */
function crewList(ctx, x, y, w, crew, unit) {
  let s = txt(x, y + 5, 'THE CREW', 4.5, ROLE.intern, ' font-weight="bold"') +
    txt(x + w, y + 5, crew.length ? plural(crew.length, 'AI') : '', 4, ROLE.dim, ' text-anchor="end"')
  if (!crew.length) return s + txt(x, y + 16, 'nobody yet', 4.5, ROLE.dim)
  const bars = []
  let names = ''
  let hours = ''
  let shares = ''
  let tips = ''
  crew.forEach((c, i) => {
    const ch = CAST[c.a]
    const ly = y + 9 + i * CREW_ROW
    const pct = c.share >= 0.005 ? `${Math.round(c.share * 100)}%` : c.min > 0 ? '<1%' : '0%'
    const time = fmtAgentTime(c.shown)
    s += use(ctx, `mo-mini-${c.a}`, x, ly + 1)
    names += `<tspan x="${x + 14}" y="${ly + 6}">${esc(ch.who)}</tspan>`
    hours += `<tspan x="${x + w}" y="${ly + 6.5}" fill="${ch.hex.dark}">${esc(time)}</tspan>`
    // the bar runs from under the name to the share, the share at the line's right end
    const bw = w - 14 - (Math.ceil(textW(pct, 4)) + 2)
    bars.push([x + 14, ly + 9, bw, 2, SOCKET])
    const fill = Math.round(bw * c.share)
    if (fill > 0) bars.push([x + 14, ly + 9, fill, 2, ch.hex.dark])
    shares += `<tspan x="${x + w}" y="${ly + 11.5}">${esc(pct)}</tspan>`
    tips += hitArea(x, ly, w, CREW_ROW - 1, `${ch.name} (${ch.who}): ${c.n == null ? '' : `${plural(c.n, 'agent')} (sessions) · `}${time} agent-time · ` +
      `${pct} of the ${unit}'s agent-time`)
  })
  return s + paint(bars) + `<text font-size="4.5" fill="${ROLE.title}">${names}</text>` +
    `<text font-size="5" font-weight="bold" text-anchor="end">${hours}</text><text font-size="4" fill="${ROLE.dim}" text-anchor="end">${shares}</text>` + tips
}

/**
 * The month, drawn alone in the `month` view (facts collected with the `month` range: range.days and per_day cover
 * last month and this one so far, or a calendar month of the past; a week range draws its 7). Why a calendar: a month
 * is read by weeks and weekdays, which a 30-window facade
 * hides; the directory keeps the per-project story (who was busy when) beside it. Returns `{ svg, h, alt }` painted
 * from y0 down under the shared header (svg-kit sceneHeader; the scene contract: SCENES in lib/svg.mjs), and `rooms`:
 * the wall calendar's, the building directory's and the crew's boxes (the crew's: the wall column beside the calendar,
 * under the portrait), [x, y, w, h] in art units, which an export crops.
 */
export function sceneMonth(ctx, y0) {
  const { W, f, night } = ctx
  const t = f.totals ?? {}
  const days = rangeDays(f)
  const mins = (d) => num(f.per_day?.[d]?.minutes)
  const st = monthStats(days, mins)
  // a day whose sessions or commits say it was worked with no agent-time on record (Claude Code's cleanup took its
  // transcripts, or no agent worked) is tinted and counts as worked: any such day of a page of the past, or of a page with
  // no agent-time at all; a day of now without agent-time stays paper, as it always was
  const isUntimed = (d) => !mins(d) && num(f.per_day?.[d]?.sessions) + num(f.per_day?.[d]?.commits) > 0
  const traced = isPast(f, days) || !st.max ? new Set(days.filter(isUntimed)) : new Set()
  st.traced = traced.size
  const kind = f.range?.kind
  const unit = kind === 'week' ? 'week' : kind === 'today' || kind === 'live' ? 'day' : 'month'
  const worked = days.length ? `worked ${st.active + st.traced} of ${plural(days.length, 'day')}` : 'no days in range'
  // ---- horizontal plan: calendar room | directory room side by side when wide, else stacked (directory below); a
  // box taller than wide (ctx.tall: a screen held upright) keeps them stacked at any width, the building as tall as it
  const BX0 = 6
  const BX1 = W - 6
  const IX0 = BX0 + 4
  const IW = BX1 - 4 - IX0
  const side = IW >= 430 && !ctx.tall
  const dirRoomW = side ? clamp(Math.round(IW * 0.47), 210, 520) : IW
  const calRoomW = side ? IW - 3 - dirRoomW : IW
  const dirX = side ? IX0 + calRoomW + 3 : IX0
  const g = calendarGeometry(calRoomW, days)
  // the page centered in the room with its wall column (the portrait over the crew) right of it
  const calX = IX0 + Math.max(5, Math.floor((calRoomW - g.calW - 4 - g.colW) / 2))
  const colX = calX + g.calW + 4
  const colW = Math.min(g.colW, IX0 + calRoomW - colX - 2)
  const list = f.projects.slice(0, boardCap(ctx))
  const more = f.projects.length - list.length + num(f.projects_more)
  const bw = Math.min(dirRoomW - 12, 500)
  const bh = boardH(list.length, more)
  const crew = crewOf(ctx)
  // ---- vertical plan: sky, roof, band(s) of rooms over their slabs, sidewalk, the month in numbers. The calendar's
  // room is at least as tall as its wall column needs: the crew, the portrait over it (×1.5 when the column takes it),
  // the room under the nameplate band and Clawd's head
  const roof = y0 + SKY
  const top = roof + 5
  const calInner = 7 + g.calH + 9
  const dirInner = 5 + bh + 14
  const colInner = 25 + crewH(crew) + 8 + Math.round(PBLOCK * (PW * 1.5 <= colW ? 1.5 : 1))
  const BH1 = HEAD + Math.max(side ? Math.max(calInner, dirInner) : calInner, colInner)
  const top2 = side ? top : top + BH1 + SLAB
  const BH2 = side ? BH1 : HEAD + dirInner
  // the building stands on the Office's street front, lent by the composer as ctx.floors.front, as the week's tower
  // does: its entrance under the canopy fits 56
  const lobbyTop = top2 + BH2 + SLAB
  const lobby = typeof ctx.floors?.front === 'function' ? 56 : 0
  const groundY = lobbyTop + lobby
  const line = [
    [`the ${unit}:`, ROLE.dim, ''], [worked, ROLE.title],
    st.streak > 1 && [`longest streak ${st.streak} days`, ROLE.title],
    st.active && [`${fmtHours(st.total / st.active)} per day ${st.traced ? 'with agent-time' : 'worked'}`, ROLE.title],
    st.weekend && [`weekends ${fmtAgentTime(st.weekend)}`, ROLE.night],
  ].filter(Boolean)
  const H = groundY + 4 + 9 + 5 - y0
  // ---- the shared header (sky, title, the month's totals, skyline, brick shell); the total keeps its unit past 1000h
  // ('2239h agent-time', not '2.2k' beside the counts)
  const tot = [
    [`${fmtAgentTime(t.agent_minutes ?? 0)} agent-time`, ROLE.title], [plural(num(t.sessions), 'session'), ROLE.title],
    [plural(num(t.subagents), 'intern'), ROLE.intern], [plural(num(t.workflows), 'meeting'), ROLE.meeting],
    [plural(num(t.commits), 'commit'), ROLE.ship],
  ]
  let s = sceneHeader(ctx, y0, { view: 'month', when: f.range?.label ?? '', info: tot, groundY }).svg
  // ---- rooms: walls (warm ceiling light at night), the partition beside the directory, slabs
  const rooms = side ? [[IX0, calRoomW, top, BH1], [dirX, dirRoomW, top, BH1, true]] : [[IX0, IW, top, BH1], [IX0, IW, top2, BH2]]
  const walls = []
  for (const [x, w, ty, h, part] of rooms) {
    walls.push([x, ty, w, h, K.wall], [x, ty + h - 14, w, 14, K.wallLow])
    if (night) walls.push(...ceilingLight(x, ty, w))
    if (part) walls.push([x - 3, ty, 3, h, K.part], [x - 3, ty, 1, h, K.partHi])
  }
  // the slabs stop at the inner walls, as the live floor's do: the brick piers run unbroken from the parapet to the street
  for (const slabY of side ? [top + BH1] : [top + BH1, top2 + BH2]) {
    walls.push([IX0, slabY, IW, SLAB, K.slab], [IX0, slabY, IW, 2, K.wood], [IX0, slabY + 2, IW, 1, K.woodD])
  }
  s += paint(walls)
  // every room's windows look out on the page's season
  const season = SEASON_OF[monthOf(pageDay(f, days))]
  const P = {
    IX0, IW, top, BH1, calRoomW, g, calX, colX, colW, days, st, mins, traced, unit, worked, side, dirX, dirRoomW, top2, BH2, list, more, bw, bh, crew,
    season,
  }
  s += calendarRoom(ctx, P) + directoryRoom(ctx, P)
  const front = lobby ? ctx.floors.front(ctx, lobbyTop, lobby, IX0, IX0 + IW) : { facade: '', street: '' }
  s += front.facade
  // ---- the sidewalk, then under it (footing: the composer lays the commits line between) the month in numbers
  const foot = footing(ctx, groundY, y0 + H, lineSpans(6, groundY + 12, 5, line, W - 10))
  s += foot.walk + front.street
  const busiest = st.max ? `, busiest day ${dayName(st.best)} (${fmtHours(st.max)})` : ''
  const alt = `The Office, the ${unit} on the wall calendar: ${fmtAgentTime(t.agent_minutes ?? 0)} agent-time, ` +
    `${plural(num(t.sessions), 'session')}, ${plural(num(t.commits), 'commit')}, ${worked}${busiest}` +
    (crew.length ? `; the crew: ${crew.map((c) => `${CAST[c.a].name} ${c.n == null ? '' : `${plural(c.n, 'agent')} `}${fmtAgentTime(c.shown)}`).join(', ')}` : '')
  // each room as an export crops it: from the brick pier to the partition (or the other pier), from the cornice over the
  // first floor (or the slab over it) down to its own slab and the lines on it; the crew, its wall column under the
  // nameplate band
  const boxes = {
    calendar: [BX0, roof, (side ? dirX : BX1) - BX0, top + BH1 + SLAB - roof],
    directory: side ? [dirX - 3, roof, BX1 - dirX + 3, top + BH1 + SLAB - roof] : [BX0, top2, BX1 - BX0, BH2 + SLAB],
    crew: [colX - 2, top + HEAD, colW + 4, BH1 - HEAD],
  }
  return { svg: s + foot.under.svg, top: s, under: foot.under, h: Math.round(H), alt, rooms: boxes }
}

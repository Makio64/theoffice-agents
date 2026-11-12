// PURE: the cast of the office, one character per kind of coding agent. Clawd is Claude Code's own mascot (the official
// sprite); Dex and Rok are drawn after their agents' own bots (the Codex app's "Codex" pet, a blue cloud with a screen
// for a face; Grok Bot, a round white blob with two big eyes); Gem, Caret and Mooni are the office's own, each in its
// agent's colors with one thing of its own: Gem's sparkle, Caret's cube and text caret, Mooni's crescent moon. None is a
// logo. Every character stands on Clawd's skeleton (17 × 10 pixels: the body in columns 2..14 and rows 0..7, an arm stub
// each side on rows 4–5, legs on rows 8–9, two eyes a pose moves up to 2 px each way), so every pose the drawings give
// Clawd (typing, a hand up, dozing, standing in the kitchen…) fits each of them. The text office gives each a 3-column
// head of its own.
// Leaf module: no imports at all (model.mjs re-exports Clawd's part for its existing readers). No node:* imports: the
// desktop mod's hooks module loads it.

/** Agent ids, in the order the office names them (a desk without one is Claude's). */
export const AGENT_IDS = ['claude', 'codex', 'gemini', 'cursor', 'kimi', 'grok', 'opencode', 'omp']

// ---------------------------------------------------------------- Clawd

/** Clawd's colors: `{ dark, light }` body orange for a dark or a light background, and his near-black eyes. */
export const CLAWD_HEX = { dark: '#d77757', light: '#c4623f', eye: '#141414' }

/**
 * The official pixel sprite (Claude Code's own "Clawd stirs a steaming pot"), neutral pose, one char per pixel:
 * `C` body, `E` eye, `.` empty. 17 × 10: the arms stick out 2 px each side on rows 4–5, four little legs below.
 * Clawd looks at what he works on by shifting both eyes 1–2 px that way.
 */
export const CLAWD_SPRITE = [
  '..CCCCCCCCCCCCC..',
  '..CCCCCCCCCCCCC..',
  '..CCCECCCCCECCC..',
  '..CCCECCCCCECCC..',
  'CCCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCCC',
  '..CCCCCCCCCCCCC..',
  '..CCCCCCCCCCCCC..',
  '..C.C.......C.C..',
  '..C.C.......C.C..',
]

/**
 * Terminal Clawd for the block-glyph office: Claude Code's welcome-banner sprite shrunk to a 3-column body (6 × 4
 * quadrant pixels). Every entry is a `[unicode, 7-bit]` pair of the same width, so `--ascii` never moves a
 * wall. A 1-row Clawd is his head (`face`: the compact desks, meeting seats, interns, the legend); at a desk a 2nd row
 * adds `body` with an arm stub each side.
 *
 *   ┌───┐ ▛▛█      ..######..   head, eyes 1 px left (on the monitor)
 *   │</>│▝███▘     ..#.#.##..
 *                  .########.   arms 1 px out each side
 *                  ..######..
 */
export const CLAWD_TERM = {
  face: {
    front: ['▛█▜', '["]'], // eyes = the missing inner quadrants of ▛ ▜, as on the banner
    left: ['▛▛█', '["]'], // both eyes 1 px left: on the monitor
    right: ['█▜▜', '["]'], // both eyes 1 px right: on the thought bubble
    talk: ['▛▀▜', '[o]'], // the eyes run together into an open mouth: speaking
    sunk: ['▄▄▄', '[-]'], // head sunk into the shoulders, eyes shut: dozing
  },
  body: ['███', '|_|'],
  arm: {
    left: ['▝', '-'], // shoulder-height stubs, 1 px out
    right: ['▘', '-'],
    low: ['▗', '_'], // left arm down: typing, slumped
    reach: ['▀', '='], // right arm stretched out: handing work off
    elbowL: ['▗', '\\'], // hands behind the head: the boss pose
    elbowR: ['▖', '/'],
    raised: ['▌', '|'], // right arm straight up: hand up
  },
  feet: ['▄', '_'], // up on the desk (boss)
  legs: ['▝ ▘', "' '"], // standing (kitchen)
}

// ---------------------------------------------------------------- the others

/**
 * A head in the text office for a character that is not Clawd: its mark between two half blocks (`▐>▌`), the mark
 * being what the character is known by. It has no eyes to move, so it looks the same whichever way it looks; it talks
 * with an `o` and dozes sunk into its shoulders like Clawd. Body, arms, feet and legs are Clawd's, in its own color.
 */
function termHead(mark, ascii = mark) {
  const head = [`▐${mark}▌`, `[${ascii}]`]
  return { front: head, left: head, right: head, talk: ['▐o▌', '[o]'], sunk: ['▄▄▄', '[-]'] }
}

/**
 * The cast: agent id → its character. `name` is the agent ('Codex'), `who` the character ('Dex'), `trait` one line about
 * it; `hex` its color in the text office's roles ({ dark, light }), `ansi`/`ansi16` its SGR codes, `term` the theme color
 * the desktop pane's terminal draws it in. For the pixel art: `sprite` (17 × 10 on Clawd's skeleton) with `legend`
 * (char → color; an eye char maps to the color behind the eye, which shows when the eye looks away), `eyes` (its eye
 * chars), `eye` (the eye color), `reach` (how far a pose may move the eyes, 2 px when absent: a face on a screen keeps
 * them on it), `arm` (the arms' color, or [left, right]); `mini` (11 × 6, interns) and `micro` (7 × 5, tiny cells) with
 * the same legend. `tag` prefixes its sprite names (Clawd's are `cT0`, `cL`…). `term` heads: `face`.
 */
export const CAST = {
  claude: {
    id: 'claude', name: 'Claude', who: 'Clawd', tag: 'c',
    trait: 'the first tenant: careful, polite, asks before it breaks anything',
    hex: { dark: CLAWD_HEX.dark, light: CLAWD_HEX.light }, ansi: '38;5;173', ansi16: '33', term: 'claude',
    sprite: CLAWD_SPRITE, legend: { C: CLAWD_HEX.dark, E: CLAWD_HEX.dark }, eyes: 'E', eye: CLAWD_HEX.eye, arm: CLAWD_HEX.dark,
    mini: ['.CCCCCCCCC.', '.CCECCCECC.', '.CCECCCECC.', 'CCCCCCCCCCC', '.CCCCCCCCC.', '.C.C...C.C.'],
    micro: ['.CCCCC.', '.CECEC.', 'CCCCCCC', '.CCCCC.', '.C...C.'],
    miniEye: CLAWD_HEX.eye,
    face: CLAWD_TERM.face,
  },
  codex: {
    id: 'codex', name: 'Codex', who: 'Dex', tag: 'dx',
    trait: 'a cloud with a terminal for a face: runs every command itself, patches in tidy diffs',
    hex: { dark: '#7f9df8', light: '#3b5bd6' }, ansi: '38;5;69', ansi16: '34', term: 'ide',
    // after the Codex app's own pet: a periwinkle cloud for a head, lit from above, a navy screen in it for a face with
    // two sleepy cyan eyes (one row tall, reach 1: they look about without leaving the screen), a small body, little feet
    sprite: [
      '....LLLLL.LLL....',
      '...LLLLLLLLLLL...',
      '..LLLLLLLLLLLLL..',
      '..BBKKKKKKKKKBB..',
      'BBBBKEEKKKEEKBBBB',
      'BBBBKKKKKKKKKBBBB',
      '...BBBBBBBBBBB...',
      '.....bbbbbbb.....',
      '......d...d......',
      '.....dd...dd.....',
    ],
    legend: { L: '#7c9cf8', B: '#5a80f0', b: '#4568dc', K: '#1e2a63', E: '#1e2a63', d: '#3a5ac8' },
    eyes: 'E', eye: '#8ff0f7', reach: 1, arm: '#5a80f0',
    mini: ['..LLLL.LL..', '.LLLLLLLLL.', '.BKEEKEEKB.', 'BBKKKKKKKBB', '..BBBBBBB..', '...d...d...'],
    micro: ['.LLLLL.', 'BKEKEKB', 'BKKKKKB', '.BBBBB.', '.d...d.'],
    miniEye: '#8ff0f7',
    face: termHead('>'),
  },
  gemini: {
    id: 'gemini', name: 'Gemini', who: 'Gem', tag: 'gm',
    trait: 'a twin-star dreamer: reads the whole repo in one go, sparkles when an idea lands',
    hex: { dark: '#b49cf6', light: '#6a46c9' }, ansi: '38;5;141', ansi16: '95', term: 'magenta',
    // violet, a four-point sparkle on its brow, pink cheeks
    sprite: [
      '........S........',
      '...VVVVSSSVVVV...',
      '..VVVEVVSVVEVVV..',
      '..VVVEVVVVVEVVV..',
      'VVVVPVVVVVVVPVVVV',
      'VVVVVVVVVVVVVVVVV',
      '..VVVVVVVVVVVVV..',
      '...vvvvvvvvvvv...',
      '..v.v.......v.v..',
      '..v.v.......v.v..',
    ],
    legend: { V: '#a983f2', v: '#8461d8', S: '#fff8d6', P: '#f39ad6', E: '#a983f2' },
    eyes: 'E', eye: '#1b1430', arm: '#a983f2',
    mini: ['.....S.....', '.VVVSSSVVV.', '.VVEVSVEVV.', 'VVPVVVVVPVV', '.vvvvvvvvv.', '.v.v...v.v.'],
    micro: ['...S...', '.VESEV.', 'VVVVVVV', '.vvvvv.', '.v...v.'],
    miniEye: '#1b1430',
    face: termHead('*'),
  },
  cursor: {
    id: 'cursor', name: 'Cursor', who: 'Caret', tag: 'cu',
    trait: 'a quick cube with a caret on its seam: finishes your sentences, tab, tab, tab',
    hex: { dark: '#8fd8e8', light: '#1d7f99' }, ansi: '38;5;116', ansi16: '96', term: 'cyan',
    // a cube seen from a corner: a light top face, a mid left face, a dark right face, a cyan text caret on the seam
    sprite: [
      '....TTTTTTTTT....',
      '..TTTTTTTTTTTTT..',
      '..LLLELLLRRFRRR..',
      '..LLLELLLRRFRRR..',
      'LLLLLLLLIRRRRRRRR',
      'LLLLLLLLIRRRRRRRR',
      '..LLLLLLIRRRRRR..',
      '..LLLLLLLRRRRRR..',
      '..d.d.......d.d..',
      '..d.d.......d.d..',
    ],
    legend: { T: '#e2e6eb', L: '#a3adb9', R: '#76808c', I: '#6fe3ff', E: '#a3adb9', F: '#76808c', d: '#5c6570' },
    eyes: 'EF', eye: '#16191d', arm: ['#a3adb9', '#76808c'],
    mini: ['.TTTTTTTTT.', '.LLELLRRFR.', '.LLELLRRFR.', 'LLLLLIRRRRR', '.LLLLIRRRR.', '.d.d...d.d.'],
    micro: ['.TTTTT.', '.LELFR.', 'LLLIRRR', '.LLIRR.', '.d...d.'],
    miniEye: '#16191d',
    face: termHead('│', '|'),
  },
  kimi: {
    id: 'kimi', name: 'Kimi', who: 'Mooni', tag: 'km',
    trait: 'a night owl from the moon: reads the longest docs, glows after dark',
    hex: { dark: '#6fb2ff', light: '#1f63c9' }, ansi: '38;5;75', ansi16: '94', term: 'blue',
    // sky blue, a pale belly, a little crescent moon on its brow
    sprite: [
      '..BBBBBBBBBBMMB..',
      '..BBBBBBBBBBBBM..',
      '..BBBEBBBBBEBMB..',
      '..BBBEBBBBBEBBB..',
      'BBBBBBBBBBBBBBBBB',
      'BBBBBBWWWWWBBBBBB',
      '..BBBBWWWWWBBBB..',
      '..bbbbbbbbbbbbb..',
      '..b.b.......b.b..',
      '..b.b.......b.b..',
    ],
    legend: { B: '#58a2ff', b: '#3d80e3', W: '#d9ecff', M: '#ffe27a', E: '#58a2ff' },
    eyes: 'E', eye: '#0f1830', arm: '#58a2ff',
    mini: ['.BBBBBBBMB.', '.BBEBBBEBM.', '.BBEBBBEMB.', 'BBBBWWWBBBB', '.bbbbbbbbb.', '.b.b...b.b.'],
    micro: ['.BBBBM.', '.BEBEM.', 'BBWWWBB', '.bbbbb.', '.b...b.'],
    miniEye: '#0f1830',
    face: termHead('('),
  },
  grok: {
    id: 'grok', name: 'Grok', who: 'Rok', tag: 'gk',
    trait: 'a round white blob with big curious eyes: groks the code, cracks a joke first, keeps its towel handy',
    hex: { dark: '#d9dde3', light: '#30343a' }, ansi: '38;5;252', ansi16: '37', term: 'text',
    // after Grok Bot: a round white blob, two tall black eyes set close together and a little to its right, short legs
    sprite: [
      '.....WWWWWWW.....',
      '...WWWWWWWWWWW...',
      '..WWWWWWWWWWWWW..',
      '..WWWWWEWWWEWWW..',
      'WWWWWWWEWWWEWWWWW',
      'WWWWWWWWWWWWWWWWW',
      '...wwwwwwwwwww...',
      '.....wwwwwww.....',
      '.....d.....d.....',
      '.....d.....d.....',
    ],
    legend: { W: '#f2f3f5', w: '#c9ced6', E: '#f2f3f5', d: '#8d949e' },
    eyes: 'E', eye: '#101114', arm: '#f2f3f5',
    mini: ['...WWWWW...', '.WWWWWWWWW.', '.WWWWEWEWW.', 'WWWWWEWEWWW', '..wwwwwww..', '...d...d...'],
    micro: ['.WWWWW.', 'WWEWEWW', 'WWWWWWW', '.wwwww.', '.d...d.'],
    miniEye: '#101114',
    face: termHead('/'),
  },
  opencode: {
    id: 'opencode', name: 'opencode', who: 'Ocho', tag: 'oc',
    trait: 'a little teal terminal on legs: runs whatever model you hand it, and tells you which',
    hex: { dark: '#2bb3a3', light: '#0f6b62' }, ansi: '38;5;37', ansi16: '36', term: 'cyan',
    // an original figure (not opencode's mark): a teal-framed screen, two cursor eyes, a prompt line for a mouth
    sprite: [
      '....OOOOOOOOO....',
      '...OSSSSSSSSSO...',
      '...OSSESSSESSO...',
      '...OSSESSSESSO...',
      'OO.OSSSSSSSSSO.OO',
      '...OSSmmmmmSSO...',
      '...OOOOOOOOOOO...',
      '....ooooooooo....',
      '.....d.....d.....',
      '.....d.....d.....',
    ],
    legend: { O: '#2bb3a3', S: '#0d2b29', E: '#0d2b29', m: '#5eead4', o: '#1a7d73', d: '#0f5550' },
    eyes: 'E', eye: '#5eead4', arm: '#2bb3a3', reach: 1, // eyes stay inside the screen / visor when a pose looks around
    mini: ['.OOOOOOOOO.', '.OSESSSESO.', 'OOSESSSESOO', '.OSSmmmSSO.', '..ooooooo..', '...d...d...'],
    micro: ['OOOOOOO', 'OSESESO', 'OSmmmSO', '.ooooo.', '.d...d.'],
    miniEye: '#5eead4',
    face: termHead('$'),
  },
  omp: {
    id: 'omp', name: 'omp', who: 'Ompa', tag: 'om',
    trait: 'an amber helmet on legs: plans out loud, then runs every step it planned',
    hex: { dark: '#e0b341', light: '#7a5c1c' }, ansi: '38;5;178', ansi16: '33', term: 'text',
    // an original figure: an amber helmet with a dark visor, two lit eyes and a grille for a mouth
    sprite: [
      '.....HHHHHHH.....',
      '....HHHHHHHHH....',
      '...HHFFFFFFFHH...',
      '...HFFEFFFEFFH...',
      'HH.HFFEFFFEFFH.HH',
      '...HFFFFmFFFFH...',
      '....HHHHHHHHH....',
      '.....hhhhhhh.....',
      '.....d.....d.....',
      '.....d.....d.....',
    ],
    legend: { H: '#e0b341', F: '#2a2110', E: '#2a2110', m: '#ffd77a', h: '#b88a2a', d: '#7a5c1c' },
    eyes: 'E', eye: '#ffd77a', arm: '#e0b341', reach: 1, // eyes stay inside the screen / visor when a pose looks around
    mini: ['..HHHHHHH..', '.HFEFFFEFH.', 'HHFEFFFEFHH', '.HFFmmmFFH.', '..hhhhhhh..', '...d...d...'],
    micro: ['.HHHHH.', 'HFEFEFH', 'HFmmmFH', '.hhhhh.', '.d...d.'],
    miniEye: '#ffd77a',
    face: termHead('%'),
  },
}

/** An agent id as the drawings use it: a known one, else 'claude' (facts from before agents had ids are Claude's). */
export function agentId(v) {
  return typeof v === 'string' && Object.hasOwn(CAST, v) ? v : 'claude'
}

/** The character of an agent id (Clawd for anything unknown). */
export const castOf = (v) => CAST[agentId(v)]

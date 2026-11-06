// The promo storyboards, as data: every panel's shot (a camera on one of the plugin's drawings, promo/scenes.mjs, or a
// layout of crops, a terminal and type), its time, move, captions and sound; and the HTML that draws a panel, shared by
// the storyboard sheets (promo/storyboard.mjs) and the editor (promo/editor.mjs)
import path from 'node:path'
import { NARROW, size, terminalHtml, pluginSign, yearOfMonths, crewBox, storyStreet, dayScenes, dayStates } from './scenes.mjs'
import { PAST } from './finale.mjs'
import { SITE_CSS, skyBackground, neonSvg } from './site.mjs'
import { BOX, boxHtml, cardHtml, clockHtml, frameSvg, INK as BOX_INK } from './editor/box.js'
import { VOICE, DAY_VOICE } from './voice.mjs'

export const NIGHT = '#05091f', DAY = '#468cd8', GROUND = '#14120f', INK = '#0b0b12'
export const REEL = [1080, 1920], SQUARE = [1080, 1080]
// Instagram's buttons and caption cover the top ~220 px and the bottom ~420 px of a Reel: text stays between
export const SAFE = { top: 220, bottom: 1500 }

// ---------------------------------------------------------------- shots
// full(): the frame is a window on the drawing, `zoom` screen px per art px, centred on art pixel (cx, cy)
// card(): the art rectangle `src` [x, y, w, h] drawn at `zoom`, its top-left at frame pixel (X, Y) ('mid' centres it)
const full = (scene, cx, cy, zoom, o = {}) => ({ scene, zoom, center: [cx, cy], ...o })
const card = (scene, src, X, Y, zoom, o = {}) => ({ scene, zoom, src, dst: [X, Y], ...o })
// a caption: `*word*` in the neon's yellow
const cap = (text, y, o = {}) => ({ text, y, ...o })

// Hand-up desk, ✓ desk and the rest, in art pixels of the 540-wide live floor (since 1.0's Live rework the building's
// bar sets the floors down under the roof and the rooms are taller: its first row 28 lower, its second 40, the door 44)
const AT = {
  sign: [268, 22], roof: [270, 190], room3F: [175, 138], asking: [118, 126], done: [56, 126], meeting: [400, 205],
  door: [270, 269], train: [310, 477], dexDesk: [245, 126], kimiDesk: [180, 126], codexMeeting: [335, 205],
  gemDesk: [495, 126], caretDesk: [270, 205], kitchen: [470, 205],
}

export const STORYBOARDS = {
  hero: {
    title: 'Your agents have an office now',
    meta: 'Launch video · 15 s · Reels 9:16 (and X 1:1, same shots cropped) · live floor at night',
    panels: [
      { t: '0.0–1.5', move: 'neon flickers on', frame: REEL, sky: NIGHT, vignette: true,
        layers: [full('liveNight', AT.sign[0], AT.sign[1] + 70, 4, { time: 0.4 })],
        captions: [cap('your AI agents\nneed an *office*', 1180, { size: 64 })],
        shot: 'Black. THE OFFICE lights letter by letter, the tired letter stutters, bulbs chase the edge.', sound: 'Neon buzz and click.' },
      { t: '1.5–3.5', move: 'tilt down ↓', frame: REEL, sky: NIGHT,
        layers: [full('liveNight', 270, 205, 3)],
        captions: [],
        shot: 'Slow tilt from the sign past the roof (water tower, pigeons on the coping) into the cut-away floors.', sound: 'Lo-fi chiptune bed comes in.' },
      { t: '3.5–6.0', move: 'push in 6×', frame: REEL, sky: NIGHT,
        layers: [full('liveNight', 190, 150, 6)],
        captions: [cap('every agent\ngets a *desk*', 1340)],
        shot: 'The 3F room: Clawd typing, Mooni testing, Dex browsing. Every desk on its own rhythm.', sound: 'Soft keyboard clicks.' },
      { t: '6.0–8.0', move: 'push in 8×', frame: REEL, sky: NIGHT,
        layers: [full('liveNight', AT.asking[0], AT.asking[1] + 18, 8)],
        captions: [cap('hand up =\nit\'s *waiting on you*', 1300)],
        shot: 'One Clawd raises its hand, a "?" bubble over it: asks "Which cape anchor?"', sound: 'A tiny "hm?" blip.' },
      { t: '8.0–9.5', move: 'whip pan ←', frame: REEL, sky: NIGHT,
        layers: [full('liveNight', AT.done[0], AT.done[1] + 18, 8)],
        captions: [cap('✓ = *your turn*', 1300)],
        shot: 'Next desk: it sits back, a ✓ on its screen, "done, your turn".', sound: 'Ding.' },
      { t: '9.5–11.5', move: 'pan →', frame: REEL, sky: NIGHT,
        layers: [full('liveNight', 420, 165, 5)],
        captions: [cap('workflows *meet*.\nbackground jobs\ntake a *coffee*.', 1320, { size: 52 })],
        shot: 'Meeting room: the whiteboard ticks 5/9 → 6/9. Kitchen: Rok and a Clawd at the water cooler, mugs up.', sound: 'Marker squeak, mug clink.' },
      { t: '11.5–13.5', move: 'tilt down ↓', frame: REEL, sky: NIGHT,
        layers: [full('weekNight', 300, 735, 4)],
        captions: [cap('*595 commits* this week', 1340)],
        shot: 'The street front: an agent walks out of the door and off; under the road the Clawd-faced train hauls its green parcels.', sound: 'Door chime, train rumble.' },
      { t: '13.5–15.0', move: 'end card', frame: REEL, sky: NIGHT, endCard: true,
        layers: [card('liveNight', [0, 0, 540, 250], 'mid', 520, 2)],
        captions: [],
        shot: 'The building by night, the sign glowing. Name, what it is, install line, the privacy line.', sound: 'Paper flip (sounds/page.mp3), music out.' },
    ],
  },
  timelapse: {
    title: 'My agents\' week in 8 seconds',
    meta: 'Timelapse loop · 8.4 s replay + hold · Reels 9:16 here; X takes the page\'s own Save video (16:9) as is',
    panels: [
      ...[
        [0, '0.0', 'Tue 03:00', 'The building asleep: rooms dark, door closed, night sky. Under it, the busiest room close up; the sign\'s clock runs the hours.', 'Night ambience.', [cap('what my agents did\nwhile I *slept*', 270, { size: 60 })]],
        [0.35, '0.35', 'Tue 10:00', 'Dawn crossfades to day; the first agents walk up to the door and take their desks.', 'Beat drops.', [cap('*Tue*', 290, { size: 72 })]],
        [0.85, '0.85', 'Tue 20:00', 'Dusk: rooms go dark one by one, the last agents walk out and off down the sidewalk.', '', [cap('*Tue*', 290, { size: 72 })]],
        [2.8, '2.8', 'Thu 11:00', 'The busiest hour of the week: 11 at work, the meeting room full, interns under the desks.', 'Music at its fullest.', [cap('*Thu* · busiest hour', 300, { size: 60 })]],
        [5.4, '5.4', 'Sat 15:00', 'The weekend: a few desks, mostly shutters. The sun and moon keep crossing behind the sign.', 'Music thins out.', [cap('*Sat*', 290, { size: 72 })]],
        [7.95, '7.95–10.5', 'Mon 18:00', 'The last hour, held (the built-in pause), then it loops to the dark start.', 'Loops seamlessly.', [cap('7 days · 92 sessions\n*81 commits*', 270, { size: 60 })]],
      ].map(([time, t, clock, shot, sound, captions]) => ({
        t: `${t} s`, move: clock, frame: REEL, sky: INK,
        layers: [card('lapseWeek', [0, 0, 540, 347], 0, 440, 2, { time }), card('lapseWeek', [10, 58, 270, 75], 0, 1170, 4, { time })],
        captions,
        shot, sound,
      })),
    ],
  },
  meme: {
    title: 'When you forget to answer your agent',
    meta: 'Meme · 9 s · Reels 9:16 and X 1:1 · one desk, locked-off 8× shot, day into night',
    panels: [
      { t: '0.0–1.5', move: 'locked off 8×', frame: REEL, sky: DAY, layers: [full('memeTyping', AT.asking[0], AT.asking[1] - 20, 8)],
        captions: [cap('you: "go ahead,\nI\'ll be right back"', 220, { band: true })], shot: '16:10. Clawd types away on the cape rig.', sound: 'Fast keyboard.' },
      { t: '1.5–3.0', move: '', frame: REEL, sky: DAY, layers: [full('memeAsk', AT.asking[0], AT.asking[1] - 20, 8)],
        captions: [cap('you: "go ahead,\nI\'ll be right back"', 220, { band: true, held: true })], shot: 'Its hand goes up, "?" bubble: asks "Which cape anchor?"', sound: 'Blip. Silence.' },
      { t: '3.0–5.0', move: 'time skip', frame: REEL, sky: NIGHT, layers: [full('memeStill', AT.asking[0], AT.asking[1] - 20, 8)],
        captions: [cap('6 hours later', 220, { band: true })], shot: '22:10. Night through the window, the room under its ceiling light. The hand is still up.', sound: 'Clock ticking, crickets.' },
      { t: '5.0–6.5', move: 'hard cut', frame: REEL, sky: NIGHT, layers: [full('memeAnswer', AT.asking[0], AT.asking[1] - 20, 8)],
        captions: [cap('you, finally:\n"yes"', 220, { band: true })], shot: 'You answer: it types like mad.', sound: 'Keyboard at double speed.' },
      { t: '6.5–7.5', move: '', frame: REEL, sky: NIGHT, layers: [full('memeDone', AT.asking[0], AT.asking[1] - 20, 8)],
        captions: [cap('you, finally:\n"yes"', 220, { band: true, held: true })], shot: 'Sits back, ✓ on the screen: "done, your turn".', sound: 'Ding.' },
      { t: '7.5–9.0', move: 'hold', frame: REEL, sky: NIGHT, layers: [full('memeDoze', AT.asking[0], AT.asking[1] - 20, 8)],
        captions: [cap('its turn\nto wait', 220, { band: true })], shot: '23:40. You don\'t look. It dozes off at the desk, "z".', sound: 'Snore. Music out.' },
    ],
  },
  cast: {
    title: 'Meet the staff',
    meta: 'Cast intro · 12 s · Reels 9:16 · then an IG carousel of the six badges (4:5)',
    panels: [
      { t: '0.0–1.0', move: 'lights on', frame: REEL, sky: NIGHT, layers: [full('liveEmpty', 270, 190, 3)],
        captions: [cap('the office\nis *hiring*', 1350, { size: 64 })], shot: 'The empty floor, lights off. They flick on room by room.', sound: 'Light switch clacks.' },
      ...[
        ['Clawd', 'Claude', 'asks before it breaks anything', 'coding', 'liveNight', [312, 92], [72, 301]],
        ['Dex', 'Codex', 'runs every command itself', 'dex', 'liveNight', [246, 92], [206, 301]],
        ['Gem', 'Gemini', 'reads the whole repo in one go', 'gem', 'liveNight', [497, 92], [340, 301]],
        ['Caret', 'Cursor', 'tab, tab, tab', 'caret', 'liveNight', [140, 160], [72, 339]],
        ['Mooni', 'Kimi', 'night owl, reads the longest docs', 'kimi', 'liveNight', [182, 92], [206, 339]],
        ['Rok', 'Grok', 'cracks a joke first', 'grok', 'liveNight', [462, 160], [340, 339]],
      ].map(([name, agent, line, , scene, [cx, cy], [bx, by]], i) => ({
        t: `${(1 + i * 1.4).toFixed(1)}–${(2.4 + i * 1.4).toFixed(1)}`, move: 'walk in · badge slides up', frame: REEL, sky: INK,
        layers: [card(scene, [cx - 67.5, cy - 38, 135, 72], 0, 300, 8), card('monthNight', [bx, by, 128, 33], 'mid', 960, 7)],
        captions: [cap(`*${name}* · ${agent}\n${line}`, 1250, { size: 48 })],
        shot: `${name} walks to its desk and sits; its staff badge (the Month's crew room) slides up.`, sound: i === 5 ? 'Rimshot.' : 'Pop.',
      })),
      { t: '9.5–12.0', move: 'pull back', frame: REEL, sky: NIGHT, layers: [full('liveNight', 270, 205, 2)],
        captions: [cap('one office.\n*every agent* you use.', 1400)], shot: 'All six at work on one floor; the header counts them.', sound: 'Music resolves.' },
    ],
  },
  tower: {
    title: 'One floor per project',
    meta: 'Week tower · 10 s · Reels 9:16 · the tower is already 1080 × 1896, so this is one vertical pan',
    panels: [
      { t: '0.0–2.0', move: 'start at street', frame: REEL, sky: NIGHT, layers: [full('weekNight', 270, 720, 3)],
        captions: [cap('every project\ngets a *floor*', 300)], shot: 'The street front: door, lamps, passers-by; the train under the road.', sound: 'City night, train.' },
      { t: '2.0–4.5', move: 'tilt up ↑', frame: REEL, sky: NIGHT, layers: [full('weekNight', 270, 450, 3)],
        captions: [cap('one window per *day*', 300)], shot: 'Up the floors: lit windows, shutters down on days off, ×5 tags where more agents worked.', sound: '' },
      { t: '4.5–7.0', move: 'tilt up ↑', frame: REEL, sky: NIGHT, layers: [full('weekNight', 270, 260, 3)],
        captions: [cap('the brighter,\nthe *busier*', 1380)], shot: 'The busy floors: rooms ablaze, awnings out, the ★ busiest-day column.', sound: '' },
      { t: '7.0–9.0', move: 'arrive at top', frame: REEL, sky: NIGHT, layers: [full('weekNight', 270, 120, 3)],
        captions: [cap('the busiest one gets\nthe *penthouse*', 1380)], shot: 'The penthouse: crown on its nameplate, flag, glowing fanlights, the marquee of the week.', sound: 'Fanfare blip.' },
      { t: '9.0–10.0', move: 'pull back', frame: REEL, sky: NIGHT, endCard: true, layers: [card('weekNight', [0, 0, 540, 680], 'mid', 300, 1)],
        captions: [], shot: 'The whole tower, the sign on top. End card.', sound: 'Paper flip.' },
    ],
  },
  loops: {
    title: 'Small loops for X',
    meta: 'Between the big posts · 2–6 s each · 1:1, autoplays muted, loops',
    panels: [
      { t: '4 s loop', move: 'commits line', frame: SQUARE, sky: GROUND, layers: [full('weekNight', 420, 735, 6)],
        captions: [cap('595 commits this week.\nthe train is *tired*.', 160)], shot: 'The Clawd-faced train hauls a green parcel per commit, ten to a wagon.', sound: 'Silent (autoplay).' },
      { t: '2 s loop', move: 'neon sign', frame: SQUARE, sky: NIGHT, layers: [full('liveNight', AT.sign[0], AT.sign[1] + 30, 3.6, { time: 1.2 })],
        captions: [cap('*open* late', 900)], shot: 'The sign\'s tired letter flickers, the bulbs chase, the neon blooms.', sound: 'Silent.' },
      { t: '6 s loop', move: 'split screen', frame: SQUARE, sky: INK, layers: [card('liveNight', [0, 58, 540, 196], 0, 100, 2), { html: 'terminal', x: 40, y: 512, w: 1000, h: 548, font: 15.5 }],
        captions: [cap('pixel pane · chat · *terminal*', 22, { size: 40 })], shot: 'The pixel office beside the same floor as text, both updating live.', sound: 'Silent.' },
      { t: '3 s loop', move: 'seasons', frame: SQUARE, sky: GROUND, layers: [card('monthNight', [18, 75, 198, 180], 'mid', 140, 4)],
        captions: [cap('the calendar keeps\nthe *season*', 900, { size: 48 })], shot: 'The Month\'s wall calendar: autumn now, the snow-Clawd in December.', sound: 'Silent.' },
    ],
  },
}

// The opening is drawn in the website's own look: its night sky behind every shot (sky: SITE), its terminal and its
// neon sign (promo/site.mjs). The office's shots are isolated (iso: an art rectangle), each a framed window on one
// scene. What moves besides the drawings is the player's (promo/editor/player.js), in seconds of the shot.
const SITE = 'site'
const NOTE = { kind: 'note', text: '# Claude Code · ~/git/island-tour-3d' }
const STERM = { x: 65, y: 760, w: 380, zoom: 2.5 }
// typed in by 3.3 s, the caret blinking after, so the last line reads whole before the video ends
const INSTALL = [
  { kind: 'note', text: '# Claude Code 2.1.308+ · Node 24+ · No dependencies', show: 0.8 },
  { kind: 'cmd', text: '/plugin marketplace add Makio64/theoffice-agents', show: 1.0, type: '1.0,50' },
  { kind: 'cmd', text: '/plugin install theoffice@makio64', show: 2.0, type: '2.0,50' },
  { kind: 'note', text: '# then, in a new session', show: 2.8 },
  { kind: 'go', text: '/theoffice', show: 2.9, type: '2.9,25', caret: '3.4,0.5' },
]
// a caption that pops in (a stepped overshoot) a beat into its shot
const say = (text, y, at = 0.1) => cap(text, y, { fx: `pop:${at}:0.3` })
// the mosaic cut, an SNES-style pixelate out and back in: only at the turns of the story, hard cuts everywhere else
const MOSAIC = 0.3
// The one office (pOffice: the extension in a 9:16 pane, every room in it) as one scroll, as the week's and the month's:
// at 4 px a pixel the building is exactly the frame's width; from the sign down every floor and the basement to its
// commits line. Two clips (a caption each) that run on from each other: the camera and the drawing's clock continue,
// easing in from the top and out onto the train. The train crosses the line every 19.3 s and is mid-frame 2.1 s into a
// pass, so the clock starts at 17.8: the camera reaches it 3.6 s later, at 21.4 (2.1 + 19.3).
const SCROLL = { top: 292, mid: 538, train: 699, time: 17.8, a: 2.0, b: 2.4, arrive: 1.6 }
const scrollA = { layers: [full('pOffice', 135, SCROLL.top, 4, { time: SCROLL.time })],
  keys: [{ t: 0, x: 135, y: SCROLL.top, zoom: 4, ease: 'in' }, { t: 'end', x: 135, y: SCROLL.mid, zoom: 4 }] }
const scrollB = { layers: [full('pOffice', 135, SCROLL.mid, 4, { time: SCROLL.time + SCROLL.a })],
  keys: [{ t: 0, x: 135, y: SCROLL.mid, zoom: 4, ease: 'out' }, { t: SCROLL.arrive, x: 135, y: SCROLL.train, zoom: 4 }, { t: 'end', x: 135, y: SCROLL.train, zoom: 4 }] }
// the end card's column, centred on the safe zone: the plugin's night sign (6 px a pixel: 954 × 246, as wide as the
// terminal), the terminal, the credit
const COLUMN = { sign: 478, term: 784, credit: 1218 }
const SIGN_LINES = [[['available in ', '#ece2cd'], ['Claude Code', '#d77757']], [['a pixel-art office for your coding agents', '#a4977c']]]

STORYBOARDS.opening = {
  title: 'From /theoffice to the whole building',
  meta: 'Launch video, your cut · ~16 s · Reels 9:16 · the site\'s terminal on its sky, the agents walk in, then three scrolls at the pane\'s own width (the office down to its commit train, the week, the month), the sign and install · hard cuts, a mosaic at the turns',
  panels: [
    // the terminal assembles from squares growing along its diagonal as it pops in with a stepped overshoot
    { t: '0.0–0.9', move: 'blocks assemble', frame: REEL, sky: SITE,
      layers: [{ siteTerm: { title: 'claude — ~/git/island-tour-3d', lines: [NOTE, { kind: 'go', text: '', caret: '0.55,0.5' }] }, fx: 'blocks:0.05:0.4 pop:0.05:0.5', ...STERM }],
      captions: [], shot: 'The site\'s sky. Its terminal assembles from squares sweeping along its diagonal, popping in with a stepped bounce; the caret blinks on the yellow line.', sound: '8-bit rising arpeggio, a thud on the bounce.' },
    // "/theoffice" typed in the site's yellow, 10 letters a second from 0.15 s; the caret steady while it types
    { t: '0.9–2.3', move: 'typing', frame: REEL, sky: SITE, fx: { out: 'mosaic', dur: MOSAIC },
      layers: [{ siteTerm: { title: 'claude — ~/git/island-tour-3d', lines: [NOTE, { kind: 'go', text: '/theoffice', type: '0.15,10', caret: '1.2,0.5' }] }, ...STERM }],
      captions: [], shot: '"/theoffice" types itself in yellow, letter by letter; Enter, and the picture breaks into big pixels.', sound: 'Key clicks, one per letter, then Enter.' },
    // the timelapse runs an hour per 0.05 s: slowed here, so the agents walk up and in at a walk
    { t: '2.3–4.3', move: 'doors open', frame: REEL, sky: SITE, rate: 0.025, fx: { in: 'mosaic', out: 'mosaic', dur: MOSAIC },
      layers: [full('lapseStreet', 262, 210, 7, { time: 0.212, doors: [0.15, 0.45] })],
      keys: [{ t: 0, x: 258, y: 210, zoom: 7 }, { t: 'end', x: 278, y: 210, zoom: 7 }],
      captions: [], shot: 'The pixels settle on the office from the street: brick and windows over the door. The glass doors swing open, Dex and a Clawd walk up and in.', sound: 'Door chime, footsteps.' },
    { t: '4.3–6.3', move: 'scroll down ↓', frame: REEL, sky: SITE, fx: { in: 'mosaic', dur: MOSAIC }, ...scrollA,
      captions: [say('see what your agents do\n*live*', 300, 0.3)],
      shot: 'Inside, the whole office at its own width, as the pane draws it: from the sign down past the desks, the bosses and Caret\'s interns, the kitchen, the meeting room, the entrance, into the basement.', sound: 'Music kicks in.' },
    { t: '6.3–8.7', move: 'scroll down ↓', frame: REEL, sky: SITE, ...scrollB,
      captions: [say('every commit\nrides the *train*', 860, 1.3), say('1 parcel = *1 commit*', 1330, 1.6)],
      shot: 'On down through what they did to the commits line under the basement, easing to a stop on the train as it passes: its plate, its green parcels, the Clawd-faced engine.', sound: 'Train rumble, a horn.' },
    { t: '8.7–10.3', move: 'scroll up ↑', frame: REEL, sky: SITE,
      layers: [full('pWeek', 135, 492, 4)], keys: [{ t: 0, x: 135, y: 492, zoom: 4 }, { t: 'end', x: 135, y: 240, zoom: 4 }],
      captions: [say('over the *week*', 300)], shot: 'The week\'s tower, as the pane draws it: up from the street, a floor per project, each day\'s hours on its window, to the week\'s card and its days.', sound: '' },
    { t: '10.3–11.9', move: 'scroll down ↓', frame: REEL, sky: SITE, fx: { out: 'mosaic', dur: MOSAIC },
      layers: [full('pMonth', 135, 240, 4)], keys: [{ t: 0, x: 135, y: 240, zoom: 4 }, { t: 'end', x: 135, y: 281, zoom: 4 }],
      captions: [say('or this *month*!', 300)], shot: 'The month: the wall calendar, the crew beside it, down to the directory.', sound: '' },
    { t: '11.9–16.1', move: 'sign + terminal', frame: REEL, sky: SITE, fx: { in: 'mosaic', dur: MOSAIC },
      layers: [{ pluginSign: { w: 159, scale: 6, lines: SIGN_LINES }, fx: 'drop:0.15:0.5', x: 63, y: COLUMN.sign },
        { siteTerm: { title: 'move in — claude', lines: INSTALL }, fx: 'blocks:0.5:0.35 pop:0.5:0.4', x: 64, y: COLUMN.term, w: 476, zoom: 2 },
        { raw: '<div class="s-credit">by <b>Makio64</b></div>', fx: 'pop:3.4:0.3', x: 0, y: COLUMN.credit, w: 1080 }],
      captions: [], shot: 'The plugin\'s own sign at night drops in with a stepped bounce, its neon glowing as on the roof, its bulbs chasing; the terminal assembles under it and types the install lines and /theoffice; by Makio64.', sound: 'A thud, keys, then the paper flip (sounds/page.mp3).' },
  ],
}

// The story: every day the agents go in, but what do they do in there? A narrator tells it (an ElevenLabs voice cut
// into its lines: promo/voice.mjs) and a role-playing game's text box over the bottom of the safe zone types what it
// says as it says it (promo/editor/box.js), on four pages; the rest is told by the pictures, an 8-bit score and the
// sounds the panels place (promo/audio/, mixed by promo/export.mjs). The box leaves the frame from the safe zone's top
// to its own (220 → 1265): a shot under it puts what it is about in the middle of that, row `y` of the drawing at
// frame row STAGE; a shot with no box, in the middle of the safe zone (MID).
const STAGE = 740
const MID = 860
const over = (y, zoom, row = STAGE) => Math.round((y + (960 - row) / zoom) * 10) / 10
// A page of the box typed with the narrator's line: from `at` (seconds of the shot), its letters done a little before
// the voice is (its line's length, promo/voice.mjs VOICE, less 0.6 s)
const letters = (text) => text.replace(/[*\n]/g, '').length
const spoken = (text, line, at, o = {}) => ({ text, box: true, at, cps: Math.round((letters(text) / (VOICE[line] - 0.6)) * 10) / 10, ...o })
const held = (text) => ({ text, box: true, at: -9 })
// A sound a panel starts `at` seconds into its shot: promo/audio/<name>, at `gain` dB, from `from` into its file for
// `dur`, faded in and out; the narrator's lines on the voice bus, the score on the music bus (ducked under the voice)
const sfx = (name, at, o = {}) => ({ name, at, ...o })
const vo = (line, at) => ({ name: `vo-${line}`, at, bus: 'voice' })
// the story's street (its timelapse as wide as the end's, promo/scenes.mjs storyStreet): its middle and its door's middle row
const STREET = storyStreet()
STREET.x = STREET.w / 2
const DOOR_ROW = STREET.door
// the timelapse's Thursday, the week's busiest day (it skips its empty hours, so these are read off its own clock):
// 07:00, daylight and the office still empty as the six walk in (the user likes it empty before they arrive), barely
// moving (ARRIVE_RATE); then the day run from 08:00, the windows filling to the busy late morning (DAY_PEAK), on
// into the night and the shut office after midnight
const MORNING = 2.625
const ARRIVE_RATE = 0.01
const NIGHT_T = 3.45
const ARRIVE_ZOOM = 5.5
// the door's row in the frame for the arrivals: low, so both floors of windows over it are in the safe zone
const ARRIVE_ROW = 965
const DAY_FROM = MORNING + 3 * ARRIVE_RATE
const DAY_PEAK = 2.88
// the building whole (the busy day, the night shot's opening) at 2.5×, as the end has its own: 1000 px of the frame,
// four floors over its lobby, five windows across, its sign the plugin's half of the roof, the sky and the neighbours
// round it
const WIDE = { zoom: 2.5 }
WIDE.y = over(0, WIDE.zoom, 300)
// the night shot's push, from the whole façade under its sky (2.5×) to the door (6×)
// over its 2.5 s; then the console over the bottom of the frame, under the door
const PUSH = { from: WIDE.zoom, to: 6, dur: 2.5 }
const CONSOLE = { x: 122, y: 1225, w: 380, zoom: 2.2 }
const OUTRO = STORYBOARDS.opening.panels.at(-1)
// The score (promo/audio/music.mp3, 120 bpm): its quiet opening under the morning, nothing at night, and from the
// montage on its groove, which comes in on a hit at 12.0 s of the file, so every cut falls on a beat. Too short for
// the rest (its last chord stops at 28.45), it goes back four bars once, on a bar, under the narrator (who ducks it):
// 10 s into the montage (the file at 22.0) it plays on from 14.0, so the chord stops as the video ends
const GROOVE = 12.0
const SPLICE = { at: 10, from: 14 }
// The montage inside: the cast at work in pWorking (the office without its labels), a cut on a beat, at 10×, each
// shot's room lit and the rest of the building dimmed (focus), the camera drifting a little, by turns right and left;
// over each, what the office says about it, a stat card a subject popping in on the beats (promo/editor/box.js). `x`,
// `y` the subject's middle and `box` its room, in art pixels; `dur` seconds; cards [title, line, color] left then right.
const CARD_Y = 560
const WORK = [
  { x: 78, y: 122, box: [18, 80, 242, 77], dur: 1.5, move: 'code', cards: [['Clawd', 'coding · 1h 42m', '#d77757'], ['Dex', 'terminal · 54m', '#7aa2f7']],
    shot: 'Inside, the work: on 5F Clawd codes, the code typing itself on its monitor; next to it Dex runs commands in its terminal. Their cards pop up on the beats.' },
  { x: 197, y: 122, box: [18, 80, 242, 77], dur: 1.5, move: 'tests + web', cards: [['Rok', 'web · 23m', '#e8e8e8'], ['Mooni', 'tests · 2h 05m', '#6cb6ff']],
    shot: 'Further along 5F: Rok browses the docs, the page loading; Mooni runs the tests, the ticks going green.' },
  { x: 198, y: 202, box: [140, 160, 120, 76], dur: 1, move: 'interns', cards: [['Caret', '+3 interns · 38m', '#8fd3dc']],
    shot: '4F: Caret codes, three mini Carets hopping on the interns\' bench in front of its desk.' },
  // the basement in two tiers since 1.0: the server room the top tier's first, the phone booth and the art studio the
  // last row's first two
  { x: 98, y: 419, box: [18, 393, 161, 52], dur: 1, move: 'server room', cards: [['Server room', '39% · 20.1k calls', '#9ab86a']],
    shot: 'The basement\'s server room: Clawd, Dex, another Clawd and Gem typing at the racks, their lights blinking.' },
  { x: 98, y: 620, box: [18, 594, 159, 52], dur: 1.5, move: 'phone booth + art studio', cards: [['Phone booth', 'talking to you', '#e07a61'], ['Art studio', 'design · 1.1k', '#f58fb7']],
    shot: 'Dex on the phone in the red booth, a speech bubble; next door Clawd paints at its easel.' },
]
// a subject's cards: one alone a little left of the middle, two on the left and the right, the second a beat later
const cardsOf = (list) => list.map(([title, text, color], i) => ({ card: true, title, text, color, x: list.length === 1 ? 250 : i ? 560 : 50, y: CARD_Y, at: 0.05 + i * 0.5 }))
// The commits line closes it, a bar long: the camera rides along with the train (20.6 art px a second, its middle at
// x 120 at 1.37 s of the drawing's clock), its wagons of green parcels under the tunnel lamps
const TRAIN = { x: 120, y: 690, time: 1.37, speed: 20.6, box: [0, 669, 270, 34], dur: 2 }
const WORK_AT = 9.4
// a panel's time as the sheet writes it, to the hundredth (the month flips are quarter-seconds)
const sec = (v) => v.toFixed(2).replace(/0$/, '')
const span = (a, d) => `${sec(a)}–${sec(a + d)}`
const workPanels = () => {
  let t = WORK_AT, clock = 5
  const panels = WORK.map((w, i) => {
    const side = i % 2 ? -1 : 1, y = over(w.y, 10, MID)
    const p = { t: span(t, w.dur), move: w.move, frame: REEL, sky: SITE,
      ...(i === 0 ? { fx: { in: 'mosaic', dur: MOSAIC } } : {}),
      layers: [full('pWorking', w.x, y, 10, { time: clock, focus: w.box })],
      keys: [{ t: 0, x: w.x - 3 * side, y, zoom: 10, ease: 'linear' }, { t: 'end', x: w.x + 3 * side, y, zoom: 10 }],
      captions: cardsOf(w.cards), shot: w.shot, sound: i === 0 ? 'The score\'s groove kicks in on the cut, busy office under it; a pop a card.' : '',
      sounds: [...(i === 0 ? [sfx('music', 0, { from: GROOVE, dur: SPLICE.at, gain: -4, fadeOut: 0.03, bus: 'music' }), sfx('office', 0, { dur: 8.5, gain: -2, fadeOut: 0.5 })] : []),
        ...w.cards.map((_, k) => sfx('pop', 0.05 + k * 0.5, { gain: -16 }))] }
    t += w.dur
    clock += w.dur
    return p
  })
  const y = over(TRAIN.y, 10, MID)
  panels.push({ t: span(t, TRAIN.dur), move: 'ride the train', frame: REEL, sky: SITE,
    layers: [full('pWorking', TRAIN.x, y, 10, { time: TRAIN.time, focus: TRAIN.box })],
    keys: [{ t: 0, x: TRAIN.x, y, zoom: 10, ease: 'linear' }, { t: 'end', x: Math.round((TRAIN.x + TRAIN.speed * TRAIN.dur) * 10) / 10, y, zoom: 10 }],
    captions: cardsOf([['Commits line', '18 commits today', '#6f91dc']]),
    shot: 'Under the basement, the camera rides along with the commits train: the Clawd-faced engine, its wagons of green parcels, the tunnel lamps going by.',
    sound: 'Train rumble, a horn.',
    sounds: [sfx('train', 0.2, { gain: -12 }), sfx('pop', 0.05, { gain: -16 })] })
  return panels
}
const WORK_END = WORK_AT + WORK.reduce((a, w) => a + w.dur, 0) + TRAIN.dur
// What the office tells you, a beat apart: what they are doing right now (liveNow, everyone at work: the building from
// its sign down to its door, 320 art px wide at 3×, the camera tilting from the one to the other), which projects they
// worked on this week (pWeek: from the street up past a floor a project to the sign), then the crew (each AI, its
// agents and its hours). Rows in art pixels: the top one in a shot (the sign's) goes on the safe zone's top, the bottom
// one (the sidewalk's) on the box's top, BOX_TOP; a beat a shot, cut on the beat as the montage is
const BOX_TOP = 1265
const NOW = { x: 160, top: 0, foot: 444, zoom: 3, dur: 2.5 }
const WEEK = { x: 160, foot: 544, top: 0, zoom: 3, dur: 2.5, arrive: 1.7 }
// the crew in the month's building at the same width (weekNow and monthNow are dressed as liveNow is): since 1.0 it
// hangs beside the wall calendar, under the employee of the month, a line an AI (its character, its hours, its share).
// The camera comes down onto it at the office's width, the rest of the building dimmed lightly round it, then pushes in
// (`push`: the column as tall as the room over the text box) towards it, the building's edge on the frame's
const CREW = { x: 160, ...crewBox(), zoom: 3, push: 5, dim: 0.55 }
CREW.row = CREW.box[1] + CREW.box[3] / 2
CREW.to = Math.min(CREW.box[0] + CREW.box[2] / 2, NARROW.now - 540 / CREW.push)
const CREW_DUR = 2
// Then the year, month after month: the wall calendar's page flipped a half-beat a month (promo/scenes.mjs YEAR: its
// picture the month's season, its sign the month's hours), the last held; a card with the month and its hours
const MONTHS = yearOfMonths()
const FLIP = 0.25, LAST = 1.25
const FLIP_PAGE = 'and for *how long*...\nmonth after *month*.'
const flipPanels = (start) => MONTHS.map((m, k) => {
  const dur = k === MONTHS.length - 1 ? LAST : FLIP, from = start + k * FLIP
  return { t: span(from, dur), move: k ? m.label : `flip: ${m.label}`, frame: REEL, sky: SITE,
    ...(k === MONTHS.length - 1 ? { fx: { out: 'mosaic', dur: MOSAIC } } : {}),
    // the month's sign on the safe zone's top
    layers: [full(`pCal${k}`, 135, over(0, 4, SAFE.top), 4)],
    // the page types on across the flips: its start kept where it was, in seconds of each flip
    captions: [spoken(FLIP_PAGE, 'g', 0.25 - k * FLIP),
      { card: true, big: true, title: m.label, text: `${m.hours} h`, x: 772, y: 600, ...(k === MONTHS.length - 1 ? { at: 0 } : {}) }],
    sounds: [sfx('page', 0, { gain: -8 }), ...(k === 0 ? [vo('g', 0.2)] : [])],
    shot: k ? `${m.label}: ${m.hours} h.` : `The wall calendar, flipped a page a half-beat: November to October, its picture turning with the seasons (the snow-Clawd in winter, blossom in spring, the beach in summer, pumpkins in October), the sign over it and a card saying each month's hours: ${m.label}, ${m.hours} h.`,
    sound: k ? '' : 'A paper flip a page. Narrator: "and for how long… month after month."' }
})
// The end, as the Timelapse plays it: the week replayed in the building (lapseEnd, 400 art px wide at 2.5×: 1000 px of
// the frame, five floors from its sign down to its door, dressed round with sky, neighbours and ground: promo/finale.mjs),
// from Thursday 02:30 to Friday's dusk at 18:30 at `rate` of its pace (an hour each 0.05 s from Tue 02:00: a day in
// 3 s), the sky turning, the rooms lighting up and going dark, the agents coming and going at the door, the sign's clock
// running; the install console under it in a pixel box as wide as the building's walls (art 10–390), its foot on the
// safe zone's. `top`: the frame row of the drawing's top
const FINALE = { cx: 200, top: 232, zoom: 2.5, time: 2.425, rate: 0.4, dur: 5, box: { x: 65, y: 1166, w: 950, h: 316 } }
// its console: the install lines (the opening's, its requirements line left out for room), then the site's address
// with the credit at the line's end, in once /theoffice is typed
const FINALE_LINES = [...INSTALL.slice(1), { kind: 'link', text: 'https://theoffice.makio.io', aside: 'by Makio64', show: 3.35 }]

STORYBOARDS.story = {
  title: 'What did your agents do?',
  meta: 'Story cut · ~34 s · Reels 9:16 · a narrator (ElevenLabs) and a game\'s text box typing what it says: every day they go in, but what do they do in there? /theoffice typed under the door, the cast at work with their stats on the beat, everyone right now, the week\'s projects, the crew, the year month after month, the week replayed in the Timelapse and install · an 8-bit score and sound design',
  blips: false,
  panels: [
    // the six walk in on their own clock (arrivals, 2× pace) over the morning street, the timelapse slowed to a crawl;
    // over the door two floors of windows, the rooms behind them still empty
    { t: '0.0–3.0', move: 'they arrive', frame: REEL, sky: SITE, rate: ARRIVE_RATE, still: 1.6,
      layers: [full('streetQuiet', STREET.x, over(DOOR_ROW, ARRIVE_ZOOM, ARRIVE_ROW), ARRIVE_ZOOM, { time: MORNING, doors: [0.9, 1.3] }),
        full('arrivals', STREET.x, over(DOOR_ROW, ARRIVE_ZOOM, ARRIVE_ROW), ARRIVE_ZOOM, { time: 0, own: 2 })],
      keys: [{ t: 0, x: STREET.x - 8, y: over(DOOR_ROW, ARRIVE_ZOOM, ARRIVE_ROW), zoom: ARRIVE_ZOOM }, { t: 'end', x: STREET.x + 8, y: over(DOOR_ROW, ARRIVE_ZOOM, ARRIVE_ROW), zoom: ARRIVE_ZOOM }],
      captions: [spoken('Every day, your agents\ngo to *work*.', 'a', 0.35, { fx: 'rise:0.1:0.3' })],
      sounds: [vo('a', 0.3), sfx('music', 0, { dur: 4.8, gain: 2, fadeOut: 0.6, bus: 'music' }), sfx('street', 0, { gain: -10, fadeOut: 0.4 }),
        sfx('pop', 0.1, { gain: -14 }), sfx('door', 0.85, { gain: -6 })],
      shot: 'Thursday, 7 in the morning, at the office\'s door, two floors of windows over it, the rooms behind them still empty. Clawd, Dex, Gem, Mooni, Caret and Rok hurry up the sidewalk by turns from the left and the right; the glass doors swing open and each goes in. The text box rises in under them.',
      sound: 'The score\'s soft opening, birds and footsteps, the door\'s bell. Narrator: "Every day, your agents go to work."' },
    // Thursday, framed as the night shot opens (the whole façade, the sign and its clock clear of the header, the sky
    // over it): a slow second through the busy hours, the windows full of agents, then a quick run into the night, the
    // rooms going dark one by one; the page stays. The night shot picks up the same framing, so it is one shot
    { t: '3.0–4.0', move: 'a busy day', frame: REEL, sky: SITE, rate: Math.round(((DAY_PEAK - DAY_FROM) / 1) * 1000) / 1000,
      layers: [full('streetLapse', STREET.x, WIDE.y, WIDE.zoom, { time: DAY_FROM })],
      captions: [held('Every day, your agents\ngo to *work*.')], sounds: [sfx('clock', 0, { gain: -10, fadeOut: 0.2 })],
      shot: 'The whole façade from its sign down under the sky, Thursday running: the windows filling with agents at their desks, coming and going at the door.', sound: 'A clock ticking fast, the score fading out.' },
    { t: '4.0–4.6', move: 'into the night', frame: REEL, sky: SITE, rate: Math.round(((NIGHT_T - DAY_PEAK) / 0.6) * 1000) / 1000,
      layers: [full('streetLapse', STREET.x, WIDE.y, WIDE.zoom, { time: DAY_PEAK })],
      captions: [held('Every day, your agents\ngo to *work*.')], sounds: [],
      shot: 'On faster: the dusk warms the brick, the rooms go dark one by one, the night turns it blue.', sound: '' },
    // after midnight, the office shut: from the whole façade under the night sky (the sign on the safe zone's top, the
    // moon and the stars over it) a push in on the door; the lamps glowing, standby lights blinking in the dark
    // windows, a cat going by (the last two on their own clocks)
    { t: '4.6–7.1', move: 'push in', frame: REEL, sky: SITE, rate: 0.025,
      layers: [full('streetQuiet', STREET.x, WIDE.y, PUSH.from, { time: NIGHT_T }),
        full('nightLights', STREET.x, WIDE.y, PUSH.from, { time: 0, own: 1 }), full('nightCat', STREET.x, WIDE.y, PUSH.from, { time: 0, own: 1 })],
      keys: [{ t: 0, x: STREET.x, y: WIDE.y, zoom: PUSH.from }, { t: 'end', x: STREET.x, y: over(DOOR_ROW, PUSH.to), zoom: PUSH.to }],
      captions: [spoken('But what do they *do*\nin there?', 'b', 0.1)],
      sounds: [vo('b', 0.05), sfx('night', 0, { dur: 4.8, gain: -2, fadeIn: 0.3, fadeOut: 0.4 })],
      shot: 'After midnight, the office shut: the whole façade under the night sky, the moon over the sign, the windows dark but for a few standby lights blinking, the street lamps glowing in pools on the sidewalk, a black cat padding past the door. A slow push in on the door, "closed" on its glass.',
      sound: 'No music: crickets, a far hum. Narrator: "But… what do they DO in there?"' },
    // the same night, on: the console pops in under the door and types /theoffice, Enter, and the picture breaks up
    { t: '7.1–9.4', move: 'console under the door', frame: REEL, sky: SITE, rate: 0.025, fx: { out: 'mosaic', dur: MOSAIC },
      layers: [full('streetQuiet', STREET.x, over(DOOR_ROW, PUSH.to), PUSH.to, { time: NIGHT_T + PUSH.dur * 0.025 }),
        full('nightLights', STREET.x, over(DOOR_ROW, PUSH.to), PUSH.to, { time: PUSH.dur, own: 1 }),
        { installBox: { lines: [{ kind: 'note', text: '# today… find out.' }, { kind: 'go', text: '/theoffice', type: '0.7,16', caret: '1.35,0.5' }] }, fx: 'blocks:0.05:0.4', ...BOX }],
      captions: [], sounds: [vo('c', 0.05), sfx('pop', 0.05, { gain: -10 }), sfx('typing', 0.6, { gain: 4 }), sfx('glitch', 2.0, { gain: -10 })],
      shot: 'Still on the shut door: in the text box\'s place the story\'s pixel console assembles from squares ("# today… find out.") and types "/theoffice" in its big yellow type, as the end\'s console has it; Enter, and the picture breaks into big pixels.',
      sound: 'A pop, keys and Enter, a glitch on the cut. Narrator: "Today… find out."' },
    ...workPanels(),
    // the box rises back in over the whole building at work, the camera drifting from its sign down to its door
    { t: span(WORK_END, NOW.dur), move: 'everyone, right now', frame: REEL, sky: SITE,
      layers: [full('liveNow', NOW.x, over(NOW.top, NOW.zoom, SAFE.top), NOW.zoom)],
      keys: [{ t: 0, x: NOW.x, y: over(NOW.top, NOW.zoom, SAFE.top), zoom: NOW.zoom }, { t: 'end', x: NOW.x, y: over(NOW.foot, NOW.zoom, BOX_TOP), zoom: NOW.zoom }],
      captions: [spoken('See what they\'re doing\n*right now*,', 'n', 0.35, { fx: 'rise:0:0.3' })],
      sounds: [vo('n', 0.3), sfx('pop', 0, { gain: -14 }), sfx('office', 0, { dur: NOW.dur, gain: -12, fadeOut: 0.4 }),
        sfx('music', SPLICE.at - (WORK_END - WORK_AT), { from: SPLICE.from, gain: -4, fadeIn: 0.03, bus: 'music' })],
      shot: 'The whole office live, narrower than the frame, its street under it: every desk at work at once, Clawd, Dex, Gem, Mooni, Caret and Rok typing, testing, browsing, the interns hopping, the meeting on, the sign counting 9 working. The camera drifts from the sign down to the door.',
      sound: 'The busy office under the score, which goes back four bars on a bar. Narrator: "See what they\'re doing right now,"' },
    { t: span(WORK_END + NOW.dur, WEEK.dur), move: 'up the week', frame: REEL, sky: SITE,
      layers: [full('weekNow', WEEK.x, over(WEEK.foot, WEEK.zoom, BOX_TOP), WEEK.zoom)],
      keys: [{ t: 0, x: WEEK.x, y: over(WEEK.foot, WEEK.zoom, BOX_TOP), zoom: WEEK.zoom, ease: 'out' }, { t: WEEK.arrive, x: WEEK.x, y: over(WEEK.top, WEEK.zoom, SAFE.top), zoom: WEEK.zoom },
        { t: 'end', x: WEEK.x, y: over(WEEK.top, WEEK.zoom, SAFE.top), zoom: WEEK.zoom }],
      captions: [spoken('which *projects* they\nworked on this *week*,', 'w', 0.15)],
      sounds: [vo('w', 0.1), sfx('sparkle', WEEK.arrive, { gain: -10 })],
      shot: 'The week\'s tower, as wide as the office was, the night round it, lower neighbours each side, a floor a project: from its door up past novibenolife, theoffice-agents, md2epub, csv-batch-importer, island-tour-3d, glyph-atlas-webgpu, each floor\'s windows its days and its hours on its plate, to the sign\'s 528 h of agent-time.',
      sound: 'A sparkle as it reaches the sign. Narrator: "which projects they worked on this week,"' },
    { t: span(WORK_END + NOW.dur + WEEK.dur, CREW_DUR), move: 'down to the crew', frame: REEL, sky: SITE,
      layers: [full('monthNow', CREW.x, over(CREW.row, CREW.zoom), CREW.zoom, { focus: CREW.box, dim: CREW.dim })],
      keys: [{ t: 0, x: CREW.x, y: over(CREW.row, CREW.zoom) - 60, zoom: CREW.zoom, ease: 'out' }, { t: 1, x: CREW.x, y: over(CREW.row, CREW.zoom), zoom: CREW.zoom },
        { t: 'end', x: CREW.to, y: over(CREW.row, CREW.push), zoom: CREW.push }],
      captions: [spoken('which *AI* did the work,', 'd2', 0.15)],
      sounds: [vo('d2', 0.1), sfx('sparkle', 1, { gain: -10 })],
      shot: 'The month\'s building at the office\'s width under the night, dimmed but its crew beside the wall calendar: the employee of the month\'s portrait and under it a line per AI, its character, its hours and its share. The camera comes down onto it and pushes in: Clawd 1037 h, Dex 456 h, Gem 269 h, Caret 145 h, Mooni 103 h, Rok 62 h.',
      sound: 'A sparkle as it lands. Narrator: "which AI did the work…"' },
    ...flipPanels(WORK_END + NOW.dur + WEEK.dur + CREW_DUR),
    { t: span(WORK_END + NOW.dur + WEEK.dur + CREW_DUR + (MONTHS.length - 1) * FLIP + LAST, FINALE.dur), move: 'the week, replayed', frame: REEL, sky: SITE, rate: FINALE.rate,
      fx: { in: 'mosaic', dur: MOSAIC },
      layers: [full('lapseEnd', FINALE.cx, over(0, FINALE.zoom, FINALE.top), FINALE.zoom, { time: FINALE.time }),
        { installBox: { lines: FINALE_LINES }, fx: 'blocks:0.5:0.35', ...FINALE.box }],
      captions: [],
      sounds: [vo('e', 0.6), sfx('office', 0, { dur: FINALE.dur, gain: -8, fadeIn: 0.3, fadeOut: 0.8 }), sfx('pop', 0.5, { gain: -14 })],
      shot: 'The Timelapse: the week replayed in the tower, sign to door, on its street, the frame its sky. Thursday before dawn to Friday\'s dusk: the sky turns from night to day and back, the sun and the moon cross behind the sign, the rooms light up as the agents come in at the door and go dark as they leave, the sign\'s clock runs. The install console assembles under it and types the plugin\'s two lines and /theoffice.',
      sound: 'The busy office, a pop, the score\'s last chord. Narrator: "The Office plugin, available in Claude Code!"' },
  ],
}

// A day in the life: the camera follows one Clawd through its Thursday as a documentary follows someone at work. It
// walks in at 08:58, reads the ticket, thinks, greps, codes, runs the tests (2 fail), thinks again, gets up for a coffee
// (Dex joins it in the kitchen), briefs three interns and waits on them, holds a meeting with the whole cast, raises its hand to ask you, ships
// (its commit rides the train) and walks out at dusk. Each office shot is Clawd's states in turn on one camera (every
// state its own drawing, promo/scenes.mjs DAY_SCRIPT), a tag over its head saying what it is at ("[THINKING...]") and
// a feeling now and then (promo/tags.mjs); a time card at the top, what it says in the game's text box, a page a beat.
const { places: DAYP } = dayScenes()
const DAY_ZOOM = 8
// Clawd's desk's middle (the desk drawn 44 × 36 from its top-left), and the room round it, in the pane's art px
const HERO_DESK = [DAYP.morning[0].hero.x + 22, DAYP.morning[0].hero.y + 18]
const HERO_ROOM = [18, 80, 244, 77]
const DESK_CAM = [HERO_DESK[0] - 30, over(HERO_DESK[1], DAY_ZOOM)]
// the kitchen: Dex and Clawd side by side at the water cooler, their tags over them
const KITCHEN = { box: [141, 160, 121, 61], at: [Math.round((DAYP.coffee[0].hero.x + DAYP.coffee[0].dex.x) / 2) + 11, DAYP.coffee[0].hero.y], zoom: 9 }
// the meeting: the room (a floor of its own), the camera panning at 8× (135 art px) from the whiteboard and Clawd to
// Rok at the table's end (each tag in frame as it pops), its row (the heads, the tags over them) at the stage's middle
const MEET_AT = DAYP.meeting[0]
const MEET = { box: [18, MEET_AT.meeting.y - 13, 244, 53], zoom: 8, row: MEET_AT.meeting.y + 8 }
MEET.from = MEET_AT.meeting.x + 2 + 540 / MEET.zoom
MEET.to = 250 - 540 / MEET.zoom
const RIDE = { x: 117, y: 610, time: 1.37, speed: 20.6, box: [0, 592, 270, 34] }
// the street: Clawd alone at 08:58 (the office still empty, the morning barely moving), out at 19:00 (3.2 on the
// timelapse's clock; "closed" on the door at 20:00, 3.25)
const DAY_STREET = { zoom: 5.5, morning: 2.625, dusk: 3.2 }
DAY_STREET.y = over(DOOR_ROW, DAY_STREET.zoom, 965)
// The narrator (promo/voice.mjs DAY_LINES, the story's voice) and its text box at the bottom, nothing else in it: a
// line a chapter (a shot with `narr` [line, text] opens one, the shots after it until the next are in it), spoken
// LEAD into the chapter and typed with it, its letters done a little before the voice is, held through the chapter's
// other shots, so it never changes as the tags over the agents do
const LEAD = 0.1, TAIL = 0.25
const narrPage = ([line, text], o = {}) => ({ text, box: true, at: LEAD + 0.05, cps: Math.round((letters(text) / Math.max(0.5, DAY_VOICE[line] - 0.3)) * 10) / 10, ...o })
// The day's clock, top left, small and still: from 08:55 at the first frame to 19:00 as Clawd walks out, at an even
// pace (minutes a second of the video) across every cut, in 5-minute ticks (promo/editor/box.js clockHtml)
const DAY_CLOCK = { x: 50, y: SAFE.top + 30, day: 'THU', from: 8 * 60 + 55, to: 19 * 60 }
/**
 * A shot on Clawd's states (DAY_SCRIPT[key]): each state's drawing shown in its turn, all on one camera and one clock,
 * the tags over them on the shot's own; the camera on (x, y) at `zoom`, drifting `drift` art px right (or to `to`
 * [x, y, zoom]); `focus` lit, the rest dimmed.
 */
const statesShot = (key, [x, y], { zoom = DAY_ZOOM, drift = 4, focus, to, time = 2 } = {}) => {
  const states = dayStates(key)
  return {
    dur: Math.round(states.at(-1).to * 100) / 100,
    layers: [...states.map((s, i) => full(s.scene, x, y, zoom, { time, ...(focus ? { focus } : {}), ...(i ? { show: s.from } : {}), ...(i < states.length - 1 ? { hide: s.to } : {}) })),
      full(`day_${key}_tags`, x, y, zoom, { time: 0, own: 1 })],
    keys: [{ t: 0, x: x - drift / 2, y, zoom, ease: 'inOut' }, { t: 'end', x: to?.[0] ?? x + drift / 2, y: to?.[1] ?? y, zoom: to?.[2] ?? zoom }],
  }
}
// The score: its soft opening under the street, then its groove from the office on, gone back seven bars each time it
// nears its end (120 bpm: a bar is 2 s; the groove from 12.0 s of the file, its last full bar ending at 28.0)
// (each cue in the panel it starts in: a sound plays from its own shot)
const loopMusic = (panels, from, total) => {
  const cues = []
  for (let t = 0, at = GROOVE; t < total; at = 14) {
    const dur = Math.min(28 - at, total - t)
    cues.push({ t: from + t, from: at, dur })
    t += dur
  }
  cues.forEach((c, i) => {
    const p = panels.findLast((q) => q.start <= c.t + 1e-6)
    p.sounds = [...(p.sounds ?? []), sfx('music', Math.round((c.t - p.start) * 100) / 100, { from: c.from, dur: c.dur, gain: -6, bus: 'music', fadeIn: i ? 0.02 : 0, fadeOut: i === cues.length - 1 ? 1.5 : 0.02 })]
  })
}
const DAY_SHOTS = [
  { dur: 3, move: 'walks in', sky: 'site:day', rate: 0.01, fx: { out: 'mosaic', dur: MOSAIC },
    layers: [full('streetQuiet', STREET.x, DAY_STREET.y, DAY_STREET.zoom, { time: DAY_STREET.morning, doors: [1.8, 2.2, 2.6, 3] }),
      full('dayIn', STREET.x, DAY_STREET.y, DAY_STREET.zoom, { time: 0, own: 1 })],
    keys: [{ t: 0, x: STREET.x - 30, y: DAY_STREET.y, zoom: DAY_STREET.zoom, ease: 'out' }, { t: 'end', x: STREET.x - 4, y: DAY_STREET.y, zoom: DAY_STREET.zoom }],
    narr: ['d1', 'Meet *Clawd*.'],
    sounds: [sfx('music', 0, { dur: 3, gain: 0, fadeOut: 0.4, bus: 'music' }), sfx('street', 0, { gain: -10, fadeOut: 0.4 }), sfx('door', 1.8, { gain: -6 })],
    shot: 'Thursday, 08:58, the street in the morning, the office still empty: one Clawd hurries up the sidewalk from the left, "[CLOCKING IN...]" over its head, the glass doors swing open and it goes in.',
    sound: 'The score\'s soft opening, the street, the door\'s bell.' },
  { move: 'read · think · grep', fx: { in: 'mosaic', dur: MOSAIC }, ...statesShot('morning', DESK_CAM, { focus: HERO_ROOM, drift: 0, to: [DESK_CAM[0] + 4, over(HERO_DESK[1] - 2, 9), 9] }),
    narr: ['d2', 'Mornings: read, think,\ncode, test... *repeat*.'],
    sounds: [sfx('office', 0, { dur: 30, gain: -10, fadeOut: 0.5 }), sfx('pop', 0.1, { gain: -16 }), sfx('sparkle', 2.4, { gain: -14 }), sfx('typing', 3.0, { gain: -6, dur: 1.4 })],
    shot: 'Up on 5F, its desk by the window, Mooni testing next to it: Clawd reads the ticket ("[READING TICKET-42]"), looks up to think, a thought bubble, a light bulb ("[THINKING...]"), then greps the repo ("[GREP \'ANCHOR\'...]").',
    sound: 'The groove comes in, the office hum, a ping for the idea, keys.' },
  { move: 'code · test · fail · think', ...statesShot('fix', DESK_CAM, { focus: HERO_ROOM }),
    narr: null,
    sounds: [sfx('typing', 0.1, { gain: -2, dur: 1.4 }), sfx('pop', 0.1, { gain: -16 }), sfx('thud', 2.62, { gain: -8 }), sfx('sparkle', 4.65, { gain: -14 })],
    shot: 'It codes ("[EDIT CAPE-RIG.JS]", a note over it), runs the tests ("[NPM TEST...]"): 2 fail, a red "!", it scratches its head ("[2 FAILED!]"); it thinks ("[HMM...]") and the bulb lights.',
    sound: 'Keys, a thud on the fail, a ping.' },
  // the coffee break: up from its desk and off; in the kitchen, the coffee, then Dex
  { move: 'gets up', ...statesShot('up', DESK_CAM, { focus: HERO_ROOM, drift: 10 }),
    narr: ['d3', 'Every agent needs\na *coffee break*.'],
    sounds: [sfx('pop', 0.1, { gain: -16 })],
    shot: 'At its desk it sits back and stretches ("[BREAK TIME!]", a note); it gets up and walks off to the right, "[COFFEE...]" over its head, its chair left empty, the ✓ on its screen.',
    sound: 'A chair creak.' },
  { move: 'coffee', ...statesShot('coffee', [KITCHEN.at[0], over(KITCHEN.at[1], KITCHEN.zoom)], { zoom: KITCHEN.zoom, focus: KITCHEN.box }),
    narr: null,
    sounds: [sfx('pop', 0.1, { gain: -16 }), sfx('pop', 3.4, { gain: -18 })],
    shot: 'The kitchen on 4F, bunting under its ceiling: Clawd walks in ("[COFFEE BREAK]") to the water cooler and makes its coffee ("[MAKING COFFEE...]", steam off its mug); Dex walks in from the counter\'s side ("[COFFEE?]"), and they chat by turns ("[CHATTING...]" over each), a heart.',
    sound: 'Mugs, chatter under the groove.' },
  { move: 'plan · delegate · wait', ...statesShot('team', [HERO_DESK[0] - 8, over(HERO_DESK[1] + 8, 10)], { zoom: 10, focus: HERO_ROOM }),
    narr: ['d4', 'Big job? It hires\n*sub-agents*.'],
    sounds: [sfx('pop', 0.1, { gain: -16 }), sfx('sparkle', 0.95, { gain: -10 }), sfx('sparkle', 3.85, { gain: -12 })],
    shot: 'Back at its desk: it plans ("[PLANNING...]"), points, and three mini Clawds, its interns (sub-agents), pop onto the bench ("[SPAWNING 3 AGENTS]"); it leans back while they hop ("[WAITING...]", "[SEARCHING...]" under the bench); they report back and are gone ("[3 REPORTS IN]").',
    sound: 'A sparkle as the interns appear, another as they report.' },
  { move: 'along the table', ...statesShot('meeting', [MEET.from, over(MEET.row, MEET.zoom)], { zoom: MEET.zoom, drift: 0, focus: MEET.box, to: [MEET.to, over(MEET.row, MEET.zoom), MEET.zoom] }),
    narr: ['d5', 'Then the team *meets*.'],
    sounds: [sfx('pop', 0.1, { gain: -16 }), ...[1.2, 2.0, 2.7, 3.4, 4.0].map((at) => sfx('pop', at, { gain: -20 }))],
    shot: 'Afternoon, the meeting room: Clawd\'s workflow, the whole cast round the table, their desks upstairs empty. The camera pans along it from the whiteboard as each says its piece in turn: Clawd "[PRESENTING...]", Dex "[I\'LL RUN IT]", Gem "[READ IT ALL]", Mooni "[EDGE CASE?]", Caret "[TAB TAB TAB]", Rok "[HA HA!]".',
    sound: 'A pop for each, marker squeak.' },
  { move: 'push in', ...statesShot('ask', DESK_CAM, { focus: HERO_ROOM, drift: 0, to: [HERO_DESK[0] - 6, over(HERO_DESK[1] - 4, 11), 11] }),
    narr: ['d6', 'Stuck? It asks *you*.'],
    sounds: [sfx('pop', 0.1, { gain: -16 })],
    shot: 'Its hand goes up, a "?" over it ("[WAITING ON YOU...]"), a bead of sweat: it needs you. A slow push in.', sound: 'A small "hm?" blip.' },
  { move: 'code · test · pass', ...statesShot('ship', DESK_CAM, { focus: HERO_ROOM }),
    narr: ['d7', 'Tests green. *Shipped*.\nThe commit rides home.'],
    sounds: [sfx('typing', 0.05, { gain: -4, dur: 0.9 }), sfx('pop', 0.1, { gain: -16 }), sfx('sparkle', 2.05, { gain: -8 })],
    shot: 'A last edit ("[EDIT CAPE-RIG.JS]"), the tests again ("[NPM TEST...]"), and it sits back, a ✓ on its screen, a sparkle ("[24 PASSED!]").', sound: 'Keys, a sparkle.' },
  { dur: 2, move: 'ride the train', sky: SITE, layers: [full(dayStates('ship').at(-1).scene, RIDE.x, over(RIDE.y, 10, MID), 10, { time: RIDE.time, focus: RIDE.box })],
    keys: [{ t: 0, x: RIDE.x, y: over(RIDE.y, 10, MID), zoom: 10, ease: 'linear' }, { t: 'end', x: RIDE.x + RIDE.speed * 2, y: over(RIDE.y, 10, MID), zoom: 10 }],
    narr: null,
    sounds: [sfx('train', 0.1, { gain: -12 }), sfx('pop', 0.1, { gain: -16 })],
    shot: 'Under the basement, the camera rides along with the commits train, Clawd\'s parcel on it.', sound: 'Train rumble.' },
  // out of the door at 19:00, then the camera pulls back to the whole building under the dusk sky as Clawd walks off
  // and the office shuts behind it (20:00, "closed" on the door: the timelapse's clock at `rate`)
  { dur: 3.4, move: 'walks out · pull back', sky: 'site:dusk', rate: 0.018, fx: { in: 'mosaic', out: 'mosaic', dur: MOSAIC },
    layers: [full('streetQuiet', STREET.x, DAY_STREET.y, DAY_STREET.zoom, { time: DAY_STREET.dusk, doors: [0.2, 0.6, 1.2, 1.6] }),
      full('dayOut', STREET.x, DAY_STREET.y, DAY_STREET.zoom, { time: 0, own: 1 })],
    keys: [{ t: 0, x: STREET.x, y: DAY_STREET.y, zoom: DAY_STREET.zoom, ease: 'inOut' }, { t: 1, x: STREET.x + 12, y: DAY_STREET.y, zoom: DAY_STREET.zoom, ease: 'inOut' },
      { t: 'end', x: STREET.x + 10, y: WIDE.y, zoom: WIDE.zoom }],
    narr: ['d8', 'Same time *tomorrow*.'],
    sounds: [sfx('door', 0.2, { gain: -6 }), sfx('street', 0, { gain: -10, fadeOut: 0.4 }), sfx('pop', 0.1, { gain: -16 })],
    shot: 'Dusk on the street: the doors open and Clawd walks out ("[LOGGING OFF...]") and off to the right; the camera pulls back to the whole building as the rooms go dark.',
    sound: 'The door, the evening street.' },
]
// The day played fast: every shot at DAY_SPEED, its drawings' clocks, its walkers and tags, its camera, its typing,
// its clock and its sounds all at that pace (speedUp), so the 41.7 s day runs in 20.85 s; the end card (the install
// lines to read) at its own pace, cut to END_DUR: 25 s in all. The score is laid after, in the video's own seconds.
const DAY_SPEED = 2
const END_DUR = 4.15
// its end card: the opening's (the sign, the install terminal, the credit), its setup lines typed fast one after the
// other, /theoffice at its own pace (the one line that matters) and held, the caret blinking after it
const DAY_INSTALL = [
  { ...INSTALL[0], show: 0.75 },
  { ...INSTALL[1], show: 0.85, type: '0.85,110' },
  { ...INSTALL[2], show: 1.35, type: '1.35,110' },
  { ...INSTALL[3], show: 1.75 },
  { ...INSTALL[4], show: 1.85, type: '1.85,25', caret: '2.3,0.5' },
]
const DAY_END = { ...OUTRO, layers: OUTRO.layers.map((l) => (l.siteTerm ? { ...l, siteTerm: { ...l.siteTerm, lines: DAY_INSTALL } } : l.raw ? { ...l, fx: 'pop:2.4:0.3' } : l)),
  shot: 'The plugin\'s own sign at night drops in, its bulbs chasing; the terminal assembles under it and types the setup lines quickly, then /theoffice at its own pace, held, the caret blinking; by Makio64.' }
/** Panel `p` (`dur` its seconds) played `k` times as fast: what runs in its seconds runs in 1/k of them. */
function speedUp(p, k) {
  const s = (v) => Math.round((v / k) * 1000) / 1000
  const timed = (o) => ({ ...(o.show != null ? { show: s(o.show) } : {}), ...(o.hide != null ? { hide: s(o.hide) } : {}) })
  return {
    ...p, dur: s(p.dur), rate: (p.rate ?? 1) * k,
    layers: p.layers.map((l) => ({ ...l, ...(l.own ? { own: l.own * k } : {}), ...(l.doors ? { doors: l.doors.map(s) } : {}), ...timed(l) })),
    ...(p.keys ? { keys: p.keys.map((q) => (q.t === 'end' ? q : { ...q, t: s(q.t) })) } : {}),
    captions: p.captions.map((c) => (c.clock ? { ...c, rate: Math.round(c.rate * k * 1000) / 1000 }
      : c.box ? { ...c, at: c.at < 0 ? c.at : s(c.at), cps: (c.cps ?? 36) * k, ...timed(c) } : c)),
    sounds: (p.sounds ?? []).map((q) => ({ ...q, at: s(q.at), ...(q.dur ? { dur: s(q.dur) } : {}) })),
  }
}
// The fastest a chapter may play, to make room for a longer line elsewhere
const MAX_SPEED = 2.6
/**
 * Each chapter's pace: DAY_SPEED, unless its line needs more room (LEAD + the line + TAIL); the time a slow chapter
 * takes is made up from the others' room to spare (down to their line's need or MAX_SPEED), so the day keeps its
 * length. `board` each chapter's seconds as drawn, `need` its line's: the pace of each.
 */
function chapterSpeeds(board, need, total) {
  const real = board.map((b, i) => Math.max(b / DAY_SPEED, need[i]))
  const floor = board.map((b, i) => Math.max(need[i], b / MAX_SPEED))
  const spare = real.map((r, i) => Math.max(0, r - floor[i]))
  const over = real.reduce((a, b) => a + b, 0) - total, room = spare.reduce((a, b) => a + b, 0)
  const cut = over > 0 ? Math.min(1, over / room) : 0
  return board.map((b, i) => b / (real[i] - spare[i] * cut))
}
STORYBOARDS.day = {
  title: 'A day in the life of Clawd',
  meta: 'Follow-cam cut · 25 s · Reels 9:16 · one agent\'s Thursday played at about 2×, told by the story\'s narrator, as a documentary would film someone at work, how an agent really works: read, think, grep, edit, test, fail, think, fix; a coffee break (Dex joins it); three interns briefed and waited on; a meeting with the whole cast; a question for you; the commit on the train; out at dusk · what each is at in a tag over its head, a running clock, the narrator in the game\'s text box',
  blips: false,
  panels: (() => {
    // the chapters: a shot with a line opens one
    const chapters = []
    for (const shot of DAY_SHOTS) {
      if (shot.narr) chapters.push({ line: shot.narr, shots: [] })
      chapters.at(-1).shots.push(shot)
    }
    const board = chapters.map((c) => c.shots.reduce((a, q) => a + q.dur, 0))
    const speeds = chapterSpeeds(board, chapters.map((c) => LEAD + DAY_VOICE[c.line[0]] + TAIL), 25 - END_DUR)
    const panels = chapters.flatMap((c, i) => c.shots.map(({ dur, narr, ...p }, k) => {
      // the line: typed with the voice in the chapter's first shot, held in the others
      const page = k ? { ...narrPage(c.line), at: -9 } : narrPage(c.line, i ? {} : { fx: 'rise:0.05:0.3' })
      const fast = speedUp({ frame: REEL, sky: 'site:day', ...p, dur, captions: [] }, speeds[i])
      fast.captions = [page]
      if (!k) fast.sounds = [vo(c.line[0], LEAD), ...fast.sounds]
      return fast
    }))
    // the end card, the narrator's last line over it (the story's)
    panels.push({ ...DAY_END, dur: END_DUR, sounds: [vo('e', 0.3)] })
    let t = 0
    for (const p of panels) {
      Object.assign(p, { t: span(t, p.dur), start: t })
      t += p.dur
    }
    // the clock, at one pace in the video's seconds: from its first time to the last at the walk out's start
    const out = panels.at(-2), rate = (DAY_CLOCK.to - DAY_CLOCK.from) / out.start
    for (const p of panels.slice(0, -1)) p.captions.unshift({ clock: true, x: DAY_CLOCK.x, y: DAY_CLOCK.y, day: DAY_CLOCK.day, from: Math.round((DAY_CLOCK.from + p.start * rate) * 1000) / 1000, rate: Math.round(rate * 1000) / 1000 })
    // the score from the first office shot to the end card's end, in the video's seconds (not sped up: on its bars)
    loopMusic(panels, panels[1].start, t - panels[1].start)
    return panels.map(({ start, dur, ...p }) => p)
  })(),
}

// The same cut with no room kept for Instagram's buttons (for X, the site, anywhere the whole frame shows): the clock
// in the top-left corner, the narrator's box FULL.margin over the frame's foot; and as X's other shapes, 4:5 and 1:1
const FULL = { clock: [32, 32], margin: 108 }
// the clock plate's foot (24-px type in a 3-px frame)
const CLOCK_FOOT = FULL.clock[1] + 52
// the end card's column, from the sign's top to the credit's foot
const COLUMN_MID = (COLUMN.sign + COLUMN.credit + 42) / 2
/**
 * The day's panels laid out for a frame [W, H] with no safe zone: the clock in its corner, the narrator's box
 * FULL.margin over the foot. On a frame shorter than the Reel's every camera moves by the same screen distance, so
 * what a shot is about (the stage's row) sits in the middle of the room between the clock and the box; the dusk
 * pull-back ends on the whole building fitted into that room (2.5× at most); the end card's column is centred.
 */
function reframe(panels, [W, H]) {
  const boxTop = H - BOX.h - FULL.margin, room = [CLOCK_FOOT + 16, boxTop - 16], mid = (room[0] + room[1]) / 2
  const reel = H === REEL[1]
  // screen px from where a Reel's camera leaves the stage's row (H/2 − (960 − STAGE)) to the room's middle
  const shift = reel ? 0 : mid - (H / 2 - (960 - STAGE))
  const lift = (y, z) => Math.round((y - shift / z) * 100) / 100
  return panels.map((p) => {
    const out = { ...p, frame: [W, H], captions: p.captions.map((c) => (c.clock ? { ...c, x: FULL.clock[0], y: FULL.clock[1] } : c.box ? { ...c, top: boxTop } : c)) }
    if (reel) return out
    if (p.layers.some((l) => l.pluginSign)) {
      out.layers = p.layers.map((l) => (l.y != null ? { ...l, y: Math.round(l.y + H / 2 - COLUMN_MID) } : l))
      return out
    }
    out.layers = p.layers.map((l) => (l.center ? { ...l, center: [l.center[0], lift(l.center[1], l.zoom)] } : l))
    if (p.keys) out.keys = p.keys.map((k) => ({ ...k, y: lift(k.y, k.zoom) }))
    if (p.move.startsWith('walks out')) {
      // the building from its sign (row 0) to its curb, in the room
      const tall = STREET.walk + 6, z = Math.min(WIDE.zoom, Math.floor(((room[1] - room[0]) / tall) * 100) / 100)
      out.keys = [...out.keys.slice(0, -1), { ...out.keys.at(-1), zoom: z, y: Math.round((tall / 2 + (H / 2 - mid) / z) * 100) / 100 }]
    }
    return out
  })
}
const variant = (title, frame, note) => ({ ...STORYBOARDS.day, title: `A day in the life of Clawd (${title})`, meta: `${STORYBOARDS.day.meta} · ${note}`, panels: reframe(STORYBOARDS.day.panels, frame) })
STORYBOARDS.dayfull = variant('full frame', REEL, 'full frame: the clock in the corner, the narrator\'s box low, no Instagram margins')
STORYBOARDS.dayportrait = variant('4:5', [1080, 1350], '4:5 for X: the full frame\'s layout, every shot re-centred between the clock and the box')
STORYBOARDS.daysquare = variant('1:1', SQUARE, '1:1 for X: the full frame\'s layout, every shot re-centred between the clock and the box')

// The story in X's shapes, 4:5 and 1:1. The whole frame shows there, so the narrator's box goes FULL.margin over the
// foot (as the day's), and what the Reel laid out between Instagram's safe zone's top and its box is laid out between
// STORY_MARGIN and the new box: a row the Reel put at frame row r goes to the same place in proportion (the safe
// zone's top to the margin, the box's top to the new box's), a shot with no box onto the whole frame less the margin.
// Each shot moves its camera so that what it is about lands there: the door as they arrive, the stage (STAGE) under
// the box, the montage's subject (MID) and its cards with it, the building's sign then its foot as the camera tilts,
// the crew on the box. The shots that framed a whole drawing fit it to the room: the façade from its sign to its curb
// (2.5× at most), the calendar's sign and page with the month's card pinned to it (4× at most), and the end's
// building with the sun's arc over it, the install console under its street.
const STORY_MARGIN = 40
// the calendar's sign and page, in art rows of pCal; the sky the sun crosses over the end's sign, and the end's rows down
// to its console's top (the Reel's: FINALE.box.y at FINALE.top and zoom)
const CAL_FOOT = 269
const SUN_SKY = 40
const FINALE_FOOT = (FINALE.box.y - FINALE.top) / FINALE.zoom
function reframeStory(panels, [W, H]) {
  const boxTop = H - BOX.h - FULL.margin, room = [STORY_MARGIN, boxTop - 16]
  const r2 = (v) => Math.round(v * 100) / 100
  const boxed = (r) => STORY_MARGIN + ((r - SAFE.top) * (boxTop - STORY_MARGIN)) / (BOX_TOP - SAFE.top)
  const open = (r) => STORY_MARGIN + ((r - SAFE.top) * (H - 2 * STORY_MARGIN)) / (SAFE.bottom - SAFE.top)
  // a camera's y at zoom z: the art row it put at the Reel's row r, now at frame row `to`
  const cam = (y, z, r, to) => r2(y + (r - 960 - (to - H / 2)) / z)
  // art rows [top, foot] fitted in [a, b] of the frame (at `max` at most): the zoom and the camera's y
  const fit = (top, foot, max, [a, b] = room) => {
    const zoom = Math.min(max, Math.floor(((b - a) / (foot - top)) * 100) / 100)
    return { zoom, y: r2((top + foot) / 2 + (H / 2 - (a + b) / 2) / zoom) }
  }
  // a caption at (x, y) of the Reel's frame, pinned to the art under it: where that art is in the new frame
  const pin = (c, from, to) => {
    const ax = from.x + (c.x - 540) / from.zoom, ay = from.y + (c.y - 960) / from.zoom
    return { ...c, x: Math.round(540 + (ax - to.x) * to.zoom), y: Math.round(H / 2 + (ay - to.y) * to.zoom) }
  }
  // the façade from the sun's arc over its sign down to its curb
  const wide = fit(-SUN_SKY, STREET.walk + 6, WIDE.zoom, [0, room[1]])
  return panels.map((p) => {
    const out = { ...p, frame: [W, H], captions: p.captions.map((c) => (c.box ? { ...c, top: boxTop } : c)) }
    // every camera of the shot (its layers' and its keys') through f(camera, key's index) → { y, zoom }
    const cams = (f) => {
      out.layers = out.layers.map((l) => {
        if (!l.center) return l
        const c = f({ t: 0, y: l.center[1], zoom: l.zoom }, 0)
        return { ...l, zoom: c.zoom, center: [l.center[0], c.y] }
      })
      if (p.keys) out.keys = p.keys.map((k, i) => ({ ...k, ...f(k, i) }))
    }
    // every camera of the shot by one screen distance: the Reel's row r to `to`
    const shift = (r, to) => cams((k) => ({ y: cam(k.y, k.zoom, r, to), zoom: k.zoom }))
    const scene = p.layers.find((l) => l.scene)?.scene ?? ''
    if (p.move === 'they arrive') shift(ARRIVE_ROW, boxed(ARRIVE_ROW))
    else if (p.move === 'a busy day' || p.move === 'into the night') cams(() => wide)
    // from the fitted façade in on the door, at the stage
    else if (p.move === 'push in') cams((k) => (k.t === 'end' ? { y: cam(k.y, k.zoom, STAGE, boxed(STAGE)), zoom: k.zoom } : wide))
    else if (p.move === 'console under the door') {
      shift(STAGE, boxed(STAGE))
      out.layers = out.layers.map((l) => (l.installBox ? { ...l, y: boxTop } : l))
    } else if (scene === 'pWorking') {
      shift(MID, open(MID))
      const d = open(MID) - MID
      out.captions = out.captions.map((c) => (c.card ? { ...c, y: Math.round(c.y + d) } : c))
    } else if (p.move === 'everyone, right now') {
      // from the sign on the margin down to the foot on the box
      cams((k, i) => ({ y: i ? cam(k.y, k.zoom, BOX_TOP, boxTop) : cam(k.y, k.zoom, SAFE.top, STORY_MARGIN), zoom: k.zoom }))
    } else if (p.move === 'up the week') {
      cams((k, i) => ({ y: i ? cam(k.y, k.zoom, SAFE.top, STORY_MARGIN) : cam(k.y, k.zoom, BOX_TOP, boxTop), zoom: k.zoom }))
    } else if (p.move === 'down to the crew') shift(STAGE, boxed(STAGE))
    else if (scene.startsWith('pCal')) {
      const l = p.layers[0], from = { x: l.center[0], y: l.center[1], zoom: l.zoom }
      const to = { x: from.x, ...fit(0, CAL_FOOT, l.zoom) }
      cams(() => to)
      out.captions = out.captions.map((c) => (c.card ? pin(c, from, to) : c))
    } else if (p.move === 'the week, replayed') {
      // the console's foot where the box's is (7 px under it, as in the Reel), the building over it
      const box = { ...FINALE.box, y: boxTop + BOX.h + (FINALE.box.y + FINALE.box.h - BOX.y - BOX.h) - FINALE.box.h }
      const end = fit(-SUN_SKY, FINALE_FOOT, FINALE.zoom, [0, box.y])
      cams(() => end)
      // smaller than its dressing reaches across the frame: the one dressed wider
      const reach = end.zoom * (STREET.w + 2 * PAST) < W
      out.layers = out.layers.map((l) => (l.installBox ? { ...l, ...box } : reach && l.scene === 'lapseEnd' ? { ...l, scene: 'lapseEndWide' } : l))
    }
    return out
  })
}
const storyVariant = (title, frame) => ({ ...STORYBOARDS.story, title: `${STORYBOARDS.story.title} (${title})`,
  meta: `${STORYBOARDS.story.meta} · ${title} for X: the box low, every shot laid out in the whole frame`, panels: reframeStory(STORYBOARDS.story.panels, frame) })
STORYBOARDS.storyportrait = storyVariant('4:5', [1080, 1350])
STORYBOARDS.storysquare = storyVariant('1:1', SQUARE)

/** The site's terminal (site/index.html #install), `w` site px wide scaled by `zoom`: its title bar and its lines. */
function siteTerm(l) {
  const t = l.siteTerm
  const line = (q) => `<div class="s-line${q.kind === 'note' ? ' s-note' : q.kind === 'go' ? ' s-go' : ''}"${q.show != null ? ` data-show="${q.show}"` : ''}>` +
    `${q.kind === 'note' ? '' : '<span class="s-pr">&gt;</span>'}<code class="s-cmd"${q.type ? ` data-type="${q.type}"` : ''}>${esc(q.text)}</code>` +
    `${q.caret ? `<i class="s-caret" data-blink="${q.caret}"></i>` : ''}</div>`
  return `<div class="s-at"${l.fx ? ` data-fx="${l.fx}"` : ''} style="left:${l.x}px;top:${l.y}px"><div class="s-term"${t.pop ? ` data-pop="${t.pop}"` : ''}${t.dither ? ` data-dither="${t.dither}"` : ''} style="width:${l.w}px;zoom:${l.zoom}">` +
    `<div class="s-titlebar"><i></i><i></i><i></i><h2>${esc(t.title)}</h2></div><div class="s-screen">${t.lines.map(line).join('')}</div></div></div>`
}

/**
 * The story's install console as one of its own boxes (promo/editor/box.js frameSvg: the text box's frame and board),
 * `w` × `h` px: the site terminal's lines in pixel type, typed and shown as there. The commands and the notes in VT323
 * at 40 px (2.5 px a pixel of it, the building's own grid at 2.5×), the notes dimmer; /theoffice in the box's Press
 * Start 2P at 40 (5 px a pixel) on the board's lit row, its caret blinking; a link (the site's address) in the sign's
 * interns blue, underlined, its `aside` dim at the line's end; no ligature anywhere (a `font` shorthand resets the
 * setting, so it goes after each), or "ff" folds into one cell.
 */
function installBox(l) {
  const pad = 30, LINK = '#92b0f0'
  const face = (q) => `font:${q.kind === 'go' ? "40px 'Press Start 2P'" : '40px VT323'};font-variant-ligatures:none;font-feature-settings:'liga' 0,'clig' 0,'calt' 0`
  const line = (q) => {
    if (q.kind === 'link') {
      return `<div${q.show != null ? ` data-show="${q.show}"` : ''} style="display:flex;align-items:center;justify-content:space-between;height:42px">` +
        `<code style="${face(q)};white-space:pre;color:${LINK};line-height:34px;border-bottom:3px solid ${LINK}">${esc(q.text)}</code>` +
        `<code style="${face(q)};white-space:pre;color:#7d7466">${esc(q.aside ?? '')}</code></div>`
    }
    const go = q.kind === 'go', note = q.kind === 'note'
    return `<div${q.show != null ? ` data-show="${q.show}"` : ''} style="display:flex;align-items:center;gap:${go ? 24 : 12}px;height:${go ? 74 : note ? 42 : 46}px;` +
      `${go ? `margin:6px ${-pad + 15}px;padding:0 ${pad - 10}px;border-left:5px solid ${BOX_INK.key};background:${BOX_INK.lit}` : ''}">` +
      `${note ? '' : `<span style="${face(q)};color:#d77757">&gt;</span>`}` +
      `<code${q.type ? ` data-type="${q.type}"` : ''} style="${face(q)};white-space:pre;color:${go ? BOX_INK.key : note ? '#7d7466' : BOX_INK.text}">${esc(q.text)}</code>` +
      `${q.caret ? `<i data-blink="${q.caret}" style="display:inline-block;width:25px;height:40px;margin-left:-14px;background:${BOX_INK.key}"></i>` : ''}</div>`
  }
  return `<div${l.fx ? ` data-fx="${l.fx}"` : ''} style="position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px">${frameSvg(l.w, l.h)}` +
    `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${pad - 4}px;-webkit-font-smoothing:none">${l.installBox.lines.map(line).join('')}</div></div>`
}

/** The site's neon sign (site/index.html .sign): its marquee, THE OFFICE in neon, the rail, a title and a lede. */
function siteSign(l) {
  const t = l.siteSign
  return `<div class="s-at"${l.fx ? ` data-fx="${l.fx}"` : ''} style="left:${l.x}px;top:${l.y}px"><div class="s-sign" style="width:${l.w}px;zoom:${l.zoom}"><div class="s-bulbs top" data-marquee="1.2,0"></div>` +
    `<div class="s-neon">${neonSvg(4)}</div><div class="s-rail"></div><h1>${esc(t.h1)}</h1><p class="s-lede">${esc(t.lede)}</p><div class="s-bulbs bottom" data-marquee="1.2,0.6"></div></div></div>`
}

/** An isolated scene's window in the frame: the art rectangle `iso` seen by a camera at `center` and `zoom`, clamped. */
function isoBox([x, y, w, h], [cx, cy], z, FW, FH) {
  const X0 = Math.max(0, FW / 2 + (x - cx) * z), Y0 = Math.max(0, FH / 2 + (y - cy) * z)
  const X1 = Math.min(FW, FW / 2 + (x + w - cx) * z), Y1 = Math.min(FH, FH / 2 + (y + h - cy) * z)
  return { X: X0, Y: Y0, W: X1 - X0, H: Y1 - Y0 }
}

/**
 * The street front's glass doors made to open: an empty group laid right over the entrance (after the last of its
 * day, evening and night faces, before the sidewalk and whoever walks on it), which the player fills with the doorway
 * and its two leaves swinging in between `times` [open from, open by, close from?, closed by?], in seconds of the shot.
 * The entrance is found by THE OFFICE on its canopy (lib/svg-live.mjs entrance: 40 × 40 under it, the text at top − 4).
 */
function withDoors(svg, times) {
  const re = /<text x="([\d.]+)" y="([\d.]+)" font-size="5"[^>]*>THE OFFICE<\/text>/g
  let m, last
  while ((m = re.exec(svg))) last = m
  if (!last) return svg
  let at = last.index + last[0].length
  const close = svg.indexOf('</g>', at)
  // in the timelapse each face is a group shown by the hour: go past the last one's end
  if (close > 0 && svg.slice(at, close).includes('attributeName="display"')) at = close + 4
  else {
    const sign = svg.slice(at).match(/^(<path[^>]*\/>)*<text[^>]*>closed<\/text>/)
    if (sign) at += sign[0].length
  }
  return `${svg.slice(0, at)}<g data-doors="${times.join(',')}" data-door="${Number(last[1]) - 20},${Number(last[2]) + 4}"></g>${svg.slice(at)}`
}

// ---------------------------------------------------------------- one panel as a page
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
export const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>').replace(/\n/g, '<br>')

export function layerHtml(l, svgs, frame) {
  const html = sceneLayerHtml(l, svgs, frame)
  // shown only from `show` to `hide` (seconds of the shot): a scene among several, one after another on one camera
  return l.show != null || l.hide != null
    ? `<div data-show="${l.show ?? -1}"${l.hide != null ? ` data-hide="${l.hide}"` : ''} style="position:absolute;inset:0">${html}</div>` : html
}
function sceneLayerHtml(l, svgs, [FW, FH]) {
  if (l.pluginSign) return `<div class="s-at"${l.fx ? ` data-fx="${l.fx}"` : ''} style="left:${l.x}px;top:${l.y}px;line-height:0">${pluginSign(l.pluginSign)}</div>`
  if (l.siteTerm) return siteTerm(l)
  if (l.installBox) return installBox(l)
  if (l.siteSign) return siteSign(l)
  if (l.raw) return `<div${l.fx ? ` data-fx="${l.fx}"` : ''} style="position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px">${l.raw}</div>`
  if (l.html === 'terminal') {
    return `<div style="position:absolute;left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;background:#0d0e14;border-left:2px solid #2a2c38;overflow:hidden">
      <div style="height:34px;background:#1d1f29;display:flex;gap:9px;align-items:center;padding-left:14px"><i style="width:13px;height:13px;border-radius:7px;background:#ff5f57"></i><i style="width:13px;height:13px;border-radius:7px;background:#febc2e"></i><i style="width:13px;height:13px;border-radius:7px;background:#28c840"></i></div>
      <pre style="margin:0;padding:14px 18px;font:${l.font ?? 10.6}px/1.3 ui-monospace,Menlo,monospace;color:#cfc8b8">${terminalHtml(80)}</pre></div>`
  }
  const svg = l.doors ? withDoors(svgs[l.scene], l.doors) : svgs[l.scene]
  const { w, h } = size(svg)
  const z = l.zoom
  let x, y, X, Y, bw, bh
  if (l.center) {
    bw = FW / z; bh = FH / z
    x = l.center[0] - bw / 2; y = l.center[1] - bh / 2; X = 0; Y = 0
  } else {
    [x, y, bw, bh] = l.src
    X = l.dst[0] === 'mid' ? (FW - bw * z) / 2 : l.dst[0]; Y = l.dst[1]
  }
  const cam = l.center ? ` data-cam data-w="${w}" data-h="${h}"` : ''
  // own: the drawing's clock runs at that pace in seconds of the shot, whatever the clip's rate (promo/editor/player.js)
  const own = l.own ? ` data-own="${l.own}"` : ''
  const body = svg.replace('<svg ', `<svg data-time="${l.time ?? 3}"${cam}${own} style="position:absolute;left:0;top:0;width:${w * z}px;height:${h * z}px;transform:translate(${-x * z}px,${-y * z}px);background:transparent" `)
  // an isolated scene: the drawing clipped to its rectangle, in the site's sign frame (the player keeps both on it)
  // a room in focus: the rest of the drawing dimmed round its box, the building still there
  if (l.focus && l.center) {
    const f = isoBox(l.focus, l.center, z, FW, FH)
    const dim = `<div class="s-focus" data-isof style="left:${f.X}px;top:${f.Y}px;width:${f.W}px;height:${f.H}px${l.dim != null ? `;box-shadow:0 0 0 4000px rgba(5,5,12,${l.dim})` : ''}"></div>`
    return `<div data-iso="${l.focus}" data-focus style="position:absolute;left:${X}px;top:${Y}px;width:${bw * z}px;height:${bh * z}px;overflow:hidden">${body}</div>${dim}`
  }
  const box = l.iso && l.center ? isoBox(l.iso, l.center, z, FW, FH) : null
  const clip = box ? `;clip-path:inset(${box.Y}px ${FW - box.X - box.W}px ${FH - box.Y - box.H}px ${box.X}px)` : ''
  const frame = box ? `<div class="s-isof" data-isof style="left:${box.X - 18}px;top:${box.Y - 18}px;width:${box.W + 36}px;height:${box.H + 36}px"></div>` : ''
  return `<div${box ? ` data-iso="${l.iso}"` : ''} style="position:absolute;left:${X}px;top:${Y}px;width:${bw * z}px;height:${bh * z}px;overflow:hidden${clip}">${body}</div>${frame}`
}

/** The panel's backdrop: the site's night sky (sky: 'site'), or its sky color down to the middle, the ground under it. */
const skies = new Map()
export function backdrop(p) {
  // 'site', or 'site:day' (dawn, dusk): the site's sky in that mood
  const [site, mood = 'night'] = String(p.sky).split(':')
  if (site !== 'site') return `linear-gradient(to bottom, ${p.sky} 0, ${p.sky} 48%, ${p.sky === INK ? INK : GROUND} 52%)`
  const key = `${p.frame.join('x')}:${mood}`
  if (!skies.has(key)) skies.set(key, skyBackground(...p.frame, mood))
  return skies.get(key)
}
/** A caption's markup (`*word*` in the neon's yellow), or the story's text box or a stat card (promo/editor/box.js). */
export const captionHtml = (c) => c.clock ? clockHtml(c) : c.card ? cardHtml(c) : c.box ? boxHtml(c) : `<div class="cap${c.plain ? ' plain' : ''}${c.band ? ' band' : ''}"${c.fx ? ` data-fx="${c.fx}"` : ''} style="top:${c.y}px;font-size:${c.size ?? (c.band ? 74 : 56)}px"><span>${rich(c.text)}</span></div>`
const END = `<div class="end">
      <div class="kicker">a Claude Code plugin</div>
      <div class="big">a pixel-art office<br>for your <b>coding agents</b></div>
      <div class="cmd">/plugin install theoffice</div>
      <div class="small">Claude · Codex · Gemini · Cursor · Kimi · Grok<br>runs on your machine. nothing leaves it.</div></div>`
export const FONTS = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Silkscreen:wght@400;700&display=block'
/** The panel's own styles: captions, the end card, the site's sign and terminal (promo/site.mjs). */
export const PANEL_CSS = `
    .cap{position:absolute;left:50px;right:50px;text-align:center;color:#fff;font-weight:800;line-height:1.28;letter-spacing:-.01em}
    .cap span{background:rgba(8,9,16,.86);padding:.1em .45em;-webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:.18em}
    .cap b{color:#ffd23f}.cap.plain{font-weight:600;color:#c9c3b4}.cap.plain span{background:none}
    .cap.band{left:0;right:0;background:#fff;color:#111;padding:44px 60px;font-family:Impact,'Arial Black',sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.01em;line-height:1.1}.cap.band span{background:none;padding:0}
    .vig{position:absolute;inset:0;background:radial-gradient(ellipse 62% 30% at 50% 50%,transparent 40%,rgba(0,0,0,.93) 100%)}
    .end{position:absolute;left:0;right:0;top:1040px;text-align:center;color:#ece2cd}
    .end .kicker{font-size:30px;letter-spacing:.2em;text-transform:uppercase;color:#a4977c}
    .end .big{margin-top:22px;font-size:58px;font-weight:800;line-height:1.2}.end b{color:#ffd23f}
    .end .cmd{display:inline-block;margin-top:34px;padding:18px 34px;font-size:40px;font-weight:700;color:#7ee787;background:#0d1117;border:2px solid #30363d;border-radius:14px}
    .end .small{margin-top:30px;font-size:28px;line-height:1.6;color:#a4977c}
${SITE_CSS}
`
/** A panel's drawing without its captions: its layers, the vignette and the end card. */
export const stageHtml = (p, svgs) => `${p.layers.map((l) => layerHtml(l, svgs, p.frame)).join('')}${p.vignette ? '<div class="vig"></div>' : ''}${p.endCard ? END : ''}`

/**
 * A panel as a page of its own, paused at its time (window.ready), for the screenshot: its drawings at their time, or
 * `still` seconds into the shot when it has one (a moment that says more than its first frame: the walkers on their way).
 */
export function panelHtml(p, svgs) {
  const [FW, FH] = p.frame
  const S = p.still ?? 0, rate = p.rate ?? 1
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>
    body{margin:0;width:${FW}px;height:${FH}px;overflow:hidden;position:relative;background:${backdrop(p)};font-family:ui-monospace,"SF Mono",Menlo,monospace}${PANEL_CSS}</style>${stageHtml(p, svgs)}${p.captions.map(captionHtml).join('')}
  <script>window.ready=async()=>{await document.fonts.ready;for(const s of document.querySelectorAll('svg[data-time]')){s.pauseAnimations();s.setCurrentTime(Number(s.dataset.time)+${S}*(s.dataset.own?Number(s.dataset.own):${rate}))}return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}</script>`
}

// ---------------------------------------------------------------- the sheet
export function sheetHtml(key, sb, files) {
  const tall = sb.panels[0].frame[1] > sb.panels[0].frame[0]
  const TW = tall ? 330 : 380
  const cards = sb.panels.map((p, i) => {
    const [FW, FH] = p.frame
    const th = Math.round(TW * FH / FW)
    const guides = FH === 1920 ? `<i class="g" style="top:${(SAFE.top / FH) * 100}%"></i><i class="g" style="top:${(SAFE.bottom / FH) * 100}%"></i>` : ''
    return `<figure><div class="thumb" style="width:${TW}px;height:${th}px"><img src="${path.basename(files[i])}" width="${TW}" height="${th}">${guides}
      <span class="tc">${esc(p.t)}</span>${p.move ? `<span class="mv">${esc(p.move)}</span>` : ''}<span class="n">${i + 1}</span></div>
      <figcaption><p class="shot">${esc(p.shot)}</p>
      ${p.captions.filter((c) => !c.plain && c.text).length || p.endCard ? `<p class="txt">${p.endCard ? 'END CARD: name · what it is · install · privacy' : p.captions.filter((c) => !c.plain && c.text).map((c) => `${c.held ? '(held) ' : ''}“${esc(c.text.replace(/\*/g, '').replace(/\n/g, ' '))}”`).join(' ')}</p>` : '<p class="txt none">no text</p>'}
      ${p.sound ? `<p class="snd">♪ ${esc(p.sound)}</p>` : ''}</figcaption></figure>`
  }).join('')
  const cols = tall ? 4 : 4
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Silkscreen:wght@400;700&display=block"><style>
    body{margin:0;padding:56px 60px 64px;background:#15161d;color:#ece2cd;font-family:ui-monospace,"SF Mono",Menlo,monospace;width:${cols * TW + (cols - 1) * 34}px}
    h1{margin:0;font-size:40px;letter-spacing:-.01em}h1 small{color:#ffd23f;font-size:40px;margin-right:16px}
    .meta{margin:10px 0 40px;color:#a4977c;font-size:17px}
    .grid{display:grid;grid-template-columns:repeat(${cols},${TW}px);gap:44px 34px}
    figure{margin:0}.thumb{position:relative;border-radius:10px;overflow:hidden;outline:1px solid #2c2e3a}
    .thumb img{display:block}.g{position:absolute;left:0;right:0;border-top:1px dashed rgba(255,80,80,.55)}
    .tc,.mv,.n{position:absolute;font-size:14px;font-weight:700;padding:4px 8px;border-radius:6px}
    .tc{left:8px;bottom:8px;background:#ffd23f;color:#15161d}.mv{right:8px;bottom:8px;background:rgba(8,9,16,.85);color:#7ee787}
    .n{left:8px;top:8px;background:rgba(8,9,16,.85);color:#ece2cd}
    figcaption{padding-top:14px;font-size:15px;line-height:1.45}
    figcaption p{margin:0 0 8px}.shot{color:#ece2cd}.txt{color:#ffd23f}.txt.none{color:#5d5a52}.snd{color:#8a90a8}
    .legend{margin-top:44px;color:#5d5a52;font-size:14px}
  </style><h1><small>${Object.keys(STORYBOARDS).indexOf(key) + 1}</small>${esc(sb.title)}</h1><div class="meta">${esc(sb.meta)}</div>
  <div class="grid">${cards}</div>
  <div class="legend">Each panel is a real frame of the plugin's drawing (made-up sample projects). ${tall ? 'Red dashes: Instagram\'s safe zone (its buttons cover above and below). ' : ''}Yellow: time in seconds · green: camera move · ♪ sound.</div>`
}

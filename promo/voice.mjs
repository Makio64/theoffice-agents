#!/usr/bin/env node
// The story's narration, cut into its lines: ElevenLabs takes of the script (promo/audio/takes/, the flow "The Office —
// story promo audio"), each line from the start of its words to its last sound, at the pauses a take leaves between
// them ([long pause] in the script). A line is a WAV in promo/audio/ (vo-<line>.wav) that the story's panels place
// (promo/boards.mjs sounds) and the export mixes, every one at the same loudness (LEVEL): the takes came out up to 3 dB
// apart, and the lines of three takes follow one another as one sentence.
// The times are the take's own, measured with ffmpeg silencedetect (−38 dB, 0.3 s; −40 dB, 0.06 s for a line's own
// start and end): a new take needs new times.
//   node promo/voice.mjs        the story's lines
//   node promo/voice.mjs day    the day's (DAY_LINES)
import { execFileSync, spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUDIO = path.join(path.dirname(fileURLToPath(import.meta.url)), 'audio')
// [line, take, from, to] in seconds of the take
export const LINES = [
  ['a', 'narrator-2', 0, 3.2], // Every day, your agents go to work.
  ['b', 'narrator-2', 3.88, 6.05], // But… what do they DO in there?
  ['c', 'narrator-2', 6.53, 8.74], // Today… find out.
  ['n', 'now-1', 0.18, 1.95], // See what they're doing right now...
  ['w', 'now-1', 3.27, 5.38], // which projects they worked on this week...
  ['d2', 'months-1', 0, 1.98], // which AI did the work...
  ['g', 'months-1', 2.57, 6.24], // and for how long… month after month.
  ['e', 'plugin-1', 0.07, 2.83], // The Office plugin, available in Claude Code!
]
/** Every line's integrated loudness, in LUFS (the mix brings the whole to −14 after). */
const LEVEL = -18

/** How long each line lasts, in seconds: { a: 3.2, … }. */
export const VOICE = Object.fromEntries(LINES.map(([line, , from, to]) => [line, Math.round((to - from) * 100) / 100]))

// The day's narration (promo/boards.mjs `day`): one take of its script (day-2: the flow's "New tts node", the same
// narrator), each line its words' pieces ([from, to] in the take) joined by GAP of silence, the narrator's own pauses
// inside a line closed up and two half-lines left out ("Coding agent, nine to five", "Everyone has a say"), played
// DAY_TEMPO as fast with its pitch kept (atempo), so every line fits its chapter of the day played at 2×
export const DAY_TEMPO = 1.1
const GAP = 0.2, PAD = [0.03, 0.06]
export const DAY_LINES = [
  ['d1', 'day-2', [[0.14, 1.06]]], // Meet Clawd.
  ['d2', 'day-2', [[4.35, 8.64]]], // Mornings: read, think, code, test... repeat.
  ['d3', 'day-2', [[9.62, 11.5]]], // Every agent needs a coffee break.
  ['d4', 'day-2', [[12.34, 12.97], [13.37, 14.79]]], // Big job? It hires sub-agents.
  ['d5', 'day-2', [[15.55, 16.81]]], // Then the team meets.
  ['d6', 'day-2', [[19.09, 19.59], [20.17, 20.93]]], // Stuck? It asks you.
  ['d7', 'day-2', [[21.83, 22.82], [23.12, 23.63], [23.99, 25.43]]], // Tests green. Shipped. The commit rides home.
  ['d8', 'day-2', [[26.13, 27.21]]], // Same time tomorrow.
]
const pieces = (segs) => segs.map(([a, b]) => [Math.max(0, a - PAD[0]), b + PAD[1]])
/** How long each of the day's lines lasts as cut, in seconds: { d1: 0.92, … }. */
export const DAY_VOICE = Object.fromEntries(DAY_LINES.map(([line, , segs]) =>
  [line, Math.round(((pieces(segs).reduce((t, [a, b]) => t + b - a, 0) + GAP * (segs.length - 1)) / DAY_TEMPO) * 100) / 100]))

/** A line cut from `src` by the audio filter `cut` (its graph ending in [v]) into vo-<line>.wav, at LEVEL. */
function cutLine(line, src, cut) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-filter_complex', `${cut};[v]ebur128[o]`, '-map', '[o]', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const I = Number([...log.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)[1])
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-filter_complex', `${cut};[v]volume=${(LEVEL - I).toFixed(2)}dB[o]`, '-map', '[o]', '-ar', '44100', path.join(AUDIO, `vo-${line}.wav`)])
  return I
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'day') {
  // the day's lines: each piece faded at its edges, a GAP after all but the last, joined, then sped up
  for (const [line, take, segs] of DAY_LINES) {
    const src = path.join(AUDIO, 'takes', `${take}.mp3`), ps = pieces(segs)
    const parts = ps.map(([a, b], k) => `[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=${(b - a - 0.05).toFixed(3)}:d=0.05` +
      `${k < ps.length - 1 ? `,apad=pad_dur=${GAP}` : ''}[p${k}]`)
    const cut = `${parts.join(';')};${ps.map((_, k) => `[p${k}]`).join('')}concat=n=${ps.length}:v=0:a=1,atempo=${DAY_TEMPO}[v]`
    const I = cutLine(line, src, cut)
    console.log(`vo-${line}.wav ${DAY_VOICE[line].toFixed(2)} s, ${I.toFixed(1)} LUFS → ${LEVEL}`)
  }
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [line, take, from, to] of LINES) {
    const d = to - from, src = path.join(AUDIO, 'takes', `${take}.mp3`)
    const cut = `atrim=start=${from}:end=${to},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st=${(d - 0.06).toFixed(3)}:d=0.06`
    // the line's loudness as cut (ebur128's summary is the last I: it prints)
    const log = spawnSync('ffmpeg', ['-hide_banner', '-i', src, '-af', `${cut},ebur128`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr
    const I = Number([...log.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)[1])
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', `${cut},volume=${(LEVEL - I).toFixed(2)}dB`, '-ar', '44100', path.join(AUDIO, `vo-${line}.wav`)])
    console.log(`vo-${line}.wav ${d.toFixed(2)} s, ${I.toFixed(1)} LUFS → ${LEVEL}`)
  }
}

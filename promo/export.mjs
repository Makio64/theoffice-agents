#!/usr/bin/env node
// The promo export: a board's edit (promo/edits/<board>.json, or the storyboard's own timing) filmed frame by frame in
// headless Chrome (promo/editor/render.html, the editor's own player) and encoded by ffmpeg as an H.264 MP4 for Reels and
// X: yuv420p, faststart, tuned for flat pixel art. Its sound is mixed from the board's own: the sounds its panels place
// (promo/boards.mjs, files in promo/audio/), a blip under every letter its text boxes type (unless the board turns
// them off), and the audio track if one is given; a board with none of them is silent.
//   node promo/export.mjs opening                      → promo/out/video/opening.mp4
//   node promo/export.mjs opening --audio music.mp3 --out ~/Desktop/opening.mp4
//   node promo/export.mjs story --no-blips             the text boxes without their blips
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browser } from './cdp.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const VIDEO = path.join(HERE, 'out', 'video')
const AUDIO = path.join(HERE, 'audio')

/**
 * The text boxes' blips as a WAV `duration` seconds long: a short square-wave chirp at each of `times`, at most one every
 * 55 ms as a game's text has (a letter in two at full speed), its pitch stepping between four notes, decaying fast.
 * 44.1 kHz, 16-bit, mono.
 */
function blipTrack(times, duration, file) {
  const RATE = 44100, LEN = 0.03, GAP = 0.055, NOTES = [880, 932, 880, 831]
  const pcm = new Int16Array(Math.ceil(duration * RATE))
  let last = -Infinity, k = 0
  for (const t of times) {
    if (t - last < GAP) continue
    last = t
    const f = NOTES[k++ % NOTES.length], i0 = Math.round(t * RATE)
    for (let i = 0; i < LEN * RATE && i0 + i < pcm.length; i++) {
      const u = i / RATE
      const square = (u * f) % 1 < 0.5 ? 1 : -1
      pcm[i0 + i] += Math.round(square * 0.16 * Math.min(1, u / 0.001) * Math.exp(-u / 0.012) * 32767)
    }
  }
  const head = Buffer.alloc(44)
  head.write('RIFF', 0); head.writeUInt32LE(36 + pcm.byteLength, 4); head.write('WAVEfmt ', 8)
  head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(RATE, 24)
  head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.byteLength, 40)
  fs.writeFileSync(file, Buffer.concat([head, Buffer.from(pcm.buffer)]))
}

/** A board's sound by name: promo/audio/<name>.wav, else <name>.mp3. */
function soundFile(name) {
  for (const ext of ['wav', 'mp3']) {
    const f = path.join(AUDIO, `${name}.${ext}`)
    if (fs.existsSync(f)) return f
  }
  throw new Error(`no sound "${name}" in promo/audio/`)
}
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]))

/**
 * The video's sound as one WAV `duration` seconds long in `dir`, at −14 LUFS with its peaks under −1.5 dBTP (the
 * feeds' loudness): every cue ({ name or file, t, from, dur, gain, fadeIn, fadeOut, bus }: promo/editor/player.js
 * soundCues) cut from its file at `from` for `dur`, faded, set to `gain` dB and laid at `t`; by bus, the voice ducks
 * the music under it (a sidechain compressor) and the effects go over both. Two passes: the mix, then its loudness
 * measured and set in one linear step, so nothing pumps.
 */
function mixTrack(cues, duration, dir) {
  const raw = path.join(dir, 'mix.wav'), out = path.join(dir, 'mix-14.wav')
  const inputs = [], parts = [], buses = { voice: [], music: [], sfx: [] }
  cues.forEach((c, i) => {
    const file = c.file ?? soundFile(c.name), from = c.from ?? 0
    const len = Math.max(0.01, Math.min(c.dur ?? Infinity, seconds(file) - from, duration - c.t))
    inputs.push('-i', file)
    let f = `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start=${from}:duration=${len.toFixed(3)},asetpts=PTS-STARTPTS`
    if (c.fadeIn) f += `,afade=t=in:d=${c.fadeIn}`
    if (c.fadeOut) f += `,afade=t=out:st=${Math.max(0, len - c.fadeOut).toFixed(3)}:d=${c.fadeOut}`
    parts.push(`${f},volume=${c.gain ?? 0}dB,adelay=${Math.round(c.t * 1000)}:all=1[s${i}]`)
    buses[c.bus ?? 'sfx'].push(`[s${i}]`)
  })
  const join = (list, label) => (list.length > 1 ? `${list.join('')}amix=inputs=${list.length}:normalize=0:duration=longest[${label}]` : `${list[0]}anull[${label}]`)
  for (const [bus, list] of Object.entries(buses)) if (list.length) parts.push(join(list, bus))
  const mix = []
  if (buses.voice.length && buses.music.length) {
    // both run the video's length: the compressor stops when either input does, and the voice ends before the score
    parts.push('[voice]asplit=2[v1][v2]', `[v1]apad=whole_dur=${duration}[side]`, `[music]apad=whole_dur=${duration}[bed]`,
      '[bed][side]sidechaincompress=threshold=0.04:ratio=6:attack=15:release=350[ducked]')
    mix.push('[ducked]', '[v2]')
  } else {
    if (buses.voice.length) mix.push('[voice]')
    if (buses.music.length) mix.push('[music]')
  }
  if (buses.sfx.length) mix.push('[sfx]')
  // trimmed to the video's length before it is padded to it, and the file capped at it besides: a pad with no end ahead
  // of the trim once ran on for hours of silence and filled the disk
  parts.push(join(mix, 'all'), `[all]atrim=duration=${duration},apad=whole_dur=${duration}[out]`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', parts.join(';'), '-map', '[out]', '-t', String(duration), '-ar', '48000', raw])
  const LN = 'loudnorm=I=-14:TP=-1.5:LRA=11'
  const probe = spawnSync('ffmpeg', ['-hide_banner', '-i', raw, '-af', `${LN}:print_format=json`, '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const m = JSON.parse(probe.slice(probe.lastIndexOf('{'), probe.lastIndexOf('}') + 1))
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', `${LN}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:` +
    `measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`, '-t', String(duration), '-ar', '48000', out])
  return out
}

/**
 * Film board `key` served at `base` (the editor's server) into `out`. `onProgress(done, total)` after each frame;
 * `audio` a sound file laid under it with the board's own (as music, ducked under the voice; cut to the video's
 * length); `blips` false leaves the text boxes silent.
 */
export async function exportVideo({ base, key, out = path.join(VIDEO, `${key}.mp4`), audio, blips = true, onProgress = () => {} }) {
  fs.mkdirSync(path.dirname(out), { recursive: true })
  const b = await browser()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-sound-'))
  try {
    await b.open(`${base}/render.html#${key}`, { width: 1080, height: 1920 })
    const info = await b.evaluate('window.whenReady')
    const [W, H] = info.frame
    await b.resize(W, H)
    const n = Math.max(1, Math.round(info.duration * info.fps))
    const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'png', '-i', '-']
    const cues = [...(info.sounds ?? [])]
    if (blips && info.letters?.length) {
      const file = path.join(tmp, 'blips.wav')
      blipTrack(info.letters, info.duration, file)
      cues.push({ file, t: 0 })
    }
    if (audio) cues.push({ file: audio, t: 0, bus: 'music' })
    if (cues.length) args.push('-i', mixTrack(cues, info.duration, tmp), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest')
    args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-r', String(info.fps), '-movflags', '+faststart', out)
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] })
    let log = ''
    ff.stderr.on('data', (d) => { log += d })
    const exited = once(ff, 'exit')
    for (let f = 0; f < n; f++) {
      await b.evaluate(`frameAt(${f / info.fps})`)
      if (!ff.stdin.write(await b.capture())) await once(ff.stdin, 'drain')
      onProgress(f + 1, n)
    }
    ff.stdin.end()
    const [code] = await exited
    if (code !== 0) throw new Error(`ffmpeg failed (${code}): ${log.trim()}`)
    return { out, frames: n, duration: info.duration, frame: info.frame }
  } finally {
    await b.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

// the command line: its own editor server on a free port, for the time of the export
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [key, ...rest] = process.argv.slice(2)
  const opt = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined }
  if (!key) {
    console.error('usage: node promo/export.mjs <board> [--audio file] [--out file.mp4] [--no-blips]')
    process.exit(1)
  }
  const { startServer } = await import('./editor.mjs')
  const server = await startServer(0)
  const t0 = Date.now()
  try {
    const r = await exportVideo({
      base: server.url, key, out: opt('out') && path.resolve(opt('out')), audio: opt('audio') && path.resolve(opt('audio')), blips: !rest.includes('--no-blips'),
      onProgress: (done, n) => { if (done % 15 === 0 || done === n) process.stdout.write(`\r${key}: frame ${done}/${n}`) },
    })
    console.log(`\n${path.relative(process.cwd(), r.out)} · ${r.frame.join('×')} · ${r.duration.toFixed(2)} s · ${((Date.now() - t0) / 1000).toFixed(0)} s to export`)
  } finally {
    await server.close()
  }
}

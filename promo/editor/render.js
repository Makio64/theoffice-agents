// The page the video export films (promo/export.mjs): one board's saved edit (render.html#<board>) on a stage of the
// frame's size at scale 1, drawn by the same player as the editor's preview. The export reads window.info once
// whenReady settles (with the times its text boxes type a letter, for their blips, and its sounds), then calls
// frameAt(t) for every frame and screenshots the viewport.
import { letterTimes, player, soundCues, total } from './player.js'

window.whenReady = (async () => {
  const key = location.hash.slice(1)
  const { css, fonts } = await (await fetch('/api/boards')).json()
  document.head.insertAdjacentHTML('beforeend', `<link rel="stylesheet" href="${fonts}"><style>${css}</style>`)
  const { edit, panels, blips } = await (await fetch(`/api/board/${key}`)).json()
  const [FW, FH] = panels[0].frame
  const stage = document.getElementById('stage')
  Object.assign(stage.style, { width: `${FW}px`, height: `${FH}px` })
  const P = player(stage)
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  window.frameAt = async (t) => {
    P.draw(edit, panels, t)
    await frames()
  }
  await document.fonts.ready
  window.info = { board: key, frame: [FW, FH], fps: edit.fps ?? 30, duration: total(edit.clips), letters: blips ? letterTimes(edit, panels) : [], sounds: soundCues(edit, panels) }
  return window.info
})()

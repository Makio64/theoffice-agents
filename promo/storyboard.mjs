// The promo storyboards as sheets: every panel of promo/boards.mjs drawn as the video will show it (a real frame of the
// plugin's drawings, cut, zoomed and captioned), then one sheet per video with each panel's time, camera move, shot,
// text and sound, into promo/out/.
//   node promo/storyboard.mjs            every storyboard
//   node promo/storyboard.mjs hero meme  only those
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { scenes } from './scenes.mjs'
import { browser } from './cdp.mjs'
import { STORYBOARDS, panelHtml, sheetHtml } from './boards.mjs'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')

const only = process.argv.slice(2)
const svgs = scenes()
const b = await browser()
try {
  for (const [key, sb] of Object.entries(STORYBOARDS)) {
    if (only.length && !only.includes(key)) continue
    const dir = path.join(OUT, key)
    fs.mkdirSync(dir, { recursive: true })
    const files = []
    for (const [i, p] of sb.panels.entries()) {
      const html = path.join(dir, `panel-${i + 1}.html`)
      fs.writeFileSync(html, panelHtml(p, svgs))
      const png = html.replace('.html', '.png')
      await b.shoot(html, png, { width: p.frame[0], height: p.frame[1] })
      fs.rmSync(html)
      files.push(png)
    }
    const sheet = path.join(dir, 'sheet.html')
    fs.writeFileSync(sheet, sheetHtml(key, sb, files))
    const width = 4 * (sb.panels[0].frame[1] > sb.panels[0].frame[0] ? 330 : 380) + 3 * 34 + 120
    await b.shoot(sheet, path.join(OUT, `${Object.keys(STORYBOARDS).indexOf(key) + 1}-${key}.png`), { width, height: 900, scale: 2, full: true })
    console.log(key, files.length, 'panels')
  }
} finally {
  await b.close()
}

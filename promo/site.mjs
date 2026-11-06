// The website's own pixel art for the promo, so the video and the site look one: its night sky (the plugin's sky in
// bands, its stars, the moon, the skyline), its neon sign and its terminal, drawn by site/art.js, sky.js and theme.js
// from site/data.js (which site/build.mjs writes: it is built here first if it is missing).
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!fs.existsSync(path.join(ROOT, 'site', 'data.js'))) spawnSync(process.execPath, [path.join(ROOT, 'site', 'build.mjs')], { stdio: 'inherit' })
const A = await import('../site/art.js')
const S = await import('../site/sky.js')
const T = await import('../site/theme.js')

/**
 * The site's night sky over a frame W × H CSS px, at its 2 px a pixel, as one CSS background (nearest layer first): the
 * plugin's night in hard bands (site/sky.js skyBands, as many rows as the frame), the row over each seam checkered with
 * the color under it (the plugin's own seam, bandTile); its stars, the moon and the skyline.
 */
export function skyBackground(W, H, mood = 'night') {
  const w = W / 2, h = H / 2
  const bands = S.skyBands(mood, h)
  const city = S.layoutCity(w)
  // by day (or dusk) the sun where the moon hangs at night, and no stars; the city by day or lit (dawn and dusk too)
  const night = mood === 'night', town = mood === 'day' ? 'day' : 'night'
  return [
    `${A.uri(S.nearSvg(city, w, town))} left bottom no-repeat`,
    `${A.uri(S.farSvg(city, w, town))} left bottom no-repeat`,
    `${A.uri(A.orbSvg(night ? 'moon' : 'sun', 4))} right 120px top 260px no-repeat`,
    ...(night ? [`${A.uri(S.starsSvg(w, Math.round(h * 0.55)))} left top no-repeat`] : []),
    `${A.uri(S.bandTile(bands))} left top repeat-x`,
    bands[0][0],
  ].join(',')
}

/** THE OFFICE in the site's neon, `scale` px to its pixel (its tired letter kept lit: .s-neon .flick is hidden). */
export const neonSvg = (scale) => A.neonSvg(scale)

// the frames and the marquee's bulbs from the site's stylesheet (theme.js artCss), and the neon's glow by night
const root = T.artCss().match(/:root\{([^}]*)\}/)[1]
const VARS = Object.fromEntries(root.split(';').map((d) => [d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1)]))
const glow = A.neonGlow('#17120e').night

/**
 * The site's sign and terminal (site/style.css .sign, .term) under s- names, at the site's own sizes: a panel scales
 * them with `zoom`. Their marquee and caret are driven by the player (data-marquee, data-blink), not by CSS animations,
 * so the export films them frame by frame.
 */
export const SITE_CSS = `
    :root{--s-fr-win:${VARS['--fr-win']};--s-fr-sign:${VARS['--fr-sign']};--s-bulbs-a:${VARS['--bulbs-a']};--s-bulbs-b:${VARS['--bulbs-b']};--s-ng1:${glow[0]};--s-ng2:${glow[1]}}
    .s-at{position:absolute}
    .s-sign,.s-term{font:14px/20px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#d6dbe3;box-sizing:border-box}
    .s-sign{display:flex;flex-direction:column;border-style:solid;border-width:6px;border-image:var(--s-fr-sign) 6 / 6px stretch;background:#17120e padding-box;text-align:center}
    .s-bulbs{flex:none;height:8px;background:var(--s-bulbs-a) 0 0 / 32px 8px repeat-x}.s-bulbs.alt{background-image:var(--s-bulbs-b)}
    .s-bulbs.top{margin-top:6px}.s-bulbs.bottom{margin-top:auto;margin-bottom:6px}
    .s-neon{margin:6px auto 0;line-height:0}.s-neon .ng1{fill:var(--s-ng1)}.s-neon .ng2{fill:var(--s-ng2)}.s-neon .flick{display:none}
    .s-rail{flex:none;height:4px;margin:6px 12px 0;background:linear-gradient(#5d6168 0 2px,#2b2e33 2px)}
    .s-sign h1{margin:6px 12px 0;font-size:18px;line-height:24px;font-weight:700;color:#f4efe4;text-shadow:2px 2px 0 #a8533a}
    .s-lede{margin:2px 16px 6px;font-size:13px;line-height:18px;color:#e6c48c}
    .s-term{display:flex;flex-direction:column;border-style:solid;border-width:2px;border-image:var(--s-fr-win) 2 / 2px stretch}
    .s-titlebar{flex:none;position:relative;display:flex;align-items:center;gap:6px;height:26px;padding:0 10px;background:linear-gradient(#4a4e55 0 2px,#33363c 2px 24px,#1c1e22 24px)}
    .s-titlebar i{width:10px;height:10px;background:#e07a61;clip-path:polygon(2px 0,8px 0,8px 2px,10px 2px,10px 8px,8px 8px,8px 10px,2px 10px,2px 8px,0 8px,0 2px,2px 2px)}
    .s-titlebar i:nth-child(2){background:#ffcf2e}.s-titlebar i:nth-child(3){background:#9ab86a}
    .s-titlebar h2{position:absolute;left:60px;right:60px;top:0;margin:0;font-size:12px;font-weight:400;line-height:26px;text-align:center;color:#a4a9b0;white-space:nowrap;overflow:hidden}
    .s-screen{display:flex;flex-direction:column;justify-content:center;padding:8px 8px 8px 12px;background:#0b0d13}
    .s-line{display:flex;align-items:center;gap:8px;min-height:28px;padding:4px 0;box-sizing:border-box}
    .s-pr{flex:none;font-weight:700;color:#d77757}
    .s-cmd{font:inherit;white-space:pre}
    .s-note{color:#76809a}
    .s-go{min-height:36px;margin:2px -8px -2px -12px;padding:2px 8px 2px 12px;background:#1d1a0d;box-shadow:inset 2px 0 0 #ffcf2e}
    .s-go .s-cmd{font-weight:700;color:#ffcf2e}
    .s-caret{display:inline-block;width:8px;height:16px;margin-left:-6px;background:#ffcf2e}
    .s-foot{text-align:center;font:24px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#a4977c}
    .s-credit{text-align:center;font:30px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#a4977c}.s-credit b{color:#ffcf2e;font-weight:700}
    .s-focus{position:absolute;pointer-events:none;box-shadow:0 0 0 4000px rgba(5,5,12,.62)}
    .s-isof{position:absolute;box-sizing:border-box;border-style:solid;border-width:18px;border-image:var(--s-fr-sign) 6 / 18px stretch;pointer-events:none;box-shadow:0 24px 60px rgba(0,0,0,.55)}`

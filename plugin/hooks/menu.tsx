// The pixel-art menu at the top of the pane, as a surface module: the desktop app draws it in a `Client` region as wide
// as the pane (hooks/register.tsx), one row per region: the tabs, on the Timelapse its ranges and Export under them,
// on the Month the row its Export key opens under the strip (an LED asking what, then how), and under the Frame key
// its row (an LED saying whether the frame is on, the keys that turn it on or off). It draws
// lib/svg-menu.mjs's row as an image (no frame: the pointer must reach this module), tells from the cell under a click
// which key it fell on (zoneAt, the cell's span as a share of the row, which the row spans), and posts that key's id
// with its row (`{ row, id }`); the hooks module checks it and answers with the row's next props at once. A key held
// down is drawn pressed until the button comes up on it; the pointer leaving it, or coming up off the row, lets it go
// for nothing. It listens to no key: a listener would take the pane's keyboard on a click, and the pane's hotkeys (the
// tabs' digits, y w m e, p n c, the export row's letters), which hidden Buttons beside it keep, would stop. No `$`
// here, no state but the key held down.
import type { ClientModule, ClientPointerEvent, RenderElement } from 'claude-code'

import type { MenuKey } from '../lib/svg-menu.mjs'
import { renderMenu, zoneAt } from '../lib/svg-menu.mjs'

/**
 * What the hooks module hands a row: which row, its keys, its width in CSS px, whether a row hangs under it or it under
 * one, and the question its LED asks (the export row's).
 */
type MenuProps = { row: 'tabs' | 'lapse' | 'export' | 'frame-row'; keys: MenuKey[]; width: number; joined: boolean; under?: boolean; prompt?: string }
/** The key held down, while it is. */
type Held = { pressed: string | null }

const Menu: ClientModule<MenuProps, Held> = (props, surface) => {
  const pressed = surface.state?.pressed ?? null
  const menu = renderMenu({
    keys: Array.isArray(props.keys) ? props.keys : [], width: props.width, joined: props.joined === true, under: props.under === true, pressed,
    prompt: typeof props.prompt === 'string' ? props.prompt : '',
  })
  // the key under the pointer, none off the row. As on the strip (hooks/period.tsx): a row 38 px tall is 2 rows of 19
  // px, or 1 row and a part of one of 20 px, which is on the row all the same; and the cell's span counts from
  // columns + 0.5, the region being `columns` cells and a part of one more
  const keyAt = (e: ClientPointerEvent) => {
    if (e.y < 0 || (surface.rows > 0 && e.y >= Math.max(2, surface.rows))) return null
    const columns = Math.max(1, surface.columns)
    if (e.fine) return zoneAt(menu, e.fine.x / columns)
    return zoneAt(menu, e.x / (columns + 0.5), (e.x + 1) / (columns + 0.5))
  }

  surface.onPointer((e) => {
    const held = surface.state?.pressed ?? null
    if (e.type === 'down' && e.button === 'left') {
      const zone = keyAt(e)
      if (zone) surface.setState({ pressed: zone.id })
    } else if (e.type === 'up' && held) {
      const zone = keyAt(e)
      surface.setState({ pressed: null })
      if (zone?.id === held) surface.post({ row: props.row, id: zone.id })
    } else if (held && (e.type === 'leave' || (e.type === 'move' && keyAt(e)?.id !== held))) surface.setState({ pressed: null })
  })

  // the surface's own Svg, which its element table for a module does not list: the desktop draws it all the same
  return h('Svg', { source: menu.source, alt: menu.alt, width: menu.px, height: menu.h }) as RenderElement
}

export default Menu

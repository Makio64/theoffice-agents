// The strip that pages a tab of The Office through the past, as a surface module: the desktop app draws it in a
// `Client` region right under the tabs (hooks/register.tsx), from the props the hooks module hands it, and it answers
// the pointer itself. It draws lib/svg-period.mjs's strip as an image (no frame: the pointer must reach this module),
// tells from the cell under a click which key or window it fell on (zoneAt, the zones' share of the strip's width), and
// posts what it asks for: a key that turns pages its step (`{ unit, step }`, older positive), which the hooks module
// counts from the page on screen when it lands, so quick clicks never fall on the same page; a window or NOW its page
// (`{ unit, back }`); the Month's Export key what it does (`{ unit, act: 'export' }`, opening or closing the row that
// asks what to export). The hooks module checks each, and answers with the strip's next props at once. A key held down
// is drawn pressed until the button comes up on it; the pointer leaving it, or coming up off the strip, lets it go for
// nothing. It listens to no key: a listener would take the pane's keyboard on a click, and the pane's hotkeys (p, n, c
// for these keys, the tabs' digits) would stop. No `$` here, no state but the key held down.
import type { ClientModule, ClientPointerEvent, RenderElement } from 'claude-code'

import { pageBack } from '../lib/period.mjs'
import { renderPeriod, zoneAt } from '../lib/svg-period.mjs'

/**
 * What the hooks module hands the strip: the tab's unit, its page, today's date, its width in CSS px, whether the page is
 * being read, whether the menu's tabs sit on it, the Month's Export key (none elsewhere), and whether a deck hangs
 * under it (the row asking what to export).
 */
type PeriodProps = {
  unit: 'day' | 'week' | 'month'; back: number; today: string; width: number; busy: boolean; joined?: boolean; exporter?: 'idle' | 'open' | 'busy' | null
  hangs?: boolean
}
/** The zone held down, while it is. */
type Held = { pressed: string | null }

const Period: ClientModule<PeriodProps, Held> = (props, surface) => {
  const pressed = surface.state?.pressed ?? null
  const strip = renderPeriod({
    unit: props.unit, back: pageBack(props.back), today: props.today, width: props.width, busy: props.busy === true, pressed, joined: props.joined === true,
    exporter: props.exporter ?? null, hangs: props.hangs === true,
  })
  // the zone under the pointer, none off the strip. Its 40 px are rows 0 and 1 of the desktop's 19 or 20 px, and row 2
  // is below the keys or below the strip (the pointer is held from a press, so an up off it still comes); rows taller
  // than 20 px make it 1 row and a part, which holds the keys' lower half. The desktop tells only the cell, so the
  // cell's span as a share of the region, which the strip spans, goes to what it covers most; the region is `columns`
  // cells and a part of one more, half a cell on average, so the span counts from columns + 0.5 (from columns alone it
  // drifts a cell right at the end).
  const under = (e: ClientPointerEvent) => {
    if (e.y < 0 || (surface.rows > 0 && e.y >= Math.max(2, surface.rows))) return null
    const columns = Math.max(1, surface.columns)
    if (e.fine) return zoneAt(strip, e.fine.x / columns)
    return zoneAt(strip, e.x / (columns + 0.5), (e.x + 1) / (columns + 0.5))
  }

  surface.onPointer((e) => {
    const held = surface.state?.pressed ?? null
    if (e.type === 'down' && e.button === 'left') {
      const zone = under(e)
      if (zone) surface.setState({ pressed: zone.id })
    } else if (e.type === 'up' && held) {
      const zone = under(e)
      surface.setState({ pressed: null })
      if (zone?.id === held) {
        surface.post(zone.act ? { unit: props.unit, act: zone.act } : zone.step ? { unit: props.unit, step: zone.step } : { unit: props.unit, back: zone.back })
      }
    } else if (held && (e.type === 'leave' || (e.type === 'move' && under(e)?.id !== held))) surface.setState({ pressed: null })
  })

  // the surface's own Svg, which its element table for a module does not list: the desktop draws it all the same
  return h('Svg', { source: strip.source, alt: strip.alt, width: strip.px, height: strip.h }) as RenderElement
}

export default Period

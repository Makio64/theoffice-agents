// Type sidecar for lib/svg-menu.mjs, so the menu's surface module (hooks/menu.tsx) and the hooks module can import it
// under `strict`. Runtime code lives in svg-menu.mjs; keep the two in step.

/** The pixel icons a key of the menu may carry. */
export type MenuArt =
  | 'live' | 'today' | 'week' | 'month' | 'work' | 'timelapse' | 'yesterday' | 'export'
  // the switches: the Live tab's Quiet, the Zoom
  | 'quiet' | 'zoom'
  // the Month's export row: what to export, how, and Back
  | 'calendar' | 'directory' | 'building' | 'stats' | 'png' | 'svg' | 'gif' | 'video' | 'page' | 'csv' | 'json' | 'back'

/** A standalone glyph shares the desktop menu's bitmap and default key colours. */
export type MenuIconOptions = {
  /** Whole CSS px per art pixel (1…16, rounded); defaults to 2. */
  scale?: number
  ink?: string
  accent?: string
}

/** An aria-hidden inline SVG, or an empty string for an unknown icon. */
export function menuIconSvg(name: MenuArt, options?: MenuIconOptions): string

/**
 * One key of the menu: its id (what a click on it posts), its words in full and short, its icon. `isOn`: the one picked,
 * drawn lit, going nowhere unless `isRepeatable` (a range of the Timelapse, pressed again for a fresh replay); `isBusy`:
 * still at work (Export while it exports), its letters blinking, going nowhere. `isSwitch`: a switch apart at the right
 * end (the Live tab's Quiet), lit while on (`isOn`), always pressable, its face the same on and off; `isHidden`: it
 * keeps its room in the row and draws nothing (the switch off the Live tab, so the tabs never move).
 */
export type MenuKey = {
  id: string; label: string; short: string; icon: MenuArt; isOn?: boolean; isRepeatable?: boolean; isBusy?: boolean; isSwitch?: boolean; isHidden?: boolean
}

/** A key a click may go to, in the menu's own units. */
export type MenuZone = { id: string; x: number; w: number }

/**
 * A drawn menu row: its source, its size (`W` × `H` units, `px` × `h` CSS px), its alt text, its zones, and what is
 * drawn and goes nowhere (`still`, in units).
 */
export type MenuRow = {
  source: string; W: number; H: number; px: number; h: number; alt: string; zones: MenuZone[]; still: { x: number; w: number }[]
  /** The ladder's step drawn: full, short, tight, words, picked, picked-short, icons or tiny. */
  tier: string
}

export type RenderMenuOptions = {
  keys?: MenuKey[]
  /** CSS px (240…4096). */
  width?: number
  /** The id of the key held down, drawn pressed. */
  pressed?: string | null
  /** The strip, or another row, hangs right under it: its foot square, the two read as one console. */
  joined?: boolean
  /** It hangs right under another row: its top square. */
  under?: boolean
  /** The question an amber LED asks at the row's left (the Month's export row), left out where the keys would not fit beside it. */
  prompt?: string
}

/** One row of the menu: the tabs, the Timelapse's ranges, or the Month's export row. */
export function renderMenu(options: RenderMenuOptions): MenuRow
/** The key a click falls on, at a point `from` or over a span `from`–`to` (shares of the row's width), or null. */
export function zoneAt(row: MenuRow, from: number, to?: number): MenuZone | null

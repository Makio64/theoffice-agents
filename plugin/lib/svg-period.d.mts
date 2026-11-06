// Type sidecar for lib/svg-period.mjs, so the strip's surface module (hooks/period.tsx) can import it under `strict`.
// Runtime code lives in svg-period.mjs; keep the two in step.
import type { PageUnit } from './period.mjs'

/** A key or a window a click may go to, in the strip's own units. */
/**
 * `step`: on a key that turns pages, by how many (older positive), counted from the page on screen when the click lands.
 * `act`: on the Month's Export key, what it does instead of turning a page.
 */
export type PeriodZone = { id: string; x: number; w: number; back: number; step?: number; act?: 'export' }

/**
 * A drawn strip: its source, its size (`W` × `H` units, `px` × `h` CSS px), its alt text and LED label, its zones, and
 * what is drawn and goes nowhere (`still`, in units).
 */
export type PeriodStrip = {
  source: string; W: number; H: number; px: number; h: number; alt: string; label: string; zones: PeriodZone[]
  still: { x: number; w: number }[]
}

export type RenderPeriodOptions = {
  unit?: PageUnit
  /** The page on screen: 0 the range as it runs now. */
  back?: number
  /** The calendar the pages count from (YYYY-MM-DD). */
  today: string
  /** CSS px across. */
  width?: number
  /** The page named is being read: its LED blinks. */
  busy?: boolean
  /** The id of the zone held down, drawn pressed. */
  pressed?: string | null
  /** The menu of tabs sits on it: its top corners square, so the two meet flush. */
  joined?: boolean
  /**
   * The Month's Export key past NOW: 'idle', 'open' (lit: the row asking what to export hangs under the strip) or 'busy'
   * (an export runs: its tray blinks, and it goes nowhere). None when unset.
   */
  exporter?: 'idle' | 'open' | 'busy' | null
  /** A deck hangs under it: its foot corners square, its plate running on under its foot. */
  hangs?: boolean
}

/** What the LED says for a page: TODAY, YESTERDAY, SAT 31 OCT, 19-25 OCT, AUGUST 2026… */
export function ledLabel(unit: PageUnit, back: number, today: string, short?: boolean): string
/** The strip of a unit's page. */
export function renderPeriod(options: RenderPeriodOptions): PeriodStrip
/** The zone a click falls on, at a point `from` or over a span `from`–`to` (shares of the strip's width), or null. */
export function zoneAt(strip: PeriodStrip, from: number, to?: number): PeriodZone | null
/** How many characters the LED holds for each unit, in full and short. */
export const LED_CHARS: Record<PageUnit, { full: number; short: number }>

// Type sidecar for lib/svg.mjs, so the TypeScript hooks module (hooks/register.tsx) can import the renderer under
// `strict`. Runtime code lives in svg.mjs; keep the two in step.
import type { OfficeFacts } from '../types/index.js'

/** Views renderSvg draws (lib/svg.mjs SVG_VIEWS); anything else draws 'live'. */
export type SvgView = 'live' | 'today' | 'week' | 'month' | 'work' | 'all'

export type RenderSvgOptions = {
  /** CSS pixels; the art sits on a grid of `scale`-px pixels (viewBox = width / scale, 2 by default). */
  width?: number
  /** false emits no SMIL at all. */
  animate?: boolean
  /** 'live' floor plan, 'today' the day, 'week' tower, 'month' the month, 'work' what they did, 'all' the Office: the live building, as 'live'. Every view has the commits line under its street. */
  view?: SvgView
  /** Prefix of the `<defs>` ids, so two SVGs can share one document. */
  idPrefix?: string
  /** CSS px the drawing should at least fill: a shorter one grows bedrock under its commits line (nothing when transparent). */
  minHeight?: number
  /** true paints no backdrop (sky, title bar, ground fill, root background): the drawing sits on the page behind it. */
  transparent?: boolean
  /** true draws a card: clipped to rounded corners on its ground, a hairline edge of light inside them, no root background. */
  card?: boolean
  /**
   * true for a drawing that stays on screen: its clocks run by themselves (SMIL, phased from `clockAt`), durations hold
   * for a 10-minute window in coarse steps, running totals move in steps, the rest moves on the hour. The same facts
   * within one window and the same `clockAt` give the same string, so the pane redraws only when something changed.
   */
  liveClock?: boolean
  /** Epoch ms the live clocks are phased from: when the source goes on screen. The facts' now when not given. */
  clockAt?: number
  /**
   * true draws the live building ('live', 'all') with its names alone, the pane's Quiet key: the nameplates and floor
   * numbers stay, the whiteboards and the basement's shares too, the other tags and the scoreboards go, a desk that needs
   * you keeps its two lines and every other one says them in a card under the pointer, the sign keeps one line. Any other
   * view ignores it.
   */
  quiet?: boolean
  /**
   * CSS px per art pixel, 2 (default) to 4: the pane's Zoom key draws at 2.5. The same `width` holds fewer, bigger art
   * pixels (words and figures with them), so the building is taller; its box is still `width` wide.
   */
  scale?: number
}

/** Live headcount as the drawing counts it. */
export type OfficeCounts = {
  desks: number
  working: number
  waiting: number
  asking: number
  /** Stopped by the user, or went quiet. */
  stopped: number
  errors: number
  /** Something will start their next turn by itself (a background job, a scheduled wakeup). */
  onBreak: number
  /** Their turn ended with an answer: dozing ones (done over an hour ago) too. */
  done: number
  interns: number
  meetings: number
  meetingAgents: number
}

export type RenderTimelapseOptions = {
  /** CSS pixels (240…2400); the art sits on a 2-px pixel grid (viewBox = width / 2). Default 960. */
  width?: number
  /** false draws a still of the busiest slot, no SMIL at all. Default true. */
  animate?: boolean
  /** Prefix of the `<defs>` ids, so two SVGs can share one document. Default 'tl'. */
  idPrefix?: string
  /** true paints no backdrop (sky bands, ground, root background): the drawing sits on the page behind it. */
  transparent?: boolean
  /** true draws a card (rounded corners on its ground, a hairline edge, no root background), as renderSvg's. */
  card?: boolean
  /** CSS px per art pixel (2 to 4), as renderSvg's: the pane's Zoom key. */
  scale?: number
}

/**
 * The replay's pace every renderer of the timelapse shares: seconds of replay per slot, seconds the last slot holds.
 * A loop of `slots` slots lasts `slots * SLOT_SECONDS + HOLD_SECONDS`.
 */
export const TIMELAPSE: Readonly<{ SLOT_SECONDS: 0.05; HOLD_SECONDS: 2.5 }>

export function renderSvg(facts: OfficeFacts | null | undefined, options?: RenderSvgOptions): string
/**
 * The timelapse of `facts.timeline` as one self-animating, looping SVG (≤ 120 000 chars). Its root carries
 * `data-timelapse` (the range), `data-loop` (seconds), `data-slots`, `data-slot-seconds` and `data-hold`.
 */
export function renderTimelapse(facts: OfficeFacts | null | undefined, options?: RenderTimelapseOptions): string
export function esc(s: unknown): string
/** A finished drawing with every animation on a shared beat and no frame loop left running (lib/svg-beat.mjs). `prefix`: what its ids start with. */
export function onBeat(svg: string, prefix?: string): string
export function officeCounts(facts: OfficeFacts | null | undefined): OfficeCounts
/** View → the one scene it draws (`all` draws `live`), as a one-item list. */
export const SVG_VIEWS: Readonly<Record<SvgView, readonly string[]>>

export type RenderLoadingOptions = {
  /** CSS pixels (240…2400). */
  width?: number
  /** false emits no SMIL at all. */
  animate?: boolean
  /** Prefix of the `<defs>` ids. */
  idPrefix?: string
  /** true draws a card, as renderSvg's. */
  card?: boolean
  /** The windows by night. */
  night?: boolean
}

/**
 * The room a tab shows while its facts are read for the first time (svg-loading.mjs): Clawd reading at the archive,
 * the calendar's days lighting up one by one. The same drawing for the whole wait.
 */
export function renderLoading(kind: 'week' | 'today' | 'month' | 'past', options?: RenderLoadingOptions): string

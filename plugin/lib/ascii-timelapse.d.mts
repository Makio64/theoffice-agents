// Type sidecar for lib/ascii-timelapse.mjs, so the TypeScript hooks module (hooks/register.tsx) can import the text
// timelapse under `strict`. Runtime code lives in ascii-timelapse.mjs; keep the two in step.
import type { OfficeFacts } from '../types/index.js'
import type { Line } from './ascii.mjs'

export type RenderTimelapseTextOptions = {
  /** Columns, 20..140. From 60 up 16 project rows and full names; below 60 (down to 20) the narrow form: 8 rows, short names. */
  width?: number
  /**
   * Frame of the replay, counting up with the frame clock (TEXT_FRAME_MS); it wraps after timelapseFrames(facts) frames.
   * null or missing draws the still: the whole range, no playhead, and its busiest slot. Every frame of one replay has
   * the same line count.
   */
  frame?: number | null
  /** Printable 7-bit ASCII only. */
  ascii?: boolean
}

/** The frame clock the text replay is paced for, in ms (700). */
export const TEXT_FRAME_MS: number

/** facts.timeline as text lines (`[text, role]` spans, as renderOffice); no timeline or nobody at work → two lines saying so. */
export function renderTimelapseText(facts: OfficeFacts | null | undefined, options?: RenderTimelapseTextOptions): Line[]
/** Frames one loop of the text replay takes at TEXT_FRAME_MS (ceil(slots / 48) slots a frame, then 4 held); 1 when there is nothing to replay. */
export function timelapseFrames(facts: OfficeFacts | null | undefined): number
/** The slot of the cut replay a frame shows (lapseSlot of model.mjs cropTimeline's timeline names it; it wraps like the replay), or null when there is nothing to replay. */
export function timelapseFrameSlot(facts: OfficeFacts | null | undefined, frame: number): number | null

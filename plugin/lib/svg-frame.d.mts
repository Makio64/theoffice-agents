// Type sidecar for lib/svg-frame.mjs, so the hooks module (hooks/register.tsx) can import the Frame key's card under
// `strict`. Runtime code lives in svg-frame.mjs; keep the two in step.
import type { OfficeFrameLink } from '../types/index.js'

export type RenderFrameCardOptions = {
  /** CSS px (240…4096). */
  width?: number
  /** Where the frame stands, as the launcher's `--frame --json` answer was checked; null draws it off. */
  link?: OfficeFrameLink | null
}

/** The card's SVG, its size in CSS px, and its alt text. */
export type FrameCard = { source: string; alt: string; px: number; h: number }

/** The Frame key's card: the QR code of the frame's address and what it says while it is on, what turning it on does while it is off. */
export function renderFrameCard(options?: RenderFrameCardOptions): FrameCard
/** Where the frame stands, in a few words: `off`, `on your network`, `on this computer only`… */
export function frameState(link: OfficeFrameLink | null | undefined): string
/** The card in lines of text for a terminal, the code in half blocks under the words. */
export function frameText(options?: { link?: OfficeFrameLink | null; columns?: number }): string[]
/** Words broken into lines of `room` characters at most; an address is cut after its port. */
export function wrap(text: string, room: number): string[]

// Type sidecar for lib/ascii.mjs, so the TypeScript hooks module (hooks/register.tsx) can import the renderer under
// `strict`. Runtime code lives in ascii.mjs; keep the two in step.
import type { OfficeFacts } from '../types/index.js'

/** Semantic color of a span; `clawd` is Claude orange (every agent is a Clawd); `p0`..`p7` are the per-project palette. */
export type Role =
  | 'wall' | 'floor' | 'title' | 'accent' | 'dim' | 'busy' | 'idle' | 'wait' | 'ask' | 'intern' | 'meeting' | 'ship'
  | 'night' | 'day' | 'warn' | 'clawd' | 'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7'

/** One run of text in one color; `null` is the surface's default text color. */
export type Span = [text: string, role: Role | null]

/** One drawn line: spans whose display widths add up to at most the asked width. */
export type Line = Span[]

export type View = 'live' | 'today' | 'week' | 'month' | 'work' | 'all'

export type RenderOfficeOptions = {
  /** Anything outside VIEWS renders `all`. */
  view?: View
  /** Columns, at most 140. From 60 up every view draws its art; below 60 (down to 20) it draws the narrow list. */
  width?: number
  /** Animation frame; the same facts and frame give the same lines. */
  frame?: number
  /** Printable 7-bit ASCII only. */
  ascii?: boolean
  /** Case-insensitive substring filter on project names. */
  project?: string | null
  /** false leaves "what they did" out of today, week and month (a page that draws it under its own picture). */
  departments?: boolean
}

export const VIEWS: readonly View[]
/** SGR parameters per role: 16-color codes, plus 256-color `38;5;173` for `clawd`. */
export const ROLE_ANSI: Readonly<Record<Role, string>>
/** ROLE_ANSI restricted to the 16-color palette (`clawd` falls back to `33`). */
export const ROLE_ANSI_16: Readonly<Record<Role, string>>
export const ROLE_HEX: Readonly<Record<Role, { readonly dark: string; readonly light: string }>>
/** Text props per role for a terminal Claude Code draws: theme keys and basic color names that follow the theme. */
export const ROLE_TERM: Readonly<Record<Role, { readonly color?: string; readonly dimColor?: boolean }>>

export function renderOffice(facts: OfficeFacts | null | undefined, options?: RenderOfficeOptions): Line[]
export function renderStatus(facts: OfficeFacts | null | undefined, options?: { width?: number; ascii?: boolean }): string
export function toPlain(lines: readonly Line[]): string
/** `colors: 16` keeps to the 16-color palette (ROLE_ANSI_16); the default lets Clawd use 256-color orange. */
export function toAnsi(lines: readonly Line[], options?: { colors?: 16 | 256 }): string

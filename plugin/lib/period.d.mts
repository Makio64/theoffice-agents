// Type sidecar for lib/period.mjs, so the TypeScript hooks module (hooks/register.tsx) and the strip's surface module
// (hooks/period.tsx) can import it under `strict`. Runtime code lives in period.mjs; keep the two in step.

/** A tab's unit of paging: Today pages by days, Week and What they did by Monday-to-Sunday weeks, Month by calendar months. */
export type PageUnit = 'day' | 'week' | 'month'

/** One window of a page's ruler (pageTicks). */
export type PageTick = {
  /** The page it goes to (0 for one yet to come, which has none). */
  back: number
  /** What the window shows: a weekday's letter, a Monday's date, a month's letter. */
  mark: string
  /** The page's name (pageName); '' for one yet to come. */
  name: string
  isOn: boolean
  isFuture: boolean
}

/** A page's distance as the whole number it must be: anything else is page 0. */
export function pageBack(back: unknown): number
/** How many pages one leap turns: a week of days, about a month of weeks, a year of months. */
export function pageLeap(unit: PageUnit): number
/** The days of a page of `unit`, oldest first (YYYY-MM-DD), on the calendar of `today`: the month's page 0 from last month's 1st. */
export function pageDays(unit: PageUnit, back: number, today: string): string[]
/** `Sat 31 Oct`, with its year when that is not `today`'s. */
export function dayName(day: string, today: string): string
/** What a past page is called in the facts: `Sat 31 Oct`, `Mon 19 Oct → Sun 25 Oct`, `October 2026`. */
export function pageLabel(unit: PageUnit, back: number, today: string): string
/** What a page is called on the strip and in a sentence: `Today`, `Last 7 days`, `Oct → now`, `Yesterday`, `October 2026`… */
export function pageName(unit: PageUnit, back: number, today: string): string
/** The ruler a page sits on: the days of its week, the weeks of its month or the months of its year. */
export function pageTicks(unit: PageUnit, back: number, today: string): PageTick[]

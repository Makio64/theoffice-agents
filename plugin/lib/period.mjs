// PURE: the pages of the past. A tab with a range pages back through time by its unit, with no end to it: page 0 is the
// range as it runs now (today, the last 7 days, last month and this one so far) and page N the N-th whole day,
// Monday-to-Sunday week or calendar month before it, so a page says the same thing whatever day it is read on and
// January 2026 is a page of its own. Days are `YYYY-MM-DD` strings worked out in UTC from the string alone (as model.mjs
// dayInfo), so a machine's zone can never shift one. The collector (resolveRange), the desktop mod and its strip (svg-period.mjs) all page through
// here. No node:* imports (the desktop mod loads this file).

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/** How many pages a leap turns: a week of days, about a month of weeks, a year of months. */
const LEAP = { day: 7, week: 4, month: 12 }

const msOf = (day) => Date.parse(`${day}T00:00:00Z`)
const dayAt = (ms) => new Date(ms).toISOString().slice(0, 10)
const shift = (day, n) => dayAt(msOf(day) + n * 864e5)
const parts = (day) => YMD.exec(day).slice(1).map(Number)
const span = (first, n) => Array.from({ length: n }, (_, i) => shift(first, i))
/** Monday of a day's week (the calendars here run Monday first). */
const mondayOf = (day) => shift(day, -((new Date(msOf(day)).getUTCDay() + 6) % 7))

/** A page's distance as the whole number it must be: anything else is page 0, the range as it runs now. */
export function pageBack(back) {
  const n = Math.floor(Number(back))
  return Number.isSafeInteger(n) && n > 0 ? n : 0
}

/** How many pages one leap turns (LEAP). */
export const pageLeap = (unit) => LEAP[unit] ?? 1

/**
 * The days of a page of `unit`, oldest first, on the calendar of `today`. The month's page 0 runs from the 1st of last
 * month to today, so a month is never cut and a young one is not a page of empty squares: 29 to 62 days.
 */
export function pageDays(unit, back, today) {
  const n = pageBack(back)
  if (unit === 'day') return [shift(today, -n)]
  if (unit === 'week') return n ? span(shift(mondayOf(today), -7 * n), 7) : span(shift(today, -6), 7)
  const [y, m] = parts(today)
  const first = Date.UTC(y, m - 1 - Math.max(n, 1), 1)
  const end = n ? Date.UTC(y, m - n, 1) : msOf(today) + 864e5
  return span(dayAt(first), Math.round((end - first) / 864e5))
}

/** `Sat 31 Oct`, with its year when that is not `today`'s (`Fri 12 Dec 2025`). */
export function dayName(day, today) {
  const [y, m, d] = parts(day)
  const name = `${WEEKDAYS[new Date(msOf(day)).getUTCDay()]} ${d} ${MONTHS[m - 1].slice(0, 3)}`
  return y === parts(today)[0] ? name : `${name} ${y}`
}

/** What a past page is called in the facts: `Sat 31 Oct`, `Mon 19 Oct → Sun 25 Oct`, `October 2026`. */
export function pageLabel(unit, back, today) {
  const days = pageDays(unit, back, today)
  if (unit === 'day') return dayName(days[0], today)
  if (unit === 'week') return `${dayName(days[0], today)} → ${dayName(days.at(-1), today)}`
  const [y, m] = parts(days[0])
  return `${MONTHS[m - 1]} ${y}`
}

/** What a page is called on the strip and in a sentence: page 0 by what it is now (Oct → now), the others by their dates. */
export function pageName(unit, back, today) {
  const n = pageBack(back)
  if (n === 0 && unit === 'month') return `${MONTHS[parts(pageDays(unit, 0, today)[0])[1] - 1].slice(0, 3)} → now`
  if (n === 0) return { day: 'Today', week: 'Last 7 days' }[unit]
  if (unit === 'day' && n === 1) return 'Yesterday'
  return pageLabel(unit, n, today)
}

/**
 * The ruler a page sits on: the days of its week, the weeks of its month or the months of its year, as
 * `{ back, mark, name, isOn, isFuture }`. Fixed frames, so a mark stays where it was while the page moves within them
 * and January is always the first of its row: a day's `mark` is its weekday's letter, a week's the date of its Monday
 * (a week belongs to the month of its Monday), a month's its letter. A page yet to come has no `back` to go to. The
 * month's page 0 lights last month's window too, which still goes to that month alone.
 */
export function pageTicks(unit, back, today) {
  const n = pageBack(back)
  const anchor = pageAnchor(unit, n, today)
  const backOf = (day) => pageBackOf(unit, day, today)
  const tick = (day, mark) => {
    const b = backOf(day)
    const isOn = b === n || (unit === 'month' && n === 0 && b === 1)
    return { back: Math.max(0, b), mark, name: b >= 0 ? pageName(unit, b, today) : '', isOn, isFuture: b < 0 }
  }
  if (unit === 'day') return span(mondayOf(anchor), 7).map((d) => tick(d, WEEKDAYS[new Date(msOf(d)).getUTCDay()][0]))
  if (unit === 'week') {
    const [, m] = parts(anchor)
    const first = shift(anchor, -7 * Math.floor((parts(anchor)[2] - 1) / 7))
    const out = []
    for (let monday = first; parts(monday)[1] === m; monday = shift(monday, 7)) out.push(tick(monday, String(parts(monday)[2])))
    return out
  }
  const [y] = parts(anchor)
  return MONTHS.map((name, i) => tick(`${y}-${String(i + 1).padStart(2, '0')}-01`, name[0]))
}

/** A day that names a page on its ruler: the page's own, its Monday for a week, its 1st for a month. Page 0 runs to today. */
function pageAnchor(unit, n, today) {
  if (unit === 'day') return shift(today, -n)
  if (unit === 'week') return shift(mondayOf(today), -7 * n)
  const [y, m] = parts(today)
  return dayAt(Date.UTC(y, m - 1 - n, 1))
}

/** How many pages back the page that holds `day` is, negative for one yet to come. */
function pageBackOf(unit, day, today) {
  if (unit === 'day') return Math.round((msOf(today) - msOf(day)) / 864e5)
  if (unit === 'week') return Math.round((msOf(mondayOf(today)) - msOf(mondayOf(day))) / (7 * 864e5))
  const [ty, tm] = parts(today)
  const [y, m] = parts(day)
  return (ty - y) * 12 + tm - m
}

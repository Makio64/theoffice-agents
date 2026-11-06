// The pages of the past (lib/period.mjs): what a day, a week and a month are, what they are called, and the ruler each sits on.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { pageBack, pageDays, pageLabel, pageLeap, pageName, pageTicks } from '../plugin/lib/period.mjs'

const TODAY = '2026-11-01' // a Sunday
const marks = (ticks) => ticks.map((t) => `${t.mark}${t.isOn ? '*' : ''}${t.isFuture ? '!' : ''}`).join(' ')

describe('pages of the past', () => {
  test('page 0 is the range as it runs now, a past page a whole day, Monday-to-Sunday week or calendar month', () => {
    assert.deepEqual([pageDays('day', 0, TODAY), pageDays('week', 0, TODAY).length, pageDays('month', 0, TODAY).length], [[TODAY], 7, 32])
    // the month of now: last month whole and this one so far, never a month cut nor a young one alone
    const now = (today) => { const d = pageDays('month', 0, today); return [d[0], d.at(-1), d.length] }
    assert.deepEqual(now('2026-11-03'), ['2026-10-01', '2026-11-03', 34])
    assert.deepEqual(now('2026-11-30'), ['2026-10-01', '2026-11-30', 61])
    assert.deepEqual(now('2026-12-01'), ['2026-11-01', '2026-12-01', 31])
    assert.deepEqual(now('2027-01-31'), ['2026-12-01', '2027-01-31', 62], 'across the year, two months of 31')
    assert.deepEqual(now('2026-03-01'), ['2026-02-01', '2026-03-01', 29])
    assert.deepEqual(pageDays('day', 2, TODAY), ['2026-10-30'])
    assert.deepEqual([pageDays('week', 1, TODAY)[0], pageDays('week', 1, TODAY).at(-1)], ['2026-10-19', '2026-10-25'])
    const january = pageDays('month', 10, TODAY)
    assert.deepEqual([january[0], january.at(-1), january.length], ['2026-01-01', '2026-01-31', 31])
    assert.equal(pageDays('month', 20, '2028-03-31').length, 31, 'July 2026, from a day no shorter month has')
    assert.equal(pageDays('month', 1, '2026-03-31').length, 28)
  })

  test('a page has its name, its year when it is not this one, and only whole numbers go back', () => {
    assert.deepEqual([pageName('day', 0, TODAY), pageName('day', 1, TODAY), pageName('week', 0, TODAY), pageName('month', 0, TODAY)], ['Today', 'Yesterday', 'Last 7 days', 'Oct → now'])
    assert.equal(pageName('month', 0, '2027-01-03'), 'Dec → now')
    assert.deepEqual([pageName('month', 10, TODAY), pageName('month', 22, TODAY)], ['January 2026', 'January 2025'])
    assert.equal(pageLabel('week', 45, TODAY), 'Mon 15 Dec 2025 → Sun 21 Dec 2025')
    assert.deepEqual([-1, 'x', null, undefined, Number.NaN, Infinity].map(pageBack), [0, 0, 0, 0, 0, 0])
    assert.deepEqual([2.9, '3'].map(pageBack), [2, 3])
    assert.deepEqual(['day', 'week', 'month'].map(pageLeap), [7, 4, 12])
  })

  test('a ruler is a fixed frame: the months of a year, the Mondays of a month, the days of a week; what is to come has no page', () => {
    assert.equal(marks(pageTicks('month', 10, TODAY)), 'J* F M A M J J A S O N D!')
    assert.equal(pageTicks('month', 10, TODAY)[1].back, 9)
    assert.equal(marks(pageTicks('month', 11, TODAY)), 'J F M A M J J A S O N D*', 'the month before January turns the ruler to its year')
    assert.equal(marks(pageTicks('week', 1, TODAY)), '5 12 19* 26')
    assert.equal(marks(pageTicks('day', 0, TODAY)), 'M T W T F S S*')
    assert.equal(marks(pageTicks('day', 0, '2026-10-28')), 'M T W* T! F! S! S!')
    assert.equal(pageTicks('month', 0, '2026-03-15').filter((t) => t.isFuture).every((t) => t.back === 0 && t.name === ''), true)
    // the month of now lights last month's window too, which still goes to that month alone
    assert.equal(marks(pageTicks('month', 0, TODAY)), 'J F M A M J J A S O* N* D!')
    assert.deepEqual(pageTicks('month', 0, TODAY).slice(9, 11).map((t) => [t.back, t.name]), [[1, 'October 2026'], [0, 'Oct → now']])
    assert.equal(marks(pageTicks('month', 0, '2027-01-03')), 'J* F! M! A! M! J! J! A! S! O! N! D!', 'December is on the year before')
    assert.equal(marks(pageTicks('month', 1, TODAY)), 'J F M A M J J A S O* N D!', 'a past page lights its own alone')
  })
})

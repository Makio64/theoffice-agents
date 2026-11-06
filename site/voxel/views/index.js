/**
 * Each view's builder: (ctx, snapshot, { previous, quiet }) → { storeys, group, lobbyPeople?, sign, status, rooms?,
 * anchors?, pickables?, update?, order?, dispose? }. See views/README.md for the contract every view keeps.
 */
import { buildLive } from './live.js'
import { buildToday } from './today.js'
import { buildWeek } from './week.js'
import { buildMonth } from './month.js'
import { buildWork } from './work.js'
import { buildTimelapse } from './timelapse.js'

export const VIEW_BUILDERS = {
  live: buildLive,
  today: buildToday,
  week: buildWeek,
  month: buildMonth,
  work: buildWork,
  timelapse: buildTimelapse,
}

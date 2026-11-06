// Native-size first pictures, ready to fetch without loading the browser's SVG
// renderer. The exact renderer, lively sample and crops stay shared with later
// responsive drawings; only their delivery changes.
import { Buffer } from 'node:buffer'
import { renderSvg } from '../plugin/lib/svg.mjs'
import * as kit from '../plugin/lib/svg-kit.mjs'
import { EDGE, pictureParts } from './pictures.mjs'
import { livelySamples } from './demo.js'

export const INITIAL_WIDTHS = Object.freeze(Array.from({ length: (1088 - 376) / 4 + 1 }, (_, index) => 376 + index * 4))
export const INITIAL_VIEWS = Object.freeze(['office', 'week', 'month', 'front', 'subway'])
const FLOOR_VIEWS = INITIAL_VIEWS.slice(0, 3)
const { rooms, ground } = pictureParts(kit)

function heightOf(source, width, name) {
  const dimensions = source?.match(/\bwidth="(\d+)" height="(\d+)" viewBox=/)
  if (!dimensions || Number(dimensions[1]) !== width) throw new Error(`Invalid initial ${name} picture at ${width}px`)
  return Number(dimensions[2])
}

/** Build a selected subset in tests; production uses every four-pixel width.
 * Layout rows follow INITIAL_VIEWS, indexed by (width - 376) / 4 in the full table.
 * Night artwork, the three floors and the street under them (front and subway, cut
 * from the week's drawing), starts the page; other lights retain their exact layout
 * sizes while their responsive pictures are produced in the background. */
export function createInitialPictures(input, {
  widths = INITIAL_WIDTHS,
  skies = ['night', 'day'],
  motions = [true, false],
} = {}) {
  const samples = livelySamples(input)
  const pictures = new Map()
  const layouts = {}
  let bytes = 0
  for (const sky of skies) {
    layouts[sky] = {}
    for (const animate of motions) {
      const rows = []
      layouts[sky][animate ? 'animated' : 'still'] = rows
      for (const width of widths) {
        const drawings = {}
        for (const name of FLOOR_VIEWS) {
          const source = renderSvg(samples[sky][name], {
            width: width + EDGE * 4,
            animate,
            quiet: true,
            view: name === 'office' ? 'live' : name,
            idPrefix: `simple-${name}-${sky}`,
          })
          drawings[name] = rooms(source, name)
          if (name === 'week') Object.assign(drawings, ground(source))
        }
        rows.push(INITIAL_VIEWS.map(name => heightOf(drawings[name], width, name)))
        if (sky === 'night') {
          for (const name of INITIAL_VIEWS) {
            const filename = `initial-${name}-${width}${animate ? '' : '-still'}.svg`
            const source = drawings[name]
            pictures.set(filename, source)
            bytes += Buffer.byteLength(source)
          }
        }
      }
    }
  }
  return { pictures, layouts, widths: [...widths], stats: { count: pictures.size, bytes } }
}

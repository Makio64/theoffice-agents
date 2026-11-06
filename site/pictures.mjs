// The same crops for the static fallback pictures and the site's responsive drawings.
// One art pixel is 2 CSS px; the renderer leaves EDGE art pixels outside either wall.
export const TOWER = 1088
export const EDGE = 6
export const FEATURE_VIEWS = { live: 'office', history: 'week', work: 'work' }

/** Pure crop helpers using the renderer's palette and geometry. */
export function pictureParts(kit) {
  const { K } = kit
  // The site's building is the only building: of each drawing, only its rooms. Its sky, sign and roof go, down to under its
  // cornice (roof + 5), and its sidewalk and all that runs under it, with what stands over the sidewalk (FOOT tall: the street
  // front, Today's empty band): the site has its own lobby and street. A drawing whose sidewalk is not found keeps its foot.
  const FOOT = { office: 56, week: 56, today: 16 }
  function rooms(svg, name) {
    const H = Number(svg.match(/viewBox="0 0 \d+ (\d+)"/)[1])
    const walk = svg.match(new RegExp(`<path fill="${K.walk}" d="M0 (\\d+)h`))
    return band(svg, kit.SKY + 5, walk ? Number(walk[1]) - (FOOT[name] ?? 0) : H)
  }

  // A band of a drawing, its rows y0 to y1, as wide as the tower: the EDGE margins outside its walls go
  function band(svg, y0, y1) {
    const W = Number(svg.match(/viewBox="0 0 (\d+) /)[1])
    const box = [EDGE, y0, W - 2 * EDGE, y1 - y0]
    return svg.replace(/width="\d+" height="\d+" viewBox="[^"]*"/, `width="${box[2] * 2}" height="${box[3] * 2}" viewBox="${box.join(' ')}"`)
  }

  // The feature windows are slices of the app's existing animated rooms. These row heights follow its renderer:
  // live's first desk row and tags (69); week's marquee, penthouse and first floor (20 + 15 + 48);
  // work's department band (HEAD 13 + ROW 36 + caption 24), with the second band showing several kinds of work.
  function feature(svg, name) {
    const rows = { live: [0, 69], history: [0, 83], work: [73, 73] }[name]
    if (!rows) return null
    const H = Number(svg.match(/viewBox="0 0 \d+ (\d+)"/)[1])
    const y0 = kit.SKY + 5 + rows[0]
    const y1 = Math.min(H, y0 + rows[1])
    return y1 > y0 ? band(svg, y0, y1) : null
  }

  // The foot of the page, from the week's drawing, whose tower stands on the Office's street front: `front`, its ground
  // floor (FOOT.week tall over the sidewalk: the entrance under its canopy, the shop windows, the agents going in and out),
  // the tower's last floor; `subway`, just the commits line below its road, under the page's own street. The storage
  // and directory below the line belong to the app's week view, so they stay outside the site's footer crop.
  // Null when its sidewalk or its line is not found: the page keeps its street alone.
  const ROAD = 13
  const SUBWAY = 53 // full line height, including its road (lib/svg-street.mjs SUBWAY_H)
  function ground(svg) {
    const walk = svg.match(new RegExp(`<path fill="${K.walk}" d="M0 (\\d+)h`))
    const line = svg.match(new RegExp(`<g transform="translate\\(0 (\\d+)\\)"><path fill="${K.walkD}" d="M0 0h`))
    if (!walk || !line) return null
    const y = Number(walk[1])
    // the soil over and under the line's tunnel in the page's own (art.js SOIL), so the line runs on into the page's ground
    const soiled = svg.replace(`<path fill="${kit.UNDER?.soil ?? '#1b1713'}" d="M0 13h`, `<path fill="${TOP_SOIL}" d="M0 13h`)
    return { front: band(svg, y - FOOT.week, y), subway: band(soiled, Number(line[1]) + ROAD, Number(line[1]) + SUBWAY) }
  }
  const TOP_SOIL = '#3b2b21'

  // the street front's lit lamps: the middle of each one's glass, in CSS px from the tower's left at its full width
  const lampsOf = (svg) => [...svg.matchAll(/<use href="#[\w-]+-fr-lampN" x="(-?[\d.]+)"/g)].map((m) => (Number(m[1]) + 3.5 - EDGE) * 2)

  return { rooms, feature, ground, lampsOf }
}

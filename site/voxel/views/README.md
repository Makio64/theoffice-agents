# Views of the voxel office

Each tab of the pixel office (Live, Today, Week, Month, What they did, Timelapse) is a building of its own here, stacked
on the shared street lobby (1F) and capped by the shared roof and neon sign. `scene.js` calls the tab's builder on every
new snapshot, page or theme of the tab, and throws the previous building away (`kit.releaseGroup` frees its instance
buffers and labels).

## The contract

```js
export function buildX(ctx, snapshot, { previous, quiet }) {
  return {
    storeys,      // [{ base, height, number, group }], bottom-up. base starts at LOBBY_TOP (3.8): storey i's base is the
                  // previous one's base + height. `group` holds that storey's content (it moves when floors are pulled apart).
    group,        // a THREE.Group that holds every storey group (and anything else the view puts above the lobby)
    lobbyPeople,  // optional: a group of things the view puts in the lobby (1F, y 0 … 3.8)
    sign,         // the sign's one or two lines under the neon: [[[text, color, opts], …], …] (the view's numbers)
    status,       // null (only Live has the status fascia under the cornice)
    rooms,        // optional: [{ project, floor, x0, x1, base, top }] for "find this project" (floor = storey index)
    anchors,      // optional: Map id → { x, y, z, floor, level } for "find this desk"
    pickables,    // optional: meshes the pointer hovers and clicks; their userData: { id?, project?, text? }.
                  // `text` is shown as the tooltip, `project` opens that project's card, `id` a desk's.
    update,       // optional: (elapsed, dt) → per frame while playing; animate a few transforms, never rebuild
    order,        // optional: anything the next build should keep (handed back as `previous`)
    dispose,      // optional
  }
}
```

`ctx` is `{ THREE, kit, labels, actors, building, lobby, windowMaterial, colliderGeometry, colliderMaterial, lights, nowMs, night }`.
Push every `PointLight` a view adds onto `ctx.lights` (with `userData.nightIntensity`, and `userData.dayIntensity` when 2.3 is not right by day) so day and night set it; a view
adds four at most.

## Space

- x to the right, y up, z towards the street (the camera). The camera looks from the street nearly straight on, a little
  from above, and the page scroll pans it down the building: everything is read from the front.
- Storeys span x −8.0 … 8.0 between the brick side walls (±8.18, drawn by the shell with each storey's floor number on
  the left, at x ≈ −8.1, z ≈ 3.56, near the storey's base: keep that corner clear). The front is at z 3.2 (`FRONT`), the
  back wall at z ≈ −3.1.
- A storey's height is the view's to choose (Live: 4.1, its bottom 0.62 a dark label band facing the street).
- The lobby (y 0 … 3.8) and the roof are built for you.

## The kit (kit.js)

- `box(parent, x, y, z, w, h, d, colorOrMaterial, { glow, rotate, yaw, dynamic, castShadow, receiveShadow })`: a unit
  box batched per parent and material into an instanced mesh. `dynamic: true` returns a mesh you can move (use sparingly).
- `flush()` turns the batches into meshes (the scene also flushes after a build).
- `mat(color, glow)`, `beam(...)`, `plant(parent, x, y, z, scale)`, `sprite(parent, rows, legend, x, y, z, pixel, depth)`
  (pixel art extruded, a legend char → color or material), `pixels()` (the 3×5 neon font, decorative only).
- Paint: `K` (plugin/lib/svg-kit.mjs scene paint), `stone`, `stoneHi`, `steel`, `darkSteel`.

## Words (labels.js)

`labels.label(spec)` returns a group facing the street, unlit, drawn on a canvas in the page's fonts:

```js
{
  lines: [{ spans: [[text, color, { bold, pixel, sep, join }]], size, align, gap }], // size in world units (tags .14–.16, plates .3–.34)
  width, height, pad, bg, alpha, mark, frame, radius, valign: 'middle',
  anchor: 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'bottom-left',          // the origin, else the centre
}
```

`{ pixel: true }` sets a span in the Office Pixel face (VT323), the default is DM Mono. A line too long for `width` ends
in an ellipsis. `labels.measure(text, size, { pixel })` is a span's width in world units.

## The cast (actors.js)

- `actors.figure(agentId, { p, legs, id })` → `{ root, … }`: a character extruded from its own sprite, its feet at the
  root's origin, `p` world units a pixel (17 × 10 pixels; .085 at a desk).
- `actors.animate(actor, pose, t)` per frame: `type`, `look`, `read`, `think`, `point`, `boss`, `hand`, `back`,
  `stuck`, `doze`, `stand`.
- `actors.mini(agentId, { p })`: an intern (11 × 6). `actors.screen(parent, name, x, y, z, w, h)`: a monitor's screen
  (`coding`, `reading`, `terminal`, `testing`, `web`, `delegating`, `planning`, `talking`, `design`, `tools`, `think`,
  `wait`, `ask`, `done`, `stop`, `err`, `doze`, `off`); `actors.tickScreen(mesh, t, phase)` flips its frames.

## The snapshot

Local (plugin/lib/voxel-dashboard.mjs) and sample (data.js) snapshots carry the same fields: `view`, `period` (`kind`,
`label`, `days`, `back`, `past`), `now` (`date`, `time`, `hour`, `night`, `weekday`), `projects` (`name`, `color`,
`minutes`, `commits`, `sessions`, `toolCalls`, `subagents`, `days` and `dayCommits` along `period.days`, `hourly`,
`daily` and `dailyDates` for the last seven days, `work`, `crew`, `live`, `recentCommits`), `totals`, `days` (one row a
day of the page), `hourly`, `work`, `crew`, `interns` (`job`, `n`), `agents` (the live desks: `kind`, `words`, `clock`,
`doing`, `title`, `project`, `agent`, `interns`, `meetings`), `left`, `timeline` (the replay's).

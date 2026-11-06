# The Office / Voxel

An alternative website and local plugin that extrudes The Office’s original pixel world into 3D. It uses Three.js **0.187.0** and `WebGPURenderer`, with Three’s built-in WebGL 2 fallback. The original pixel edition remains available.

The scene uses a normal 45° perspective camera, facing the building by default. Like the original pixel website, the building occupies a single column and the page scrolls through its floors. Details open over the page without resizing or moving the camera.

## Run

Use Node.js 24 or newer from the repository root:

```sh
npm install
npm run voxel
```

The development website is at `http://127.0.0.1:4186/`; `?mode=demo` opens the sample office directly. Both use the original scrolling building composition. The website’s data is illustrative and clearly labelled.

For actual local activity:

```sh
npm run build:voxel
npm run voxel:live
```

The local dashboard opens a token-protected loopback URL and refreshes saved agent activity every ten seconds. Activity is read by the existing collector. It is never uploaded. For a packaged sample dashboard, use `node scripts/voxel.mjs --demo --open`.

## The views

The tabs are the pixel office's own, and each one is a building of its own on the same street lobby, under the same roof and neon sign (keys **1**–**6** in the workspace):

- **Live:** the live building. One room per project, as wide as its desks, the biggest on the top floor; a carpet woven in the project's color and its nameplate hanging at the room's front with its headcount strip. Every desk's character takes the pose of its state at a monitor showing what it is at (typing, reading, thinking, the boss watching its interns, a hand up under a big ?, sitting back with a ✓ on the screen, scratching its head at an error or a stop, dozing under its zZ), its interns on a bench in front, and its tag on the floor's label band: its title, then what it is at and for how long (`coding · 1h30+`, `asks: Which cape anchor?`, `your turn · 10m+`), framed in its color when it waits on you. The lobby's café holds whoever is on a break, mug in hand; the meeting room seats the running workflows around a whiteboard of their progress; the coat rack keeps a coat for whoever just left. Under the cornice the status bar counts who is working, who needs you, who is with helpers and who is on a break; the sign says who is in (the desks, the cast, the interns, the longest shift, the meetings). **Quiet** (`q`) keeps the names and only the tags of the desks that need you. With nobody in, the projects worked today keep dark rooms.
- **Today:** the time clock room: the card racks (a card per open desk), the punch clock showing the time while a character punches in (sparks fly), the employee of the day in a gold frame and a tear-off calendar, over the busiest hour and the night shift's agent-time. Then the city of hours under the sky of the hour: a building for every hour worked, as tall as its agent-time, the busiest crowned, the hour now under construction with the mascot on its roof and a crane beside it, trees where nobody worked, the hours to come behind a fence. Then the timesheet on its clipboard: a row per project, 24 cells with a bar each, a gold star on its best hour, the night shift's hours tinted blue, the hour now as a red playhead.
- **Week:** the office tower: one floor per project, one window per day, lit by that day's agent-time, the day's agents at their monitors and its agent-time on the transom; a day off is shut behind its roller shutter. The nameplate tallies the floor's agent-time and commits, the busiest floor wears the crown, and a tear-off calendar page hangs over each day's column.
- **Month:** the wall calendar on its wire coil with the month's own picture (a scene and a pastime for each month), a square a day raised and shaded by its agent-time, stars on the best days, a crown on the busiest, today edged in gold; the employee of the month in a gilt frame; the building directory on a felt board (a week's sparkline, agent-time, commits and a lamp for a desk at work now per project); the crew, a staff badge per AI with its share; and what stood out (the busiest day, the days worked, the longest streak). **⤓ CSV** and **⤓ JSON** export the page's stats.
- **What they did:** the departments, one room per kind of work, busiest first and as wide as its share of the tool calls, each furnished as the pixel rooms are (the server room's blinking racks, the QA lab's boards of ticks, the library's bookcases and banker's lamps, the typing pool under its scoreboard of lines, the phone booth, the art studio…), an agent per share of the calls at work in it, its share, calls and kind of work under it; then the interns by job on their bench. The Live building carries the same departments in its basement, B1, under the street.
- **Timelapse:** yesterday, the last 7 days or the last 30 replayed, a twentieth of a second a slot: sessions take their desks while they work and leave them, rooms go dark while nobody is in, the meeting room fills while a workflow runs, the parcels pile up on the commits line, the sign's clock names the replayed time in gold and the sky turns with its hour. The bar under the tabs has the ranges, play and pause, the speeds, and the reel of the whole replay (sessions, interns, commits) with its scrubber.

Today, Week, What they did and Month page back through time from the strip under the tabs, as in the pixel office: **◀** (`p`) an older page, **▶** (`n`) a newer one, the windows of the strip to jump, **Now** (`c`). Every word in the scene is drawn on a canvas in the page's own fonts (DM Mono for tags, the Office Pixel face for signs and figures), unlit, so it reads by night and by day; the theme follows the hour until you pick one. The building fills the stage's width and the page scroll moves the camera down through its floors, so a tall building stays as readable as a short one.

## Explore

- **Explore 3D depth:** opt into orbit and wheel zoom; regular page scrolling works by default.
- **Camera angle:** optional shallow cutaway, dollhouse, rooftop and street views.
- **Floors:** separate the levels while keeping the whole building in frame.
- **Directory:** browse projects, search named sessions and select an agent. A click on a character or a project's room opens its card; **Find in the office** brings the camera to its desk.
- **Night shift / Day shift:** original night and day palettes, lamps, neon, sun and moon.
- **Preferences:** pause motion and choose crisp, retro or chunky pixel rendering.
- **The bigger picture / Activity:** page sections under the building with the page's totals, daily and hourly activity, tool departments, crew contributions and the activity feed.
- **Camera:** export the current canvas as a PNG.

The local snapshot API serves each view and page: `/api/snapshot?token=…&view=today|week|month|work|timelapse&back=N&range=yesterday|week|month`, the live building by default. It reads the same collector as the pixel office, one view at a time, and keeps a page of the past for ten minutes. The live building refreshes every ten seconds, a page as it runs now every minute, a page of the past and a replay once.

The pavement, subfloor and parquet occupy separate depths. Contiguous floor tiles avoid the dark subpixel gaps that previously looked like flicker. The renderer suspends when the building scrolls off screen or the document is hidden, and unchanged labels reuse their projected positions. Opening a detail panel does not refit the camera or rebuild agents. WebGPU caches opaque character commands with `BundleGroup`; the WebGL 2 fallback retains the regular render path.

Three cars circulate in two lanes and six voxel pedestrians walk, carry bags and pause near entrances. Their poses share three instanced draw batches, update at 30 Hz, and freeze with the existing pause or reduced-motion setting. Street actors stay below the office floors.

Flower boxes, a chalk menu, a book crate, café cups and stools, low bollards and curb drains give the pavement more life. Stepped warm lamp pools reuse the existing lighting mood without adding lights or shadows. These 105 small boxes share eight material batches and have no animation work. The paving extends beneath both pedestrian lanes. An unchanged paused scene skips geometry and post-processing submissions; theme changes, selections, camera moves and separating floors still repaint immediately.

The surrounding district adds four detailed neighboring buildings, eighteen distant towers, shops, fire escapes, balconies, trees, bicycles, parked cars and crossings. Its geometry shares the scene's instance batches and adds no point lights or animation loops. World-space depth and lateral fog blend into the exact screen-space background gradient, including while orbiting. A matching peripheral veil keeps the central office clear.

The crisp preset uses the display DPR up to 2× and updates when the window changes display density. A 1088×1180 CSS canvas uses a 2176×2360 drawing buffer on a Retina display. Retro presets reduce the canvas resolution deliberately. **Preferences → Graphics details** reports the actual DPR, buffer size and effects.

Native WebGPU uses a [RenderPipeline](https://threejs.org/docs/pages/RenderPipeline.html) with one MRT geometry pass, packed normals, half-resolution GTAO and depth-aware denoising. Contact shading is subtle and protects bright emissive lights. HDR bloom uses a 1.25 luminance threshold and lower strength in daylight. Only the AO signal is denoised; the scene colors and text keep their pixel edges. WebGL 2 uses direct rendering, and an unsupported effect falls back to that path.

See [PERFORMANCE.md](./PERFORMANCE.md) for measured results, conditions and limits.

## Package the alternative plugins

```sh
npm run build:voxel
npm run package:voxel
```

Outputs:

- `dist/theoffice-voxel-1.0.0.vsix`: independent VS Code / Cursor extension.
- `dist/theoffice-voxel-plugin-1.0.0.zip`: portable agent plugin.
- `dist/theoffice-voxel-plugin/`: extracted agent plugin, ready to load.

VS Code:

```sh
code --install-extension dist/theoffice-voxel-1.0.0.vsix
```

Run **The Office / Voxel: Open Live Office** from the command palette. In Cursor, install the same file through **Extensions: Install from VSIX…**.

Claude Code:

```sh
claude --plugin-dir ./dist/theoffice-voxel-plugin
```

Then run `/theoffice-voxel:office-voxel`.

Codex:

```sh
codex plugin marketplace add ./dist/theoffice-voxel-plugin
codex plugin add theoffice-voxel@theoffice-voxel
```

These packages contain the compiled UI and local collector runtime. They do not require `node_modules` after installation. The prototype reads activity; answer waiting agents in their original coding tool.

## Build both websites

```sh
npm run build:site
```

This creates `dist/site/`, with the original website at `/` and the compiled voxel edition at `/3d/` (`/voxel/` redirects to it). The GitHub Pages workflow publishes that directory when its existing deployment is triggered.

## Verify

```sh
npm test
npm run build:site
```

The voxel checks cover local API access, the views and pages it serves, real status and calendar normalization, desk classes and their words, read-only hosting, shared collection, the live floor plan, the replay's seats and clock, the week's window light and sample-data consistency for every view. Browser checks cover WebGPU rendering, camera presets, exploded geometry, day/night, mobile directory, project filters and insights. Native editor WebGPU availability depends on the editor’s Chromium configuration; the renderer can fall back to WebGL 2.

`scene.js` runs the renderer, camera and the current view; `building.js` builds the street, lobby, roof and shell every view shares; `views/` holds one builder per tab (see [views/README.md](./views/README.md)); `kit.js`, `labels.js` and `actors.js` are the voxel kit, the readable words and the cast; `office-layout.js` plans the live floors. `app.js` provides both the website and workspace. `lib/voxel-dashboard.mjs` hosts the compiled application and provides the bounded local snapshot API.

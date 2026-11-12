# The Office: the full guide

The short version is the [README](../README.md). This is everything else: every view, every flag, every host, and how the collector works.

**A little pixel-art office for your coding agents, where every agent is a character: Clawd, the orange Claude mascot, and the office's own characters for Codex, Gemini, Cursor, Kimi and Grok.** Who is at their desk right now and what they're typing. Which projects are busy. Who's stuck in a meeting. Who has a hand up waiting for you. What the whole building did this week, and which agent did how much of it, across every account you use.

Pixel art is the main look: every view is an animated drawing, and the desktop app keeps one open beside the chat. The same office also comes as text, laid out like a timesheet in block characters: a row per room, a line per desk, columns that line up. That is the backup, and it works everywhere: in a chat reply, in a terminal, in a log.

Everything is read from files the agents already write on your machine. Nothing leaves it.

## The pixel art

Each view is its own building, drawn as one animated SVG under the same sky of the hour (night, dawn, day or dusk, a glow on the roofline where the sun rises or sets), with the moon or the sun where the hour puts it, on its way up from between the roof's props or down to them. Every view opens with the same header: a sign on the roof, about half the building wide on its steel legs and catwalk, with `THE OFFICE` in big pixel-art neon tubes (a poppy yellow, one tired letter flickering now and then) over the view's own numbers on one or two lines, bulbs blinking along its edges (hover it for the view, the date or the range and the shift). The neon glows pixel by pixel, a wide bloom at night, still lit by day. Around it, the same sky and a skyline that changes every day: on each side of the sign a landmark (a wind turbine, a flag in the neon's colors, a cell tower, a lattice antenna or the water tower), then a structure or two (a greenhouse, solar panels, a satellite dish, a planter garden, the stair bulkhead) and the roof's life (loungers under a parasol, party lights, a grill, a telescope, a pigeon coop, the AC unit, vents, a chimney), their lamps, LEDs and beacons lit at night, behind a parapet with a stone coping where pigeons perch, over a cornice of dentils and brackets; stone quoins run down both corners of the brick. The roof sits at the same height in every view. Every agent is a character of [the cast](#the-cast): a Clawd (the official sprite, in Claude orange) for Claude, and its own character for every other agent:

- **Live floor** (`live`): the cut-away floor plan of the office, room by room. Clawds, Dexes, Gems and the rest of the cast type at their monitors, raise a hand, sit back with a ✓ on the screen when their turn is done, doze, gather in the meeting room around a whiteboard of their workflow, or stand at the water cooler with their mugs while a background job of theirs runs. Interns sit on a bench in front of their boss's desk. The rooms are lit: at night each desk sits under its own ceiling light, its screen glowing on the wall and on its character. Each room's floor is a woven carpet in its project's color, a cream tassel at either end, so a room reads as its nameplate's from across the building. Every desk keeps its own rhythm, so no two characters move in step: bursts of typing and pauses, eyes running down the page, blinks, a stretch now and then, a dozer nodding off and starting awake. The office cat wanders through. A very full office draws its figures standing still to stay in the size budget. Across the top of the building, under the roof, a bar says how the floors stand at a glance: the headcount strip (one tick per desk), then `5 working`, `1 need you`, `1 in a meeting` and `2 on break`, each with its pixel icon at the sign's size, only the number in its state's color; the sign on the roof keeps the fun of it: the desks and who sits at them, the interns, the longest shift and the meetings. Every row of desks has a little air over it, and a raised hand gets a big white bubble with a fat `?` hopping over it. Under each desk a small dark tag on the slab says whose session it is and what it is at in a few words: its title, then what it is at and for how long (`coding · 1h30+`, to ten minutes while it works; `dozing · 1h+`) or, with a hand up, its question (`asks: Which cape anchor?`); a turn done says `your turn · 10m+`, a boss waiting on its helpers `3 interns` or `in a meeting`, and a tag too narrow for the time leaves it off rather than cut it. A desk that waits on you (its turn done, a hand up, an error, a turn you stopped) marks its tag with a bar down the left edge and a frame round it in its color, a turn done in gold, so what is yours to do stands out from the desks at work. The meeting room's tables, the kitchen (`2 on break`, and whose mugs) and the basement's departments wear tags too, and each room's headcount strip gives its count. The pane's **Quiet** key draws the floors with their names alone.
- **Week tower** (`week`): the office tower, one floor per project (the busiest on top) and one window per day, each floor one row of the facade. On the left its sign: its number on a soft dark tab fused to its nameplate (the project's name in dark bold type on the project's color, on two lines when long), and under it a tally with a lit tube as long as its share of the busiest floor's agent-time, its agent-time and its commits, each in its own column down the tower. On the right its seven windows, each the street front's own under the floor's own awning (stripes, a band, a hood or a stone lintel): a room lit by that day's agent-time, warm from the quietest day up (lit by its screens alone, the pendant lamp on, the room lit, the room ablaze), the day's agents at their monitors, and the day's agent-time printed on its transom, crisp on a bright room and quieter as it dims; the floor's best day wears a gold tag. A day nobody worked there is closed, as a shop is: its window's roller shutter down and its awning rolled up, so the open offices stand out at a glance. Over the floors, on a picture rail, hang the week's card (its agent-time in bold pixel figures, its dates and commits) and a tear-off calendar page per day (the weekday, the date in bold pixel figures, the day's agent-time; Saturday in blue, Sunday in red, today edged in gold, the busiest day starred); today's column is picked out in gold, and a key under the floors gives each light's hours. The busiest floor wears a crown and a gilt ledge. It stands on the same street front as the Office. At night the brick goes dark and the busy windows throw their light on it, and now and then a light goes off; by day a window cleaner works his way down the building.
- **Today** (`today`): the time clock room, where a Clawd punches its card into a clock that shows the time (sparks fly), the clock-in racks with one card per open desk, and the employee of the day in a gold frame; then the day's timesheet on a clipboard, a pencil on a string at its side, on the month calendar's paper. On top of the sheet the day's picture, the city now: the sky of the hour (dawn's pinks, noon's blue, a golden evening, a starry night), the sun or the moon where it stands, and along its street, midnight to midnight, a building for every hour worked, as tall as its agent-time, the busiest crowned, the hour now under construction with the mascot on its roof and a crane on the next lot, a tree in the season's colors where nobody worked, the hours still to come empty lots behind a fence. The whole street takes the hour's light: glass windows by day, warm facades at sunset, lit windows by night with a few going on and off. It is alive: clouds drift by, a flock crosses the day, a star shoots now and then at night, a car and a taxi drive along the street. Under it the date on a band in the month's color, then one line per project, each hour worked a bar in its color as tall as its agent-time (the day's shape at a glance, whatever the color), a gold star on its best one, the night shift's hours on paper tinted blue, and the hour now picked out like a playhead: its cells washed in red inside a marker ring, a red tag with the time on top.
- **Month** (`month`): a wall calendar on a wire coil with the month's picture on top, a scene and a pastime of its own for each month, alive (Clawd skating to and fro on a frozen pond in January, tossing a snowball beside its snow-Clawd in February, flying a kite in March, under an umbrella in April's shower with a rainbow behind, watering tulips while a butterfly flits by in May, fishing as a fish jumps in June, on the beach as a crab scuttles past in July, with an ice cream among nodding sunflowers and bees in August, picking apples in September, throwing leaves beside jack-o'-lanterns in October, roasting a marshmallow over a campfire as geese fly south in November, bringing a present to the twinkling Christmas tree in December), one square per day shaded by its agent-time, gold stars on the best days and a crown on the busiest, today's square edged in soft gold with a tiny Clawd on it; beside it the employee of the month in a gilt frame (larger on a wide pane), and the building directory on a felt board. Under them, the building's last room is **the crew**: a staff badge per AI that worked in the month, busiest first, its character's photo on a band in its color, its agents (its sessions), its agent-time and its share of it as a bar. Its wall calendar, its building directory, the whole drawing or its full stats export to a file (`month --export`, the pane's Month Export).
- **The Office** (`all`): the live building, as the live floor draws it, every floor numbered on its corner pier (1F the street front, 2F, 3F… up), and under the sidewalk its basement, **B1**: what they did, one room per kind of work, busiest first, each with its share of the week's tool calls. The week has its own tower (`week`).
- **What they did** (`work`): the departments as a cut-away building, one room per kind of work, busiest first and widest. The server room is a wall of blinking racks with a terminal over every console (one rack stands open, its cables hanging), the QA lab has boards of green ticks and a bubbling flask, the library has bookcases with a rolling ladder and readers peering over their books under green banker's lamps, the typing pool's coders peer over screens of code under a scoreboard of the lines the commits added and removed, and management has its org chart. Each room is as wide as its share of the calls (what a row has left is a hallway with the lift), with one busy agent per 5% or 10% of the calls (the key under the title says which: `1 Clawd` in an office of Claude alone, `1 agent` when the cast is mixed, each character seated by its share of the agent-time); under each room its share in big type, its calls and the kind of work in plain words.

- **Timelapse** (`timelapse`): yesterday, the last 7 days or the last 30 days replayed as one looping drawing, a twentieth of a second per step of the clock (15 minutes for yesterday, an hour for the week, 4 hours for the month), then a short pause on the last one. It plays only where something happened: from a few steps before the first agent at work, meeting or commit to a few after the last (room for the first to walk in and the last to walk out), so a yesterday that began at 08:00 replays from 06:45. The sky turns as a real timelapse's does: the night fades into the dawn, the day, the dusk and back into the night, the stars coming out and going, clouds racing by in the light of the hour, and the sun and the moon rise between the roof's props, climb beside the sign, pass behind it and set behind the roof on the other side, the sun orange when low and gold by day. Every session walks up to the front door, works at its desk in its project's room (dozing through a short pause), its interns under the desk, and walks out of the door and off down the sidewalk when it is done; the meeting room fills while a workflow runs (one row of tables, with a +N for the meetings beyond them), and a room goes dark while nobody is in. The clock on the sign names the replayed time in gold. Under the street runs the reel of the whole replay: three lanes (the sessions at work in each step, their interns and the commits), each with its total in big pixel figures, the busiest moment flagged, and a playhead whose tag names the day (the hour for yesterday). Its page plays it with a scrubber and saves it as a GIF, a video or the SVG.

Under every building, right under the sidewalk (under the Office's basement), runs the **commits line**: a metro whose Clawd-faced train hauls one green parcel per commit, ten to a wagon. The Office, live and today views carry today's commits, the others their range's. The more commits a day, the faster the train passes. With no commits it sleeps at the platform.

Where you see it:

- **`/theoffice`**, or the **🏢 Open The Office** button above the prompt, opens the live pane: it keeps the drawing beside the chat and updates it while your agents work. Its tabs pick the drawing: **Live** (the live building), **Today**, **Week**, **Month**, **What they did** and **Timelapse**, and `/theoffice week` opens it on a tab. See [The live pane](#the-live-pane-desktop-app).
- **In the chat**, ask Claude "show me the office" or "what did my agents do this week?": it sends the drawing of the view first, then the same view as text (below).
- **A page**: ask Claude for the office as a page, or run `node plugin/scripts/office.mjs <view> --html`, for every drawing of the view, each followed by its text. `node plugin/scripts/office.mjs <view> --pixel` writes the drawing to a file and prints its path.

## The cast

Every kind of agent the office reads has its own character. They all stand on Clawd's skeleton (17 × 10 pixels, two arms, little legs), so every pose works for each of them: typing, reading, thinking, pointing at a helper, the boss with its feet up, a hand up, sitting back when done, scratching its head at a stop or an error, dozing, standing in the kitchen with a mug.

| Agent | Character | Pixel art | Text | What it is like |
| --- | --- | --- | --- | --- |
| Claude Code | **Clawd** | the official sprite, Claude orange | `▛█▜` | the first tenant: careful, polite, asks before it breaks anything |
| Codex | **Dex** | after the Codex app's own pet: a blue cloud with a navy screen for a face, sleepy cyan eyes | `▐>▌` | runs every command itself, patches in tidy diffs |
| Gemini (CLI and Antigravity) | **Gem** | violet, a four-point sparkle on its brow, pink cheeks | `▐*▌` | a twin-star dreamer: reads the whole repo in one go |
| Cursor | **Caret** | a grey cube seen from a corner, a cyan text caret on its seam | `▐│▌` | finishes your sentences: tab, tab, tab |
| Kimi | **Mooni** | sky blue, a crescent moon on its brow | `▐(▌` | a night owl from the moon: reads the longest docs |
| Grok | **Rok** | after Grok Bot: a round white blob, two big black eyes | `▐/▌` | groks the code, cracks a joke first, keeps its towel handy |
| GitHub Copilot CLI | **Copi** | an original co-pilot: mint, a wide dark goggle visor with two bright lenses, a white earcup each side under a headband, a mic boom with a rose tip, a rose scarf | `▐=▌` | the second seat: goggles down, headset on, reads the map while you fly |

None of them is a logo: Dex and Rok follow the bots their makers drew for Codex and Grok, the others are in their agent's colors with one thing of their own. A subagent is an intern of its boss's kind (a mini Dex on a Codex desk's bench). Where more than Clawd works, the header counts each character (`3 Clawd · 2 Dex · 1 Gem`), a line under the floor says who is who, the rooms of *what they did* and the windows of the week tower seat the characters by their share of the agent-time, and the history views add a `crew:` line, agent-time per agent:

```text
 ▛█▜ Clawd/Claude  ▐>▌ Dex/Codex  ▐*▌ Gem/Gemini  ▐│▌ Caret/Cursor  ▐(▌ Mooni/Kimi  ▐/▌ Rok/Grok
crew: Claude 392h · Codex 193h · Gemini 107h · Cursor 17m
```

An office of Claude alone draws exactly as it always did.

## Accounts

The office reads every account you use, not only the one it runs in. An account is a home folder of its agent: `~/.claude` and each `~/.claude-<name>` beside it (where `CLAUDE_CONFIG_DIR=~/.claude-work claude` keeps its sessions), `~/.codex` and each `~/.codex-<name>` (`CODEX_HOME`), `~/.grok` and `~/.grok-<name>` (`GROK_HOME`), and the folder `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME` or `GEMINI_CLI_HOME` points to. A folder counts once it holds sessions.

When an agent works from more than one account, each of its desks carries the account's name, `@main` (the default folder) or `@work` (the folder's suffix), in its own color on the desk's label in the pixel art and after the shift on its caption in the text, a line under the floor lists the accounts, and the history views add one line of agent-time per account:

```text
accounts: claude@main 300h · claude@work 92h
```

An agent with one account carries no label. Account ids never appear: the name comes from the folder.

### What is in the office

The office is a floor plan cut open from above. Each **room** is a project, with the project's name on its door plate and a headcount strip (one cell per desk). Each **desk** is a live session of an agent: its character sits at a monitor that shows what it is doing (editing, the terminal, browsing, reading, running tests), with the session's title, its current tool and how long its shift has run. A working agent looks at its monitor. One with a question for you **raises its hand**. One whose turn is **done** sits back and looks out at you, a ✓ on its screen: your turn to read what it did. One you stopped shows a pause sign, one whose turn ended on an error (a usage limit, say) a warning sign with the error's words; both keep saying so until you are back. Done for 15 minutes, an agent goes home, even with its session still open (the desktop app keeps every session it opened running), and its coat hangs on the rack for 15 minutes; on a break for an hour, it dozes at its desk. **Interns** are subagents: small figures of their boss's kind below its desk (mini Clawds under a Clawd), with their job. The **meeting room** holds running workflows: a whiteboard with one mark per workflow agent, ticked off as they finish, and Clawds around the table. Agents **on a break** stand in the **kitchen** by the water cooler, mug in hand, chatting under the shelf with the microwave and the fruit: their turn is over, but something will start the next one by itself, a background job of that turn that has not reported back or a scheduled wake-up. An agent whose helpers are still at work is not on a break: it waits on them at its desk. Agents who just left leave their coat on the **rack**; in the pixel art the ground floor is the **street front**, and they walk out of its door and off down the sidewalk, where visitors walk in and passers-by stroll under the street lamps. At night the moon and stars come out, above the roof and in its windows.

The week view is the **office tower**: one floor per project, one window per day, lit by how much agent-time that day saw, with each floor's agent-time and ships (commits), plus its interns and meetings when the width allows. In the pixel art a window seats the day's agents at their monitors (the screens show the floor's main kind of work) and carries the day's agent-time on its transom; a project with under 10 minutes of agent-time, or sessions with no project at all, waits in its storage with the floors that did not fit. Below it you get **what they did** (the departments) and a few factual awards.

### What they did: the departments

Every tool call your agents made in the range is sorted by the kind of work it was, and each kind of work is a department of the office. The percentage is the department's share of all those tool calls. `server room/terminal 61%` means 61% of the tool calls ran terminal commands.

| Department | Kind of work | What counts |
| --- | --- | --- |
| server room | terminal | terminal commands (`Bash`, `Monitor`…) |
| QA lab | tests | terminal commands that run tests (`npm test`, `pytest`, `node --test`…) |
| library | reading | reading code (`Read`, `Grep`, `Glob`…) |
| typing pool | coding | writing code (`Edit`, `Write`…) |
| internet café | web | browsing the web (`WebFetch`, `WebSearch`, browser tools) |
| gadget shop | other tools | the other MCP tools and anything else |
| whiteboard | planning | planning (todo lists, plan mode, skills) |
| phone booth | talking to you | questions and messages to you |
| management | delegating | handing work to helpers (subagents, workflows) |
| art studio | design | design tools (artifacts, image and Figma tools) |

The text says each department with its kind of work (`what they did (share of 106k tool calls): server room/terminal 61% · QA lab/tests 15% · …`), and the `work` view adds a chart with named columns and this legend. The pixel art writes the same words under each room.

## The text version (the backup)

The full text version of every view is always there, in case the drawing cannot be shown:

- **In the chat** Claude always puts the text office in its reply, in a code block after the drawing, or on its own when the drawing cannot be shown.
- **The live pane** in a terminal, which cannot draw an SVG, always draws the text.
- **In a terminal** `node plugin/scripts/office.mjs` prints it in color, and `--watch` animates it.

```text
THE OFFICE · live · Mon 26 Oct · 01:40 · night shift    ·  ·     ·  (
10 desks █████▒?░░░ 5 working · 1 in a meeting · 1 hand up · 2 on break · 1 done
                    +2 interns

── the floor · room by room, desk by desk ──────────────────────────────────────
• island-tour-3d  ███?░░  3 working · 1 hand up · 1 on break · 1 done
    ▄▄▄z Fresques d'Hélène et Apo…  dozing at the desk                 idle 1h32
    ▛█▜? Wizard's cape shoulder p…  asks: Which cape anchor?         hand up 25m
    ▛█▜c Lava Cavern camera posit…  on break                            idle 37m
    ▛▛█  Playtest notes and diffi…  test Run difficulty curve tests   shift 2h35
    ▛▛█  Deploy previews and asse…  browse app.netlify.com            shift 2h29
    ▛▛█  Coconut drum rhythm puzz…  edit rhythm-drums.js              shift 1h37
• glyph-atlas-w…  ▒░      1 in a meeting · 1 on break
    ▛█▜c Atlas glyph edge cleanup   on break                            idle 33m
    ▄▛█▜ Final arcade world design  meeting arcade-finale-brief       shift 1h41
• md2epub         █       1 working
    ▛▛█  Footnote links in EPUB 3   $ Validate the sample book wit…   shift 1h36
• theoffice-age…  █ii     1 working · 2 interns
    ▛▛█  Clawd desk sprites in pi…  read office-notes.… · 2 interns   shift 1h32
  meeting room            1 running · 3 in the room
    ✓✓✓✓✓ooo·    arcade-finale-brief  5/9 done · 3 running · 1 to go  design: a…

lights off: harborledger · webgl-swatch-demos · csv-batch-importer · +28 more
coat rack ─┼─ gizmo3d "Exporter cleanup" left 9m ago
what they did: server room 39% · typing pool 14% · library 13% +7 more
▛▛█ working  ▄▛█▜ waiting on helpers  ▛█▜? hand up  ▛█▜✓ done  ▄▄▄z dozing
```

<sub>The `live` view at 80 columns, on the sample facts in `test/fixtures/` (made-up projects). In a terminal it is in color, with every Clawd in Claude orange.</sub>

In the text, every view is laid out like Today's timesheet. On the live floor each room has one row, its headcount strip one cell per desk (`█` working, `▒` waiting, `?` hand up, `!` an error, `■` stopped, `░` done or on a break, an `i` per intern), and each desk one line under it: its figure, the session's title, what it is doing and how long. A Clawd is `▛▛█` at work, `█▜▜°` thinking, `▄▛█▜` waiting on its helpers, `▛█▜?` with a hand up, `▛█▜✓` done, `▛█▜■` stopped, `▛█▜!` on an error, `▛█▜c` on a break and `▄▄▄z` dozing; a long floor folds a room's quiet desks into one `+N more` line. Today, the week and the month are the same timesheet: one row per room with who is in now, the range as a strip (hour by hour today, day by day over a week or a month), its agent-time, interns and ships, and under it what was on its desk and the last thing it shipped. The month ends with its crew: a row per AI, busiest first, its agents (its sessions), its agent-time with a bar and its share, then all of them (the week and today name the crew on one `crew:` line). The legend names an error and a stop only when a desk shows one. The other characters have heads of their own (`▐>▌` Dex, `▐*▌` Gem, `▐│▌` Caret, `▐(▌` Mooni, `▐/▌` Rok) on the same body, each in its own color.

## Install

In a Claude Code terminal session:

```
/plugin install theoffice --marketplace Makio64/theoffice-agents
```

From a shell:

```bash
claude plugin install theoffice --marketplace Makio64/theoffice-agents
```

Either adds the `makio64` marketplace and installs `theoffice@makio64` in one step (Claude Code 2.1.275 or newer).

In the Claude desktop app, a `/plugin` command typed in the chat only opens **Settings → Plugins**: it installs nothing there. Paste this into the chat instead: Claude reads the steps in [install.md](https://theoffice.makio.io/install.md) (the site's `site/install.md`), runs the install, with the desktop app's own Claude Code when `claude` isn't on your `PATH`, and checks Node:

```text
Install The Office for me by following https://theoffice.makio.io/install.md
```

Or by hand: click **+** next to the prompt box, then **Plugins**, **Add**, **Add marketplace** with `Makio64/theoffice-agents`. The Discover page shows Anthropic's picks, so search **office** in the plugins, open **The Office** and switch it on.

From a local clone, add the folder itself as the marketplace: `claude plugin marketplace add /path/to/theoffice-agents`, then install `theoffice@makio64` as above. Edits to the folder reach a session after `/reload-plugins`.

Then, in a new session, type `/theoffice`.

You need Node.js 24 or newer and Claude Code 2.1.308 or newer for the pane. There are no dependencies.

To update to the latest version, from a shell, then restart Claude Code (in the desktop app, start a new session):

```bash
claude plugin marketplace update makio64
```

```bash
claude plugin update theoffice@makio64
```

### Cursor, Antigravity, and Codex

The collector and drawings work in all these hosts. The `theoffice` skill is the short invocation (`/theoffice` or `$theoffice`); `office` also handles facts and chat views. The short skill ships in the portable plugin alone (from `integrations/skills/`): in Claude Code a skill of that name would be `/theoffice:theoffice` and take `/theoffice` from the pane's own command. Each integration uses the same live dashboard and renderers, with a native entry point where its host supports one. Claude's function-hooks pane remains its own adapter.

| Host | Agent integration | Live view | Headcount |
| --- | --- | --- | --- |
| Claude Code | Existing Claude plugin and `/theoffice` command | Claude's native pane | Its status line |
| Cursor | Native plugin, shared skills, and local MCP App | Office activity-bar/sidebar and editor tab; MCP App in agent chats | Status bar item (editor extension); `cursor-agent` status line |
| Antigravity App | Native plugin, shared skills, and opt-in managed sidecar | Its own side pane beside chat (App 2.22+), opened from a pill in chat | `agy` status line |
| Codex desktop / CLI | Portable plugin, repo marketplace, and local MCP App | A page in the sidebar and a tab in any thread; in-app browser fallback; text in the CLI | In the page |
| VS Code, Windsurf | Editor extension | Office activity-bar/sidebar and editor tab | Status bar item |

Build the portable plugin from this checkout:

```bash
npm run package:plugin
```

This writes `dist/theoffice-plugin/`, containing the skill, scripts, and renderers. Keep that folder together. It excludes the Claude UI modules, marketing site, and development files.

For **Cursor**, copy the built folder's contents into `~/.cursor/plugins/local/theoffice/`, then reload Cursor. Use a real directory: Cursor skips external symlinks in that local plugin directory. Its native manifest uses `${CURSOR_PLUGIN_ROOT}` for the local MCP server; the portable `${PLUGIN_ROOT}` form is for other hosts. Ask for `/theoffice`, or use the editor extension's Office button. See [Cursor plugins](https://cursor.com/docs/plugins) and [Cursor MCP Apps](https://cursor.com/docs/mcp).

For **Antigravity**, install the built folder, then start a new session:

```bash
agy plugin install ./dist/theoffice-plugin
node "$HOME/.gemini/config/plugins/theoffice/integrations/antigravity/configure.mjs" enable
```

The `.antigravity-plugin/plugin.json` manifest selects its native integration. The second command enables only The Office's managed sidecar and preserves other settings. Reopen Antigravity App to start it, then use `/theoffice`: its **The Office** pill opens the office in the App's own side pane, beside chat, as Google's plugins open theirs (App 2.22 and newer; an older App gets an **Open The Office** link for its browser beside chat). See [the integration's setup and disable instructions](../integrations/antigravity/README.md), [Antigravity plugins](https://antigravity.google/docs/plugins), and [managed sidecars](https://antigravity.google/docs/sidecars).

For **Codex**, add the built folder as a marketplace and install its plugin:

```bash
codex plugin marketplace add ./dist/theoffice-plugin
codex plugin add theoffice@makio64
```

Then start a new chat and ask for `$theoffice` or `$office`. The local `open_office` tool provides the live MCP App, fullscreen by default. Codex desktop also lists **The Office** in its sidebar, as a page of its own, and offers it as a tab in any thread; a link such as `codex://plugins/theoffice@makio64/app/open_office?path=%2F%3Fview%3Dmonth` opens that page on a view. The skill uses Codex's in-app browser panel when that is the available UI surface. Codex desktop can also install from the local marketplace in its plugin browser. Codex's IDE extension does not currently load plugins; the editor extension remains available there. See [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), [conversation panels](https://developers.openai.com/plugins/build/extensions), and [supported plugin surfaces](https://learn.chatgpt.com/docs/plugins).

### A status line in any CLI

`plugin/scripts/statusline.mjs` prints the headcount Claude Code's pane keeps in its status line, `🏢 1 hand up · 5 working · 2 interns`, for any CLI that runs a command for its own. It never collects: it reads the answer the collector shared in the cache folder, in about 40 ms, and when that answer is more than a minute old it starts one refresh in the background and prints what it has. `--width N` sets the columns, `--ascii` keeps to 7-bit characters, and `--json` prints the counts for a host that styles its own item.

For **Cursor's CLI** (`cursor-agent`), in `~/.cursor/cli-config.json`:

```json
{ "statusLine": { "type": "command", "command": "node /absolute/path/to/theoffice/scripts/statusline.mjs --width 60", "updateIntervalMs": 5000 } }
```

For **Antigravity's CLI** (`agy`), in `~/.gemini/antigravity-cli/settings.json`, under its own line ([its status line](https://antigravity.google/docs/cli/statusline)):

```json
{ "statusLine": { "command": "node /absolute/path/to/theoffice/scripts/statusline.mjs --width 60", "stack_with_default": true } }
```

Use the folder the plugin was installed to (for Antigravity, `~/.gemini/config/plugins/theoffice`) or this checkout's `plugin/` folder.

### Live dashboard in any host

```bash
npm run dashboard
```

This opens the Claude desktop pane in a browser page: the same pixel-art console on top (the six tabs, Quiet and Zoom, the ◀ ▶ strip that pages through the past, the Timelapse's ranges and the Month's export row, drawn by the pane's own modules), the same card drawing under it, and the same keys. The server pushes a nudge to the page when your agents' files move (a hand going up shows within two seconds), and the page redraws only when the drawing changed; with no stream it falls back to asking every five seconds while visible. The Timelapse's Export opens the replay's player (scrubber, speed, GIF/video/SVG); Month exports its calendar, directory, whole picture, or statistics. The server listens only on `127.0.0.1` and its URL contains a random access token. Nothing is uploaded. Use **Stop server** to end the standalone server, or Ctrl+C in its foreground terminal.

In Claude Code in a terminal, `/theoffice` opens The Office this way instead of a pane (optionally on a tab: `/theoffice month`), as does **🏢 Open The Office** above the prompt; there is no text pane to fall back to. `/theoffice browser` opens it from the desktop app too.

An agent can launch it without holding a terminal open:

```bash
node plugin/scripts/dashboard.mjs --open --detach --reuse
```

`--reuse` keeps one server for the computer: a second launch opens the running one on the tab asked for instead of starting another, and a server started with it stops by itself 30 minutes after its last page closes (`--idle <minutes>` sets another wait, `0` never). Open a requested view directly with `--view month --back 1`, `--view timelapse --range yesterday`, `--view live --quiet`, or `--zoom`. Inside the page, keys **1–6** select views, **p/n/c** page through the past, **q** toggles Quiet labels, **z** Zoom, **y/w/m** pick the replay's range, **e** opens Export and **b** goes back. The last selection is remembered locally; explicit launch flags take precedence.

### Editor pane for Cursor and Antigravity

Build the installable VS Code extension:

```bash
npm run package:editor
```

The build uses a pinned version of VSCE through npm and writes `dist/theoffice-<version>.vsix`. In Cursor, VS Code, Windsurf, or a compatible Antigravity IDE build, choose **Extensions: Install from VSIX…**, select that file, then use the **Office** status button, activity-bar entry, or **The Office: Open Live Pane** command. The status button is the headcount, `5 working · 1 hand up`, read every 20 seconds while the window has the focus and lit as a warning while an agent needs you; **The Office › Status Bar Headcount** turns it back into a plain button. **The Office: Open in Editor** gives it a full editor tab; **The Office: Restart** restarts the local server. Surfaces share one process, retain their state while hidden, and pause background refresh; closing the last surface stops the process. Node.js 24 or newer must be available to the editor; **The Office › Node Path** accepts an absolute executable path. The extension reads agents on the local computer, including when editing a remote workspace. It also accepts native links such as `cursor://Makio64.theoffice/open?view=month&back=1`.

## Use

In Claude Code, `/theoffice` is the one command:

| Command | What you get |
| --- | --- |
| `/theoffice` | Opens or closes The Office: a live, animated pixel-art pane beside the chat, with tabs, on the tab you picked last |
| `/theoffice today` | Opens it on the Today tab (or `live`, `week`, `month`, `work`, `timelapse`; `office` also opens Live) |
| `/theoffice close` | Closes it |

Claude can also draw the office in the chat, through the plugin's skill, which has no command of its own. Ask in your own words ("what are my agents doing?", "show me this week's office tower", "the office as a page for the game project") and Claude picks the view:

| View | What you get in the chat |
| --- | --- |
| `all` (the default) | The live building in pixel art, then the live floor, this week's timesheet, what they did and the awards as text |
| `live` | Only the live floor: room by room, a line per desk, and the meeting room |
| `today` | Today's timesheet, hour by hour, for each project |
| `week` | The tower for the last 7 days; as text, the timesheet day by day |
| `month` | A wall calendar, the building directory, the crew (agents and agent-time per AI) and the departments for last month and this one so far (on 3 November: from 1 October); as text, the timesheet day by day and the crew as a table |
| `month --back 1` | Last calendar month, on the same wall calendar (`--back N` goes N months back, with no limit; `week --back N` N weeks) |
| `work` | What they did this week: the departments chart, the interns and models, and what each department counts |
| `timelapse` | Yesterday, this week (the default) or this month replayed: `timelapse yesterday`, `timelapse month`. As text, one strip per project across the range (`2h a column`), shaded by how many desks were at work at once, with rows for all of them, the interns, the meetings and the commits; `--watch` plays it in a terminal |
| `--project game` | Only the projects whose name contains `game` |
| `--html` | A self-contained page, saved to the current folder: every pixel-art drawing of the view, each followed by its text. `all` and `week` give the live floor, the week tower and what they did; `today` the live floor and today's time clock; `month` the live floor, the wall calendar and what they did (`--html FILE.html` picks the name; it never replaces a file that is not one of its own pages) |

Each view comes twice: first its pixel art, then the text office in a code block, the backup. The skill runs the script a second time with `--pixel`, which writes the drawing to `pixel/office-<view>.svg` in the cache folder (below) and prints its path. Claude shows you that file first when it has a tool for showing files (`SendUserFile` in the desktop app), then always writes the text office; with no such tool you get the text and the drawing's path.

You can also run the script yourself. In a real terminal it's in color, and `--watch` animates it (Clawds typing and talking, monitors flickering, steam over the mugs):

```bash
node plugin/scripts/office.mjs live --watch
```

```bash
node plugin/scripts/office.mjs week --json
```

```bash
node plugin/scripts/office.mjs month --pixel
```

```bash
node plugin/scripts/office.mjs timelapse week --export --open
```

`--export` saves the timelapse twice in the cache folder's `pixel/` folder, as `timelapse-<range>.html` (its page: the replay with play, pause, a scrubber and speeds, and **Save GIF**, **Save video** and **Save SVG**) and `timelapse-<range>.svg`, and prints both paths; `--open` also opens the page in your browser. The page needs no network: the GIF is encoded and the video recorded (WebM, or MP4 where the browser records only that) in the page itself. `timelapse --html` saves the same page to the current folder.

```bash
node plugin/scripts/office.mjs month --back 1 --export calendar --as png --open
```

`month --export <part> --as <format>` keeps one part of the month (of now, or `--back N` months back) in the same `pixel/` folder and prints its path: `calendar` (the wall calendar room), `directory` (the building directory room), `whole` (the whole drawing) or `stats`. A drawing goes `--as png` (the default), `gif`, `video` or `svg`; the stats `--as html` (the default: a page of the month's totals, what stood out, the crew, the projects and every day, under its drawing), `csv` (a row per day, a column per project's agent-hours, a row of totals) or `json` (all of it). An SVG, the stats page, the CSV and the JSON are written as they are, named after the month (`month-2026-10-calendar.svg`, or `month-2026-10-01-to-2026-11-03-stats.csv` for last month and this one so far). A PNG, a GIF or a video needs a browser to draw it, so it is a page (`month-2026-10-calendar.html`) that makes it as it loads and saves it to your browser's downloads, with buttons for the other three: the PNG pixel-sharp at a whole scale at least 1600 px wide, the GIF and the video a 6-second loop of the drawing's own motion (the falling leaves, the lamps, Clawd at the calendar). `--open` opens a page in your browser and shows any other file in its folder. `--stdin` draws the facts given on standard input (the pane's) instead of reading them.

Flags: `--width N`, `--back N` (today, the week or the month N pages back, with no limit: a day, a Monday-to-Sunday week, a calendar month), `--ascii` (pure 7-bit characters), `--no-color`, `--project NAME`, `--agents claude,codex` (read only these agents: `claude`, `codex`, `gemini`, `cursor`, `kimi`, `grok`), `--claude-only`, `--pixel` (writes the view's pixel art to `<cache folder>/pixel/office-<view>.svg` and prints only its path), `--svg` (prints that SVG instead), `--html [file]`, `--json`, `--no-git`, `--no-novi`, `--no-cache`. Clawd's orange needs a 256-color terminal; on a plain `xterm`, `linux` or `screen` terminal the office keeps to 16 colors.

## The live pane (desktop app)

The plugin also ships a desktop **mod**, `plugin/hooks/register.tsx`, built on Claude Code's function-hooks API:

- `/theoffice` opens and closes a pane named **The Office**. `/theoffice open` and `/theoffice close` do only that. A tab's name (`live` or `office`, `today`, `week`, `month`, `work`, `timelapse`) opens it on that tab, or brings it forward there, and never closes it. A word it does not know only gets a usage line.
- While the pane is not on screen, the band above the prompt holds an **🏢 Open The Office** button: a click opens the pane, or brings it forward from behind another tab, as `/theoffice open` does. It gives way while the pane is on screen and while Claude asks you a question there, and its `[-]` collapses it. The desktop app and a terminal draw that band; VS Code and mobile do not.
- A row of tabs picks what the pane draws. Each tab has a hotkey digit while the pane has the focus (in the desktop app the keys show no badge for it), and the pane remembers your pick for the next session:

  | Tab | Key | Draws |
  | --- | --- | --- |
  | Live | 1 | The live building: who is at a desk right now, floor by floor, and what they did this week in its basement (the default) |
  | Today | 2 | Today's time clock and timesheets |
  | Week | 3 | This week's tower |
  | Month | 4 | The wall calendar and the building directory |
  | What they did | 5 | The departments: share of tool calls by kind of work |
  | Timelapse | 6 | Yesterday, this week or this month replayed on a loop |

- On the Live tab, **Quiet** (`q`) takes the words off the floors: the rooms' and the departments' nameplates, the headcount strips, the floor numbers, the meeting room's whiteboards (`5/9 done`), each department's share and calls (`39% · 20k calls`) and the commits line's name stay; the building's bar, the desks', the tables' and the kitchen's tags, the departments' kinds of work and the scoreboards go, and a row of desks shrinks to a plain floor. The sign keeps one line, the desks and what needs you. A desk that needs you, with a hand up, an error or a turn you stopped, keeps its two lines; rest the pointer on any other desk, a meeting room's table or an agent in the kitchen and a small card shows its session's title, what it is doing (`edit cape.js`), its branch and its interns. The cards are part of the drawing, so they show in the desktop app's pane, which draws no tooltips. Press it again for the tags. It is off until you press it, and the pane remembers it like the tab. In the desktop app it is the key beside Zoom at the right end of the menu, lit while on; on the other tabs its place stays empty, so the tabs never move. A terminal draws the text office, with every word, and has no Quiet.
- On every tab, **Zoom** (`z`) draws the pixel art bigger: each art pixel 2.5 CSS px instead of 2, so the words and the figures are a quarter bigger, fewer desks fit a row and the building grows taller. Press it again for the usual size. It is off until you press it, and the pane remembers it like the tab. In the desktop app it is the key at the right edge of the menu, lit while on. A terminal draws the text office and has no Zoom.

- In the desktop app, VS Code and on mobile each tab is the animated pixel-art drawing, right under the tabs, one even gap apart on every tab. The drawing is a card: its own sky and ground inside rounded corners with a thin light edge, so it ends cleanly inside the pane's margins, whatever your theme.
- In the desktop app the whole menu is pixel art: the tabs are keys on the same riveted console as the strip that pages them, flush on top of it, the picked one lit, each with a pixel icon and its name. As the pane narrows the names shorten, the icons go, then the names give way to the icons, the picked tab keeping its name longest. On the Timelapse the ranges and Export are the console's second row; on the Month, the row that asks what to export hangs under the strip as a third. VS Code and mobile draw the tabs as buttons.
- A press of a tab, of a range of the Timelapse or of a page of the past turns a page: a soft paper flip, always, and the pane's only sound. It was made with ElevenLabs ([sounds/README.md](../plugin/sounds/README.md)); on macOS it plays through Claude Code, and a terminal on Linux or Windows has no player.
- In a terminal, which cannot draw an SVG, each tab is always the colored block-glyph office of the same view. The Live tab shows the live office alone, as the drawing does (this week's tower is the Week tab), and a list of desks under 60 columns.
- Today and Month need facts of their own range, so the pane asks the collector for them only while that tab is on screen.
- A tab whose facts are still being read shows a waiting room: Clawd reading at the archive desk, the calendar's days lighting up one by one, and under it what is read and how far it is (`Step 1 of 3, Claude's sessions: 8.2 GB of 21.1 GB · 0:42` with a bar), written by the collector as it goes. The first month on a machine reads every session of the last 30 days once: here 22 GB, about 45 s; after that the Month tab opens in about a second.
- **Today**, **Week**, **Month** and **What they did** page through the past, with no end to it, from one strip under the tabs: Today by days, Week and What they did by Monday-to-Sunday weeks (they share their page), Month by calendar months, so January 2026 is a page of its own. The Month as it runs now is last month and this one so far, so a month that just began still shows the whole one before it rather than a page of empty squares. In the desktop app the strip is pixel art: **◀** an older page, **▶** a newer one, an amber LED that names the page, a row of windows (the days of its week, the weeks of its month, the months of its year: click one to go there, the page on screen lit, the ones to come shuttered), **«** and **»** at its ends to leap a week of days, four weeks or a year of months, and **Now** back to the range as it runs now. Each click turns a page, however quick; the keys stay where they are from page to page, and as the pane narrows the windows go first, then the leaps. In a terminal, VS Code and on mobile the strip is three buttons around the page's name: **◀** (`p`), **▶** (`n`) and **Now** (`c`), the same hotkeys as in the desktop app. A page is read when you turn to it, one at a time, the newest press winning; while it is read the drawing on screen stays and the LED blinks, and a month far back can take a while the first time. Its days are over, so it is never read again by itself: the last few you read are drawn at once when you come back to them, and a page any session read in the last hour is taken as it is. A new session opens on now.
- A page from before your transcripts still says what was done. Claude Code deletes a session's transcript 30 days after it was last written (`cleanupPeriodDays` in `~/.claude/settings.json`, or in its managed settings, which win; sessions started in the desktop app are kept at any age, unless `desktopSessionCleanupPeriodDays` or the managed settings say how long). What the office read of a session before Claude Code's cleanup deleted it stays in its cache and counts on its pages as it did, with its agent-time, subagents, workflow runs and account: a session whose transcript went once it was older than Claude Code keeps the transcripts of where it ran, whatever the settings say later. A session deleted in the desktop app or by hand, younger than that or one the office never learnt the source of, goes for good, and so does a project folder removed by hand, but for what in it had aged as the cleanup takes it; while a settings file does not read, nothing is decided. A month the office never read has no agent-time to show: it counts the sessions Claude Code's former index (`sessions-index.json`, written until early 2026) still names, with no agent-time, and the commits written in it in every repo Claude Code was opened in (the projects of `~/.claude.json`); its calendar tints the days that had sessions or commits but no agent-time.
- The **Month** tab's strip ends in **⤓ Export** (`e`), past Now. It opens a row under the strip that asks what to export: **Calendar** (`a`, the wall calendar), **Directory** (`d`, the building directory), **Whole month** (`m`) or **Stats** (`s`); then how: **PNG** (`i`), **SVG** (`s`), **GIF** (`g`) or **Video** (`v`), or for the stats **Page** (`h`), **CSV** (`t`) or **JSON** (`j`), with **‹ Back** (`b`) to pick again and Export again to close it. It saves the page on screen, a month of the past or the last 30 days, from the very facts the tab draws, in the cache folder (`month --export`, above): a page opens in your browser (which makes a PNG, a GIF or a video and saves it to its downloads), any other file shows in its folder, and a toast says where it went; the file stays named under the strip while you stay on that page. One export at a time: while one runs the key blinks. In the desktop app the row is a deck of the same console, an amber LED asking the question; in a terminal, VS Code and on mobile the key and the row are buttons.
- The **Timelapse** tab has a row of its own under the tabs: **Yesterday** (`y`), **Week** (`w`) and **Month** (`m`) pick the range it replays (this week until you pick another; the pane remembers it), and **⤓ Export** (`e`) saves the range on screen as a page and an SVG in the cache folder and opens the page in your browser, where it saves as a GIF, a video or the SVG; a toast says where it went. The replay is read when you pick the tab or a range and is never refreshed by itself, so it plays to its end without a reload; press the range again for a fresh one. In a terminal it plays as the text strips, a playhead moving along them.
- The pane updates itself when something changes. While it is on screen it watches the files your sessions write (each live session's record and transcript, its subagent and workflow folders, the journal of each workflow still running, and the session file of every other agent at a desk) with a quick look every 1.5 s. A session starting, ending or changing status, an intern or a meeting runs the collector at once; a transcript that only grew runs it at most every 15 s, since what a busy desk is doing is redrawn once a minute at most and a hand going up moves the session's record, and another agent's session file, all there is to see of it, at most every 5 s (Today at most every 10 s, Month every 30 s). Once a minute it runs anyway, for commits and visitors. A session of another agent that starts is drawn within a minute or so.
- Every session on the machine shares one collector. A run leaves its answer in the cache folder (`shared/`), a session reads it from there when it is recent enough, and one that needs fresher facts waits for the run under way instead of starting its own. With the pane off screen, closed or behind another tab, a session watches nothing: its status line follows the shared answer, at most a minute old, or 10 s after a prompt or a turn in that session. Closing the pane also lets go of what it drew and of the facts of its tabs: a tab opened again fetches its own. It only reads: it lists `~/.claude/sessions` and checks file times, and never opens a `.key` file.
- The drawing is reloaded only when what it shows changes, so it blinks rarely. Its clocks run by themselves; durations say what they are at least: a desk at work to ten minutes (`1h30+`), the rest in a few steps (`10m+`, `1h+`, `3h+`); agent-time and tool calls move in steps (10 minutes, half hours, then whole hours); the now line and the sky move on the hour. What a busy agent is doing (its tool and file) and the counts and shares of what they did, which move with every tool call, are redrawn at most once a minute, while a desk arriving, leaving, raising its hand, finishing its turn, going on a break or a meeting moving on is drawn at once. An office where nothing happens is reloaded only when the hour turns or a desk's time crosses a step.
- What moves in the drawing moves on one shared beat, four times a second, and nothing in it keeps the browser busy between two beats. An open pane costs about a third of the CPU it did (the Office tab in Chrome: 34% of a core before, 12% now), so walkers and the train go in steps rather than glide. A very full office that would outgrow what a pane can draw gives up some of its blinks first. A Timelapse plays as it always did.
- A status line keeps a one-line headcount, such as `🏢 1 hand up · 5 working · 1 in a meeting · 2 on break · 1 done · 2 interns`. An error comes right after the hands up: both need you.

Function hooks are an early-access part of Claude Code, so the pane needs a recent build (2.1.308 or newer). Asking Claude for the office in the chat works everywhere.

## How it works

`plugin/scripts/office.mjs` collects facts, then draws them.

**Live.** The live view reads:

- `~/.claude/sessions/<pid>.json`: one file per running Claude Code process, with its status (busy or idle) and name. A running session is at its desk until its turn has been done for 15 minutes.
- The last 64 KB of each session's transcript: the tool being used right now, and whether it waits for an answer.
- Subagent transcripts touched in the last couple of minutes: these are the interns.
- Workflow journals that don't have a result file yet: these are the meetings.

**History.** The other views read:

- Every transcript under `~/.claude/projects/`, main sessions and subagents. Each project gets prompts, tool calls by kind, files edited, active minutes (gaps capped at 5 minutes) and tokens, bucketed by local day, and the active minutes by hour and by quarter of an hour, which the timelapse replays.
- Your own commits in each repo (`git log --branches --tags --author=<you>`).

Worktrees under `<repo>/.claude/worktrees/` and agent scratchpads count toward their repo.

**Cache.** Transcripts are append-only, so the collector keeps a byte offset per file and only reads what's new. The cache lives in `$THEOFFICE_CACHE_DIR` if you set it, else in the plugin's data folder when Claude Code provides one (`$CLAUDE_PLUGIN_DATA`, under `~/.claude/plugins/data/`), else in `~/.cache/theoffice/`. Its files are readable by you only. The last 9 days are kept apart from the older days, so the live view, today and the week never load the older ones; days past 63 are kept apart again, up to 400 (what Claude Code's cleanup deleted, for good: it is the only copy), so the month never loads them while a page of the past up to a year back is read from there in a second or two instead of from the transcripts; and git is asked again only when a repo's branches or tags moved. The first week view on a busy machine takes a few seconds (here, 4.7 GB of a week's transcripts: 10 to 15 s); the pane shows the live floor before it, in about a second, its basement and commits line saying they are still counting, and a repo's line stats come a run later. After that it takes about 0.1 s. A long read saves what it has as it goes, so a run stopped halfway leaves the next one less to read. In a new time zone only the last 9 days are read again, a matter of seconds: the older days stay as you lived them. A cache from before the timelapse has no quarters of an hour, so the first timelapse of yesterday reads yesterday's sessions again, once.

**Folders macOS guards.** The system can hold a read inside `~/Documents`, `~/Desktop` or `~/Downloads` for as long as its privacy prompt waits for an answer. The collector never waits on one: it reads a project's files there through a small process it can stop, and goes on. Until you answer, a linked worktree in such a folder counts as a project of its own, and that repo's new commits wait.

**Agent-time vs desk time.** *Agent-time* adds up every agent, subagents included, so ten interns working for an hour count as ten hours. That is why a day can show more than 24 agent-hours (`agent-h` in the columns). *At desks* counts only the main sessions.

**Other agents.** Every account of every agent (see [Accounts](#accounts)) is read the same way, into the same cache, and booked into the same projects: a session is a desk's worth of work, a subagent an intern's, and each project's agent-time is split by agent (`agents` in the facts). They read:

| Agent | Sessions | Live state |
| --- | --- | --- |
| Codex | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (the last 62 days, or back to a page of the past), `archived_sessions/*.jsonl.zst` (zstd, read once; a page of the past skips those begun after it), titles from `session_index.jsonl` | a turn open (`task_started` with no `task_complete`), the call it waits on; subagent threads are interns |
| Gemini | Antigravity's `~/.gemini/antigravity{,-cli}/brain/<id>/.system_generated/logs/transcript.jsonl`, titles from `annotations/<id>.pbtxt`; the Gemini CLI's `~/.gemini/tmp/<project>/chats/session-*.json(l)` | the last step running, or a tool call with no answer yet |
| Cursor | `~/.cursor/projects/<project>/agent-transcripts/<id>/<id>.jsonl` and its `subagents/` | a turn not ended (`turn_ended`), the tool it called last |
| Kimi | kimi-code's `~/.kimi-code/sessions/` and the Kimi Work app's copy, the older kimi-cli's `~/.kimi/sessions/` | a prompt with no turn end, a tool call with no result |
| Grok | Grok Build's `~/.grok/sessions/<folder>/<id>/updates.jsonl` and `summary.json` | a tool call with no completed update, until `turn_completed` |

None of them keeps a record of a running process, so a session of theirs sits at its desk while its file was written in the last 30 minutes: working while a turn is open (stopped after 10 minutes without a write), done once it ended (stopped when Codex says the turn was aborted, an error when Antigravity says so), on the coat rack for 15 minutes after. Cursor writes no timestamps, so its agent-time is an estimate: the lines of a chunk are spread over the time it was written in, each worth 30 seconds at most.

If you use [novibenolife](https://novibenolife.com), the office asks it for the agents it has no reader of its own for (Aider, Amp, Cline, Goose…) with `novi <range> --facts --no-ingest`. They appear as visitors, little grey robots. Turn this off with `--no-novi`.

## Privacy

- **Read-only on your sessions.** The plugin never touches your sessions, transcripts or settings, Claude's or any other agent's. It reads only the session folders listed in [How it works](#how-it-works), and never a credential file (`auth.json`, OAuth tokens, `.key` files) or a database. Its only writes are its cache, and the `--pixel` drawings and the timelapse and month exports (`--export`, the pane's Export buttons) in that cache's `pixel/` folder: in `$THEOFFICE_CACHE_DIR` if you set it, else in the plugin data folder Claude Code gives it (`$CLAUDE_PLUGIN_DATA`, under `~/.claude/plugins/data/`), else in `~/.cache/theoffice/`. The cache holds titles, edited file paths and commit subjects, and the drawings show project names and titles, so its files are owner-only.
- **Stays on your machine.** Nothing is sent anywhere. `--html` writes a file only when you ask for one: a new `.html` file, or one of its own earlier pages. The timelapse page and the month's export pages load nothing from the network (their own rules forbid it), and their PNG, GIF, video and SVG are made in your browser and saved where you say.
- **What gets shown.** Session titles, project names, tool names and counts. Titles pass through secret redaction first. Prompt text, file contents and account ids are never shown.

## Development

```bash
npm test
```

This runs the node tests: the collector, the CLI, formatting, the text office (`plugin/lib/ascii.mjs`), the SVG and the HTML page.

```bash
npm run test:mod
```

This runs the mod's tests (`tests/`) with `claude plugin test`, on a scratch copy of `plugin/` with the tests beside it, so they never ship with the plugin. It needs Claude Code 2.1.308 or newer; `CLAUDE_BIN` picks another `claude` binary.

```bash
pnpm dev
```

This runs `claude --plugin-dir plugin`, which loads the plugin from this checkout's `plugin/` folder for one session. Claude Code also writes the mod's type definitions to `plugin/.claude-plugin/types/` (gitignored), which `tsc -p .` needs: run one such session before type-checking a fresh checkout.

```bash
pnpm site
```

This draws the site's pictures (`site/build.mjs`) and serves `site/` with no cache, on `http://127.0.0.1:4173/` or the next free port (it prints which).

`claude plugin validate --strict .` passes on Claude Code 2.1.308. Older builds (2.1.233, for one) do not know the `types` field of `plugin.json` and warn about it, which `--strict` turns into a failure. They ignore the field when loading the plugin, and 2.1.308 needs it for the mod's state contract, so it stays.

Environment overrides for tests and odd setups:

- `THEOFFICE_HOME` (the folder the agents' homes are looked for in; `$HOME` otherwise)
- `THEOFFICE_AGENTS` (`claude,codex,…`: the agents to read)
- `THEOFFICE_CLAUDE_DIR` (one Claude folder, read alone, unless `THEOFFICE_HOME` is set too)
- `THEOFFICE_CACHE_DIR`
- `THEOFFICE_NOW` (an ISO timestamp)
- `THEOFFICE_NO_GIT=1`
- `THEOFFICE_NO_NOVI=1`

## License

MIT © Makio64 (David Ronai)

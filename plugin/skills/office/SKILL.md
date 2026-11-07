---
name: office
description: Show The Office, a pixel-art view of the user's local coding agents across their accounts. Use when they ask what their agents are doing, which projects were busy, what an agent did today or this week, or for an office dashboard or activity timelapse.
---

# The Office

Read activity that coding agents already save on this machine and render it as animated pixel art with a full text backup. Run the bundled Node.js scripts with the host's shell tool. Node.js 24 or newer is required.

## Locate the scripts

Resolve `../../scripts/office.mjs` relative to **this loaded `SKILL.md` file's directory**, not the current project directory. The plugin root is two directories above that directory. Keep the complete plugin installed so its `scripts/` and `lib/` remain alongside `skills/`. Use the resolved absolute path in commands; no host-specific environment variable or skill-time shell interpolation is required.

For example, if this file is `/plugins/theoffice/skills/office/SKILL.md`, run `node "/plugins/theoffice/scripts/office.mjs" live --no-color`. In commands below, replace `/absolute/path/to/theoffice` with that resolved plugin root. Choose arguments from the user's request and the options below; pass them as ordinary shell arguments, quoting values such as project names.

## What to do

For a view in chat:

1. **First, show the pixel art.** Run `node "/absolute/path/to/theoffice/scripts/office.mjs" <view and options> --no-color --pixel`. Its stdout is one absolute path to an animated `.svg` file. Show that local file if the host has a file display tool, such as `SendUserFile` with `display: "render"`, or supports local image attachments. Never paste the SVG's contents into the chat. If the host cannot display SVG, give the file's clickable path or open the dashboard when requested.
2. **Then, always, the full text art.** Run the same command without `--pixel`: `node "/absolute/path/to/theoffice/scripts/office.mjs" <view and options> --no-color`. Copy its stdout exactly into one fenced code block that opens with ```text. Keep every block character and every space so the columns stay lined up. Don't redraw, re-align, translate, shorten or summarize it. Include it even when the pixel art was shown: it is the backup, and shell output is not reliably visible to the user.
3. **Add one or two short factual sentences.** Point out a busy project, a running workflow, an agent waiting for the user, or a department. Take every claim from the art or facts. Never invent work or grade the user's productivity. If the pixel art could not be shown, include its path and mention the live dashboard or a page (`--html`) when useful.

If a command fails, report the failure; do not present an error as office art. Raw output starting with `<svg` or `{` is markup or JSON, not text art: use `--pixel` for a file or use the facts to answer a follow-up. If `--html` was requested, the output is a page path: link to that file instead of putting its path in an art block.

## Live dashboard and native pane

When the user asks to open the office, keep it live, or see a dashboard, prefer the host's native integration. Map the request to `view` (`live`, `today`, `week`, `month`, `work`, or `timelapse`), `back` (calendar pages), and `range` (`yesterday`, `week`, or `month` for a replay). Default to `live`.

1. **MCP App:** If an installed `open_office` tool is available, call it with the selected view. It opens the interactive office in hosts that support MCP Apps. If it returns a local URL without showing a panel, open that URL in the host's browser panel. In Codex desktop, use `open_in_codex` with `target: {type: "browser", url: <returned URL>}` and `placement: "right"` when that tool is available; otherwise give an **Open The Office** link to `codex://browser?url=<the returned URL, percent-encoded>`, which Codex opens in its browser panel beside the chat. Do not send the URL to an external service.
2. **Cursor's native extension:** When the user is in Cursor and the editor extension is installed, its activity-bar **The Office** entry and status-bar button open the live sidebar. **The Office: Open in Editor** opens a full editor tab. A host tool that opens local app URLs may open `cursor://Makio64.theoffice/open?view=month&back=1` (substitute the requested fixed view/range/page). The `/theoffice` skill and command-palette entry lead to the same office. In Cursor's Agents window, prefer the MCP App.
3. **Antigravity's managed sidecar:** If this host is Antigravity and the plugin's sidecar is enabled, read `~/.gemini/antigravity/sidecar_data/theoffice/office/data/ready.json` with the host's file-reading tool. Accept it only when `spec` is `theoffice-antigravity/1` and `url` is an `http://127.0.0.1:<port>/?token=...` capability URL.
   - When the record has a numeric `pane`, the App runs The Office as a side pane: end your reply with the pill `[The Office](sidecar://theoffice/office/)`, exactly that link, which opens it beside the chat. It opens on the tab picked last; name the key for the requested tab (1 Live, 2 Today, 3 Week, 4 Month, 5 What they did, 6 Timelapse).
   - Otherwise preserve the record's token and append only the selected `view`, `range`, and `back` query fields. Open it with the host's browser-panel tool if available, or show an **Open The Office** link: Antigravity opens conversation links in its built-in side-panel browser.
   - If the record is absent or the endpoint is stale, use the fallback below; never invent a ready URL or a pill.
4. **Claude Code:** `/theoffice` uses Claude's native live pane when its function-hooks mod is supported (Claude Code 2.1.308 or newer). `/theoffice today`, `week`, `month`, `work`, or `timelapse` picks a tab. In a terminal, `/theoffice` opens The Office in the browser instead (the desktop pane's pixel art, kept live), never as text; `/theoffice browser` does the same anywhere. When a terminal user asks to see the office in pixel art, visually, or in the browser, run `node "/absolute/path/to/theoffice/scripts/dashboard.mjs" --detach --reuse --open --view <view>` and say it opened (its first line is the page's address).

If no native integration is available, start the bundled dashboard:

```sh
node "/absolute/path/to/theoffice/scripts/dashboard.mjs" --detach --reuse --view live
```

Use `--view month --back 1` for last month, or `--view timelapse --range yesterday` for yesterday's replay. This prints a local capability URL; `--reuse` opens the server already running instead of starting another, and stops it by itself half an hour after its last page closes. Open it beside the conversation with the host's browser-panel tool when available; in Codex desktop, use `open_in_codex` as above. If the host has no embedded browser, add `--open` to launch the system browser, or give the user an **Open The Office** link. A foreground alternative omits `--detach`; leave that process running in the host's background terminal if supported. Never copy raw agent activity into a browser URL.

The dashboard is the desktop pane's pixel console in a page: the same six views, the period strip, Quiet and Zoom, the Timelapse's player and exports, the Month's export row, and the same keys. It redraws by itself as the agents work. **Stop server** ends the standalone server. A managed sidecar or MCP server owns its own process lifecycle. Do not promise an IDE extension API in hosts that provide only skills and an embedded browser.

## Views and arguments

Every agent has its own character: Claude is Clawd (`▛█▜`), Codex is Dex (`▐>▌`), Gemini CLI and Antigravity are Gem (`▐*▌`), Cursor is Caret (`▐│▌`), Kimi is Mooni (`▐(▌`), and Grok is Rok (`▐/▌`). Desks show their account name when more than one account is in use, and historical views include agent-time per agent and account.

| Argument | Shows |
| --- | --- |
| *(none)* or `all` | The live floor plan, the week's office tower, departments, and factual awards. Its pixel art is the live building; use `week` for the tower |
| `live` | One room per project, with desks for sessions, interns for subagents, workflows in the meeting room, agents on a break in the kitchen, and a coat rack for agents who just left. A hand up means the agent needs the user; a check means its turn is done |
| `today` | Today's timesheet, one row per project and one column per hour, with agent-time, commits, and who is working now. Its pixel art is a time clock room and a street of hourly activity |
| `week` | The last seven days as an office tower, one floor per project and one window per day, lit by agent-time, with commits and subagents |
| `month` | A wall calendar and project directory for last month and this month so far, then departments |
| `month --back 1` | Last calendar month. `--back N` pages back through calendar months, Monday-to-Sunday weeks for `week` and `work`, or days for `today` |
| `work` | Departments: what kinds of work the agents did this week, with tool-call shares, subagents, and models |
| `timelapse yesterday`, `timelapse week`, `timelapse month` | A looping replay of yesterday, the last seven days, or the last thirty days. `week` is the default. Agents arrive, work, meet, take breaks, and leave |

**Departments** describe the share of all those tool calls, not hours. Server room = terminal commands; QA lab = running tests; library = reading code; typing pool = writing code; internet café = browsing; gadget shop = other tools including MCP; whiteboard = planning; phone booth = questions and messages to the user; management = delegation; art studio = design tools. Agent-time counts each agent, including subagents, so a day can hold more agent-hours than clock hours.

- `--project NAME` filters matching projects.
- `--agents claude,codex` reads only selected agents; `--claude-only` reads Claude.
- `--pixel` writes the animated SVG and prints its path.
- `--html` writes a self-contained page with every drawing of the view followed by its text. An optional filename chooses where it is saved.
- `--ascii` uses plain 7-bit characters for the text.
- `--json` prints raw facts for answering follow-up questions; do not paste the entire payload.
- `--svg` prints raw SVG markup; use `--pixel` for user-facing output.

## Timelapse and exports

Use `timelapse <range>` with the same pixel-first, full-text workflow. A replay of today is unavailable because the day is still running; offer yesterday or the week. Take any claim about the busiest moment from the text or facts.

For GIF or video, run `node "/absolute/path/to/theoffice/scripts/office.mjs" timelapse <range> --html`. The page plays the replay with a scrubber and has Save GIF, Save video, and Save SVG buttons; it creates the exports locally in the browser. `--export` instead saves both the page and SVG in the plugin's cache folder and prints both paths, page first; `--export --open` also opens it.

For a month export, use `month [--back N] --export <calendar|directory|whole|stats> --as <format>`. Calendar, directory, and whole support `png`, `svg`, `gif`, and `video`; stats supports `html`, `csv`, and `json`. Link to the generated file or page. PNG, GIF, and video are saved through the generated page's browser controls.

## Follow-up questions

For what an agent or project did, run `node "/absolute/path/to/theoffice/scripts/office.mjs" <view and filters> --json`. Answer only from its session titles, activity counts, commits, and minutes. Each desk names its `agent` and `account`; project and total `agents` hold agent-minutes, and `accounts` lists the accounts read. Cursor writes no timestamps, so its agent-time is an estimate. If the facts don't cover something, say so.

For when they worked, `timelapse <range> --json` adds `timeline`. Each desk's `runs` holds slot ranges: slot `i` starts `slot_min` × (`i` mod `per_day`) minutes after midnight on `days[floor(i / per_day)]`.

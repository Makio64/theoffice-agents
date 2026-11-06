---
name: office-voxel
description: Open the alternative 3D voxel edition of The Office, a live local dashboard of the user's coding agents. Use when the user asks for the voxel office, 3D office, or to open their agents' living workspace.
---

# The Office / Voxel

Open the bundled 3D voxel dashboard, using the existing read-only local activity collector. Node.js 24 or newer is required. The complete installed plugin includes its prebuilt website and collector; no package installation or build is needed.

## Locate and open

Resolve `../../scripts/voxel.mjs` relative to **this loaded SKILL.md file's directory**, not the current project directory. The plugin root is two directories above that directory. Keep the whole plugin installed so its `scripts/`, `lib/`, and `dist/voxel/` stay alongside `skills/`.

Run the resolved absolute script path in the host's retained background terminal:

```sh
node "/absolute/path/to/theoffice-voxel-plugin/scripts/voxel.mjs" --open
```

Replace the placeholder with the actual resolved plugin path. Its first stdout line is the private loopback capability URL. Open that URL in the host's browser preview if available, or provide the clickable local URL. Leave the process running while the user uses the office. Stop the owned process with SIGTERM when the user asks to close it.

Add `--view today` (or `week`, `month`, `work`, `timelapse`) to open the office on that tab, as the pixel office's views: the live building is the default. Use `--demo` only if the user explicitly wants the illustrative sample office. Otherwise show the actual local activity, including an empty office when no sessions are active. Agent-time is combined measured active time; a session's age is not active time.

## What the dashboard does

The office visualizes local sessions from Claude, Codex, Gemini, Cursor, Kimi, and Grok. It shows who is working, who needs attention, project activity, and weekly summaries. It can rotate and zoom the voxel scene, inspect agents, toggle day/night, and display activity and insights. These are observational controls: they do not send prompts, approve requests, terminate sessions, or modify the running agents.

When an agent needs attention, direct the user to that agent's original session. Do not invent activity or infer successful work from an animated character. Local data remains on the machine; never send snapshots or the private tokenized URL to an external service.

In Claude Code, this plugin's explicit skill command is `/theoffice-voxel:office-voxel`. In other hosts, invoke the `office-voxel` skill using that host's skill picker or ask to open the voxel office. This portable skill opens the browser dashboard; the separate VSIX provides an editor pane.

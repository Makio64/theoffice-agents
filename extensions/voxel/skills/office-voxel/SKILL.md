---
name: office-voxel
description: Open the alternative 3D voxel office of local coding agents in a browser. Use when the user requests the voxel edition of The Office.
---

# The Office / Voxel

From the repository root, run `node plugin/scripts/voxel.mjs --open` in a retained terminal session. If the build is missing, run `npm install` and `npm run build:voxel` first. The first stdout line is the local capability URL. Do not publish that tokenized URL or transmit local activity to remote services.

Add `--view today` (or `week`, `month`, `work`, `timelapse`) to open the office on that tab, as the pixel office's views: the live building is the default. Use `--demo` only when the user wants illustrative sample data. Otherwise show actual local activity, including an empty office when no sessions are active. Stop the owned process with SIGTERM when the user asks to close it.

The office is observational. Its controls do not send prompts, approve agent requests, or change running coding sessions. If an agent needs attention, direct the user to that session.

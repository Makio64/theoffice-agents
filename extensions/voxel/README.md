# The Office / Voxel

An alternative 3D office for your coding agents. This prototype renders the office with Three.js 0.187.0 `WebGPURenderer`, with the renderer's WebGL 2 backend available when WebGPU is unavailable.

Install the generated `theoffice-voxel-1.0.0.vsix` in VS Code, Cursor, or an editor supporting VS Code extensions. Run **The Office / Voxel: Open Live Office** from the command palette. Node.js 24 or newer is required; set `theofficeVoxel.nodePath` if necessary.

The pane starts a capability-protected loopback server. It reads the existing local collector and stops the process when you close the pane. It does not upload your sessions. The website's sample data is clearly distinguished from local activity. Empty local activity stays empty.

## Build from this repository

```sh
npm install
npm run build:voxel
npm run package:voxel
```

Run the browser version locally with `npm run voxel`, or `node plugin/scripts/voxel.mjs --open`. Use `--demo` to open the illustrative demo rather than local activity. The alternative extension has its own command and settings, so the original pixel office can remain installed.

Packaging also produces `dist/theoffice-voxel-plugin-1.0.0.zip` and `dist/theoffice-voxel-plugin/`, a self-contained agent plugin with its built website and collector. Load it in Claude Code with `claude --plugin-dir ./dist/theoffice-voxel-plugin`, then invoke `/theoffice-voxel:office-voxel`. Register its local marketplace in Codex with `codex plugin marketplace add ./dist/theoffice-voxel-plugin`, then install with `codex plugin add theoffice-voxel@theoffice-voxel`. The agent plugin README has the full instructions.

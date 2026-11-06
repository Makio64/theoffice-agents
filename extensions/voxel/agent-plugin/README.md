# The Office / Voxel — agent plugin

A complete alternative 3D office for your local coding agents. The packaged plugin contains the prebuilt Three.js 0.187.0 WebGPU website and the same local activity collector as the original Office. Node.js 24 or newer is required. The renderer can use its WebGL 2 backend when WebGPU is unavailable.

## Claude Code

After building and packaging from the repository root:

```sh
claude --plugin-dir ./dist/theoffice-voxel-plugin
```

Then run `/theoffice-voxel:office-voxel`, or ask to open the voxel office. Claude Code also accepts the generated ZIP directly with `--plugin-dir ./dist/theoffice-voxel-plugin-1.0.0.zip`.

## Codex

Register the extracted package's local marketplace and install its plugin:

```sh
codex plugin marketplace add ./dist/theoffice-voxel-plugin
codex plugin add theoffice-voxel@theoffice-voxel
```

Restart the relevant Codex session if needed, then invoke the `office-voxel` skill from the skill picker or ask to open the voxel office. These commands are installation instructions; building the package does not change your Codex configuration.

The local marketplace format is described in the [official OpenAI plugin documentation](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work), and the [CLI marketplace command reference](https://learn.chatgpt.com/docs/developer-commands#codex-plugin-marketplace).

## Direct browser launch

```sh
node ./dist/theoffice-voxel-plugin/scripts/voxel.mjs --open
```

Use `--demo` for illustrative sample data. The normal launch reads real local activity through a capability-protected loopback API. Close the retained terminal or send SIGTERM to stop it. This dashboard observes agents; it does not control or approve their work.

The independent VSCode/Cursor extension is available as `theoffice-voxel-1.0.0.vsix` and has the command **The Office / Voxel: Open Live Office**.

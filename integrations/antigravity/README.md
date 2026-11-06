# The Office in Antigravity App

The managed sidecar draws The Office in the App's own side pane, beside chat, the way Google's plugins draw theirs: the same live dashboard as the other hosts, with no terminal command each time you open it. The App starts the sidecar, names the port it listens on and the token its pane carries, and restarts it after a failure. It stays idle until the pane requests activity. No conversation is created by the sidecar.

Install the packaged plugin, then opt in once:

```sh
agy plugin install /absolute/path/to/dist/theoffice-plugin
node "$HOME/.gemini/config/plugins/theoffice/integrations/antigravity/configure.mjs" enable
```

The second command changes only `sidecars["theoffice/office"].enabled` in `~/.gemini/config/config.json`. It keeps a private backup of that setting alone, preserving other settings. Start or reopen Antigravity App if it was not already running. The App's sidecar runtime uses `node` from its process environment; Node.js 24 or newer is required.

Use `/theoffice` in a new conversation. The skill reads the private `~/.gemini/antigravity/sidecar_data/theoffice/office/data/ready.json` file and ends its reply with a **The Office** pill (`sidecar://theoffice/office/`): select it to open or close the side pane (App 2.22 and newer). The pane cannot stop the sidecar; the App owns it.

An App that runs the sidecar without a pane gets an **Open The Office** link instead: Antigravity App 2.28 and newer opens conversation links in its built-in browser beside chat by default. If you changed **Settings → General → Open Links In**, choose the built-in browser there, or use the link's browser choice.

The sidecar reuses its live endpoint instead of opening duplicate processes. A stale endpoint is replaced after its process exits. Runtime files are private to your account and disappear when the sidecar stops. The App owns the process lifecycle; closing a browser tab does not stop the managed sidecar.

```sh
# Report whether the opt-in sidecar is enabled and running.
node "$HOME/.gemini/config/plugins/theoffice/integrations/antigravity/configure.mjs" status

# Disable the sidecar and stop its dashboard.
node "$HOME/.gemini/config/plugins/theoffice/integrations/antigravity/configure.mjs" disable

# Restore only the setting that existed before the first opt-in change.
node "$HOME/.gemini/config/plugins/theoffice/integrations/antigravity/configure.mjs" restore
```

Antigravity CLI and the standalone IDE can use the portable skill and dashboard. Sidecars are an App feature. In the CLI, `scripts/statusline.mjs` gives `agy` the office's headcount as a status line (see the guide's *A status line in any CLI*).

Official references: [sidecar discovery, runtime, and opt-in settings](https://antigravity.google/docs/sidecars), [App 2.28 built-in side-panel browser](https://antigravity.google/docs/changelog), [plugin manifests and shared files](https://antigravity.google/docs/build-plugins). The pane follows the App's own `ui-plugin-navigation` skill: a sidecar with `has_web_ui` and an `SIDECAR_UI_ENTRYPOINT_AUX_PANE` view, framed as `<path>?token=<ANTIGRAVITY_SIDECAR_UI_TOKEN>&conversationId=<id>` on `ANTIGRAVITY_SIDECAR_WEB_PORT`.

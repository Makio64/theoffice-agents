# Install The Office

The Office is a Claude Code plugin: a live pixel-art dashboard of your coding agents, in a pane beside the chat. These steps install it for the person who asked for it. They work from a Claude Code chat in the desktop app or in a terminal.

## 1. Install the plugin

Run this in a shell:

```bash
claude plugin install theoffice --marketplace Makio64/theoffice-agents
```

It adds the `makio64` marketplace (the GitHub repository Makio64/theoffice-agents) and installs `theoffice@makio64` for the user.

If `claude` isn't on the PATH, which is usual on a computer with only the Claude desktop app, use the Claude Code that ships with the app and run the same `plugin install` command with it. On macOS that is the newest `~/Library/Application Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude`.

## 2. Check Node.js

Run `node -v`. The Office's pane runs its collector with Node.js 24 or newer. If Node is missing or older than 24, tell the person to install Node.js 24 or newer from https://nodejs.org before opening it.

## 3. Open it

Tell the person to start a new session (the current one keeps the plugins it loaded) and type `/theoffice`.

## Good to know

- In a Claude Code terminal session the person can also type `/plugin install theoffice --marketplace Makio64/theoffice-agents` themselves. In the desktop app a typed `/plugin` command only opens Settings → Plugins.
- `claude plugin list` shows `theoffice@makio64` once it's installed; `claude plugin uninstall theoffice@makio64` removes it.
- Everything the plugin runs, reads and writes is listed in its README: https://github.com/Makio64/theoffice-agents/blob/main/plugin/README.md. It reads the agents' session files on this computer and sends nothing anywhere.

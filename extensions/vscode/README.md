# The Office for Cursor and VS Code editors

Use the **Office** status button, The Office activity-bar entry, or **The Office: Open Live Pane** in the Command Palette to open its sidebar. The status button is the office's headcount (`5 working · 1 hand up`), the line Claude Code keeps in its status line, lit as a warning while an agent needs you; it is read every 20 seconds while the window has the focus, from what the office last collected, and **The Office › Status Bar Headcount** turns it back into a plain button. **The Office: Open in Editor** gives it a full editor tab; **The Office: Restart** restarts its server. The same pixel-art office works in Cursor, VS Code, and compatible Antigravity IDE builds. It reads the coding-agent transcripts on this computer and refreshes while visible.

Node.js 24 or newer must be installed. If the editor cannot find it, set **The Office › Node Path** to the absolute path of your Node executable. No account, API key, or network service is needed.

The panes share a private server on `127.0.0.1` with a random access token. Hidden panes keep their state and pause refresh; closing the last pane stops the server. The six views, Quiet labels, history navigation, replay player, and exports share the collector and renderers used by the Claude plugin. Keys 1–6 switch views, p/n/c navigate history, and q toggles Quiet. The extension runs on your local computer, including when editing a remote workspace; it shows agents on that computer.

Native links such as `cursor://Makio64.theoffice/open?view=month&back=1` open a requested view. The portable Cursor plugin also provides an interactive MCP App in supported agent chats.

To build a VSIX from the repository, run `node scripts/package-editor.mjs`, then choose **Extensions: Install from VSIX…** in the editor. To develop without packaging, launch the editor with `--extensionDevelopmentPath=/absolute/path/to/theoffice-agents/extensions/vscode`.

Source and privacy details: [The Office](https://github.com/Makio64/theoffice-agents).

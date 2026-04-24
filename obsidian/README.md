# Obsidian MCP Server (Streamable HTTP → Perplexity)

A Model Context Protocol server that connects a local **Obsidian vault**
on your machine to **Perplexity** (and any other MCP client) over
**Streamable HTTP**. You edit a single `config.json` to point it at your
vault; the server exposes read, write, search, backlinks, daily notes,
tags, and metadata as MCP tools.

Works just as well with Claude Desktop / Cursor / Zed via the included
stdio entry point.

## Requirements

Based on the Perplexity custom-connector docs (checked 2026-04-24):

- Transport: **Streamable HTTP** or SSE — this server uses Streamable HTTP.
- URL: must be reachable from Perplexity over **HTTPS**. Since your vault
  is local, you'll expose the server via a secure tunnel (ngrok,
  cloudflared, or Tailscale Funnel). See "Exposing to Perplexity" below.
- Authentication: **API key** (Bearer token). Set one in `config.json`
  and Perplexity sends it as `Authorization: Bearer <token>`.

## 1. Install

```bash
cd obsidian
npm install
npm run build
```

## 2. Configure

Copy the example and edit `vaultPath`:

```bash
cp config.example.json config.json
```

```json
{
  "vaultPath": "/Users/you/Documents/My Vault",
  "readOnly": false,
  "allowDelete": false,

  "dailyNotesFolder": "Daily",
  "dailyNoteDateFormat": "YYYY-MM-DD",

  "exclude": [".obsidian", ".trash", ".git"],
  "maxFileBytes": 1048576,
  "maxSearchResults": 50,
  "defaultExtension": ".md",

  "server": {
    "host": "127.0.0.1",
    "port": 3737,
    "mcpPath": "/mcp",
    "authToken": "",
    "allowedOrigins": ["*"],
    "trustProxy": false
  }
}
```

| Key | Meaning |
| --- | --- |
| `vaultPath` | **Absolute** path to your Obsidian vault on this machine. |
| `readOnly` | If `true`, disables create/update/delete/rename. |
| `allowDelete` | Must be `true` to permit `vault_delete_note`. Off by default. |
| `dailyNotesFolder` | Folder used by `vault_daily_note`. |
| `dailyNoteDateFormat` | Token format: `YYYY`, `MM`, `DD`, `HH`, `mm`, `ss`. |
| `exclude` | Folder names to skip during listing/search. |
| `maxFileBytes` | Safety cap — files above this are skipped. |
| `maxSearchResults` | Default cap on search hits. |
| `defaultExtension` | Automatically appended when a path has no extension (`.md`). |
| `server.host` / `port` / `mcpPath` | Where the HTTP server binds. |
| `server.authToken` | **Set a long random string** when exposing publicly. |
| `server.allowedOrigins` | CORS allowlist, or `["*"]`. |
| `server.trustProxy` | Set `true` behind a proxy/tunnel (honours `X-Forwarded-For`). |

The config path defaults to `./config.json`. You can override it via
`OBSIDIAN_CONFIG_PATH=/path/to/config.json`.

## 3. Run

```bash
npm start          # Streamable HTTP (for Perplexity)
npm run start:stdio  # stdio (for Claude Desktop/Cursor/Zed)
```

Quick smoke test from another terminal:

```bash
curl -s http://127.0.0.1:3737/health
```

## 4. Expose to Perplexity

Perplexity requires an HTTPS URL. Pick one of these tunnels:

### Option A — Cloudflare Tunnel (recommended, free, stable domain)

```bash
# one-off, ephemeral URL:
cloudflared tunnel --url http://127.0.0.1:3737

# or a stable subdomain with a named tunnel:
cloudflared tunnel login
cloudflared tunnel create obsidian-mcp
cloudflared tunnel route dns obsidian-mcp obsidian-mcp.example.com
cloudflared tunnel --url http://127.0.0.1:3737 run obsidian-mcp
```

### Option B — ngrok

```bash
ngrok http 3737
```

### Option C — Tailscale Funnel (works if both devices are on your tailnet)

```bash
tailscale funnel 3737
```

Any of these gives you a URL like `https://<something>.trycloudflare.com`.

### Hook it into Perplexity

1. Set `server.authToken` in `config.json` to a long random string
   (e.g. `openssl rand -hex 32`) and restart the server.
2. Perplexity → **Settings → Connectors → Add custom connector**.
3. Fill in:
   - **Server URL**: `https://<your-tunnel-host>/mcp`
   - **Transport**: Streamable HTTP
   - **Authentication**: API Key, value = your `authToken`
4. Save. Perplexity validates the endpoint; if validation fails it will
   show an error tag.
5. Enable the connector in a Space or chat. The model now sees the 12
   vault tools listed below.

> Never expose a vault with `readOnly: false` and no `authToken`. A
> public URL without auth means anyone who finds it can read, rewrite,
> or (if allowed) delete your notes.

## Tools exposed

| Tool | What it does |
| --- | --- |
| `vault_list_notes` | List markdown notes, optionally scoped to a folder. |
| `vault_list_folders` | List folders in the vault. |
| `vault_read_note` | Read a note's parsed frontmatter + body (+ raw if asked). |
| `vault_search` | Case-insensitive full-text search, returns path + line + preview. |
| `vault_create_note` | Create a new note, optionally with YAML frontmatter. |
| `vault_update_note` | Append / prepend / replace an existing note. |
| `vault_rename_note` | Move or rename a note. |
| `vault_delete_note` | Delete a note (gated by `allowDelete`). |
| `vault_note_metadata` | Frontmatter + tags (inline + frontmatter) + wikilinks + md links. |
| `vault_backlinks` | All notes that `[[link]]` to the target. |
| `vault_daily_note` | Read or create today's (or any date's) daily note. |
| `vault_list_tags` | Every tag used in the vault, with counts. |

Resource: `obsidian://vault/info` returns the current config summary.

## Using with Claude Desktop (stdio, no tunnel needed)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/absolute/path/to/Mcp-template/obsidian/dist/stdio.js"],
      "env": {
        "OBSIDIAN_CONFIG_PATH": "/absolute/path/to/Mcp-template/obsidian/config.json"
      }
    }
  }
}
```

## Security

- **Path traversal**: every user-supplied path is resolved inside
  `vaultPath` and rejected if it escapes. Absolute paths are rejected
  outright.
- **SSRF / exec**: this server has no network or shell tools — only
  filesystem access to the configured vault.
- **Read-only mode**: `readOnly: true` blocks every mutating tool.
- **Delete opt-in**: `allowDelete: true` is required for
  `vault_delete_note`.
- **Size cap**: files above `maxFileBytes` are skipped.

## Scripts

- `npm run dev` — hot-reload HTTP server (`tsx`)
- `npm run dev:stdio` — hot-reload stdio server
- `npm start` / `npm run start:stdio` — run the compiled servers
- `npm test` — unit tests against an ephemeral test vault
- `npm run typecheck` — type-check `src/` and `test/`
- `npm run build` / `npm run clean`

## License

MIT

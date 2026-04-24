# MCP Streamable HTTP Template

A general-purpose [Model Context Protocol](https://modelcontextprotocol.io) server template that speaks the **Streamable HTTP** transport, written in TypeScript on top of the official `@modelcontextprotocol/sdk`. It is designed to be dropped in as the starting point for any MCP server you want to expose to web-based clients such as the **Perplexity** web app, Claude Desktop (via `mcp-remote`), Cursor, or your own integrations.

## Features

- Streamable HTTP transport with a single `/mcp` endpoint (POST + GET + DELETE).
- **Stateless mode** (default): one MCP server instance per request — ideal for serverless and Perplexity.
- **Stateful mode**: multi-turn sessions with server-initiated notifications over SSE.
- Optional **stdio** entry point for local clients (Claude Desktop, Cursor, Zed).
- CORS, Bearer-token auth, per-IP rate limiting, health check, graceful shutdown.
- Example **tools** (`echo`, `current_time`, `hash`, `fetch_url`), a resource, and a prompt.
- Built-in **test client** script and `node:test` unit tests.
- Dockerfile, docker-compose, Fly.io and Render recipes, and GitHub Actions CI.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

The server is now listening at `http://localhost:3000/mcp`.

Smoke-test it with `curl` (Streamable HTTP initialize handshake):

```bash
curl -i -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-06-18",
      "capabilities": {},
      "clientInfo": {"name": "curl", "version": "0"}
    }
  }'
```

You should get back an SSE stream (or JSON if `MCP_ENABLE_JSON_RESPONSE=true`) containing the server's capabilities.

Or use the built-in test client (spawns against a running HTTP server):

```bash
npm run test:client -- http://localhost:3000/mcp current_time '{"timezone":"UTC"}'
```

## Running over stdio (local clients)

If you want to plug this server into a local MCP client (Claude Desktop, Cursor,
Zed…), run it over stdio instead of HTTP:

```bash
npm run build
node dist/stdio.js
```

Example Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "my-template": {
      "command": "node",
      "args": ["/absolute/path/to/Mcp-template/dist/stdio.js"]
    }
  }
}
```

The same tools, resources, and prompts are served on both transports.

## Connecting from the Perplexity web app

Perplexity supports MCP servers that expose a **Streamable HTTP** endpoint reachable from the public internet.

1. Deploy this server to any host that terminates TLS (Fly, Railway, Render, Cloud Run, Vercel, Fargate, your own VPS…). You must be reachable over `https://`.
2. Set `MCP_AUTH_TOKEN` to a strong random string. Perplexity will send it as `Authorization: Bearer <token>`.
3. In Perplexity, go to **Settings → Connectors → Add custom connector** and enter:
   - **Name**: any label
   - **URL**: `https://your-host.example.com/mcp`
   - **Auth**: Bearer token, value = the `MCP_AUTH_TOKEN` you configured
4. Enable the connector in a Space or in a chat. The tools defined in `src/tools/` will appear to the model.

> Stateless mode (the default) is recommended for Perplexity — it avoids sticky-session requirements behind load balancers.

## Adding your own tools

Create a file under `src/tools/`:

```ts
// src/tools/my-tool.ts
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const Input = z.object({
  query: z.string().describe("What to search for."),
});

export const myTool: ToolDefinition<typeof Input> = {
  name: "my_tool",
  title: "My Tool",
  description: "Does a thing and returns a result.",
  inputSchema: Input,
  handler: async ({ query }) => ({
    content: [{ type: "text", text: `you asked: ${query}` }],
  }),
};
```

Then register it in `src/tools/index.ts`:

```ts
import { myTool } from "./my-tool.js";
export const tools = [echoTool, fetchUrlTool, myTool];
```

That's it — the tool is now advertised in `tools/list` and callable via `tools/call`.

To add resources or prompts, edit `src/resources.ts` and `src/prompts.ts` — the existing entries show the pattern.

## Configuration

All configuration is environment-driven. See `.env.example`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `MCP_PATH` | `/mcp` | Path the MCP endpoint is mounted at |
| `MCP_SERVER_NAME` | `mcp-streamable-http-template` | Name reported to clients |
| `MCP_SERVER_VERSION` | `0.1.0` | Version reported to clients |
| `MCP_STATELESS` | `true` | `true` = new server per request, `false` = sessions |
| `MCP_ENABLE_JSON_RESPONSE` | `false` | Return plain JSON instead of SSE when no stream is needed |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist |
| `MCP_AUTH_TOKEN` | _(unset)_ | If set, requires `Authorization: Bearer <token>` |
| `RATE_LIMIT_MAX` | _(unset, off)_ | Max requests per IP per window. Leave empty to disable. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window size in milliseconds |
| `TRUST_PROXY` | `false` | Honour `X-Forwarded-For` (set `true` behind a proxy/load balancer) |

## Deploy

Ready-to-copy recipes live in [`deploy/`](./deploy):

- `deploy/fly.toml` — Fly.io
- `deploy/render.yaml` — Render blueprint
- `deploy/docker-compose.yml` — local/self-hosted compose stack
- `Dockerfile` — plain Docker build

```bash
# Docker
docker build -t mcp-template .
docker run --rm -p 3000:3000 -e MCP_AUTH_TOKEN=changeme mcp-template

# Fly.io
cp deploy/fly.toml .
fly launch --copy-config --no-deploy
fly secrets set MCP_AUTH_TOKEN=$(openssl rand -hex 32)
fly deploy
```

See [`deploy/README.md`](./deploy/README.md) for details.

## Tests

```bash
npm test           # unit tests (node:test, no extra deps)
npm run typecheck  # type-check src + scripts + test
```

## Scripts

- `npm run dev` — hot-reload the HTTP server with `tsx`
- `npm run dev:stdio` — hot-reload the stdio entry
- `npm run build` — emit `dist/`
- `npm start` — run the compiled HTTP server
- `npm run start:stdio` — run the compiled stdio server
- `npm test` — run unit tests via `node:test`
- `npm run test:client` — run the built-in MCP client against a URL
- `npm run typecheck` — type-check `src/`, `scripts/`, and `test/` without emitting

## Variants

- [`obsidian/`](./obsidian) — a ready-to-run MCP server that connects a
  local **Obsidian vault** to Perplexity over Streamable HTTP. Edit one
  `config.json` to point at your vault; 12 tools cover read, write,
  search, backlinks, daily notes, tags, and metadata.

## License

MIT

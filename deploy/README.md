# Deployment recipes

Ready-to-use configs for putting this MCP server on the public internet
(which is what Perplexity and other web-based MCP clients need).

| Target | Config | One-liner |
| --- | --- | --- |
| **Fly.io** | `fly.toml` | `cp deploy/fly.toml . && fly launch --copy-config --no-deploy && fly secrets set MCP_AUTH_TOKEN=$(openssl rand -hex 32) && fly deploy` |
| **Render** | `render.yaml` | `cp deploy/render.yaml .` then connect the repo in the Render dashboard |
| **Docker Compose** | `docker-compose.yml` | `docker compose -f deploy/docker-compose.yml up --build` |
| **Raw Docker** | `../Dockerfile` | `docker build -t mcp . && docker run -p 3000:3000 -e MCP_AUTH_TOKEN=change-me mcp` |

## What to set in every deployment

1. `MCP_AUTH_TOKEN` — a long random string. Clients send it as
   `Authorization: Bearer <token>`.
2. `TRUST_PROXY=true` — so `X-Forwarded-For` is honoured for rate
   limiting and logs.
3. HTTPS at the edge — all the managed targets above do this for you.

## After the deploy

Point Perplexity (Settings → Connectors → Add custom connector) at
`https://<your-host>/mcp` using Bearer auth with the same token. See the
root README for step-by-step connector setup.

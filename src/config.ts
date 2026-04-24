export interface ServerConfig {
  name: string;
  version: string;
  host: string;
  port: number;
  mcpPath: string;
  stateless: boolean;
  enableJsonResponse: boolean;
  allowedOrigins: string[];
  authToken: string | null;
  rateLimit: { windowMs: number; max: number } | null;
  trustProxy: boolean;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value || value.trim() === "" || value.trim() === "*") return ["*"];
  return value.split(",").map((o) => o.trim()).filter(Boolean);
}

function parsePositiveInt(name: string, value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return n;
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

  const rateMax = parsePositiveInt("RATE_LIMIT_MAX", process.env.RATE_LIMIT_MAX);
  const rateWindow =
    parsePositiveInt("RATE_LIMIT_WINDOW_MS", process.env.RATE_LIMIT_WINDOW_MS) ?? 60_000;

  return {
    name: process.env.MCP_SERVER_NAME ?? "mcp-streamable-http-template",
    version: process.env.MCP_SERVER_VERSION ?? "0.1.0",
    host: process.env.HOST ?? "0.0.0.0",
    port,
    mcpPath: process.env.MCP_PATH ?? "/mcp",
    stateless: (process.env.MCP_STATELESS ?? "true").toLowerCase() === "true",
    enableJsonResponse:
      (process.env.MCP_ENABLE_JSON_RESPONSE ?? "false").toLowerCase() === "true",
    allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
    authToken: process.env.MCP_AUTH_TOKEN?.trim() || null,
    rateLimit: rateMax === null ? null : { windowMs: rateWindow, max: rateMax },
    trustProxy: (process.env.TRUST_PROXY ?? "false").toLowerCase() === "true",
  };
}

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
}

function parseOrigins(value: string | undefined): string[] {
  if (!value || value.trim() === "" || value.trim() === "*") return ["*"];
  return value.split(",").map((o) => o.trim()).filter(Boolean);
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${process.env.PORT}`);
  }

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
  };
}

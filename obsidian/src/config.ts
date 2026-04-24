import { readFileSync, statSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { z } from "zod";

const ServerSchema = z
  .object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().positive().default(3737),
    mcpPath: z.string().default("/mcp"),
    authToken: z.string().default(""),
    allowedOrigins: z.array(z.string()).default(["*"]),
    trustProxy: z.boolean().default(false),
    enableJsonResponse: z.boolean().default(false),
    stateless: z.boolean().default(true),
  })
  .default({});

const FileConfigSchema = z.object({
  vaultPath: z.string().min(1, "vaultPath is required"),
  readOnly: z.boolean().default(false),
  allowDelete: z.boolean().default(false),
  dailyNotesFolder: z.string().default("Daily"),
  dailyNoteDateFormat: z.string().default("YYYY-MM-DD"),
  exclude: z.array(z.string()).default([".obsidian", ".trash", ".git"]),
  maxFileBytes: z.number().int().positive().default(1_048_576),
  maxSearchResults: z.number().int().positive().default(50),
  defaultExtension: z.string().default(".md"),
  server: ServerSchema,
});

export type Config = z.infer<typeof FileConfigSchema> & {
  vaultPath: string;
  name: string;
  version: string;
};

function stripComments(raw: string): string {
  // Remove underscore-prefixed keys (used as "comments") by parsing + reserialising.
  // We do this after JSON.parse; this function is a no-op placeholder for clarity.
  return raw;
}

function findConfigPath(): string {
  const fromEnv = process.env.OBSIDIAN_CONFIG_PATH;
  if (fromEnv) return resolve(fromEnv);
  return resolve(process.cwd(), "config.json");
}

export function loadConfig(): Config {
  const path = findConfigPath();
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const hint =
      (err as NodeJS.ErrnoException).code === "ENOENT"
        ? `\n\nCopy config.example.json to ${path} and edit vaultPath.`
        : "";
    throw new Error(`Failed to read config at ${path}: ${(err as Error).message}${hint}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripComments(raw));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${(err as Error).message}`);
  }

  // Strip `_`-prefixed keys so users can use them as inline comments.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of Object.keys(parsed)) {
      if (key.startsWith("_")) delete (parsed as Record<string, unknown>)[key];
    }
  }

  const cfg = FileConfigSchema.parse(parsed);

  if (!isAbsolute(cfg.vaultPath)) {
    throw new Error(`vaultPath must be absolute, got: ${cfg.vaultPath}`);
  }

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(cfg.vaultPath);
  } catch (err) {
    throw new Error(
      `vaultPath does not exist or is unreadable: ${cfg.vaultPath} (${(err as Error).message})`,
    );
  }
  if (!stat.isDirectory()) {
    throw new Error(`vaultPath is not a directory: ${cfg.vaultPath}`);
  }

  // Environment variable overrides (useful for containers/CI).
  const env = process.env;
  const server = {
    ...cfg.server,
    host: env.HOST ?? cfg.server.host,
    port: env.PORT ? Number(env.PORT) : cfg.server.port,
    authToken: env.MCP_AUTH_TOKEN?.trim() || cfg.server.authToken,
    trustProxy: env.TRUST_PROXY
      ? env.TRUST_PROXY.toLowerCase() === "true"
      : cfg.server.trustProxy,
  };

  return {
    ...cfg,
    vaultPath: resolve(cfg.vaultPath),
    server,
    name: "obsidian-mcp-server",
    version: "0.1.0",
  };
}

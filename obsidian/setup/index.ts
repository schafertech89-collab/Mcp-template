/**
 * Local setup wizard server. Serves wizard.html on 127.0.0.1 and exposes
 * a small JSON API that validates input, saves config.json, and runs a
 * smoke test against the real MCP server.
 *
 * Launch with: npm run setup
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { promises as fs } from "node:fs";
import { statSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const OBSIDIAN_ROOT = resolve(HERE, "..");
const DEFAULT_CONFIG_PATH = resolve(OBSIDIAN_ROOT, "config.json");
const WIZARD_HTML = resolve(HERE, "wizard.html");

function isLoopback(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function countMarkdown(dir: string): Promise<number> {
  let total = 0;
  const walk = async (d: string, depth: number) => {
    if (depth > 6 || total > 5000) return;
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".obsidian") continue;
      const abs = join(d, e.name);
      if (e.isDirectory()) await walk(abs, depth + 1);
      else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) total += 1;
      if (total > 5000) return;
    }
  };
  await walk(dir, 0);
  return total;
}

async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const srv = createNetServer();
    srv.once("error", () => resolvePromise(false));
    srv.once("listening", () => {
      srv.close(() => resolvePromise(true));
    });
    srv.listen(port, "127.0.0.1");
  });
}

async function detectTool(name: string): Promise<boolean> {
  const cmd = process.platform === "win32" ? "where" : "which";
  return new Promise((resolvePromise) => {
    const p = spawn(cmd, [name], { stdio: "ignore", shell: false });
    p.on("error", () => resolvePromise(false));
    p.on("exit", (code) => resolvePromise(code === 0));
  });
}

interface ServerCfg {
  host: string;
  port: number;
  mcpPath: string;
  authToken: string;
  allowedOrigins: string[];
  trustProxy: boolean;
}

interface VaultCfg {
  vaultPath: string;
  readOnly: boolean;
  allowDelete: boolean;
  dailyNotesFolder: string;
  dailyNoteDateFormat: string;
  exclude: string[];
  maxFileBytes: number;
  maxSearchResults: number;
  defaultExtension: string;
  server: ServerCfg;
}

function defaultConfig(): VaultCfg {
  return {
    vaultPath: "",
    readOnly: false,
    allowDelete: false,
    dailyNotesFolder: "Daily",
    dailyNoteDateFormat: "YYYY-MM-DD",
    exclude: [".obsidian", ".trash", ".git"],
    maxFileBytes: 1_048_576,
    maxSearchResults: 50,
    defaultExtension: ".md",
    server: {
      host: "127.0.0.1",
      port: 3737,
      mcpPath: "/mcp",
      authToken: "",
      allowedOrigins: ["*"],
      trustProxy: false,
    },
  };
}

function parseRpcResponse(text: string): any {
  // Streamable HTTP returns JSON when MCP_ENABLE_JSON_RESPONSE is true,
  // otherwise SSE frames where each event payload is `data: <json>`.
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }
  for (const line of trimmed.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      try { return JSON.parse(line.slice(5).trim()); } catch {}
    }
  }
  return null;
}

async function runMcpSmokeTest(port: number, authToken: string): Promise<{
  ok: boolean;
  tools?: string[];
  error?: string;
}> {
  const base = `http://127.0.0.1:${port}/mcp`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  try {
    const initRes = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "setup-wizard", version: "0" },
        },
      }),
    });
    if (!initRes.ok) {
      return { ok: false, error: `initialize returned ${initRes.status}` };
    }
    const initPayload = parseRpcResponse(await initRes.text());
    if (!initPayload?.result?.protocolVersion) {
      return { ok: false, error: "initialize did not return a protocol version" };
    }

    const listRes = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    const listText = await listRes.text();
    const payload = parseRpcResponse(listText);
    const tools = payload?.result?.tools;
    if (!Array.isArray(tools)) {
      return { ok: false, error: "tools/list did not return a tools array" };
    }
    return {
      ok: true,
      tools: tools.map((t: { name: string }) => t.name),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

function spawnMcpServer(configPath: string): {
  child: ReturnType<typeof spawn>;
  stop: () => Promise<void>;
} {
  const distEntry = resolve(OBSIDIAN_ROOT, "dist", "index.js");
  const srcEntry = resolve(OBSIDIAN_ROOT, "src", "index.ts");

  let command: string;
  let args: string[];
  try {
    statSync(distEntry);
    command = process.execPath;
    args = [distEntry];
  } catch {
    // Fallback to tsx for dev mode.
    command = process.execPath;
    args = [resolve(OBSIDIAN_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), srcEntry];
  }

  const child = spawn(command, args, {
    cwd: OBSIDIAN_ROOT,
    env: { ...process.env, OBSIDIAN_CONFIG_PATH: configPath },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stop = (): Promise<void> =>
    new Promise((resolvePromise) => {
      if (child.exitCode !== null) return resolvePromise();
      child.once("exit", () => resolvePromise());
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 3000);
    });

  return { child, stop };
}

async function waitForHealth(port: number, timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  // Block requests from anywhere but loopback, as a defence-in-depth
  // guard even though we bind to 127.0.0.1.
  app.use((req, res, next) => {
    const ip = req.socket.remoteAddress ?? "";
    if (!isLoopback(ip)) {
      res.status(403).json({ error: "loopback only" });
      return;
    }
    next();
  });

  app.get("/", async (_req, res) => {
    try {
      const html = await fs.readFile(WIZARD_HTML, "utf8");
      res.type("html").send(html);
    } catch (err) {
      res.status(500).send(`Failed to read wizard.html: ${(err as Error).message}`);
    }
  });

  app.get("/api/state", async (_req, res) => {
    const existing = await readJson<VaultCfg>(DEFAULT_CONFIG_PATH);
    const [cloudflared, ngrok] = await Promise.all([
      detectTool("cloudflared"),
      detectTool("ngrok"),
    ]);
    res.json({
      platform: process.platform,
      nodeVersion: process.version,
      configPath: DEFAULT_CONFIG_PATH,
      obsidianRoot: OBSIDIAN_ROOT,
      existing,
      defaults: defaultConfig(),
      tools: { cloudflared, ngrok },
    });
  });

  app.post("/api/validate-vault", async (req: Request, res: Response) => {
    const path = String(req.body?.vaultPath ?? "");
    if (!path) return res.json({ valid: false, error: "path is required" });
    if (!isAbsolute(path)) {
      return res.json({
        valid: false,
        error:
          "Path must be absolute. On Windows this looks like C:\\Users\\You\\Documents\\Vault",
      });
    }
    try {
      const st = await fs.stat(path);
      if (!st.isDirectory()) {
        return res.json({ valid: false, error: "Path is not a directory." });
      }
    } catch (err) {
      return res.json({
        valid: false,
        error: `Path not found: ${(err as Error).message}`,
      });
    }

    let hasObsidianFolder = false;
    try {
      const st = await fs.stat(join(path, ".obsidian"));
      hasObsidianFolder = st.isDirectory();
    } catch {}

    const noteCount = await countMarkdown(path);
    res.json({
      valid: true,
      hasObsidianFolder,
      noteCount,
      warning:
        !hasObsidianFolder && noteCount === 0
          ? "No .obsidian folder and no markdown files found — double-check the path."
          : !hasObsidianFolder
          ? "No .obsidian folder found. Did you pick a parent folder instead of the vault root?"
          : null,
    });
  });

  app.post("/api/check-port", async (req, res) => {
    const port = Number(req.body?.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return res.json({ free: false, error: "Invalid port" });
    }
    res.json({ free: await isPortFree(port) });
  });

  app.post("/api/gen-token", (_req, res) => {
    res.json({ token: randomBytes(32).toString("hex") });
  });

  app.post("/api/save-config", async (req, res) => {
    const cfg = req.body as VaultCfg;
    if (!cfg?.vaultPath || !isAbsolute(cfg.vaultPath)) {
      return res.status(400).json({ error: "vaultPath must be an absolute path" });
    }
    const out = JSON.stringify(cfg, null, 2) + "\n";
    await fs.writeFile(DEFAULT_CONFIG_PATH, out, "utf8");
    res.json({ saved: true, path: DEFAULT_CONFIG_PATH });
  });

  // Runs the MCP server briefly against the saved config and checks the
  // initialize + tools/list handshake. Returns the detected tool names.
  app.post("/api/test-server", async (_req, res) => {
    const cfg = await readJson<VaultCfg>(DEFAULT_CONFIG_PATH);
    if (!cfg) return res.status(400).json({ ok: false, error: "config.json not found. Save first." });

    const free = await isPortFree(cfg.server.port);
    if (!free) {
      return res.json({
        ok: false,
        error: `Port ${cfg.server.port} is already in use. Stop the other process or pick a new port.`,
      });
    }

    const { stop } = spawnMcpServer(DEFAULT_CONFIG_PATH);
    try {
      const healthy = await waitForHealth(cfg.server.port);
      if (!healthy) {
        return res.json({ ok: false, error: "Server did not respond to /health within 8s." });
      }
      const result = await runMcpSmokeTest(cfg.server.port, cfg.server.authToken);
      res.json(result);
    } finally {
      await stop();
    }
  });

  const server = createHttpServer(app);
  await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://127.0.0.1:${port}/`;

  console.log("\nObsidian MCP Setup Wizard");
  console.log(`  Opening: ${url}`);
  console.log("  Press Ctrl+C to exit when you're done.\n");

  // Try to open the default browser. Don't crash the wizard if the
  // opener is missing (e.g. headless Linux) — the user can just visit
  // the URL we printed above.
  const openers: Record<string, [string, string[]]> = {
    win32: ["cmd", ["/c", "start", '""', url]],
    darwin: ["open", [url]],
    linux: ["xdg-open", [url]],
  };
  const opener = openers[process.platform] ?? openers.linux;
  try {
    const child = spawn(opener[0], opener[1], { stdio: "ignore", detached: true, shell: false });
    child.on("error", () => {
      console.log("(could not auto-open the browser; please open the URL above manually)");
    });
    child.unref();
  } catch {
    console.log("(could not auto-open the browser; please open the URL above manually)");
  }

  process.on("SIGINT", () => {
    console.log("\nShutting down wizard...");
    server.close(() => process.exit(0));
  });
}

main().catch((err) => {
  console.error("Wizard failed to start:", err);
  process.exit(1);
});

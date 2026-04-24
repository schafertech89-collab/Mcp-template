import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, type Config } from "./config.js";
import { createMcpServer } from "./server.js";

const SESSION_HEADER = "mcp-session-id";

function setCors(res: Response, config: Config, origin: string | undefined): void {
  const allowed = config.server.allowedOrigins;
  const allow =
    allowed.includes("*") || (origin && allowed.includes(origin))
      ? origin ?? "*"
      : allowed[0] ?? "*";
  res.setHeader("access-control-allow-origin", allow);
  res.setHeader("vary", "origin");
  res.setHeader(
    "access-control-allow-headers",
    "content-type, authorization, mcp-session-id, mcp-protocol-version, last-event-id",
  );
  res.setHeader("access-control-expose-headers", "mcp-session-id");
  res.setHeader("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("access-control-max-age", "86400");
}

function requireAuth(config: Config) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = config.server.authToken;
    if (!token) return next();
    const header = req.header("authorization") ?? "";
    const got = header.replace(/^Bearer\s+/i, "").trim();
    if (got !== token) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  };
}

interface Session {
  transport: StreamableHTTPServerTransport;
  cleanup: () => Promise<void>;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = express();
  if (config.server.trustProxy) app.set("trust proxy", true);
  app.use(express.json({ limit: "4mb" }));

  app.use((req, res, next) => {
    setCors(res, config, req.header("origin") ?? undefined);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      name: config.name,
      version: config.version,
      vault: config.vaultPath,
      readOnly: config.readOnly,
    });
  });

  const sessions = new Map<string, Session>();

  async function createSession(): Promise<Session> {
    const server = createMcpServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: config.server.stateless ? undefined : () => randomUUID(),
      enableJsonResponse: config.server.enableJsonResponse,
      onsessioninitialized: (id) => {
        if (config.server.stateless) return;
        sessions.set(id, session);
      },
    });

    const session: Session = {
      transport,
      cleanup: async () => {
        try { await transport.close(); } catch {}
        try { await server.close(); } catch {}
      },
    };

    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) sessions.delete(id);
    };

    await server.connect(transport);
    return session;
  }

  const mcpRouter = express.Router();
  mcpRouter.use(requireAuth(config));

  mcpRouter.post("/", async (req: Request, res: Response) => {
    try {
      const sessionId = req.header(SESSION_HEADER);

      if (config.server.stateless) {
        const session = await createSession();
        res.on("close", () => { void session.cleanup(); });
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      let session = sessionId ? sessions.get(sessionId) : undefined;
      if (!session) {
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Missing or invalid session. Send an 'initialize' request first.",
            },
            id: null,
          });
          return;
        }
        session = await createSession();
      }
      await session.transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("POST /mcp error", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  const sessionHandler = async (req: Request, res: Response) => {
    if (config.server.stateless) {
      res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed in stateless mode" },
        id: null,
      });
      return;
    }
    const sessionId = req.header(SESSION_HEADER);
    const session = sessionId ? sessions.get(sessionId) : undefined;
    if (!session) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return;
    }
    await session.transport.handleRequest(req, res);
  };
  mcpRouter.get("/", sessionHandler);
  mcpRouter.delete("/", sessionHandler);

  app.use(config.server.mcpPath, mcpRouter);

  const httpServer = app.listen(config.server.port, config.server.host, () => {
    const authHint = config.server.authToken ? " (auth: Bearer token required)" : "";
    const ro = config.readOnly ? " [read-only]" : "";
    console.log(
      `Obsidian MCP server listening on http://${config.server.host}:${config.server.port}${config.server.mcpPath}${authHint}${ro}`,
    );
    console.log(`  vault: ${config.vaultPath}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    httpServer.close();
    await Promise.allSettled([...sessions.values()].map((s) => s.cleanup()));
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error", err);
  process.exit(1);
});

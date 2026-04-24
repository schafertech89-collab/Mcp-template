import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, type ServerConfig } from "./config.js";
import { createMcpServer } from "./server.js";

const SESSION_HEADER = "mcp-session-id";

function setCors(res: Response, config: ServerConfig, origin: string | undefined): void {
  const allow =
    config.allowedOrigins.includes("*") || (origin && config.allowedOrigins.includes(origin))
      ? origin ?? "*"
      : config.allowedOrigins[0] ?? "*";

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

function requireAuth(config: ServerConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.authToken) return next();
    const header = req.header("authorization") ?? "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (token !== config.authToken) {
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
    res.json({ status: "ok", name: config.name, version: config.version });
  });

  const sessions = new Map<string, Session>();

  async function createSession(sessionIdOverride?: string): Promise<Session> {
    const server = createMcpServer(config);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: config.stateless
        ? undefined
        : () => sessionIdOverride ?? randomUUID(),
      enableJsonResponse: config.enableJsonResponse,
      onsessioninitialized: (id) => {
        if (config.stateless) return;
        sessions.set(id, session);
      },
    });

    const session: Session = {
      transport,
      cleanup: async () => {
        try {
          await transport.close();
        } catch {
          // ignore
        }
        try {
          await server.close();
        } catch {
          // ignore
        }
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

      if (config.stateless) {
        const session = await createSession();
        res.on("close", () => {
          void session.cleanup();
        });
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
    if (config.stateless) {
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

  app.use(config.mcpPath, mcpRouter);

  const httpServer = app.listen(config.port, config.host, () => {
    const authHint = config.authToken ? " (auth: Bearer token required)" : "";
    const mode = config.stateless ? "stateless" : "stateful";
    console.log(
      `MCP server '${config.name}' v${config.version} listening on http://${config.host}:${config.port}${config.mcpPath} [${mode}]${authHint}`,
    );
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

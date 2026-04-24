import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tools } from "./tools/index.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import type { ServerConfig } from "./config.js";

export function createMcpServer(config: ServerConfig): McpServer {
  const server = new McpServer(
    {
      name: config.name,
      version: config.version,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title ?? tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
      },
      async (args: unknown) => {
        const parsed = tool.inputSchema.parse(args);
        return tool.handler(parsed);
      },
    );
  }

  registerResources(server);
  registerPrompts(server);

  return server;
}

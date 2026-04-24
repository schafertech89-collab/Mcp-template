import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Config } from "./config.js";
import { tools } from "./tools/index.js";
import { Vault, VaultError } from "./vault.js";

export function createMcpServer(config: Config): McpServer {
  const vault = new Vault(config);

  const server = new McpServer(
    { name: config.name, version: config.version },
    {
      capabilities: {
        tools: {},
        resources: {},
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
        try {
          const parsed = tool.inputSchema.parse(args);
          return await tool.handler(parsed, { vault });
        } catch (err) {
          if (err instanceof VaultError) {
            const errorResult: CallToolResult = {
              content: [{ type: "text", text: `Error (${err.code}): ${err.message}` }],
              isError: true,
            };
            return errorResult;
          }
          throw err;
        }
      },
    );
  }

  // Resource: expose vault info
  server.registerResource(
    "vault-info",
    "obsidian://vault/info",
    {
      title: "Vault Info",
      description: "Summary of the connected Obsidian vault.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              vaultPath: config.vaultPath,
              readOnly: config.readOnly,
              allowDelete: config.allowDelete,
              dailyNotesFolder: config.dailyNotesFolder,
              exclude: config.exclude,
            },
            null,
            2,
          ),
        },
      ],
    }),
  );

  return server;
}

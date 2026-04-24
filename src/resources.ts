import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerResources(server: McpServer): void {
  server.registerResource(
    "server-info",
    "info://server",
    {
      title: "Server Info",
      description: "Static information describing this MCP server.",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              name: "mcp-streamable-http-template",
              transport: "streamable-http",
              docs: "https://modelcontextprotocol.io/docs/concepts/transports",
            },
            null,
            2,
          ),
        },
      ],
    }),
  );
}

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Any logging must go to stderr; stdout is the JSON-RPC channel.
  console.error(
    `MCP server '${config.name}' v${config.version} ready on stdio`,
  );
}

main().catch((err) => {
  console.error("Fatal stdio startup error", err);
  process.exit(1);
});

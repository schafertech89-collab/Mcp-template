import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `Obsidian MCP server ready on stdio [vault=${config.vaultPath}]${config.readOnly ? " [read-only]" : ""}`,
  );
}

main().catch((err) => {
  console.error("Fatal stdio startup error", err);
  process.exit(1);
});

/**
 * Minimal Streamable HTTP MCP client. Connects to a running server,
 * runs initialize/tools.list/tools.call, and prints results. Useful as a
 * quick smoke test.
 *
 * Usage:
 *   tsx scripts/test-client.ts [url] [tool] [jsonArgs]
 *
 * Examples:
 *   tsx scripts/test-client.ts
 *   tsx scripts/test-client.ts http://localhost:3000/mcp echo '{"message":"hi"}'
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const url = process.argv[2] ?? "http://localhost:3000/mcp";
  const toolName = process.argv[3];
  const toolArgs = process.argv[4] ? JSON.parse(process.argv[4]) : {};

  const authToken = process.env.MCP_AUTH_TOKEN?.trim();
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: authToken
      ? { headers: { authorization: `Bearer ${authToken}` } }
      : undefined,
  });

  const client = new Client({ name: "mcp-template-test-client", version: "0.1.0" });
  await client.connect(transport);

  const { tools } = await client.listTools();
  console.log(`Connected. Tools (${tools.length}):`);
  for (const t of tools) {
    console.log(`  - ${t.name}: ${t.description}`);
  }

  if (toolName) {
    console.log(`\nCalling '${toolName}' with`, toolArgs);
    const result = await client.callTool({ name: toolName, arguments: toolArgs });
    console.log("Result:", JSON.stringify(result, null, 2));
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import type { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ToolDefinition<Schema extends z.ZodObject<z.ZodRawShape>> {
  name: string;
  title?: string;
  description: string;
  inputSchema: Schema;
  handler: (args: z.infer<Schema>) => Promise<CallToolResult> | CallToolResult;
}

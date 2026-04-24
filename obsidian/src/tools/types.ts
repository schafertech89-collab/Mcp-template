import type { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Vault } from "../vault.js";

export interface ToolDefinition<Schema extends z.ZodObject<z.ZodRawShape>> {
  name: string;
  title?: string;
  description: string;
  inputSchema: Schema;
  handler: (
    args: z.infer<Schema>,
    ctx: { vault: Vault },
  ) => Promise<CallToolResult> | CallToolResult;
}

export function textResult(payload: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const EchoInput = z.object({
  message: z.string().describe("The message to echo back."),
});

export const echoTool: ToolDefinition<typeof EchoInput> = {
  name: "echo",
  title: "Echo",
  description: "Returns the provided message verbatim. Useful as a connectivity test.",
  inputSchema: EchoInput,
  handler: async ({ message }) => ({
    content: [{ type: "text", text: message }],
  }),
};

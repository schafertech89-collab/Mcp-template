import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "summarize",
    {
      title: "Summarize Text",
      description: "Builds a prompt asking the model to summarize the provided text.",
      argsSchema: {
        text: z.string().describe("The text to summarize."),
        style: z
          .enum(["short", "bullet", "detailed"])
          .optional()
          .describe("Summary style."),
      },
    },
    ({ text, style }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Summarize the following text in a ${style ?? "short"} style.\n\n---\n${text}`,
          },
        },
      ],
    }),
  );
}

import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  query: z.string().min(1).describe("Case-insensitive substring to search for across note bodies."),
  folder: z.string().optional().describe("Optional folder to scope the search to."),
  limit: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe("Maximum hits to return (default from config.maxSearchResults)."),
});

export const search: ToolDefinition<typeof Input> = {
  name: "vault_search",
  title: "Search Vault",
  description: "Full-text substring search across all notes. Returns path + line number + preview.",
  inputSchema: Input,
  handler: async ({ query, folder, limit }, { vault }) => {
    const hits = await vault.search(query, { folder, limit });
    return textResult({ query, count: hits.length, hits });
  },
};

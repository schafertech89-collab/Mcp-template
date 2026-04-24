import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  folder: z.string().optional().describe("Optional vault-relative folder path to scope the listing."),
  extensions: z
    .array(z.string())
    .optional()
    .describe("File extensions to include (default: ['.md', '.markdown'])."),
  limit: z.number().int().positive().max(5000).default(500).describe("Max results."),
});

export const listNotes: ToolDefinition<typeof Input> = {
  name: "vault_list_notes",
  title: "List Notes",
  description: "List notes in the Obsidian vault, optionally scoped to a folder.",
  inputSchema: Input,
  handler: async ({ folder, extensions, limit }, { vault }) => {
    const notes = await vault.listNotes({ folder, extensions, limit });
    return textResult({ count: notes.length, notes });
  },
};

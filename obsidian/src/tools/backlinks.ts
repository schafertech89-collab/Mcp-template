import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  path: z.string().describe("Vault-relative note path whose backlinks you want."),
});

export const backlinks: ToolDefinition<typeof Input> = {
  name: "vault_backlinks",
  title: "Backlinks",
  description: "Find all notes that reference the target note via [[wikilinks]].",
  inputSchema: Input,
  handler: async ({ path }, { vault }) => {
    const hits = await vault.backlinks(path);
    return textResult({ target: path, count: hits.length, hits });
  },
};

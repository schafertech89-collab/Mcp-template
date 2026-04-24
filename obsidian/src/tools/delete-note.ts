import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  path: z.string().describe("Vault-relative note path."),
});

export const deleteNote: ToolDefinition<typeof Input> = {
  name: "vault_delete_note",
  title: "Delete Note",
  description:
    "Delete a note from the vault. Requires allowDelete=true in the config (disabled by default).",
  inputSchema: Input,
  handler: async ({ path }, { vault }) => {
    const out = await vault.deleteNote(path);
    return textResult({ deleted: out.path });
  },
};

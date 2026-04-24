import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  from: z.string().describe("Current vault-relative note path."),
  to: z.string().describe("New vault-relative note path. Parent folders will be created."),
});

export const renameNote: ToolDefinition<typeof Input> = {
  name: "vault_rename_note",
  title: "Rename Note",
  description: "Move or rename a note inside the vault. Fails if the destination already exists.",
  inputSchema: Input,
  handler: async ({ from, to }, { vault }) => {
    const out = await vault.renameNote(from, to);
    return textResult({ renamed: out });
  },
};

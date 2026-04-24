import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  path: z.string().describe("Vault-relative note path."),
  content: z.string().describe("Text to append, prepend, or replace the note with."),
  mode: z
    .enum(["append", "prepend", "replace"])
    .default("append")
    .describe("How to combine content with the existing note."),
});

export const updateNote: ToolDefinition<typeof Input> = {
  name: "vault_update_note",
  title: "Update Note",
  description:
    "Modify an existing note. Supports append, prepend, and replace. Replace mode will create the note if missing.",
  inputSchema: Input,
  handler: async ({ path, content, mode }, { vault }) => {
    const note = await vault.updateNote(path, content, mode);
    const { raw, ...rest } = note;
    return textResult({ updated: rest, mode });
  },
};

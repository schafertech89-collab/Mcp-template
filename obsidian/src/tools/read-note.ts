import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  path: z.string().describe("Vault-relative note path (e.g. 'Projects/Ideas.md')."),
  includeRaw: z
    .boolean()
    .default(false)
    .describe("If true, include the raw file including frontmatter. Default: body only."),
});

export const readNote: ToolDefinition<typeof Input> = {
  name: "vault_read_note",
  title: "Read Note",
  description:
    "Read a note from the vault. Returns parsed frontmatter + body, plus the raw file when requested.",
  inputSchema: Input,
  handler: async ({ path, includeRaw }, { vault }) => {
    const note = await vault.readNote(path);
    const { raw, ...rest } = note;
    return textResult(includeRaw ? { ...rest, raw } : rest);
  },
};

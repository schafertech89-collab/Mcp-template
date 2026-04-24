import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  path: z.string().describe("Vault-relative path for the new note."),
  content: z.string().describe("Markdown body of the note."),
  frontmatter: z
    .record(z.any())
    .optional()
    .describe("Optional YAML frontmatter as a JSON object."),
  overwrite: z
    .boolean()
    .default(false)
    .describe("If true, replace any existing note at this path."),
});

export const createNote: ToolDefinition<typeof Input> = {
  name: "vault_create_note",
  title: "Create Note",
  description:
    "Create a new note in the vault. Parent folders are created automatically. Refuses to overwrite unless overwrite=true.",
  inputSchema: Input,
  handler: async ({ path, content, frontmatter, overwrite }, { vault }) => {
    const note = await vault.createNote(path, content, { overwrite, frontmatter });
    const { raw, ...rest } = note;
    return textResult({ created: rest });
  },
};

import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  path: z.string().describe("Vault-relative note path."),
});

export const metadata: ToolDefinition<typeof Input> = {
  name: "vault_note_metadata",
  title: "Note Metadata",
  description:
    "Return a note's frontmatter, tags (frontmatter + inline #tags), wikilinks [[...]] and markdown links.",
  inputSchema: Input,
  handler: async ({ path }, { vault }) => textResult(await vault.metadata(path)),
};

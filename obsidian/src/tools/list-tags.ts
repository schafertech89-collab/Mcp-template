import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({});

export const listTags: ToolDefinition<typeof Input> = {
  name: "vault_list_tags",
  title: "List Tags",
  description:
    "List every tag used in the vault with its usage count. Combines YAML frontmatter tags and inline #tags.",
  inputSchema: Input,
  handler: async (_args, { vault }) => {
    const tags = await vault.listTags();
    return textResult({ count: tags.length, tags });
  },
};

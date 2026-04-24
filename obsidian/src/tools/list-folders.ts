import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  folder: z.string().optional().describe("Optional parent folder to scope the listing to."),
});

export const listFolders: ToolDefinition<typeof Input> = {
  name: "vault_list_folders",
  title: "List Folders",
  description: "List folders inside the vault, recursively.",
  inputSchema: Input,
  handler: async ({ folder }, { vault }) => {
    const folders = await vault.listFolders(folder);
    return textResult({ count: folders.length, folders });
  },
};

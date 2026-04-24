import { z } from "zod";
import { textResult, type ToolDefinition } from "./types.js";

const Input = z.object({
  date: z
    .string()
    .optional()
    .describe("ISO date (e.g. '2026-04-24'). Defaults to today."),
});

export const dailyNote: ToolDefinition<typeof Input> = {
  name: "vault_daily_note",
  title: "Daily Note",
  description:
    "Fetch the daily note for the given date (default today). Creates it from a template if it doesn't exist (unless read-only).",
  inputSchema: Input,
  handler: async ({ date }, { vault }) => {
    const note = await vault.dailyNote(date);
    const { raw, ...rest } = note;
    return textResult(rest);
  },
};

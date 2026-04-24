import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const Input = z.object({
  timezone: z
    .string()
    .optional()
    .describe(
      "IANA time zone name (e.g. 'America/New_York'). Defaults to UTC.",
    ),
});

export const currentTimeTool: ToolDefinition<typeof Input> = {
  name: "current_time",
  title: "Current Time",
  description:
    "Returns the current date and time, optionally formatted for a specific IANA time zone.",
  inputSchema: Input,
  handler: async ({ timezone }) => {
    const tz = timezone ?? "UTC";
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "long",
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              iso: now.toISOString(),
              unix: Math.floor(now.getTime() / 1000),
              timezone: tz,
              formatted: formatter.format(now),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
};

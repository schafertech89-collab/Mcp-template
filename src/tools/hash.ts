import { createHash } from "node:crypto";
import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const Input = z.object({
  input: z.string().describe("The text to hash."),
  algorithm: z
    .enum(["sha256", "sha1", "md5", "sha512"])
    .default("sha256")
    .describe("Hash algorithm to use."),
});

export const hashTool: ToolDefinition<typeof Input> = {
  name: "hash",
  title: "Hash",
  description:
    "Computes a hex-encoded cryptographic digest of the input string.",
  inputSchema: Input,
  handler: async ({ input, algorithm }) => {
    const digest = createHash(algorithm).update(input).digest("hex");
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ algorithm, digest }, null, 2),
        },
      ],
    };
  },
};

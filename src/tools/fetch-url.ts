import { z } from "zod";
import type { ToolDefinition } from "./types.js";

const FetchInput = z.object({
  url: z.string().url().describe("Absolute HTTP(S) URL to fetch."),
  method: z
    .enum(["GET", "HEAD"])
    .default("GET")
    .describe("HTTP method. Only safe, read-only methods are allowed."),
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(1_000_000)
    .default(200_000)
    .describe("Maximum bytes to read from the response body."),
});

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254",
]);

function isPrivateHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true;
  if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return true;
  return false;
}

export const fetchUrlTool: ToolDefinition<typeof FetchInput> = {
  name: "fetch_url",
  title: "Fetch URL",
  description:
    "Fetches a public HTTP(S) URL and returns the response body as text. Private/loopback addresses are blocked to prevent SSRF.",
  inputSchema: FetchInput,
  handler: async ({ url, method, maxBytes }) => {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`Unsupported protocol: ${parsed.protocol}`);
    }
    if (isPrivateHost(parsed.hostname)) {
      throw new Error(`Refusing to fetch private/internal host: ${parsed.hostname}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(parsed, {
        method,
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": "mcp-streamable-http-template/0.1" },
      });

      const contentType = response.headers.get("content-type") ?? "";
      const reader = response.body?.getReader();
      let received = 0;
      const chunks: Uint8Array[] = [];

      if (reader) {
        while (received < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          chunks.push(value);
        }
        await reader.cancel().catch(() => {});
      }

      const body = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
      const truncated = received >= maxBytes;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: response.status,
                contentType,
                bytes: received,
                truncated,
                body: method === "HEAD" ? "" : body,
              },
              null,
              2,
            ),
          },
        ],
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};

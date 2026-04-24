import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { echoTool } from "../src/tools/echo.js";
import { currentTimeTool } from "../src/tools/current-time.js";
import { hashTool } from "../src/tools/hash.js";
import { fetchUrlTool } from "../src/tools/fetch-url.js";

function textFrom(result: { content: Array<{ type: string; text?: string }> }): string {
  const first = result.content[0];
  assert.equal(first.type, "text");
  return first.text ?? "";
}

describe("echo tool", () => {
  it("returns the input message verbatim", async () => {
    const out = await echoTool.handler({ message: "hello" });
    assert.equal(textFrom(out), "hello");
  });

  it("rejects missing input via zod schema", () => {
    assert.throws(() => echoTool.inputSchema.parse({}));
  });
});

describe("current_time tool", () => {
  it("defaults to UTC when no timezone supplied", async () => {
    const out = await currentTimeTool.handler({});
    const parsed = JSON.parse(textFrom(out));
    assert.equal(parsed.timezone, "UTC");
    assert.ok(typeof parsed.iso === "string" && parsed.iso.endsWith("Z"));
    assert.ok(Number.isInteger(parsed.unix));
  });

  it("honours a provided IANA zone", async () => {
    const out = await currentTimeTool.handler({ timezone: "America/New_York" });
    const parsed = JSON.parse(textFrom(out));
    assert.equal(parsed.timezone, "America/New_York");
  });
});

describe("hash tool", () => {
  it("computes sha256 by default", async () => {
    const out = await hashTool.handler({ input: "hello", algorithm: "sha256" });
    const parsed = JSON.parse(textFrom(out));
    assert.equal(parsed.algorithm, "sha256");
    assert.equal(
      parsed.digest,
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("supports md5", async () => {
    const out = await hashTool.handler({ input: "hello", algorithm: "md5" });
    const parsed = JSON.parse(textFrom(out));
    assert.equal(parsed.digest, "5d41402abc4b2a76b9719d911017c592");
  });
});

async function runFetch(url: string): Promise<void> {
  await fetchUrlTool.handler({ url, method: "GET", maxBytes: 1000 });
}

describe("fetch_url tool (SSRF protection)", () => {
  it("refuses localhost", async () => {
    await assert.rejects(runFetch("http://localhost/"), /private\/internal host/i);
  });

  it("refuses 127.0.0.1", async () => {
    await assert.rejects(runFetch("http://127.0.0.1/"), /private\/internal host/i);
  });

  it("refuses RFC1918 10/8", async () => {
    await assert.rejects(runFetch("http://10.0.0.1/"), /private\/internal host/i);
  });

  it("refuses AWS metadata endpoint", async () => {
    await assert.rejects(
      runFetch("http://169.254.169.254/latest/meta-data"),
      /private\/internal host/i,
    );
  });

  it("rejects non-http protocols via zod schema", () => {
    assert.throws(() =>
      fetchUrlTool.inputSchema.parse({ url: "not-a-url", method: "GET", maxBytes: 1000 }),
    );
  });
});

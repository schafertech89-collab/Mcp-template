import { strict as assert } from "node:assert";
import { beforeEach, describe, it } from "node:test";
import { loadConfig } from "../src/config.js";

function clearEnv() {
  for (const key of [
    "PORT",
    "HOST",
    "MCP_PATH",
    "MCP_SERVER_NAME",
    "MCP_SERVER_VERSION",
    "MCP_STATELESS",
    "MCP_ENABLE_JSON_RESPONSE",
    "ALLOWED_ORIGINS",
    "MCP_AUTH_TOKEN",
  ]) {
    delete process.env[key];
  }
}

describe("loadConfig", () => {
  beforeEach(clearEnv);

  it("applies sensible defaults", () => {
    const cfg = loadConfig();
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.host, "0.0.0.0");
    assert.equal(cfg.mcpPath, "/mcp");
    assert.equal(cfg.stateless, true);
    assert.deepEqual(cfg.allowedOrigins, ["*"]);
    assert.equal(cfg.authToken, null);
  });

  it("reads stateless=false", () => {
    process.env.MCP_STATELESS = "false";
    assert.equal(loadConfig().stateless, false);
  });

  it("parses origin allowlist", () => {
    process.env.ALLOWED_ORIGINS = "https://a.com, https://b.com";
    assert.deepEqual(loadConfig().allowedOrigins, ["https://a.com", "https://b.com"]);
  });

  it("trims auth token and treats empty as null", () => {
    process.env.MCP_AUTH_TOKEN = "   ";
    assert.equal(loadConfig().authToken, null);

    process.env.MCP_AUTH_TOKEN = "  secret  ";
    assert.equal(loadConfig().authToken, "secret");
  });

  it("rejects invalid PORT", () => {
    process.env.PORT = "not-a-port";
    assert.throws(() => loadConfig(), /Invalid PORT/);
  });
});

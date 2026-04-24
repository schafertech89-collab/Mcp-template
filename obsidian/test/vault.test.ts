import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { Config } from "../src/config.js";
import { Vault, VaultError } from "../src/vault.js";

function makeConfig(vaultPath: string, overrides: Partial<Config> = {}): Config {
  return {
    vaultPath,
    readOnly: false,
    allowDelete: false,
    dailyNotesFolder: "Daily",
    dailyNoteDateFormat: "YYYY-MM-DD",
    exclude: [".obsidian", ".trash", ".git"],
    maxFileBytes: 1_048_576,
    maxSearchResults: 50,
    defaultExtension: ".md",
    server: {
      host: "127.0.0.1",
      port: 3737,
      mcpPath: "/mcp",
      authToken: "",
      allowedOrigins: ["*"],
      trustProxy: false,
      enableJsonResponse: false,
      stateless: true,
    },
    name: "test",
    version: "0",
    ...overrides,
  };
}

let dir: string;
let vault: Vault;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "obsidian-mcp-"));
  mkdirSync(join(dir, "Projects"));
  mkdirSync(join(dir, ".obsidian"));
  writeFileSync(
    join(dir, "Welcome.md"),
    "---\ntitle: Welcome\ntags: [intro, getting-started]\n---\n\n# Welcome\n\nSee [[Projects/Ideas]] and #intro.\n",
  );
  writeFileSync(
    join(dir, "Projects", "Ideas.md"),
    "# Ideas\n\n- Build an MCP server\n- Deploy to Perplexity\n\nRef: [[Welcome]]\n",
  );
  writeFileSync(join(dir, ".obsidian", "app.json"), "{}");
  vault = new Vault(makeConfig(dir));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("Vault path safety", () => {
  it("rejects absolute paths outside the vault", () => {
    assert.throws(() => vault.resolveInside("/etc/passwd"), /must be vault-relative/);
  });

  it("rejects ../ traversal", () => {
    assert.throws(() => vault.resolveInside("../../etc/passwd"), /escapes the vault/);
  });

  it("rejects empty paths", () => {
    assert.throws(() => vault.resolveInside(""), /required/);
  });

  it("accepts valid relative paths", () => {
    const abs = vault.resolveInside("Welcome.md");
    assert.ok(abs.endsWith("Welcome.md"));
  });

  it("normalises Windows-style backslashes", () => {
    const abs = vault.resolveInside("Projects\\Ideas.md");
    assert.ok(abs.endsWith("Ideas.md"));
  });
});

describe("Vault listing", () => {
  it("lists markdown notes and excludes .obsidian", async () => {
    const notes = await vault.listNotes();
    const paths = notes.map((n) => n.path).sort();
    assert.deepEqual(paths, ["Projects/Ideas.md", "Welcome.md"]);
  });

  it("lists folders excluding dot-dirs", async () => {
    const folders = await vault.listFolders();
    assert.deepEqual(folders, ["Projects"]);
  });
});

describe("Vault read/search/metadata", () => {
  it("reads a note with frontmatter", async () => {
    const note = await vault.readNote("Welcome.md");
    assert.equal(note.path, "Welcome.md");
    assert.equal((note.frontmatter as { title?: string }).title, "Welcome");
    assert.match(note.body, /# Welcome/);
  });

  it("auto-adds .md extension", async () => {
    const note = await vault.readNote("Welcome");
    assert.equal(note.path, "Welcome.md");
  });

  it("returns NOT_FOUND for missing notes", async () => {
    await assert.rejects(() => vault.readNote("Nope.md"), (err) => {
      return err instanceof VaultError && err.code === "NOT_FOUND";
    });
  });

  it("searches across notes", async () => {
    const hits = await vault.search("MCP");
    assert.ok(hits.length >= 1);
    assert.ok(hits.some((h) => h.path === "Projects/Ideas.md"));
  });

  it("extracts tags and wikilinks from metadata", async () => {
    const meta = await vault.metadata("Welcome.md");
    assert.ok(meta.tags.includes("intro"));
    assert.ok(meta.tags.includes("getting-started"));
    assert.deepEqual(meta.wikilinks, ["Projects/Ideas"]);
  });

  it("finds backlinks", async () => {
    const back = await vault.backlinks("Welcome");
    assert.ok(back.some((h) => h.path === "Projects/Ideas.md"));
  });

  it("aggregates tags across the vault", async () => {
    const tags = await vault.listTags();
    const names = tags.map((t) => t.tag);
    assert.ok(names.includes("intro"));
  });
});

describe("Vault writes", () => {
  it("creates a new note with frontmatter", async () => {
    const note = await vault.createNote("new/Fresh.md", "Body here", {
      frontmatter: { title: "Fresh", tags: ["auto"] },
    });
    assert.equal(note.path, "new/Fresh.md");
    assert.match(note.raw, /title: Fresh/);
    assert.match(note.raw, /Body here/);
  });

  it("refuses to overwrite without the flag", async () => {
    await assert.rejects(
      () => vault.createNote("Welcome.md", "nope"),
      (err) => err instanceof VaultError && err.code === "FORBIDDEN",
    );
  });

  it("appends to an existing note", async () => {
    const note = await vault.updateNote("Welcome.md", "## Extra\n", "append");
    assert.match(note.raw, /# Welcome[\s\S]+## Extra/);
  });

  it("renames a note", async () => {
    const out = await vault.renameNote("Welcome.md", "Archive/Old Welcome.md");
    assert.equal(out.to, "Archive/Old Welcome.md");
  });

  it("refuses delete when allowDelete=false", async () => {
    await assert.rejects(
      () => vault.deleteNote("Welcome.md"),
      (err) => err instanceof VaultError && err.code === "FORBIDDEN",
    );
  });

  it("deletes when allowDelete=true", async () => {
    const v = new Vault(makeConfig(dir, { allowDelete: true }));
    const out = await v.deleteNote("Welcome.md");
    assert.equal(out.path, "Welcome.md");
  });

  it("refuses writes when read-only", async () => {
    const v = new Vault(makeConfig(dir, { readOnly: true }));
    await assert.rejects(
      () => v.createNote("x.md", "y"),
      (err) => err instanceof VaultError && err.code === "READ_ONLY",
    );
  });
});

describe("Daily notes", () => {
  it("creates today's daily note on first access", async () => {
    const v = new Vault(makeConfig(dir, { dailyNotesFolder: "Daily" }));
    const note = await v.dailyNote("2026-04-24");
    assert.equal(note.path, "Daily/2026-04-24.md");
  });

  it("returns existing daily note without overwriting", async () => {
    const v = new Vault(makeConfig(dir));
    await v.dailyNote("2026-04-24");
    const second = await v.dailyNote("2026-04-24");
    assert.equal(second.path, "Daily/2026-04-24.md");
  });
});

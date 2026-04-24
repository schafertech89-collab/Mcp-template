import { promises as fs } from "node:fs";
import { constants } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import type { Config } from "./config.js";

export interface NoteSummary {
  path: string;
  bytes: number;
  modified: string;
}

export interface NoteContent {
  path: string;
  bytes: number;
  modified: string;
  frontmatter: Record<string, unknown>;
  body: string;
  raw: string;
}

export interface NoteMetadata {
  path: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  wikilinks: string[];
  mdlinks: string[];
}

export interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

export class VaultError extends Error {
  constructor(
    message: string,
    public code: "NOT_FOUND" | "OUTSIDE_VAULT" | "READ_ONLY" | "TOO_LARGE" | "FORBIDDEN" | "INVALID",
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export class Vault {
  constructor(private readonly config: Config) {}

  private get root(): string {
    return this.config.vaultPath;
  }

  /** Resolve a user-supplied relative path to an absolute path that MUST be inside the vault. */
  resolveInside(relPath: string, { addDefaultExt = false } = {}): string {
    if (!relPath || relPath.trim() === "") {
      throw new VaultError("path is required", "INVALID");
    }
    if (isAbsolute(relPath)) {
      throw new VaultError(
        `path must be vault-relative, not absolute: ${relPath}`,
        "OUTSIDE_VAULT",
      );
    }
    // Normalise Windows backslashes but keep the rest as-is.
    let r = relPath.replace(/\\/g, "/");
    if (addDefaultExt && extname(r) === "") {
      r = r + this.config.defaultExtension;
    }

    const absolute = resolve(this.root, r);
    const rootWithSep = this.root.endsWith(sep) ? this.root : this.root + sep;
    if (absolute !== this.root && !absolute.startsWith(rootWithSep)) {
      throw new VaultError(
        `path escapes the vault root: ${relPath}`,
        "OUTSIDE_VAULT",
      );
    }
    return absolute;
  }

  toRelative(absolute: string): string {
    return relative(this.root, absolute).split(sep).join("/");
  }

  private isExcluded(rel: string): boolean {
    const parts = rel.split("/");
    return this.config.exclude.some((ex) => parts.includes(ex));
  }

  async listNotes(options: {
    folder?: string;
    extensions?: string[];
    limit?: number;
  } = {}): Promise<NoteSummary[]> {
    const base = options.folder
      ? this.resolveInside(options.folder)
      : this.root;

    const exts = new Set(
      (options.extensions ?? [".md", ".markdown"]).map((e) =>
        e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`,
      ),
    );
    const limit = options.limit ?? 1000;

    const results: NoteSummary[] = [];
    await this.walk(base, async (abs) => {
      if (results.length >= limit) return false;
      const rel = this.toRelative(abs);
      if (this.isExcluded(rel)) return false;
      if (!exts.has(extname(abs).toLowerCase())) return true;
      const stat = await fs.stat(abs);
      if (!stat.isFile()) return true;
      results.push({
        path: rel,
        bytes: stat.size,
        modified: stat.mtime.toISOString(),
      });
      return true;
    });

    return results;
  }

  async listFolders(folder?: string): Promise<string[]> {
    const base = folder ? this.resolveInside(folder) : this.root;
    const results: string[] = [];
    await this.walk(base, async (abs, kind) => {
      if (kind !== "dir") return true;
      const rel = this.toRelative(abs);
      if (!rel) return true;
      if (this.isExcluded(rel)) return false;
      results.push(rel);
      return true;
    });
    return results.sort();
  }

  private async walk(
    base: string,
    visit: (abs: string, kind: "file" | "dir") => Promise<boolean> | boolean,
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(base, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new VaultError(`folder not found: ${this.toRelative(base)}`, "NOT_FOUND");
      }
      throw err;
    }

    for (const entry of entries) {
      const abs = join(base, entry.name);
      if (entry.isDirectory()) {
        const keep = await visit(abs, "dir");
        if (keep) await this.walk(abs, visit);
      } else if (entry.isFile()) {
        await visit(abs, "file");
      }
    }
  }

  async readNote(relPath: string): Promise<NoteContent> {
    const abs = this.resolveInside(relPath, { addDefaultExt: true });
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new VaultError(`note not found: ${relPath}`, "NOT_FOUND");
      }
      throw err;
    }
    if (!stat.isFile()) {
      throw new VaultError(`not a file: ${relPath}`, "INVALID");
    }
    if (stat.size > this.config.maxFileBytes) {
      throw new VaultError(
        `file exceeds maxFileBytes (${stat.size} > ${this.config.maxFileBytes})`,
        "TOO_LARGE",
      );
    }

    const raw = await fs.readFile(abs, "utf8");
    const parsed = matter(raw);
    return {
      path: this.toRelative(abs),
      bytes: stat.size,
      modified: stat.mtime.toISOString(),
      frontmatter: (parsed.data ?? {}) as Record<string, unknown>,
      body: parsed.content,
      raw,
    };
  }

  private assertWritable(): void {
    if (this.config.readOnly) {
      throw new VaultError("vault is configured read-only", "READ_ONLY");
    }
  }

  async createNote(
    relPath: string,
    body: string,
    options: { overwrite?: boolean; frontmatter?: Record<string, unknown> } = {},
  ): Promise<NoteContent> {
    this.assertWritable();
    const abs = this.resolveInside(relPath, { addDefaultExt: true });

    if (!options.overwrite) {
      try {
        await fs.access(abs, constants.F_OK);
        throw new VaultError(
          `note already exists: ${this.toRelative(abs)} (set overwrite=true to replace)`,
          "FORBIDDEN",
        );
      } catch (err) {
        if (!(err instanceof VaultError) && (err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
        if (err instanceof VaultError) throw err;
      }
    }

    await fs.mkdir(dirname(abs), { recursive: true });
    const content =
      options.frontmatter && Object.keys(options.frontmatter).length > 0
        ? matter.stringify(body, options.frontmatter)
        : body;
    await fs.writeFile(abs, content, "utf8");
    return this.readNote(this.toRelative(abs));
  }

  async updateNote(
    relPath: string,
    text: string,
    mode: "append" | "prepend" | "replace",
  ): Promise<NoteContent> {
    this.assertWritable();
    const abs = this.resolveInside(relPath, { addDefaultExt: true });

    let existing = "";
    try {
      existing = await fs.readFile(abs, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      if (mode === "replace") {
        await fs.mkdir(dirname(abs), { recursive: true });
      } else {
        throw new VaultError(`note not found: ${relPath}`, "NOT_FOUND");
      }
    }

    let next: string;
    if (mode === "replace") next = text;
    else if (mode === "append") next = existing.endsWith("\n") ? existing + text : existing + "\n" + text;
    else next = text + (text.endsWith("\n") ? "" : "\n") + existing;

    await fs.writeFile(abs, next, "utf8");
    return this.readNote(this.toRelative(abs));
  }

  async deleteNote(relPath: string): Promise<{ path: string }> {
    this.assertWritable();
    if (!this.config.allowDelete) {
      throw new VaultError("delete is disabled in config (set allowDelete=true)", "FORBIDDEN");
    }
    const abs = this.resolveInside(relPath, { addDefaultExt: true });
    try {
      await fs.unlink(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new VaultError(`note not found: ${relPath}`, "NOT_FOUND");
      }
      throw err;
    }
    return { path: this.toRelative(abs) };
  }

  async renameNote(fromRel: string, toRel: string): Promise<{ from: string; to: string }> {
    this.assertWritable();
    const from = this.resolveInside(fromRel, { addDefaultExt: true });
    const to = this.resolveInside(toRel, { addDefaultExt: true });
    try {
      await fs.stat(from);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new VaultError(`note not found: ${fromRel}`, "NOT_FOUND");
      }
      throw err;
    }
    await fs.mkdir(dirname(to), { recursive: true });
    try {
      await fs.access(to, constants.F_OK);
      throw new VaultError(`destination already exists: ${this.toRelative(to)}`, "FORBIDDEN");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        if (err instanceof VaultError) throw err;
        throw err;
      }
    }
    await fs.rename(from, to);
    return { from: this.toRelative(from), to: this.toRelative(to) };
  }

  async search(query: string, options: { folder?: string; limit?: number } = {}): Promise<SearchHit[]> {
    if (!query || query.trim() === "") {
      throw new VaultError("query is required", "INVALID");
    }
    const needle = query.toLowerCase();
    const notes = await this.listNotes({ folder: options.folder, limit: 10_000 });
    const hits: SearchHit[] = [];
    const limit = options.limit ?? this.config.maxSearchResults;

    for (const note of notes) {
      if (hits.length >= limit) break;
      const abs = this.resolveInside(note.path);
      const stat = await fs.stat(abs);
      if (stat.size > this.config.maxFileBytes) continue;
      const text = await fs.readFile(abs, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length && hits.length < limit; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(needle)) {
          hits.push({
            path: note.path,
            line: i + 1,
            preview: line.length > 240 ? line.slice(0, 237) + "..." : line,
          });
        }
      }
    }
    return hits;
  }

  async metadata(relPath: string): Promise<NoteMetadata> {
    const note = await this.readNote(relPath);
    const wikilinks = Array.from(
      note.body.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g),
      (m) => m[1].trim(),
    );
    const mdlinks = Array.from(
      note.body.matchAll(/(?<!\!)\[[^\]]*\]\(([^)]+)\)/g),
      (m) => m[1].trim(),
    );
    const inline = Array.from(
      note.body.matchAll(/(?:^|\s)#([A-Za-z0-9_\-/][A-Za-z0-9_\-/]*)/g),
      (m) => m[1],
    );
    const fmTags = Array.isArray(note.frontmatter.tags)
      ? (note.frontmatter.tags as unknown[]).map(String)
      : typeof note.frontmatter.tags === "string"
      ? [note.frontmatter.tags]
      : [];
    const tags = Array.from(new Set([...fmTags, ...inline]));
    return {
      path: note.path,
      frontmatter: note.frontmatter,
      tags,
      wikilinks: Array.from(new Set(wikilinks)),
      mdlinks: Array.from(new Set(mdlinks)),
    };
  }

  async backlinks(targetRel: string): Promise<Array<{ path: string; line: number; preview: string }>> {
    const abs = this.resolveInside(targetRel, { addDefaultExt: true });
    const baseName = abs.split(sep).pop()!.replace(/\.(md|markdown)$/i, "");
    const queries = [`[[${baseName}]]`, `[[${baseName}|`, `[[${baseName}#`];
    const hits = new Map<string, { path: string; line: number; preview: string }>();
    for (const q of queries) {
      const found = await this.search(q, { limit: 500 });
      for (const h of found) {
        const key = `${h.path}:${h.line}`;
        if (!hits.has(key)) hits.set(key, h);
      }
    }
    return Array.from(hits.values());
  }

  async listTags(): Promise<Array<{ tag: string; count: number }>> {
    const notes = await this.listNotes({ limit: 10_000 });
    const counts = new Map<string, number>();
    for (const note of notes) {
      const meta = await this.metadata(note.path).catch(() => null);
      if (!meta) continue;
      for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  async dailyNote(dateIso?: string): Promise<NoteContent> {
    const now = dateIso ? new Date(dateIso) : new Date();
    if (Number.isNaN(now.getTime())) {
      throw new VaultError(`invalid date: ${dateIso}`, "INVALID");
    }
    const formatted = formatDate(now, this.config.dailyNoteDateFormat);
    const rel = join(this.config.dailyNotesFolder, formatted).split(sep).join("/");
    try {
      return await this.readNote(rel);
    } catch (err) {
      if (err instanceof VaultError && err.code === "NOT_FOUND") {
        if (this.config.readOnly) throw err;
        return this.createNote(rel, `# ${formatted}\n\n`, {});
      }
      throw err;
    }
  }
}

function formatDate(d: Date, fmt: string): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return fmt
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()));
}

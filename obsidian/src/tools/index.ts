import { backlinks } from "./backlinks.js";
import { createNote } from "./create-note.js";
import { dailyNote } from "./daily-note.js";
import { deleteNote } from "./delete-note.js";
import { listFolders } from "./list-folders.js";
import { listNotes } from "./list-notes.js";
import { listTags } from "./list-tags.js";
import { metadata } from "./metadata.js";
import { readNote } from "./read-note.js";
import { renameNote } from "./rename-note.js";
import { search } from "./search.js";
import { updateNote } from "./update-note.js";
import type { ToolDefinition } from "./types.js";

export const tools: ToolDefinition<any>[] = [
  listNotes,
  readNote,
  search,
  createNote,
  updateNote,
  deleteNote,
  renameNote,
  listFolders,
  metadata,
  backlinks,
  dailyNote,
  listTags,
];

export type { ToolDefinition } from "./types.js";

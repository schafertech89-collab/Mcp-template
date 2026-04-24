import { currentTimeTool } from "./current-time.js";
import { echoTool } from "./echo.js";
import { fetchUrlTool } from "./fetch-url.js";
import { hashTool } from "./hash.js";
import type { ToolDefinition } from "./types.js";

// Add new tools here. Each tool must implement the ToolDefinition interface.
export const tools: ToolDefinition<any>[] = [
  echoTool,
  currentTimeTool,
  hashTool,
  fetchUrlTool,
];

export type { ToolDefinition } from "./types.js";

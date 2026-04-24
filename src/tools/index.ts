import { echoTool } from "./echo.js";
import { fetchUrlTool } from "./fetch-url.js";
import type { ToolDefinition } from "./types.js";

// Add new tools here. Each tool must implement the ToolDefinition interface.
export const tools: ToolDefinition<any>[] = [echoTool, fetchUrlTool];

export type { ToolDefinition } from "./types.js";

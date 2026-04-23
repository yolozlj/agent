import type { ToolContext, ToolName } from "../lib/types.js";
import { getWeather } from "./weather.js";
import { readWebPage } from "./web.js";

type ToolHandler = (
  input: Record<string, unknown>,
  context: ToolContext
) => Promise<Record<string, unknown>>;

export const toolRegistry: Record<ToolName, ToolHandler> = {
  getWeather,
  readWebPage
};


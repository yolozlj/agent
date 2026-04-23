import type { Request, Response } from "express";

import { runAgent } from "../agent/executor.js";
import type { RunAgentResponse } from "../lib/types.js";
import { runAgentRequestSchema } from "../lib/types.js";

type RouteResult = {
  status: number;
  body: RunAgentResponse | { error: string; details?: unknown };
};

export async function handleRunAgentPayload(payload: unknown): Promise<RouteResult> {
  const parsed = runAgentRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: "Invalid request payload.",
        details: parsed.error.flatten()
      }
    };
  }

  try {
    const result = await runAgent(parsed.data);

    return {
      status: 200,
      body: result
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : "Unknown server error."
      }
    };
  }
}

export async function runAgentRoute(request: Request, response: Response): Promise<void> {
  const result = await handleRunAgentPayload(request.body);
  response.status(result.status).json(result.body);
}

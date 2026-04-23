import { z } from "zod";

import { env } from "../lib/config.js";

const chatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable()
        })
      })
    )
    .min(1)
});

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function callLlm(messages: ChatMessage[]): Promise<string> {
  let response: Response;

  try {
    response = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        stream: false,
        temperature: 0.2,
        messages
      })
    });
  } catch (error) {
    const cause = error instanceof Error && "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
    const causeText =
      cause && typeof cause === "object"
        ? JSON.stringify(cause, Object.getOwnPropertyNames(cause))
        : cause
          ? String(cause)
          : "";

    throw new Error(
      `LLM fetch failed: ${error instanceof Error ? error.message : "unknown error"}${causeText ? ` | cause: ${causeText}` : ""}`
    );
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LLM request failed with ${response.status}: ${body}`);
  }

  const payload = chatCompletionSchema.parse(await response.json());
  return payload.choices[0].message.content?.trim() ?? "";
}

import { z } from "zod";

export const taskIdSchema = z.enum([
  "basic_qa",
  "weather",
  "web_reader",
  "planner",
  "memory"
]);

export const plannerModeSchema = z.enum(["none", "simple", "step-by-step"]);
export const memoryModeSchema = z.enum(["off", "short-term"]);
export const outputFormatSchema = z.enum(["text", "json"]);
export const toolNameSchema = z.enum(["getWeather", "readWebPage"]);

export const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1)
});

export const agentConfigSchema = z.object({
  systemPrompt: z.string().trim().max(1200).default(""),
  toolsEnabled: z.boolean().default(false),
  enabledTools: z.array(toolNameSchema).default([]),
  planner: plannerModeSchema.default("none"),
  memory: memoryModeSchema.default("off"),
  maxSteps: z.union([z.literal(3), z.literal(5), z.literal(10)]).default(5),
  output: outputFormatSchema.default("text")
});

export const runAgentRequestSchema = z.object({
  task: taskIdSchema,
  input: z.string().trim().min(1),
  config: agentConfigSchema,
  history: z.array(historyMessageSchema).default([])
});

export type TaskId = z.infer<typeof taskIdSchema>;
export type PlannerMode = z.infer<typeof plannerModeSchema>;
export type MemoryMode = z.infer<typeof memoryModeSchema>;
export type OutputFormat = z.infer<typeof outputFormatSchema>;
export type ToolName = z.infer<typeof toolNameSchema>;
export type AgentConfig = z.infer<typeof agentConfigSchema>;
export type HistoryMessage = z.infer<typeof historyMessageSchema>;
export type RunAgentRequest = z.infer<typeof runAgentRequestSchema>;

export type TraceStep =
  | {
      type: "user_input";
      title: string;
      content: string;
    }
  | {
      type: "plan";
      title: string;
      items: string[];
    }
  | {
      type: "memory_read";
      title: string;
      items: string[];
    }
  | {
      type: "decision";
      title: string;
      content: string;
      step: number;
    }
  | {
      type: "tool_call";
      title: string;
      step: number;
      tool: ToolName;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      title: string;
      step: number;
      tool: ToolName;
      output: Record<string, unknown>;
    }
  | {
      type: "warning";
      title: string;
      content: string;
    }
  | {
      type: "final_output";
      title: string;
      content: string;
    };

export type RunAgentResponse = {
  output: string;
  trace: TraceStep[];
  teachingExplanations: string[];
};

export type ToolContext = {
  timeoutMs: number;
};


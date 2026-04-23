import type { AgentConfig, RunAgentRequest, TraceStep } from "../lib/types.js";

export function buildTeachingExplanations(
  request: RunAgentRequest,
  trace: TraceStep[]
): string[] {
  const explanations: string[] = [];
  const toolCalls = trace.filter((step) => step.type === "tool_call");
  const hasWarnings = trace.some((step) => step.type === "warning");

  if (!request.config.toolsEnabled && (request.task === "weather" || request.task === "web_reader")) {
    explanations.push("当前任务依赖外部世界的数据。如果不开工具，模型只能依据已有知识猜测，容易出现幻觉。");
  }

  if (request.config.toolsEnabled && toolCalls.length > 0) {
    explanations.push("这次回答先调用了工具，再根据真实返回结果生成结论，因此可解释性和可信度更高。");
  }

  if (request.config.planner !== "none") {
    explanations.push("Planner 先把复杂任务拆成更小的步骤，能降低一次性完成复杂任务时的决策压力。");
  }

  if (request.config.memory === "short-term") {
    explanations.push("Short-term memory 会把历史上下文带入后续决策，所以输出更连贯，但也可能继承旧约束。");
  }

  if (request.config.maxSteps >= 5) {
    explanations.push("更高的 loop 上限给了模型更多修正机会，但也会增加重复尝试和跑偏的概率。");
  }

  if (hasWarnings) {
    explanations.push("Trace 中出现 warning，说明 Agent 在流程里遇到了边界或失败点，这正是教学里值得观察的部分。");
  }

  return explanations;
}

type Action =
  | {
      type: "tool";
      decision_summary: string;
      tool: "getWeather" | "readWebPage";
      input: Record<string, unknown>;
    }
  | {
      type: "final";
      decision_summary: string;
      answer: string;
    };

export function buildActionPrompt(params: {
  taskTitle: string;
  taskDescription: string;
  userInput: string;
  config: AgentConfig;
  availableTools: string[];
  historyLines: string[];
  planItems: string[];
  observations: string[];
}): string {
  return [
    `任务类型：${params.taskTitle}`,
    `任务说明：${params.taskDescription}`,
    `用户输入：${params.userInput}`,
    params.historyLines.length > 0 ? `会话历史：\n${params.historyLines.join("\n")}` : "会话历史：无",
    params.planItems.length > 0 ? `当前计划：\n${params.planItems.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "当前计划：无",
    params.observations.length > 0 ? `当前观察：\n${params.observations.join("\n")}` : "当前观察：无",
    `可用工具：${params.availableTools.length > 0 ? params.availableTools.join(", ") : "无"}`,
    `输出格式偏好：${params.config.output}`,
    "你必须只返回一个 JSON 对象，不要输出 Markdown。",
    "如果你需要获取真实外部信息，就返回 tool 动作。",
    "如果信息已经足够，就返回 final 动作。",
    `JSON Schema:
{
  "type": "tool" | "final",
  "decision_summary": "一句可展示给用户的决策摘要，不要暴露思维链",
  "tool": "getWeather" | "readWebPage",
  "input": {},
  "answer": "当 type=final 时返回最终答案"
}`,
    "规则：如果调用 getWeather，input 里必须包含 city 字段；如果用户问题里已经给出城市，就直接提取填入 city。",
    "规则：如果工具不可用，不要假装调用工具，而是直接给出带边界说明的 final 回答。"
  ].join("\n\n");
}

export function isAction(value: unknown): value is Action {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.type === "tool") {
    return (
      typeof candidate.decision_summary === "string" &&
      (candidate.tool === "getWeather" || candidate.tool === "readWebPage") &&
      typeof candidate.input === "object" &&
      candidate.input !== null
    );
  }

  if (candidate.type === "final") {
    return (
      typeof candidate.decision_summary === "string" &&
      typeof candidate.answer === "string"
    );
  }

  return false;
}

import { z } from "zod";

import { extractJsonObject } from "../lib/json.js";
import type { RunAgentRequest, RunAgentResponse, TraceStep, ToolName } from "../lib/types.js";
import { toolRegistry } from "../tools/index.js";
import { callLlm } from "./llm.js";
import { TASK_PRESETS } from "./task-presets.js";
import { buildActionPrompt, buildTeachingExplanations, isAction } from "./teaching.js";
import { env } from "../lib/config.js";

const planSchema = z.object({
  plan: z.array(z.string().min(1)).min(1).max(6)
});

async function createPlan(request: RunAgentRequest): Promise<string[]> {
  const preset = TASK_PRESETS[request.task];
  const prompt = [
    "你是一个教学型 Agent Planner。",
    `任务类型：${preset.title}`,
    `任务说明：${preset.description}`,
    `用户输入：${request.input}`,
    "请输出一个 JSON 对象，格式为：",
    '{"plan":["步骤1","步骤2"]}',
    "要求：计划要简洁、可执行、面向教学展示。不要输出 Markdown。"
  ].join("\n\n");

  const raw = await callLlm([
    {
      role: "system",
      content: "你只返回 JSON。"
    },
    {
      role: "user",
      content: prompt
    }
  ]);

  const parsed = planSchema.parse(JSON.parse(extractJsonObject(raw)));
  return parsed.plan;
}

function buildHistoryLines(request: RunAgentRequest): string[] {
  if (request.config.memory !== "short-term") {
    return [];
  }

  return request.history.map((message) => {
    const role = message.role === "user" ? "用户" : "助手";
    return `${role}：${message.content}`;
  });
}

function availableTools(request: RunAgentRequest): ToolName[] {
  if (!request.config.toolsEnabled) {
    return [];
  }

  return request.config.enabledTools;
}

function inferWeatherCityFromInput(input: string): string | null {
  const compact = input.replace(/\s+/g, "").replace(/[？?！!。.,，]/g, "");
  const normalized = compact.replace(
    /^(今天|现在|当前|请问|请帮我|帮我|麻烦你|想知道|查一下|查查|看看|告诉我)+/u,
    ""
  );

  const patterns = [
    /^([A-Za-z\u4e00-\u9fff]{2,20}?)(?:市|区|县|盟|自治州|特别行政区)?(?:今天|当前|现在)?天气/u,
    /([A-Za-z\u4e00-\u9fff]{2,20}?)(?:市|区|县|盟|自治州|特别行政区)?(?:今天|当前|现在)?天气/u
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    const city = match[1]?.replace(/(今天|当前|现在)$/u, "").trim();
    if (city) {
      return city;
    }
  }

  return null;
}

function normalizeToolInput(tool: ToolName, input: Record<string, unknown>, userInput: string): Record<string, unknown> {
  if (tool !== "getWeather") {
    return input;
  }

  const city = String(input.city ?? input.location ?? "").trim();
  if (city) {
    return {
      ...input,
      city
    };
  }

  const inferredCity = inferWeatherCityFromInput(userInput);
  if (!inferredCity) {
    return input;
  }

  return {
    ...input,
    city: inferredCity
  };
}

export async function runAgent(request: RunAgentRequest): Promise<RunAgentResponse> {
  const preset = TASK_PRESETS[request.task];
  const trace: TraceStep[] = [
    {
      type: "user_input",
      title: "用户输入",
      content: request.input
    }
  ];

  const historyLines = buildHistoryLines(request);
  if (historyLines.length > 0) {
    trace.push({
      type: "memory_read",
      title: "读取短期记忆",
      items: historyLines
    });
  }

  let planItems: string[] = [];
  if (request.config.planner !== "none") {
    planItems = await createPlan(request);
    trace.push({
      type: "plan",
      title: "规划任务",
      items: planItems
    });
  }

  const enabledTools = availableTools(request);
  const observations: string[] = [];

  for (let step = 1; step <= request.config.maxSteps; step += 1) {
    const systemParts = [
      preset.recommendedPrompt,
      request.config.systemPrompt.trim(),
      request.config.planner === "step-by-step"
        ? "你需要逐步推进，每次只做一个明确动作。"
        : ""
    ].filter(Boolean);

    const prompt = buildActionPrompt({
      taskTitle: preset.title,
      taskDescription: preset.description,
      userInput: request.input,
      config: request.config,
      availableTools: enabledTools,
      historyLines,
      planItems,
      observations
    });

    const rawAction = await callLlm([
      {
        role: "system",
        content: systemParts.join("\n\n")
      },
      {
        role: "user",
        content: prompt
      }
    ]);

    let action: unknown;
    try {
      action = JSON.parse(extractJsonObject(rawAction));
    } catch (error) {
      trace.push({
        type: "warning",
        title: "模型输出解析失败",
        content: error instanceof Error ? error.message : "Unknown JSON parsing error."
      });

      return {
        output: "模型没有按约定返回结构化结果，请调整提示词后重试。",
        trace: [
          ...trace,
          {
            type: "final_output",
            title: "最终输出",
            content: "模型没有按约定返回结构化结果，请调整提示词后重试。"
          }
        ],
        teachingExplanations: buildTeachingExplanations(request, trace)
      };
    }

    if (!isAction(action)) {
      trace.push({
        type: "warning",
        title: "模型动作不合法",
        content: "模型返回的 JSON 不符合预期 schema。"
      });
      break;
    }

    trace.push({
      type: "decision",
      title: `第 ${step} 步决策`,
      content: action.decision_summary,
      step
    });

    if (action.type === "final") {
      trace.push({
        type: "final_output",
        title: "最终输出",
        content: action.answer
      });

      return {
        output: action.answer,
        trace,
        teachingExplanations: buildTeachingExplanations(request, trace)
      };
    }

    if (!enabledTools.includes(action.tool)) {
      const warning = `模型尝试调用 ${action.tool}，但当前配置没有启用它。`;
      trace.push({
        type: "warning",
        title: "工具不可用",
        content: warning
      });
      observations.push(
        JSON.stringify(
          {
            tool: action.tool,
            warning
          },
          null,
          2
        )
      );
      continue;
    }

    const normalizedInput = normalizeToolInput(action.tool, action.input, request.input);

    trace.push({
      type: "tool_call",
      title: `第 ${step} 步调用工具`,
      step,
      tool: action.tool,
      input: normalizedInput
    });

    try {
      const output = await toolRegistry[action.tool](normalizedInput, {
        timeoutMs: env.WEB_FETCH_TIMEOUT_MS
      });

      trace.push({
        type: "tool_result",
        title: `第 ${step} 步工具结果`,
        step,
        tool: action.tool,
        output
      });

      observations.push(
        JSON.stringify(
          {
            tool: action.tool,
            output
          },
          null,
          2
        )
      );
    } catch (error) {
      const warning = error instanceof Error ? error.message : "Unknown tool error.";
      trace.push({
        type: "warning",
        title: "工具调用失败",
        content: warning
      });
      observations.push(
        JSON.stringify(
          {
            tool: action.tool,
            input: normalizedInput,
            warning
          },
          null,
          2
        )
      );
      continue;
    }
  }

  const fallbackOutput = "Agent 在当前 loop 限制内没有稳定完成任务，请查看 trace 和 warning。";
  trace.push({
    type: "final_output",
    title: "最终输出",
    content: fallbackOutput
  });

  return {
    output: fallbackOutput,
    trace,
    teachingExplanations: buildTeachingExplanations(request, trace)
  };
}

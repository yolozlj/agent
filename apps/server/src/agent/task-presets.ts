import type { TaskId, ToolName } from "../lib/types.js";

export type TaskPreset = {
  title: string;
  description: string;
  defaultInput: string;
  recommendedTools: ToolName[];
  recommendedPrompt: string;
};

export const TASK_PRESETS: Record<TaskId, TaskPreset> = {
  basic_qa: {
    title: "基础问答",
    description: "真实 LLM 单步回答，帮助用户理解普通对话与 Agent 的差异。",
    defaultInput: "请用通俗语言解释什么是向量数据库。",
    recommendedTools: [],
    recommendedPrompt: "你是一个清晰、耐心的中文助教。回答时优先解释概念，不要编造外部事实。"
  },
  weather: {
    title: "实时天气",
    description: "通过真实天气工具查询实时数据，展示工具调用的价值。",
    defaultInput: "今天上海天气怎么样？我下午出门要不要带伞？",
    recommendedTools: ["getWeather"],
    recommendedPrompt: "你是一个生活助理。涉及实时天气时，必须先获取真实天气数据，再给用户建议。"
  },
  web_reader: {
    title: "网页读取",
    description: "读取网页正文后再总结，展示模型与网页工具的边界。",
    defaultInput: "请阅读 https://openai.com/index/openai-o3-and-o4-mini/ 并总结重点。",
    recommendedTools: ["readWebPage"],
    recommendedPrompt: "你是一个网页研究助理。用户提供链接时，必须先读取网页内容，再进行总结或问答。"
  },
  planner: {
    title: "规划任务",
    description: "通过 planner 拆分复杂任务，展示计划如何稳定 Agent 行为。",
    defaultInput: "帮我规划一个 2 天苏州旅行行程，兼顾园林、美食和轻松节奏。",
    recommendedTools: [],
    recommendedPrompt: "你是一个规划助手。面对复杂任务时，先拆分目标，再逐步生成最终答案。"
  },
  memory: {
    title: "多轮记忆",
    description: "让历史上下文影响下一轮输出，展示 memory 的价值与风险。",
    defaultInput: "帮我写一段团队团建通知，语气轻松一些。",
    recommendedTools: [],
    recommendedPrompt: "你是一个写作助手。需要根据同一会话里的历史要求持续修改内容。"
  }
};


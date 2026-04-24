const MODES = {
  simple_qa: {
    id: "simple_qa",
    title: "简单问答",
    task: "basic_qa",
    placeholder: "请用通俗语言解释什么是向量数据库。",
    config: {
      systemPrompt: "",
      toolsEnabled: false,
      enabledTools: [],
      planner: "none",
      memory: "off",
      maxSteps: 3,
      output: "text"
    }
  },
  agent: {
    id: "agent",
    title: "Agent",
    task: "agent",
    placeholder: "今天北京天气怎么样？下午出门要不要带伞？",
    config: {
      systemPrompt: "根据用户任务自动判断是否需要工具、规划和记忆。",
      toolsEnabled: true,
      enabledTools: ["getWeather", "readWebPage"],
      planner: "auto",
      memory: "short-term",
      maxSteps: 5,
      output: "text"
    }
  }
};

const EXAMPLES = [
  {
    id: "simple",
    label: "简单问答",
    mode: "simple_qa",
    input: "请用通俗语言解释什么是向量数据库。"
  },
  {
    id: "weather",
    label: "天气咨询",
    mode: "agent",
    input: "今天北京天气怎么样？下午出门要不要带伞？"
  },
  {
    id: "web",
    label: "网页总结",
    mode: "agent",
    input: "请阅读 https://example.com 并总结重点。"
  },
  {
    id: "travel",
    label: "旅行规划",
    mode: "agent",
    input: "帮我规划一个 2 天苏州旅行行程，兼顾园林、美食和轻松节奏。"
  },
  {
    id: "memory",
    label: "记忆回顾",
    mode: "agent",
    input: "我今天问过你哪些问题？"
  }
];

const app = document.querySelector("#app");
const runtimeConfig = window.__AGENT_SANDBOX_CONFIG__ || {};
const API_BASE = String(runtimeConfig.apiBase || "").replace(/\/$/, "");
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CONTENT_CHARS = 360;

const state = {
  mode: "agent",
  config: structuredClone(MODES.agent.config),
  input: MODES.agent.placeholder,
  history: [],
  result: null,
  error: "",
  running: false
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getMode(modeId = state.mode) {
  return MODES[modeId];
}

function isAgentMode() {
  return state.mode === "agent";
}

function setMode(modeId, options = {}) {
  const mode = getMode(modeId);
  state.mode = mode.id;
  state.config = structuredClone(mode.config);
  state.input = options.keepInput ? state.input : mode.placeholder;
  state.result = null;
  state.error = "";
  render();
}

function applyExample(exampleId) {
  const example = EXAMPLES.find((item) => item.id === exampleId);
  if (!example) {
    return;
  }

  const previousInput = state.input;
  setMode(example.mode, { keepInput: true });
  state.input = example.input || previousInput;

  if (example.id === "memory") {
    state.config.memory = "short-term";
  }

  clearOutputState();
  render();
}

function renderSegmented(name, items, value, disabled = false) {
  return `
    <div class="segmented" role="group" aria-label="${escapeHtml(name)}">
      ${items
        .map(
          (item) => `
            <button
              class="segment ${item.value === value ? "segment-active" : ""}"
              type="button"
              data-segment="${escapeHtml(name)}"
              data-value="${escapeHtml(item.value)}"
              ${disabled ? "disabled" : ""}
            >
              ${escapeHtml(item.label)}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderToolChips() {
  return ["getWeather", "readWebPage"]
    .map((tool) => {
      const checked = state.config.enabledTools.includes(tool);
      return `
        <label class="${isAgentMode() ? "tool-chip" : "tool-chip tool-chip-disabled"}">
          <input
            type="checkbox"
            data-tool-name="${tool}"
            ${checked ? "checked" : ""}
            ${!isAgentMode() || !state.config.toolsEnabled ? "disabled" : ""}
          />
          <span>${tool}</span>
        </label>
      `;
    })
    .join("");
}

function renderTraceDetail(step) {
  if (step.type === "plan" || step.type === "memory_read") {
    return `<ul class="step-list">${step.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  }

  if (step.type === "router") {
    return `<p>${escapeHtml(step.content)}</p>`;
  }

  if (step.type === "tool_call") {
    return `<pre>${escapeHtml(JSON.stringify(step.input, null, 2))}</pre>`;
  }

  if (step.type === "tool_result") {
    return `<pre>${escapeHtml(JSON.stringify(step.output, null, 2))}</pre>`;
  }

  return `<p>${escapeHtml(step.content)}</p>`;
}

function renderTimeline() {
  const trace = state.result?.trace ?? [];

  if (state.running) {
    return `<div class="empty-block">Agent 正在运行，步骤会按时间顺序出现在这里。</div>`;
  }

  if (trace.length === 0) {
    return `<div class="empty-block">运行一次任务后，这里会展示完整的运行过程。</div>`;
  }

  return `
    <div class="timeline">
      ${trace
        .map(
          (step, index) => `
            <article class="step-card">
              <div class="step-index">${String(index + 1).padStart(2, "0")}</div>
              <div class="step-main">
                <div class="step-topline">
                  <span class="step-type step-type-${step.type}">${step.type}</span>
                  <h3>${escapeHtml(step.title)}</h3>
                </div>
                <div class="step-body">${renderTraceDetail(step)}</div>
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderChain(step) {
  switch (step.type) {
    case "user_input":
      return `输入：${step.content}`;
    case "memory_read":
      return `记忆：${step.items.length} 条`;
    case "router":
      return `路由：${step.tools.length > 0 ? step.tools.join(", ") : "无候选工具"}`;
    case "plan":
      return `计划：${step.items.join(" → ")}`;
    case "decision":
      return `决策：${step.content}`;
    case "tool_call":
      return `工具：${step.tool}`;
    case "tool_result":
      return `返回：${step.tool}`;
    case "warning":
      return `警告：${step.content}`;
    case "final_output":
      return `输出：${step.content}`;
    default:
      return step.title;
  }
}

function renderFinalOutput() {
  if (state.error) {
    return `<div class="output-card output-card-error">${escapeHtml(state.error)}</div>`;
  }

  if (state.result?.output) {
    return `<div class="output-card">${escapeHtml(state.result.output)}</div>`;
  }

  return `<div class="output-card muted">最终回答会显示在这里。</div>`;
}

function renderTeachingNotes(explanations) {
  if (explanations.length === 0) {
    return `<div class="note-card muted">运行后会根据配置和 trace 自动生成教学解释。</div>`;
  }

  return explanations.map((item) => `<div class="note-card">${escapeHtml(item)}</div>`).join("");
}

function renderExamples() {
  return EXAMPLES.map(
    (example) => `
      <button class="example-button" type="button" data-example="${example.id}">
        ${escapeHtml(example.label)}
      </button>
    `
  ).join("");
}

function render() {
  const mode = getMode();
  const trace = state.result?.trace ?? [];
  const explanations = state.result?.teachingExplanations ?? [];
  const rawTrace = trace.length > 0 ? escapeHtml(trace.map((step) => JSON.stringify(step, null, 2)).join("\n\n")) : "暂无 trace";
  const sessionRounds = Math.floor(state.history.length / 2);

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand-block">
          <span class="brand-kicker">AGENT SANDBOX</span>
          <h1>教学型 Agent 实验台</h1>
        </div>
      </header>

      <main class="workspace">
        <aside class="sidebar panel">
          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-label">模式</span>
              <span class="section-meta">${sessionRounds} 轮会话</span>
            </div>
            ${renderSegmented(
              "mode",
              [
                { label: "简单问答", value: "simple_qa" },
                { label: "Agent", value: "agent" }
              ],
              state.mode
            )}
          </section>

          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-label">Agent 能力</span>
            </div>

            <div class="control-group ${isAgentMode() ? "" : "control-disabled"}">
              <div class="toggle-line">
                <span>Tools</span>
                <label class="toggle-wrap">
                  <input
                    id="tools-enabled"
                    type="checkbox"
                    ${state.config.toolsEnabled ? "checked" : ""}
                    ${!isAgentMode() ? "disabled" : ""}
                  />
                  <span>${state.config.toolsEnabled ? "启用" : "关闭"}</span>
                </label>
              </div>
              <div class="chip-row">${renderToolChips()}</div>
            </div>

            <label class="control-group ${isAgentMode() ? "" : "control-disabled"}">
              <span>Planner</span>
              ${renderSegmented(
                "planner",
                [
                  { label: "off", value: "none" },
                  { label: "auto", value: "auto" },
                  { label: "step", value: "step-by-step" }
                ],
                state.config.planner,
                !isAgentMode()
              )}
            </label>

            <label class="control-group ${isAgentMode() ? "" : "control-disabled"}">
              <span>Memory</span>
              ${renderSegmented(
                "memory",
                [
                  { label: "off", value: "off" },
                  { label: "short-term", value: "short-term" }
                ],
                state.config.memory,
                !isAgentMode()
              )}
            </label>
          </section>

          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-label">执行参数</span>
            </div>

            <div class="inline-grid">
              <label class="control-group">
                <span>Loop</span>
                <select id="max-steps" ${!isAgentMode() ? "disabled" : ""}>
                  <option value="3" ${state.config.maxSteps === 3 ? "selected" : ""}>3</option>
                  <option value="5" ${state.config.maxSteps === 5 ? "selected" : ""}>5</option>
                  <option value="10" ${state.config.maxSteps === 10 ? "selected" : ""}>10</option>
                </select>
              </label>

              <label class="control-group">
                <span>Output</span>
                <select id="output-mode">
                  <option value="text" ${state.config.output === "text" ? "selected" : ""}>text</option>
                  <option value="json" ${state.config.output === "json" ? "selected" : ""}>JSON</option>
                </select>
              </label>
            </div>

            <label class="control-group">
              <span>System Prompt</span>
              <textarea id="system-prompt" rows="4">${escapeHtml(state.config.systemPrompt)}</textarea>
            </label>
          </section>

          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-label">示例输入</span>
            </div>
            <div class="example-grid">${renderExamples()}</div>
          </section>
        </aside>

        <section class="main-column">
          <section class="input-panel panel">
            <div class="input-head">
              <span class="section-label">输入</span>
              <div class="input-actions">
                <button class="ghost-button" type="button" data-action="clear-output">清空输出</button>
                <button class="ghost-button" type="button" data-action="reset-input">恢复示例</button>
                <button class="primary-button" type="button" data-action="run-agent" ${state.running ? "disabled" : ""}>
                  ${state.running ? "运行中..." : isAgentMode() ? "运行 Agent" : "运行问答"}
                </button>
              </div>
            </div>
            <textarea id="user-input" rows="4" placeholder="${escapeHtml(mode.placeholder)}">${escapeHtml(state.input)}</textarea>
          </section>

          <section class="process-panel panel">
            <div class="process-head">
              <div>
                <span class="section-label">运行过程</span>
                <p class="support-copy">${isAgentMode() ? "输入 → 路由 → 决策 → 工具 → 返回 → 输出" : "输入 → 单次模型调用 → 输出"}</p>
              </div>
            </div>
            <div class="process-scroll">${renderTimeline()}</div>
          </section>

          <section class="output-panel panel">
            <div class="output-block">
              <div class="section-head">
                <span class="section-label">最终输出</span>
              </div>
              ${renderFinalOutput()}
            </div>

            <div class="output-block">
              <div class="section-head">
                <span class="section-label">教学解释</span>
              </div>
              <div class="notes-scroll">${renderTeachingNotes(explanations)}</div>
            </div>

            <div class="output-block">
              <div class="section-head">
                <span class="section-label">Trace</span>
              </div>
              <div class="trace-stack">
                <div class="trace-subsection">
                  <span class="trace-label">结构化链路</span>
                  <div class="chain-list">
                    ${
                      trace.length > 0
                        ? trace.map((step) => `<div class="chain-item">${escapeHtml(renderChain(step))}</div>`).join("")
                        : '<div class="chain-item muted">运行后会展示结构化链路。</div>'
                    }
                  </div>
                </div>
                <div class="trace-subsection">
                  <span class="trace-label">原始 Trace</span>
                  <pre class="raw-trace">${rawTrace}</pre>
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function collectConfig() {
  state.input = document.querySelector("#user-input").value;
  const toolInputs = Array.from(document.querySelectorAll("[data-tool-name]"));
  const enabledTools = toolInputs
    .filter((input) => input.checked)
    .map((input) => input.dataset.toolName);

  state.config = {
    systemPrompt: document.querySelector("#system-prompt").value,
    toolsEnabled: isAgentMode() ? document.querySelector("#tools-enabled").checked : false,
    enabledTools: isAgentMode() && document.querySelector("#tools-enabled").checked ? enabledTools : [],
    planner: isAgentMode() ? state.config.planner : "none",
    memory: isAgentMode() ? state.config.memory : "off",
    maxSteps: isAgentMode() ? Number(document.querySelector("#max-steps").value) : 3,
    output: document.querySelector("#output-mode").value
  };
}

function clearOutputState() {
  state.result = null;
  state.error = "";
}

function compactHistory(history) {
  return history.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
    role: message.role,
    content:
      message.content.length > MAX_HISTORY_CONTENT_CHARS
        ? `${message.content.slice(0, MAX_HISTORY_CONTENT_CHARS)}...`
        : message.content
  }));
}

async function handleRun() {
  collectConfig();
  clearOutputState();
  state.running = true;
  render();

  try {
    const mode = getMode();
    const payloadHistory = state.config.memory === "short-term" ? compactHistory(state.history) : [];
    const response = await fetch(`${API_BASE}/api/run-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        task: mode.task,
        input: state.input,
        config: state.config,
        history: payloadHistory
      })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? `Request failed with ${response.status}`);
    }

    state.result = payload;
    if (state.config.memory === "short-term") {
      state.history.push(
        { role: "user", content: state.input },
        { role: "assistant", content: payload.output }
      );
      state.history = compactHistory(state.history);
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "运行失败";
  } finally {
    state.running = false;
    render();
  }
}

function bindEvents() {
  app.querySelectorAll("[data-segment='mode']").forEach((button) => {
    button.addEventListener("click", () => {
      setMode(button.dataset.value);
    });
  });

  app.querySelectorAll("[data-segment='planner']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAgentMode()) {
        return;
      }
      state.config.planner = button.dataset.value;
      render();
    });
  });

  app.querySelectorAll("[data-segment='memory']").forEach((button) => {
    button.addEventListener("click", () => {
      if (!isAgentMode()) {
        return;
      }
      state.config.memory = button.dataset.value;
      render();
    });
  });

  app.querySelectorAll("[data-example]").forEach((button) => {
    button.addEventListener("click", () => {
      applyExample(button.dataset.example);
    });
  });

  app.querySelector("[data-action='clear-output']").addEventListener("click", () => {
    clearOutputState();
    render();
  });

  app.querySelector("[data-action='reset-input']").addEventListener("click", () => {
    state.input = getMode().placeholder;
    clearOutputState();
    render();
  });

  app.querySelector("[data-action='run-agent']").addEventListener("click", () => {
    void handleRun();
  });

  app.querySelector("#user-input").addEventListener("input", (event) => {
    state.input = event.target.value;
  });

  app.querySelector("#system-prompt").addEventListener("input", (event) => {
    state.config.systemPrompt = event.target.value;
  });

  app.querySelector("#tools-enabled")?.addEventListener("change", (event) => {
    state.config.toolsEnabled = event.target.checked;
    state.config.enabledTools = event.target.checked ? ["getWeather", "readWebPage"] : [];
    render();
  });

  app.querySelectorAll("[data-tool-name]").forEach((input) => {
    input.addEventListener("change", () => {
      collectConfig();
    });
  });

  ["#max-steps", "#output-mode"].forEach((selector) => {
    app.querySelector(selector).addEventListener("change", () => {
      collectConfig();
    });
  });
}

render();

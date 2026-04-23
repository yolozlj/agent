const TASKS = [
  {
    id: "basic_qa",
    title: "基础问答",
    summary: "真实 LLM 单步回答，对比普通对话与 Agent 的区别。",
    placeholder: "请用通俗语言解释什么是向量数据库。",
    allowedTools: [],
    recommended: {
      systemPrompt: "",
      toolsEnabled: false,
      enabledTools: [],
      planner: "none",
      memory: "off",
      maxSteps: 3,
      output: "text"
    },
    risky: {
      systemPrompt: "请尽快回答，不必说明边界。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "step-by-step",
      memory: "short-term",
      maxSteps: 10,
      output: "text"
    }
  },
  {
    id: "weather",
    title: "实时天气",
    summary: "通过真实天气工具查询实时数据，观察工具如何改变回答可信度。",
    placeholder: "今天上海天气怎么样？我下午出门要不要带伞？",
    allowedTools: ["getWeather"],
    recommended: {
      systemPrompt: "涉及天气时必须先查询真实天气，再给建议。",
      toolsEnabled: true,
      enabledTools: ["getWeather"],
      planner: "simple",
      memory: "off",
      maxSteps: 5,
      output: "text"
    },
    risky: {
      systemPrompt: "直接回答，不要承认不知道。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "none",
      memory: "off",
      maxSteps: 3,
      output: "text"
    }
  },
  {
    id: "web_reader",
    title: "网页读取",
    summary: "先读取公开网页，再基于正文做总结。",
    placeholder: "请阅读 https://example.com 并总结重点。",
    allowedTools: ["readWebPage"],
    recommended: {
      systemPrompt: "用户给出网页时必须先读取，再总结。",
      toolsEnabled: true,
      enabledTools: ["readWebPage"],
      planner: "simple",
      memory: "off",
      maxSteps: 5,
      output: "text"
    },
    risky: {
      systemPrompt: "你可以直接假设网页内容。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "none",
      memory: "off",
      maxSteps: 3,
      output: "text"
    }
  },
  {
    id: "planner",
    title: "规划任务",
    summary: "通过 plan 拆分复杂任务，观察 loop 如何推进。",
    placeholder: "帮我规划一个 2 天苏州旅行行程，兼顾园林、美食和轻松节奏。",
    allowedTools: [],
    recommended: {
      systemPrompt: "先拆分目标，再生成最终答案。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "simple",
      memory: "off",
      maxSteps: 5,
      output: "text"
    },
    risky: {
      systemPrompt: "一步完成所有内容。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "none",
      memory: "off",
      maxSteps: 3,
      output: "text"
    }
  },
  {
    id: "memory",
    title: "多轮记忆",
    summary: "把历史上下文带入下一轮，展示记忆既有用也有风险。",
    placeholder: "帮我写一段团队团建通知，语气轻松一些。",
    allowedTools: [],
    recommended: {
      systemPrompt: "请持续继承会话里的历史要求。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "simple",
      memory: "short-term",
      maxSteps: 5,
      output: "text"
    },
    risky: {
      systemPrompt: "忽略历史，只看当前输入。",
      toolsEnabled: false,
      enabledTools: [],
      planner: "none",
      memory: "off",
      maxSteps: 3,
      output: "text"
    }
  }
];

const app = document.querySelector("#app");
const runtimeConfig = window.__AGENT_SANDBOX_CONFIG__ || {};
const API_BASE = String(runtimeConfig.apiBase || "").replace(/\/$/, "");

const state = {
  selectedTask: "basic_qa",
  config: structuredClone(TASKS[0].recommended),
  input: TASKS[0].placeholder,
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

function getTask(taskId) {
  return TASKS.find((task) => task.id === taskId);
}

function setTask(taskId) {
  const task = getTask(taskId);
  state.selectedTask = taskId;
  state.config = structuredClone(task.recommended);
  state.input = task.placeholder;
  state.history = [];
  state.result = null;
  state.error = "";
  render();
}

function renderScenarioOptions() {
  return TASKS.map(
    (task) => `<option value="${task.id}" ${task.id === state.selectedTask ? "selected" : ""}>${task.title}</option>`
  ).join("");
}

function renderToolChips(task) {
  return ["getWeather", "readWebPage"]
    .map((tool) => {
      const allowed = task.allowedTools.includes(tool);
      const checked = state.config.enabledTools.includes(tool);
      return `
        <label class="${allowed ? "tool-chip" : "tool-chip tool-chip-disabled"}">
          <input
            type="checkbox"
            data-tool-name="${tool}"
            ${checked ? "checked" : ""}
            ${!allowed || !state.config.toolsEnabled ? "disabled" : ""}
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
    case "plan":
      return `计划：${step.items.join(" → ")}`;
    case "memory_read":
      return `记忆：${step.items.length} 条`;
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

function render() {
  const task = getTask(state.selectedTask);
  const trace = state.result?.trace ?? [];
  const explanations = state.result?.teachingExplanations ?? [];
  const rawTrace = trace.length > 0 ? escapeHtml(trace.map((step) => JSON.stringify(step, null, 2)).join("\n\n")) : "暂无 trace";
  const toolDisabled = task.allowedTools.length === 0;
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
              <span class="section-label">场景预设</span>
              <span class="section-meta">${sessionRounds} 轮会话</span>
            </div>
            <select id="scenario-select">${renderScenarioOptions()}</select>
            <p class="support-copy">${task.summary}</p>
          </section>

          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-label">Agent 结构</span>
            </div>

            <div class="control-group">
              <div class="toggle-line">
                <span>Tools</span>
                <label class="toggle-wrap">
                  <input
                    id="tools-enabled"
                    type="checkbox"
                    ${state.config.toolsEnabled ? "checked" : ""}
                    ${toolDisabled ? "disabled" : ""}
                  />
                  <span>${toolDisabled ? "当前场景无工具" : "启用"}</span>
                </label>
              </div>
              <div class="chip-row">${renderToolChips(task)}</div>
            </div>

            <div class="inline-grid">
              <label class="control-group">
                <span>Planner</span>
                <select id="planner-mode">
                  <option value="none" ${state.config.planner === "none" ? "selected" : ""}>none</option>
                  <option value="simple" ${state.config.planner === "simple" ? "selected" : ""}>simple</option>
                  <option value="step-by-step" ${state.config.planner === "step-by-step" ? "selected" : ""}>step-by-step</option>
                </select>
              </label>

              <label class="control-group">
                <span>Memory</span>
                <select id="memory-mode">
                  <option value="off" ${state.config.memory === "off" ? "selected" : ""}>off</option>
                  <option value="short-term" ${state.config.memory === "short-term" ? "selected" : ""}>short-term</option>
                </select>
              </label>
            </div>
          </section>

          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-label">执行参数</span>
            </div>

            <div class="inline-grid">
              <label class="control-group">
                <span>Loop</span>
                <select id="max-steps">
                  <option value="3" ${state.config.maxSteps === 3 ? "selected" : ""}>3</option>
                  <option value="5" ${state.config.maxSteps === 5 ? "selected" : ""}>5</option>
                  <option value="10" ${state.config.maxSteps === 10 ? "selected" : ""}>10</option>
                </select>
              </label>

              <label class="control-group">
                <span>Output</span>
                <select id="output-mode">
                  <option value="text" ${state.config.output === "text" ? "selected" : ""}>text</option>
                  <option value="json" ${state.config.output === "json" ? "selected" : ""}>json</option>
                </select>
              </label>
            </div>

            <label class="control-group">
              <span>System Prompt</span>
              <textarea id="system-prompt" rows="5">${escapeHtml(state.config.systemPrompt)}</textarea>
            </label>
          </section>

          <section class="sidebar-section sidebar-footer">
            <button class="ghost-button" type="button" data-action="apply-recommended">推荐配置</button>
            <button class="ghost-button" type="button" data-action="apply-risky">错误配置</button>
          </section>
        </aside>

        <section class="main-column">
          <section class="input-panel panel">
            <div class="input-head">
              <div>
                <span class="section-label">输入</span>
              </div>
              <div class="input-actions">
                <button class="ghost-button" type="button" data-action="clear-session">清空输出</button>
                <button class="ghost-button" type="button" data-action="reset-input">恢复示例</button>
                <button class="primary-button" type="button" data-action="run-agent" ${state.running ? "disabled" : ""}>
                  ${state.running ? "运行中…" : "运行 Agent"}
                </button>
              </div>
            </div>
            <textarea id="user-input" rows="4" placeholder="${escapeHtml(task.placeholder)}">${escapeHtml(state.input)}</textarea>
          </section>

          <section class="process-panel panel">
            <div class="process-head">
              <div>
                <span class="section-label">运行过程</span>
                <p class="support-copy">输入 → 决策 → 工具 → 返回 → 输出</p>
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
  const task = getTask(state.selectedTask);
  const enabledTools = Array.from(document.querySelectorAll("[data-tool-name]"))
    .filter((input) => input.checked)
    .map((input) => input.dataset.toolName)
    .filter((tool) => task.allowedTools.includes(tool));

  state.input = document.querySelector("#user-input").value;
  state.config = {
    systemPrompt: document.querySelector("#system-prompt").value,
    toolsEnabled: document.querySelector("#tools-enabled").checked,
    enabledTools:
      document.querySelector("#tools-enabled").checked && task.allowedTools.length > 0 ? enabledTools : [],
    planner: document.querySelector("#planner-mode").value,
    memory: document.querySelector("#memory-mode").value,
    maxSteps: Number(document.querySelector("#max-steps").value),
    output: document.querySelector("#output-mode").value
  };
}

async function handleRun() {
  collectConfig();
  state.running = true;
  state.error = "";
  render();

  try {
    const payloadHistory = state.config.memory === "short-term" ? state.history : [];
    const response = await fetch(`${API_BASE}/api/run-agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        task: state.selectedTask,
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
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "运行失败";
  } finally {
    state.running = false;
    render();
  }
}

function bindEvents() {
  app.querySelector("#scenario-select").addEventListener("change", (event) => {
    setTask(event.target.value);
  });

  app.querySelector("[data-action='apply-recommended']").addEventListener("click", () => {
    state.config = structuredClone(getTask(state.selectedTask).recommended);
    render();
  });

  app.querySelector("[data-action='apply-risky']").addEventListener("click", () => {
    state.config = structuredClone(getTask(state.selectedTask).risky);
    render();
  });

  app.querySelector("[data-action='clear-session']").addEventListener("click", () => {
    state.history = [];
    state.result = null;
    state.error = "";
    render();
  });

  app.querySelector("[data-action='reset-input']").addEventListener("click", () => {
    state.input = getTask(state.selectedTask).placeholder;
    state.result = null;
    state.error = "";
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

  app.querySelector("#tools-enabled").addEventListener("change", (event) => {
    state.config.toolsEnabled = event.target.checked;
    if (!event.target.checked) {
      state.config.enabledTools = [];
    } else {
      state.config.enabledTools = [...getTask(state.selectedTask).allowedTools];
    }
    render();
  });

  app.querySelectorAll("[data-tool-name]").forEach((input) => {
    input.addEventListener("change", () => {
      collectConfig();
    });
  });

  ["#planner-mode", "#memory-mode", "#max-steps", "#output-mode"].forEach((selector) => {
    app.querySelector(selector).addEventListener("change", () => {
      collectConfig();
    });
  });
}

render();

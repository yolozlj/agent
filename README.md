# Agent Sandbox

教学型 Agent 实验台 MVP。

## 技术栈

- 前端：原生静态页面（HTML + CSS + JavaScript）
- 后端：Node.js + Express + TypeScript
- 部署：GitHub Pages + 阿里云函数计算

## 本地开发

1. 安装依赖：`npm install`
2. 复制环境变量模板：
   - `cp apps/server/.env.example apps/server/.env`
3. 启动服务：`npm run dev:server`
4. 打开 `http://localhost:8787`

## 功能范围

- 基础问答
- 实时天气
- 网页读取
- 规划任务
- 多轮记忆

## 部署说明

- 前端静态资源：`apps/web`
- 后端部署入口：`apps/server/dist/fc.js`
- 阿里云函数计算建议使用 `nodejs20` + `HTTP Trigger`

### GitHub Pages

1. 将项目放入 GitHub 仓库，并确保默认分支为 `main`。
2. 仓库中已包含 GitHub Actions 工作流：[.github/workflows/deploy-pages.yml](/Users/zhoulijie/AI探索/agent%20教学/.github/workflows/deploy-pages.yml:1)
3. 前端发布目录为 `apps/web`，工作流会自动复制到 `dist` 并发布到 GitHub Pages。
4. 当前 [apps/web/config.js](/Users/zhoulijie/AI探索/agent%20教学/apps/web/config.js:1) 已默认指向阿里云函数公网地址。
5. 在 GitHub 仓库设置里打开 Pages，并把 Source 设为 `GitHub Actions`。

### 阿里云函数计算

1. 先执行：`npm run build`
2. 确保环境变量已在阿里云函数中配置：
   - `DEEPSEEK_API_KEY`
   - `LLM_BASE_URL`
   - `LLM_MODEL`
   - `ALLOWED_WEB_PROTOCOLS`
   - `WEB_FETCH_TIMEOUT_MS`
3. 使用 `s deploy` 发布 `s.yaml`

### DeepSeek 配置

- 默认模型接口：`https://api.deepseek.com/chat/completions`
- 默认模型名：`deepseek-chat`
- 服务端通过 `Authorization: Bearer ${DEEPSEEK_API_KEY}` 调用 DeepSeek API

### 当前状态

- 前端已兼容 GitHub Pages 的相对路径静态托管
- 前端 API 基址已支持通过 `apps/web/config.js` 配置
- 后端结构已适配阿里云函数，但仍建议在真实环境执行一次 `s deploy` 做最终验证

# WorkMind AI — 智能办公 Agent 平台

阅读顺序
src/index.js
src/config/index.js
src/utils/logger.js
src/utils/errors.js
src/middleware/index.js
src/services/model.js
src/services/cache.js
src/services/chat/memory.js
src/services/rag/ingest.js
src/services/rag/query.js
src/services/agent/tools.js
src/services/agent/agent.js
src/services/workflow/workflows.js
src/services/erp/parser.js
src/services/erp/approval.js
src/services/prompt/promptService.js
src/routes/health.js
src/routes/chat.js
src/routes/knowledge.js
src/routes/agent.js
src/routes/workflow.js
src/routes/erp.js
src/routes/prompt.js
src/routes/monitor.js

基于 Vue3 + Node.js + LangChain.js + DeepSeek 构建的智能办公 Agent 系统。

## 项目模块

| 模块 | 说明 | 状态 |
|------|------|------|
| 智能对话助手 | 多轮对话 / 流式输出 / 用户画像 | ✅ 已完成 |
| 知识库问答   | 文档上传 / RAG 检索 / 来源标注 | 🔄 开发中 |
| 任务 Agent   | Function Call / ReAct / 工具可视化 | 🔄 开发中 |
| 内容工作流   | 周报/纪要/邮件/PRD 工作流 | 🔄 开发中 |
| ERP 报销请假 | 智能填单 / Multi-Agent 审批 | 🔄 开发中 |
| Prompt 调试  | A/B测试 / 版本管理 | 🔄 开发中 |
| 用量看板     | Token消耗 / 费用 / 缓存统计 | 🔄 开发中 |

## 技术栈

- **前端**：Vue3 + Vite + Pinia + Vue Router
- **后端**：Node.js + Express
- **AI 框架**：LangChain.js + LangGraph
- **模型**：DeepSeek（对话）/ OpenAI（Embedding）
- **向量库**：Chroma
- **部署**：Docker + docker-compose

## 快速启动

### 1. 克隆项目

```bash
git clone <repo-url>
cd workmind
```

### 2. 配置环境变量

```bash
cd server
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
```

### 3. 启动后端

```bash
cd server
npm install
npm run dev
# 服务启动在 http://localhost:3000
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
# 页面打开在 http://localhost:5173
```

### 5. （可选）启动向量数据库（RAG 功能需要）

```bash
docker run -d -p 8000:8000 chromadb/chroma
```

### 6. 一键 Docker 部署

```bash
cp server/.env.example .env
# 填入 Key
docker-compose up -d
```

## 项目结构

```
workmind/
├── frontend/               Vue3 前端
│   ├── src/
│   │   ├── views/          各模块页面
│   │   ├── components/     UI 组件
│   │   ├── stores/         Pinia 状态
│   │   ├── composables/    组合式函数
│   │   ├── utils/          工具（http、sse）
│   │   └── styles/         全局样式
│   └── vite.config.js
│
├── server/                 Node.js 后端
│   ├── src/
│   │   ├── routes/         API 路由
│   │   ├── services/       业务逻辑
│   │   ├── middleware/      中间件
│   │   ├── utils/          工具（日志、错误）
│   │   └── config/         配置管理
│   └── Dockerfile
│
└── docker-compose.yml
```

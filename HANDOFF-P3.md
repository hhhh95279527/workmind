# WorkMind 工程交接文档（P3 续建指南）

> 最后更新：2026-09-16
> 状态：**P0 / P1 / P2 全部完成并验证通过；P3 未开始。**
> 用途：token 中断/换会话后，凭本文档可直接续建，不需要重新摸索环境与上下文。

---

## 0. 项目一句话定位

**多租户 AI 工作流平台底座 + 合同风险审查垂直业务**：规则引擎保底 + LangGraph Agent 语义双轨审查，PG checkpointer 持久化人工终审（HITL），产出审查意见书，反馈回流离线 Eval。面向 2027 届全栈求职，主打技术深度与 2 周可掌握。

约束：代码克制、优先高星开源官方方案、业务/平台层分离、中文注释、新代码用规范 TS、每阶段必须可运行、不接支付。

---

## 1. 环境与启动（机器重启后照做）

### 1.1 基础环境（已安装，路径固定）

| 组件 | 版本 | 位置/命令 |
|---|---|---|
| Node | v24.11.1，npm 11.6.2 | PATH 内 |
| PostgreSQL | 16.4 |  bin：`C:\Users\18229\.local\lib\pgsql\bin\`；data：`C:\Users\18229\.local\share\pgdata` |
| Redis | 5.0.14（无密码） | `D:\Redis\redis-server.exe`，端口 6379 |

连接串：`postgresql://workmind@localhost:5432/workmind?schema=public`（trust 免密）
psql：`C:\Users\18229\.local\lib\pgsql\bin\psql.exe -U workmind -d workmind -h localhost`

### 1.2 重启后按顺序拉起（Windows PowerShell）

```powershell
# 1) PostgreSQL
& "C:\Users\18229\.local\lib\pgsql\bin\pg_ctl.exe" -D "C:\Users\18229\.local\share\pgdata" -l "C:\Users\18229\.local\share\pgdata\server.log" start

# 2) Redis（后台窗口或 run_in_background）
& "D:\Redis\redis-server.exe" --port 6379

# 3) 后端（在 d:\Project\workmind\server）
npm run dev          # http://localhost:3000

# 4) 前端（在 d:\Project\workmind\frontend）
npm run dev          # http://localhost:5173
```

健康检查：`GET http://localhost:3000/health`。

### 1.3 测试账号

| 账号 | 密码 | 租户 | 角色 | 备注 |
|---|---|---|---|---|
| testboss | Test1234 | 测试科技（id `cmu0xoil70001n3szpivkmnpd`） | ADMIN | 配额 500000，名下 7 份样例合同 |
| boss2 | Test1234 | 另一家公司 | ADMIN | 名下 1 份（个人借款合同），用于跨租户测试 |

登录响应字段是驼峰 **`accessToken`**（还有 refreshToken）；user 含 id/username/displayName/role/tenantId。

### 1.4 AI Key（重要）

`server/.env` 的 `DEEPSEEK_API_KEY` 当前是**占位中文文本**（形如 `sk-在此填入你的DeepSeek密钥`，以文件实际内容为准），不是真 key。
- 规则轨、条款切分（词典分类）、法规检索（关键词降级）**无 key 也能完整跑**；
- 启动时 `isValidAiKey()`（`src/config/index.ts`，正则 `^sk-[\x21-\x7e]{10,}$`，中文非 ASCII 必判无效）会打印格式异常警告；
- Agent 轨发 `agent_skip` 事件跳过，不再产生 "Connection error." 噪声；
- 演示双轨前需到 https://platform.deepseek.com 申请真实 key 替换。
- embeddings 用 `ZHIPU_API_KEY` 或 `OPENAI_API_KEY`（无则自动降级中文关键词召回，日志有提示，属预期）。

### 1.5 `.env` 变量清单（当前实际内容）

| 变量 | 当前值/说明 |
|---|---|
| DEEPSEEK_API_KEY | 占位文本，需替换 |
| ZHIPU_API_KEY / OPENAI_API_KEY | 空，embedding 二选一 |
| TAVILY_API_KEY | 空，无则 web_search 工具自动隐藏 |
| FEISHU_WEBHOOK | 空，审查完成通知（已留位，确认是否已接线再用） |
| PRIMARY_MODEL | `deepseek-chat` |
| EMBED_MODEL / EMBED_BASE_URL | `BAAI/bge-m3` / `https://api.siliconflow.cn/v1` |
| CACHE_TTL | 1800000（两级缓存 TTL，毫秒） |
| PORT / NODE_ENV / ALLOWED_ORIGINS | 3000 / development / http://localhost:5173 |
| DATABASE_URL | `postgresql://workmind@localhost:5432/workmind?schema=public` |
| REDIS_URL | `redis://localhost:6379` |
| JWT_SECRET / JWT_EXPIRES_IN | dev-local 密钥 / 7d（生产必换） |
| JWT_REFRESH_SECRET / JWT_REFRESH_EXPIRES_IN | dev-local / 30d |

### 1.6 装包

server：`npm install --legacy-peer-deps --registry=https://registry.npmmirror.com`
frontend：`npm install --registry=https://registry.npmmirror.com`

---

## 2. 仓库结构地图

```
d:\Project\workmind\
├── server/                       # NestJS 10 + TS 5.7（ESM）
│   ├── prisma/
│   │   ├── schema.prisma         # 20 个 model（见 §3）
│   │   ├── migrations/           # 手写 SQL 迁移（init / user_email / rule_guidance / rule_scope）
│   │   ├── seed.ts               # npm run seed，幂等：规则+法规+模板+8合同+账号
│   │   └── fixtures/
│   │       ├── legal.ts          # 3 篇法规 + 2 份模板（LEGAL/TEMPLATE）
│   │       └── contracts.ts      # 8 份埋雷样例合同
│   └── src/
│       ├── main.ts               # 启动入口
│       ├── app.module.ts         # 全局 Guard + 中间件挂载（上传/限流路由在此）
│       ├── config/index.ts       # env 配置 + validateConfig + isValidAiKey
│       ├── auth/                 # JWT(local策略+刷新) + RBAC(@Roles/RolesGuard)
│       ├── chat/                 # 对话 DB 化
│       ├── knowledge/            # RAG 知识库接口
│       ├── agent/                # 通用 Agent 接口
│       ├── contract/             # ★ P2 核心业务
│       │   ├── contract.controller.ts       # 上传/列表/详情/审查SSE/终审/意见书
│       │   ├── parsing/
│       │   │   ├── clause-parser.ts         # splitClauses 正则切分 + cnToInt + 词典分类 + LLM 精修
│       │   │   └── contract-parse.service.ts# BullMQ 消费者（QUEUES.CONTRACT_PARSE）
│       │   ├── rules/
│       │   │   ├── rules.seed.ts            # 12 条声明式规则（scope/pattern/keywords/prompt…）
│       │   │   └── rule.engine.ts           # runRuleEngine(clauses, rules, {labor})
│       │   └── review/
│       │       ├── review.agent.ts          # ★ LangGraph 双轨图 + startReview/resumeReview
│       │       ├── checkpointer.ts          # PostgresSaver 惰性单例
│       │       └── report.ts                # buildOpinionMarkdown 意见书模板
│       ├── services/
│       │   ├── model.ts          # createChatModel（DeepSeek OpenAI 兼容）
│       │   ├── rag/
│       │   │   ├── pg-store.ts   # PG 余弦检索 + 关键词降级（SIMILARITY_THRESHOLD=0.35）
│       │   │   ├── ingest.ts     # ingestText/ingestDocument/getDocRegistry/deleteDocument
│       │   │   └── query.ts      # retrieveDocs（多查询扩展、callbacks 透传）
│       │   ├── agent/tools.ts    # read_doc/legal_search/calculate/get_date/Tavily
│       │   ├── cache.ts          # 两级缓存 + 租户 namespace
│       │   └── prompt/
│       ├── observability/
│       │   ├── trace.service.ts       # tracer.run（AsyncLocalStorage + 回调聚合）
│       │   ├── trace-context.ts
│       │   ├── quota.service.ts       # 租户月度配额，QUOTA_EXCEEDED
│       │   ├── pricing.ts             # 峰谷人民币计价表
│       │   └── langchain-observer.ts  # LLM/TOOL/RETRIEVER Span 记录
│       ├── queue/                # BullMQ 模块（ioredis maxRetriesPerRequest:null）
│       ├── redis/  database/  monitor/  admin/  audit/  health/
│       ├── middleware/           # 限流(Lua令牌桶)/上传(multer)/安全/日志/SSE校验
│       └── utils/                # sse.ts(initSse)、logger、errors
└── frontend/                     # React 19 + Vite 6 + antd 5 + Zustand 5
    ├── nginx.conf                # 生产部署：SPA + /api 反代 + SSE buffering off
    ├── Dockerfile
    └── src/
        ├── App.jsx               # 路由（含 /contracts、/contracts/:id 懒加载）
        ├── config/navigation.jsx # 侧边菜单（SafetyCertificateOutlined）
        ├── stores/               # auth/app/chat/agent/knowledge/contract/monitor
        ├── utils/                # http.js(axios+fetchStream SSE)、markdown.js
        ├── views/
        │   ├── contract/
        │   │   ├── ContractListView.jsx     # 列表+上传(文件/粘贴)+状态筛选+轮询
        │   │   └── ReviewWorkbench.jsx      # 三栏工作台+终审+意见书Modal+打印
        │   └── (chat/knowledge/agent/monitor/admin)
        └── components/contract/RiskCard.jsx # 风险卡（采纳/忽略/备注）
```

---

## 3. 数据库表现状（20 张，全部已迁移）

- 平台/租户：`tenants` `users` `user_profiles` `quota_usages` `system_configs` `audit_logs`
- 对话：`chat_sessions` `messages`
- 可观测：`traces` `spans`（SpanType: LLM/TOOL/RETRIEVER）
- **Eval（表已建好，P3 直接用，无需迁移）**：
  - `eval_cases`：type(`RISK_DETECT`/`RAG_RECALL`/`FAITHFULNESS`)、input Json、expected Json、tags、source(`MANUAL`/`FEEDBACK`)、active、tenantId(null=平台基线集)
  - `eval_runs`：status、summary Json、caseCount/passCount、commitSha
  - `eval_results`：runId+caseId 唯一、passed、score、actual Json、judgeReason、latencyMs
- 知识：`documents` `doc_chunks`（docType: LEGAL/TEMPLATE/GENERAL；embedding JSON + 应用层余弦）
- 合同：`contracts` `clauses` `review_tasks`(threadId 挂 LangGraph) `risks` `review_rules`(scope ALL/LABOR)
- **LangGraph 自建表（PostgresSaver.setup() 自动创建，不要手写迁移）**：`checkpoints` `checkpoint_blobs` `checkpoint_writes` `checkpoint_migrations`。review_tasks.threadId 即 LangGraph thread_id。

队列：BullMQ 队列名常量在 `src/queue/queue.service.ts` 的 `QUEUES`（目前仅 `CONTRACT_PARSE='contract-parse'`）。

---

## 4. 已完成工作与验证证据

### P0（完成）
21 表+迁移（现 20 model）、全局 JWT+RBAC+租户隔离、chat DB 化、mathjs、删除 workflow 旧代码、真实用户菜单。

### P1（完成并实测）
峰谷人民币计价 pricing.ts、AsyncLocalStorage Trace 透传、LangChain Observer（LLM/TOOL/RETRIEVER Span，`recordRetrieverSpan`）、QuotaService（QUOTA_EXCEEDED 经 SSE 透传实测）、BullMQ 队列、Redis Lua 令牌桶限流（实测 30/40）、两级缓存（租户 namespace 修复跨租户泄露）、Tavily 工具（无 key 隐藏）+ legal_search、Monitor 切 Trace 聚合、checkpointer spike（`(PostgresSaver as any).fromConnPool(pool)`，d.ts 未暴露需 any）。

### P2（完成，2026-09-15/16 全链路验证）
1. **规则引擎**：12 条内置规则（劳动 6 + 民商 6），`scope=LABOR` 按用工特征词（LABOR_MARKER 正则）启用；8 份埋雷合同回归命中数：劳动 9 / 软件 5 / 租赁 3 / NDA 2 / 运维 4 / 采购 5 / 借款 4 / 实习 4。
2. **双轨 LangGraph**：`START → load_clauses → rule_scan → agent_review → aggregate → human_review(interrupt) → finalize`
   - 规则轨：pattern 正则失败降级 keywords（全出现才命中），quoteSentence 截取原句；
   - Agent 轨：BATCH_SIZE=6，3 轮 tool loop（legalSearchTool+calculateTool），withStructuredOutput(zod)，**extractVerifiedQuote 幻觉防线**（逐字定位→LCS≥10 字），与规则同条款同类合并升级 BOTH；
   - **HITL 关键修复**：不能用 `interruptBefore + updateState(cfg, values, 'human_review')`（恢复时会跳过节点导致决策不落库）。已改为节点内 `interrupt(payload)` 挂起 + 恢复时 `graph.stream(new Command({ resume: {actions, finalDecision, reviewerId} }))`。
3. **checkpointer 重启恢复实测通过**：审查挂起 → 杀进程 → 重启 → decision resume 成功（任务 APPROVED、合同 COMPLETED、意见书生成）。
4. **API**：POST `/api/contracts/upload|text`、GET `/api/contracts`、GET/DELETE `/api/contracts/:id`、POST `/api/contracts/:id/reviews`(SSE：task/stage/risk/waiting/done/error)、GET `/api/reviews/pending|/:id|/:id/report`、POST `/api/reviews/:id/decision`（ADMIN/MANAGER）。全部强制 tenantId，跨租户 404（boss2 实测）。
5. **seed**：`npm run seed` 幂等（规则 upsert、文档 ingestText、合同 deleteMany 重建+splitClauses、账号 ensure）。
6. **前端**：列表页 + 三栏工作台 + RiskCard + 意见书 Markdown Modal + 浏览器打印/PDF；浏览器 E2E 全 PASS（发起→agent_skip→采纳/忽略/备注→通过→意见书；boss2 空状态 + 单合同列表）。
7. 前后端 `npm run build` 均 EXIT=0。

---

## 5. 关键约定与踩坑（务必遵守）

1. **改 schema 流程**（`prisma migrate dev` 在非交互环境会报错）：
   手写 `prisma/migrations/<时间戳>_<名>/migration.sql` → `npx prisma migrate deploy` → `npx prisma generate` → **手动重启 dev**。
2. import 路径保留 `.js` 后缀（ESM + `register-js-ext.cjs`）；dev 用 ts-node-dev `--transpile-only`。
3. **同一文件禁止并行 Edit**（会互相覆盖，已踩过两次）；必须串行，改后以 Read 实际内容为准。
4. build 前删 `server/dist/*.tsbuildinfo`。
5. PowerShell 传中文 SQL 字面量会编码错乱（UPDATE 匹配 0 行）；更新中文名数据用 ID 或 ASCII 条件。
6. BullMQ ioredis 连接必须 `maxRetriesPerRequest:null` + `enableReadyCheck:false`（Redis 5.0 有版本警告，可忽略）。
7. 合同条款**不入向量库**（结构化遍历 Clause 保证零遗漏）；向量只服务法规/模板检索。
8. LangGraph 状态/条件类型复杂处用 `as any` 切断类型膨胀（TS 5.7 约束）。
9. 前端 SSE 用 `fetchStream`（原生 fetch，URL **必须带 `/api` 前缀**，axios baseURL 不生效——已踩过 404）。
10. 规则新增/修改后必须：改 `rules.seed.ts` → `npm run seed` → 用 §7 的临时回归脚本验证 8 合同命中，防止误报回归。
11. Git 有 3 个旧 commit；**不要主动 commit**，等用户明确要求。
12. 不要主动新建 md 文档（本文件是用户明确要求的例外）。

---

## 6. P3 任务分解（按优先级，含文件、步骤、验收、面试话术）

> 原则：每个任务独立可交付、可演示；先做 6.1~6.3（求职差异化核心），再做 6.4~6.8（包装加固）。

### 6.1 Eval 离线评测集 + Runner（最高优先级）

**目标**：40 条左右 case，一键跑出 precision/recall/F1、recall@k、忠实度，产出可贴简历的"评测驱动开发"闭环。表已存在（§3），**不需要改 schema**。

- 新建 `server/prisma/fixtures/eval-cases.ts`：
  - `RISK_DETECT`（~25 条）：input 用 `fixtures/contracts.ts` 的条款片段或迷你合同；expected = `{ ruleCodes: [...], clauses: [...] }`。8 份样例合同的埋雷点先全部转成 case（每份合同期望命中的 code 列表见 §4.1 的回归数字，可直接从规则结果反推）。
  - `RAG_RECALL`（~8 条）：法律问题 → expected.docIds（legal_labor_contract_law / legal_civil_code_contract / legal_civil_procedure_law），评 recall@3。
  - `FAITHFULNESS`（~7 条）：RAG 问答对，judge prompt 让模型按 0/1 打分并给 reason（无真实 key 时该组标记 skipped，不阻塞）。
- 新建 `server/scripts/run-eval.ts`（参考 `scripts/spike-checkpointer.ts` 的独立运行方式）：
  - `npx ts-node --transpile-only -r ./register-js-ext.cjs scripts/run-eval.ts [--type=RISK_DETECT] [--no-llm]`
  - 创建 EvalRun（commitSha 用 `child_process.execSync('git rev-parse HEAD')`）；
  - RISK_DETECT：对每个 case 直接调 `splitClauses` + `runRuleEngine(..., {labor})`（确定性、零成本、无 key 可跑），与 expected.ruleCodes 算 TP/FP/FN → precision/recall/F1；Agent 轨在有 key 时可选跑（`--with-agent`）；
  - RAG_RECALL：调 `retrieveFromPg`/`retrieveDocs`，命中 expected.docId 即 pass；
  - FAITHFULNESS：createChatModel 做 LLM-as-Judge（temperature=0）；
  - 每条写 EvalResult（actual JSON 存命中明细、judgeReason、latencyMs），summary 写 EvalRun.summary，控制台打印表格；
  - 包 `tracer.run({feature:'eval'})` 让评测消耗也进 Trace。
- seed.ts 增加 `seedEvalCases()`（upsert，按业务 key 如 `eval_risk_001` 固定 id）。
- package.json 加 `"eval": "ts-node --transpile-only -r ./register-js-ext.cjs scripts/run-eval.ts"`。
- **验收**：无 key 环境 `npm run eval` 绿灯，规则组 precision/recall 打印出来（当前回归质量下 macro 指标应很好看）；EvalRun/EvalResult 表有数据。
- **面试话术**："规则和模型改动靠 40 条离线评测集守门，PR 前一键回归，风险检出 F1、检索 recall@k、回答忠实度三类指标可量化。"

### 6.2 CI（GitHub Actions）

- 新建 `.github/workflows/ci.yml`（本地无 Docker 也要让 CI 能跑：用 `apt` 版 postgresql + redis services）：
  - job：install（npm mirror 不需要，CI 用官方源，server 带 `--legacy-peer-deps`）→ `prisma migrate deploy`（给 CI 建库建用户的步骤写在 workflow env）→ `prisma generate` → `npm run seed` → `npm run build`（前后端 matrix）→ `npm run eval -- --no-llm`。
  - 注意 Windows 路径相关脚本不要进 CI；run-eval 必须跨平台（用 path.join，已有的 register hook 是 cjs 没问题）。
- **验收**：推一个分支能看到 CI 绿；README 加 badge。

### 6.3 Trace 瀑布页 + EvalView（前端深度牌）

- 后端（**已确认现状，需要新建**）：`monitor.controller.ts` 目前只有 `GET /api/monitor/stats`、`GET /api/monitor/quota`、`PUT /api/monitor/budget`，**没有 traces 查询接口**；monitor.service.ts 仅有 getStats。需新增：
  - `GET /api/monitor/traces`（分页 + feature/status 过滤 + tenantId 自动注入；非平台管理员强制自己租户）
  - `GET /api/monitor/traces/:id`（含 spans，按 startedAt 升序）
  - service 直接查 prisma.trace/span（表结构见 §3），复用现有 RolesGuard。
- monitor 前端 store 已有 `stores/monitor.js`，先看现有 MonitorView 取的 stats 结构再扩展，不要重写。
- 前端新建 `views/monitor/TraceWaterfall.jsx`：
  - 左列表（trace：feature 标签、耗时、token、费用¥、状态）；右详情用时间轴画瀑布（LLM/TOOL/RETRIEVER 三色条，按 startedAt 偏移+durationMs 宽度），点击展开 input/output JSON、token、费用；
  - SSE 实时可后置，先做轮询/手动刷新。
- 新建 `views/admin/EvalView.jsx`（挂到 AdminLayout 子路由）：EvalRun 列表（commitSha、通过率、summary 指标）→ 点进去看 EvalResult 明细（passed/score/judgeReason/actual diff），失败 case 红色高亮。
- **验收**：能在页面看到一次合同审查 trace 的 rule/LLM/TOOL span 瀑布；能看到 eval run 报告。

### 6.4 人工反馈飞轮

- decision 接口已把 ACCEPTED/IGNORED + comment 落 Risk。补一个"误报/漏报反馈 → EvalCase(source=FEEDBACK)"的沉淀：
  - 方案 A（推荐，克制）：在终审 finalize 后，对被 IGNORED 的规则风险自动生成/更新一条 `RISK_DETECT` 负样本（input=条款，expected 不含该 code，tags=['feedback',ruleCode]）；被反复采纳但规则没命中的（Agent 风险）生成正样本。写一个 `scripts/sync-feedback.ts` 手动/定时跑，**不要耦合在审查主链路**。
  - tenantId 写当前租户（平台基线集为 null，反馈集按租户隔离）。
- **验收**：终审忽略若干风险 → 跑 sync → eval_cases 出现 source=FEEDBACK 记录 → 下次 eval 纳入统计。

### 6.5 租户配额/账单页

- QuotaService/pricing.ts 已有数据（quota_usages、Trace 费用聚合）。
- 前端 `views/BillingView.jsx`：本月 token 用量/配额进度条、峰谷费用折线（按天聚合 traces.costCny）、按 feature（chat/rag/contract_review/eval）饼图、超额记录。普通租户看自己，ADMIN 可在管理后台看全租户。
- 简单图表优先用 antd 自带（Progress/Statistic/Table），**不引 echords/echarts 重依赖**，除非确实需要。

### 6.6 规则管理后台

- CRUD `review_rules`（名称/severity/category/scope/pattern/keywords/prompt/suggestion/legalBasis/enabled/sortOrder），仅平台 ADMIN。
- 关键交互：规则编辑页提供"试运行"——粘贴一段条款文本，实时调规则引擎（可加 `POST /api/admin/rules/try` 不落库），展示命中+quote，降低正则改错风险。
- 列表显示 scope 标签；改完提示"规则变更将影响下次审查，建议跑一次 Eval"。

### 6.7 安全收口

- 复查：所有业务查询 tenantId（grep `findFirst/findMany/update/delete` 审计）；JWT 刷新轮转；helmet/CSP（nginx 已有模板）；上传文件类型/大小（contractFileUpload 已限 .txt/.md/.pdf/.docx，加 magic number 校验更佳）；pdf-parse/xlsx 解析超时与异常隔离（队列已隔离进程内失败，注意超大文件内存）；SSE 鉴权头（fetch 带 Bearer 已做）；审计日志敏感字段脱敏。
- 输出一个安全 checklist 注释/文档段（写进 README，不单独建 md）。

### 6.8 工程清理与文档

- 从 `server/package.json` 移除 `chromadb`（代码已零引用；删后 `npm install --legacy-peer-deps` 更新 lock，再 build+冒烟）。
- 检查 tesseract.js/sharp 是否真有调用路径，未用则标注（OCR 目前只用于扫描版检测提示，确认后再决定保留）。
- `docs/adr/`：3~5 篇 ADR（001 为什么去 Chroma 选 PG 余弦、002 双轨审查与规则 scope、003 LangGraph interrupt 选型与 resume 教训、004 多租户隔离策略、005 配额计价）。**等用户同意再建**（目录型文档，一次建一批）。
- README 重写：项目定位 → 架构图（文字版）→ 快速开始（§1 内容）→ 演示脚本（登录→合同→审查→终审→意见书）→ Eval/CI → 技术栈表 → 面试 Q&A。
- 前端 chunk 体积：markdown 包 1MB，可改为意见书弹窗内 `const {renderMarkdown}=await import('@/utils/markdown.js')` 动态导入。

---

## 7. 规则回归脚本（临时用，勿提交）

改规则后在 server 目录建 `tmp-check-rules.ts`（ESM 语法，与项目一致；已核对 SAMPLE_CONTRACTS / splitClauses / runRuleEngine 的真实导出与字段）：

```ts
import { PrismaClient } from '@prisma/client'
import { runRuleEngine } from './src/contract/rules/rule.engine.js'
import { splitClauses } from './src/contract/parsing/clause-parser.js'
import { SAMPLE_CONTRACTS } from './prisma/fixtures/contracts.js'

const prisma = new PrismaClient()
const LABOR = /劳动合同|用人单位|劳动者|试用期|竞业限制|社会保险|社保|解除劳动合同|实习生?|员工入职|工资/

async function main() {
  const rules = await prisma.reviewRule.findMany()
  for (const sc of SAMPLE_CONTRACTS) {
    const parsed = splitClauses(sc.content)
    const clauses = parsed.map((c, i) => ({ id: String(i), indexNo: i, title: c.title, content: c.content }))
    const findings = runRuleEngine(clauses, rules, { labor: LABOR.test(sc.title + sc.content) })
    const byCode: Record<string, number> = {}
    findings.forEach((f) => (byCode[f.code] = (byCode[f.code] || 0) + 1))
    console.log(`${sc.title.split('（')[0]} total=${findings.length}:`,
      Object.entries(byCode).map(([k, v]) => `${k}x${v}`).join(' '))
  }
  await prisma.$disconnect()
}
main()
```

运行：`npx ts-node --transpile-only -r ./register-js-ext.cjs tmp-check-rules.ts`，**用完删除**。
注意：若 ts-node 对 fixtures 导入路径报 `.js` 找不到，把 import 后缀去掉再试（register 钩子版本差异）；seed.ts 是可参照的可运行样板。
期望命中：劳动 9 / 软件 5 / 租赁 3 / NDA 2 / 运维 4 / 采购 5 / 借款 4 / 实习 4。

---

## 8. 常用命令速查

```powershell
# server (d:\Project\workmind\server)
npm run dev                         # 开发（ts-node-dev respawn）
npm run build                       # 生产构建
npm run seed                        # 幂等种子
npx prisma migrate deploy           # 应用手写迁移
npx prisma generate
npx prisma studio                   # 可视化看数据
& "C:\Users\18229\.local\lib\pgsql\bin\psql.exe" -U workmind -d workmind -h localhost -c "SQL"

# frontend (d:\Project\workmind\frontend)
npm run dev                         # 5173
npm run build

# API 冒烟（PowerShell）
$login = Invoke-RestMethod http://localhost:3000/api/auth/login -Method Post -ContentType 'application/json' -Body '{"username":"testboss","password":"Test1234"}'
Invoke-RestMethod http://localhost:3000/api/contracts -Headers @{Authorization="Bearer $($login.accessToken)"}
```

SSE 接口（审查）用 HttpWebRequest 或浏览器 EventStream 测，PowerShell 简单 POST 也能拿到完整事件文本。

---

## 9. 已知非阻塞问题

- `chromadb` 依赖未删（代码已切 PG，P3 6.8 处理）。
- Redis 5.0 < BullMQ 建议的 6.2，启动有警告，功能正常。
- Agent 轨、LLM 精修条款类型、embedding、FAITHFULNESS 评测均依赖真实 key；无 key 全部静默降级，不影响主流程。
- 前端 vite chunk >500KB 警告（markdown/hljs），6.8 动态导入优化。
- 后端后台 dev 任务在机器重启/手动杀进程后会显示 failed（如 1073807364），**不是代码问题**，按 §1.2 重启即可。

---

## 10. 续建开场白（可直接复制给下一个会话）

> 读 `d:\Project\workmind\HANDOFF-P3.md`，P0-P2 已完成。先按 §1 拉起 PG/Redis/前后端并验证 health，然后从 P3 的 6.1 Eval runner 开始：新建 fixtures/eval-cases.ts + scripts/run-eval.ts，规则组无 key 可跑，验收 `npm run eval` 输出 precision/recall/F1。遵守 §5 全部约定（手写迁移、.js 后缀、同文件串行 Edit、不主动 commit/建 md）。

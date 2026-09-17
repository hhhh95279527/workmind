# ADR-003：人工终审用 LangGraph interrupt + PostgresSaver，不用自建状态机

- 状态：Accepted（2026-09）
- 相关代码：`server/src/contract/review/checkpointer.ts`、`review/review.agent.ts`、`prisma/schema.prisma`（review_tasks.threadId；checkpoints 等 4 张表由 saver.setup() 自建）

## 背景

审查流程必须在「风险已识别、等待人工终审」处暂停，且要满足：

- 用户关掉浏览器、服务重启后，第二天还能从断点继续并出意见书；
- 终审可能逐条给出采纳/忽略/备注，恢复时要把这批决策注入图；
- 一次审查涉及多次 LLM 调用与工具检索，状态结构复杂（条款、风险、中间结论）。

候选方案：①自己在业务表设计状态字段 + 手工序列化中间态；②用工作流引擎的持久化能力。

## 决策

采用 LangGraph 官方的 Human-in-the-Loop 模式：

- StateGraph 在终审节点前 `interrupt`，完整图状态由 `PostgresSaver` 写入 PG（`checkpoints / checkpoint_blobs / checkpoint_writes / checkpoint_migrations`，由 `saver.setup()` 自建，**不手写迁移**）；
- 发起审查时生成 thread_id 并存入 `review_tasks.threadId`，它是恢复审查现场的唯一钥匙；
- `startReview` 跑首段（SSE 推送风险），`resumeReview(threadId, decisions)` 带终审 payload 恢复；
- Checkpointer 惰性单例：首次审查时才建 pool（max=5）并 setup，初始化失败允许下次重试。

## 踩过的坑（resume 教训）

1. **0.0.5 版本 d.ts 未暴露 `fromConnPool`**：运行时存在但类型上没有，最终用 `(PostgresSaver as any).fromConnPool(pool)` 桥接，并保留 `new PostgresSaver(pool)` 兜底；
2. **thread_id 必须从业务侧持有**：早期只在日志里出现，恢复时找不到现场；现在强制在发起审查时落 `review_tasks.threadId`；
3. **interrupt 不是「挂起 HTTP 请求」**：SSE 连接在暂停时正常结束，恢复是另一个独立请求，靠 thread_id 关联——不能把待决状态存在请求上下文或进程内存；
4. **spike 先行**：正式接入前用 `scripts/spike-checkpointer.ts` 独立验证 setup/中断/恢复，再动业务代码。

## 后果

正面：中间态（含 LangChain message 序列）由框架序列化，无需手维护状态表；恢复语义（updateState/Command resume）官方保证；服务重启无丢失。

负面：checkpoint 表结构是框架内部格式，不应用 SQL 直接解读；调试需要理解 LangGraph 的 thread/checkpoint/write 三层模型。

## 备选方案

- **自建状态字段**：可控但要为每种中间态写序列化与恢复逻辑，等于重造半个 checkpointer；
- **MemorySaver（进程内存）**：API 最简但重启即丢，只适合 spike，不满足业务要求。

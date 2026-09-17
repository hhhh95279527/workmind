# ADR-005：配额与计价——Token 月度配额硬拦截 + 人民币峰谷计价单一事实源

- 状态：Accepted（2026-09）
- 相关代码：`server/src/observability/pricing.ts`、`quota.service.ts`、`trace.service.ts`；`tenants.monthlyTokenQuota`、`quota_usages` 表

## 背景

SaaS 需要回答两类问题：①「这个租户这个月还能不能调模型」（限额）；②「这次调用到底花了多少钱」（计量）。要求：

- 限额不能只在前端提示，必须在服务端真正拦截，且要能穿过 SSE 长连接把错误送到前端；
- 价格只应维护一处，避免不同页面/服务各写一份估价导致对不上账；
- DeepSeek 有峰谷定价与上下文缓存折扣，账单要能体现真实成本。

## 决策

**配额（前置拦截）**

- 每租户 `tenants.monthlyTokenQuota`（演示账号 500,000），消耗按自然月记 `quota_usages`（`tenantId + period` 唯一，period 形如 `202609`）；
- `QuotaService.assert(tenantId)` 在每个花钱的入口（chat/knowledge/agent/review SSE 起始处）调用，`usedTokens >= quota` 抛 `QuotaExceededException`，经 SSE 错误帧透传前端；
- 计数用 Prisma upsert 的原子自增，避免并发双花。

**计价（事后计量，单一事实源）**

- `pricing.ts` 是全仓库唯一允许出现单价的地方，纯函数、无 IO、无 Nest 依赖，可单测可现场手算：
  - 单价表：元/百万 token，区分缓存未命中输入 / 缓存命中输入（约 1/50）/ 输出；
  - 峰谷：北京时间工作日 09:00-12:00、14:00-18:00 高峰，其余及周末半价；
  - 缓存命中数取 `usage.prompt_cache_hit_tokens`，与未命中拆分计价；
- Token 用量不在业务代码里手抄，由 LangChain Callback（langchain-observer）在 LLM Span 结束时统一聚合，Trace finish 时一次 `record()` 入账（Decimal(10,4) 对齐）。

## 后果

正面：

- 超额租户被服务端硬拦，无法靠改前端绕过；错误对 SSE 与普通 JSON 请求表现一致；
- 任何页面（看板、账单、Trace 详情）的 ¥ 数字都由同一函数产出，不存在口径分歧；
- 峰谷与缓存折扣让账单贴近真实成本，也给「引导用户闲时跑批量」留了运营空间。

负面/约束：

- `assert` 是调用前检查，单月临界点可能有少量超额（先通过检查、后入账），属可接受的软边界；
- 价格随厂商调整，需要定期（本项目以月为单位）核对官方定价页并更新常量。

## 备选方案

- **网关层（如 token-bucket proxy）限额**：与业务租户模型脱节，且无法按自然月账期统计；
- **页面各自估价**：早期原型做法，导致看板与账单数字不一致，已收敛为 `pricing.ts` 单一事实源；
- **只记 Token 不折人民币**：无法回答「成本/账单」问题，峰谷优惠也无从体现，被否。

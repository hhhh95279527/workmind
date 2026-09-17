# ADR-004：多租户隔离采用「共享库 + 行级 tenant_id」，默认拒绝而非默认放行

- 状态：Accepted（2026-09）
- 相关代码：全部业务 controller/service；`server/src/services/rag/pg-store.ts`；`chat/knowledge` controller；`middleware`

## 背景

平台是多租户 SaaS（演示中 testboss 与 boss2 分属两家公司），合同、文档、对话、Trace、配额互不可见。隔离方式候选：①每租户独立库/schema；②共享库行级隔离。

## 决策

**共享一个数据库，所有业务表带 `tenant_id`，隔离在应用查询层强制。**

具体约束（安全审计后固化为 checklist）：

1. **读取先带租户条件**：用 `findFirst({ where: { id, tenantId } })`，不用 `findUnique(id)` 再事后比对——后者容易漏掉；
2. **默认拒绝（deny by default）**：RAG 检索层对 GENERAL/未指定类型，只有显式传入 tenantId 才放行「本租户 + 平台共享」范围；未带身份只返回 `tenantId=null` 的平台共享文档。杜绝「漏传参数 = 查全库」的失效模式；
3. **平台级数据显式标注**：LEGAL/TEMPLATE 文档、review_rules、平台基线 eval_cases 不带租户，是有意共享，而非漏配；
4. **非表资源也要按属主隔离**：RAG 会话历史是进程内 Map，key 必须命名空间化为 `rt:{tenantId}:{userId}:{sessionId}`；缓存 key 带租户 namespace；
5. **跨租户关联资源校验**：对话带 `contractId` 时，开流前先查合同归属本租户，否则 403，防止把消息挂到他人合同；
6. **错误信息不区分**：跨租户访问与不存在统一回 404/403，防 id 枚举；
7. **内部信任链路例外**：BullMQ 解析 worker、LangGraph 内部恢复、trace finish 等按内部 id 操作的后台链路属于设计内信任边界，不加 tenantId（入口已保证资源归属）。

## 验证方式

- 静态：审计所有 `findFirst/findMany/update/delete` 是否带租户约束；
- 动态：用两个租户账号做 IDOR 冒烟（拿对方合同 id 挂对话、删对方文档、读对方会话、看对方分类），全部拒绝才算通过。

## 后果

正面：运维简单（一套备份/迁移/连接池）、跨租户平台分析容易、租户开通零 DDL；演示数据可在一个 seed 中就绪。

负面：隔离正确性依赖代码纪律，一条漏带 where 的查询就是泄漏——所以用「默认拒绝 + 评审 checklist + 双租户冒烟」三层补偿。

## 备选方案

- **每租户独立 schema/库**：物理隔离最强，但连接池与迁移运维成本在演示/中小规模下过高；如未来出现强合规客户，可对该客户单独切库，应用层接口不变。
- **Postgres RLS（行级安全策略）**：可作为后续加固，把隔离下沉到数据库；当前先用应用层 + 默认拒绝覆盖。

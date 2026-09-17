# ADR-001：RAG 检索去 Chroma，落 PostgreSQL（应用层余弦 + 关键词降级）

- 状态：Accepted（2026-09）
- 决策者：项目负责人
- 相关代码：`server/src/services/rag/pg-store.ts`、`server/src/services/rag/ingest.ts`、`prisma/schema.prisma`（documents / doc_chunks）

## 背景

项目早期 RAG 使用 ChromaDB（独立容器 + HTTP 访问），业务数据在 PostgreSQL。实际开发中暴露四个问题：

1. **多一套有状态基础设施**：本地演示与 CI 都要额外起 Chroma 容器，网络/版本问题频繁打断演示；
2. **租户隔离要在两处重做一遍**：业务表用 `tenant_id` 行级隔离，Chroma collection 的可见性逻辑是另一套模型，跨租户泄漏面翻倍；
3. **事务边界割裂**：文档登记在 PG、向量在 Chroma，删除/更新需要跨系统对账，孤儿 chunk 已实际出现过；
4. **数据量很小**：演示规模 chunk 不足 10 万，专用向量库的 ANN 索引优势用不上。

同时 embedding 服务（BGE-M3 / 智谱）不稳定，无 Key 或服务失败时必须有不依赖向量的检索兜底。

## 决策

- 向量与文档元数据全部存 PostgreSQL：`doc_chunks.embedding` 以 JSON 数组保存（1024 维），检索时取候选在应用层算余弦相似度；
- 同一条检索路径内置**中文关键词召回降级**（SQL contains OR 召回 + 命中词长加权精排），embedding 不可用时功能不中断；
- 阈值常量 `SIMILARITY_THRESHOLD = 0.35`；多查询变体合并去重，同 chunk 取单变体最高分；
- 可见性规则与业务库统一：LEGAL/TEMPLATE 平台共享，GENERAL 为「本租户 + 平台共享文档」，未带租户身份默认只返回共享文档。

## 后果

正面：

- 零额外容器，`docker compose` 只剩 PG + Redis + 应用，CI 不再需要向量库 service；
- 文档删除随 Prisma 事务级联，无孤儿数据；租户隔离只维护一套规则；
- 备份/迁移/演示数据统一在一个 SQL dump 内。

负面/约束：

- 应用层余弦是全表取候选，上限约 10~50 万 chunk；超过后必须演进；
- JSON 存向量比二进制类型更占空间。

## 演进路径（已预留）

检索入口收敛在 `retrieveFromPg(db, query, opts)` 一个函数内。规模上来后按顺序切换：
①PG 装 pgvector 扩展改为 `<=>` ANN 查询（表结构改动小）；②仍不够再上专用向量库。业务层（query.ts / agent tools / Eval）不感知。

## 备选方案

- **继续用 Chroma**：检索性能更好，但多基础设施与隔离成本在本项目规模下不划算；
- **pgvector 一步到位**：初期评估时为减少扩展依赖（Windows 本地 PG 装扩展有摩擦）暂缓；接口已为其留好替换点。

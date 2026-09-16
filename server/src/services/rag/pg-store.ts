// server/src/services/rag/pg-store.ts
// PG 向量检索层：demo 规模下 embedding 以 JSON 存 PG、应用层算余弦；
// 未配置 embedding key 时降级为中文关键词召回（标点切词 + 词长加权），功能不中断。
// 规模增长后只需把本文件替换为 pgvector 的 <=> 检索，调用方零改动。
import type { DocType, PrismaClient } from '@prisma/client'
import { embeddings } from '../model.js'
import { recordRetrieverSpan } from '../../observability/langchain-observer.js'
import { logger } from '../../utils/logger.js'

export interface RetrieveOptions {
  k?: number
  /** 文档类型过滤：LEGAL 法规库 / TEMPLATE 模板库 / GENERAL 租户知识库 */
  docType?: DocType
  /** 租户隔离：GENERAL 文档限定本租户；LEGAL/TEMPLATE 为平台共享（tenantId=null） */
  tenantId?: string | null
  /** 旧接口兼容：按 category 文本过滤 */
  category?: string
}

export interface RetrievedChunk {
  chunkId: string
  docId: string
  title: string
  content: string
  score: number
  mode: 'vector' | 'keyword'
  category: string
  preview: string
}

const SIMILARITY_THRESHOLD = 0.35

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

/** 中文无分词器：按标点/空白切词，保留 2 字以上词元 */
function tokenize(text: string): string[] {
  return Array.from(new Set(
    text.split(/[\s，。、？?！!,.；;：:""''（）()【】\[\]《》<>\/\\|\-—_]+/)
      .filter((t) => t.length >= 2),
  )).slice(0, 8)
}

/**
 * 从 PG 检索相关 chunk。
 * 向量模式：全表取候选（demo 数据量 < 10 万 chunk）应用层余弦；
 * 关键词模式：SQL contains OR 召回 + 命中词长加权精排。
 */
export async function retrieveFromPg(
  db: PrismaClient,
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  const started = Date.now()
  const k = opts.k ?? 4

  // 文档可见范围：法规/模板平台共享；普通知识库按租户隔离
  const docWhere: any = {}
  if (opts.docType) docWhere.docType = opts.docType
  if (opts.category) docWhere.category = opts.category
  if (opts.docType === 'GENERAL' || (!opts.docType && opts.tenantId)) {
    docWhere.OR = [{ tenantId: opts.tenantId ?? null }, { tenantId: null }]
  }

  // ── 向量模式 ──────────────────────────────────────────────────
  if (embeddings) {
    try {
      const queryVec = await embeddings.embedQuery(query)
      const chunks = await db.docChunk.findMany({
        where: { document: docWhere },
        include: { document: true },
        take: 20000,
      })
      const scored = chunks
        .map((c) => {
          const vec = c.embedding as unknown as number[]
          return { c, score: Array.isArray(vec) && vec.length ? cosine(queryVec, vec) : 0 }
        })
        .filter((x) => x.score >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b.score - a.score)
        .slice(0, k)

      if (scored.length) {
        const out = scored.map(({ c, score }) => toResult(c, score, 'vector'))
        await recordRetrieverSpan(
          'pg-vector-search',
          { query, mode: 'vector', k },
          { count: out.length, topScore: out[0].score, titles: out.map((o) => o.title) },
          Date.now() - started,
        )
        return out
      }
      // 向量没命中（空库/问题太偏）：继续走关键词兜底
    } catch (e) {
      logger.warn('pg-store: vector retrieve failed, fallback to keyword', { error: (e as Error).message })
    }
  }

  // ── 关键词模式（embedding 未配置 / 向量零命中时的兜底）────────────
  const tokens = tokenize(query)
  if (!tokens.length) return []

  const chunks = await db.docChunk.findMany({
    where: {
      document: docWhere,
      OR: tokens.map((t) => ({ content: { contains: t } })),
    },
    include: { document: true },
    take: 200,
  })

  const scored = chunks
    .map((c) => ({
      c,
      score: tokens.reduce((s, t) => s + (c.content.includes(t) ? t.length : 0), 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    // 归一化到 0~1 区间，仅用于前端展示
    .map((x) => ({ c: x.c, score: Math.min(0.9, x.score / 20) }))

  const out = scored.map(({ c, score }) => toResult(c, score, 'keyword'))
  await recordRetrieverSpan(
    'pg-keyword-search',
    { query, mode: 'keyword', k },
    { count: out.length, topScore: out[0]?.score },
    Date.now() - started,
  )
  return out
}

function toResult(c: any, score: number, mode: 'vector' | 'keyword'): RetrievedChunk {
  return {
    chunkId: c.id,
    docId: c.documentId,
    title: c.document?.title || '未知来源',
    content: c.content,
    score: parseFloat(score.toFixed(3)),
    mode,
    category: c.document?.category || '通用',
    preview: `${c.content.slice(0, 80).replace(/\s+/g, ' ')}...`,
  }
}

/** 向量化并持久化一批 chunk；无 embedding key 时存空数组（检索自动降级关键词） */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!embeddings) return texts.map(() => [])
  return embeddings.embedDocuments(texts)
}

// server/src/services/agent/tools.ts
// Agent 工具集：只保留"真工具"——能搜索就真搜索，没配 key 就不暴露给模型；
// 绝不提供"假装发送/假装保存"的工具（模型会学会说谎）。
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { TavilySearchResults } from '@langchain/community/tools/tavily_search'
import { z } from 'zod'
import { evaluate } from 'mathjs'
import type { DatabaseService } from '../../database/database.service.js'
import { config } from '../../config/index.js'
import { logger } from '../../utils/logger.js'

// 函数式模块的 Prisma 句柄（legal_search 用），由 AgentModule 初始化注入
let db: DatabaseService | null = null
export function setToolsDatabase(client: DatabaseService) {
  db = client
}

// ── 工具1：联网搜索（Tavily 真实检索，未配置 key 时不注册）────────
function buildWebSearch(): StructuredToolInterface | null {
  if (!config.ai.tavilyKey) return null
  const t = new TavilySearchResults({ maxResults: 5 })
  // Tavily 默认名/描述对模型不友好，实例化后覆盖为稳定短名
  t.name = 'web_search'
  t.description = '搜索互联网获取最新资讯、法规动态、版本信息。需要最新信息或不确定事实时使用。'
  return t
}

// ── 工具2：知识库检索（公司内部文档）──────────────────────────
export const readDocTool = tool(
  async ({ question }) => {
    logger.info('tool:read_doc', { question })
    try {
      const { retrieveDocs } = await import('../rag/query.js')
      const { activeContext } = await import('../../observability/trace-context.js')
      // 显式带出租户，避免工具在异步上下文丢失时退化为全库检索
      const docs = await retrieveDocs(question, { k: 3, tenantId: activeContext()?.tenantId ?? null })
      if (!docs.length) return `知识库中未找到关于"${question}"的相关内容。`
      return docs.map((doc: any, i: number) => `[文档${i + 1}] ${doc.title}：${doc.content}`).join('\n\n')
    } catch {
      return '知识库暂时不可用，请稍后重试。'
    }
  },
  {
    name: 'read_doc',
    description: '从公司知识库检索内部文档。涉及公司规定、产品手册、内部制度时优先使用。',
    schema: z.object({ question: z.string().describe('要查询的问题或关键词') }),
  }
)

// ── 工具3：法规库检索（平台共享法规文本，向量优先/关键词兜底）────
export const legalSearchTool = tool(
  async ({ query }) => {
    logger.info('tool:legal_search', { query })
    if (!db) return '法规库未初始化。'

    // 走统一 PG 检索层（docType=LEGAL 平台共享），检索过程自动落 RETRIEVER Span
    const { retrieveDocs } = await import('../rag/query.js')
    const docs = await retrieveDocs(query, { docType: 'LEGAL' as any, k: 3, tenantId: null })
    if (!docs.length) return `法规库中未检索到与"${query}"相关的条文。`
    return docs
      .map((d: any, i: number) => `[法条${i + 1}] 出自《${d.title}》\n${d.content.slice(0, 600)}`)
      .join('\n\n')
  },
  {
    name: 'legal_search',
    description: '检索平台法规库（民法典、劳动合同法等条文原文）。合同条款合法性、法定上限、强制性规定问题必须先用它查条文，禁止凭记忆引用法条。',
    schema: z.object({ query: z.string().describe('法规关键词，如：违约金 调整、试用期 期限、经济补偿') }),
  }
)

// ── 工具4：数学计算（mathjs 自包含解析，无沙箱逃逸面）──────────
export const calculateTool = tool(
  async ({ expression }) => {
    logger.info('tool:calculate', { expression })
    const safeExpr = expression.trim()
    if (!safeExpr || safeExpr.length > 200) return '无效的数学表达式'
    if (!/^[\d\s+\-*/().,%^a-zA-Z]+$/.test(safeExpr)) return '表达式包含非法字符'
    try {
      return `计算结果：${safeExpr} = ${evaluate(safeExpr)}`
    } catch (e) {
      return `计算失败：${(e as Error).message}`
    }
  },
  {
    name: 'calculate',
    description: '执行精确数学计算（金额合计、比例、百分比、工期）。需要数值结果时使用，不要心算。',
    schema: z.object({ expression: z.string().describe('数学表达式，如 "1500 + 800 * 0.8"' ) }),
  }
)

// ── 工具5：日期计算 ──────────────────────────────────────────
export const getDateTool = tool(
  async ({ operation, date1, date2 }) => {
    logger.info('tool:get_date', { operation, date1, date2 })
    const now = new Date()
    if (operation === 'today') {
      return `今天是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日，星期${['日','一','二','三','四','五','六'][now.getDay()]}`
    }
    if (operation === 'diff' && date1 && date2) {
      const d1 = new Date(date1)
      const d2 = new Date(date2)
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '日期格式不正确，请使用 YYYY-MM-DD'
      const diffDays = Math.ceil(Math.abs(d2.getTime() - d1.getTime()) / 86_400_000)
      let workdays = 0
      const [start, end] = d1 < d2 ? [d1, d2] : [d2, d1]
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) workdays++
      }
      return `${date1} 到 ${date2}：共 ${diffDays} 天，其中工作日 ${workdays} 天`
    }
    if (operation === 'add_days' && date1 && date2) {
      const d = new Date(date1)
      d.setDate(d.getDate() + parseInt(date2, 10))
      return `${date1} 加 ${date2} 天后是 ${d.toISOString().slice(0, 10)}`
    }
    return `今天是 ${now.toISOString().slice(0, 10)}`
  },
  {
    name: 'get_date',
    description: '日期查询与计算：今天日期、两日期间隔（含工作日）、日期加减。',
    schema: z.object({
      operation: z.enum(['today', 'diff', 'add_days']),
      date1: z.string().optional().nullable().describe('YYYY-MM-DD'),
      date2: z.string().optional().nullable().describe('结束日期或天数'),
    }),
  }
)

/**
 * 构建当前可用工具列表：按环境能力动态注册。
 * 模型看不到不存在能力的工具，避免幻觉调用。
 */
export function buildTools(): StructuredToolInterface[] {
  const tools: (StructuredToolInterface | null)[] = [
    buildWebSearch(),
    readDocTool,
    legalSearchTool,
    calculateTool,
    getDateTool,
  ]
  return tools.filter((t): t is StructuredToolInterface => t !== null)
}

export const TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  tavily_search: '联网搜索',
  read_doc: '知识库检索',
  legal_search: '法规库检索',
  calculate: '数学计算',
  get_date: '日期计算',
}

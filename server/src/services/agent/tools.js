// server/src/services/agent/tools.js
// Agent 工具集：6 个工具，每个都有清晰的 name、description、schema
// description 是给模型看的，写清楚"什么情况下用这个工具"很重要
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { logger } from '../../utils/logger.js'

// ── 工具1：联网搜索 ────────────────────────────────────────────
// 生产环境对接真实搜索 API（Tavily、SerpAPI、Bing Search）
// 这里用模拟数据演示工具调用流程
export const searchTool = tool(
  async ({ query }) => {
    logger.info('tool:search', { query })

    // 模拟搜索结果（生产换成真实 API）
    const mockResults = {
      'Vue3': 'Vue 3.4.21 是目前最新版本，于2024年3月发布。主要改进：defineModel() 正式稳定，响应式系统性能提升约 56%，编译器优化减少生成代码量。',
      'React': 'React 18.3 是最新稳定版，引入了并发渲染、useTransition、Suspense 改进。2024年主要关注点是 React Server Components 的稳定化。',
      'Vite': 'Vite 5.2 是目前最新版本，使用 Rollup 4 构建，冷启动速度提升 30%，支持 Lightning CSS。推荐用于新项目。',
      'DeepSeek': 'DeepSeek-V3 于2024年12月发布，是目前最强的开源 LLM 之一，性能接近 Claude 3.5 Sonnet，中文表现优秀，API 价格仅为 GPT-4o 的1/10。',
      'TypeScript': 'TypeScript 5.7 是最新版本，新增 noUncheckedSideEffectImports 选项，改进了声明文件的处理方式。',
      '微前端': 'qiankun 2.x 和 wujie 是国内最流行的微前端框架。wujie 基于 WebComponent + iframe，隔离性更好；qiankun 更成熟，社区更大。',
    }

    // 简单匹配模拟
    const key = Object.keys(mockResults).find(k =>
      query.toLowerCase().includes(k.toLowerCase())
    )

    return key ? mockResults[key] : `关于"${query}"的搜索结果：该话题在技术社区有广泛讨论。建议查阅官方文档获取最准确的信息。`
  },
  {
    name: 'web_search',
    description: '搜索互联网获取最新技术资讯、版本信息、最佳实践。当需要了解某个技术的最新状态或不确定某个信息时使用。',
    schema: z.object({
      query: z.string().describe('搜索关键词，尽量精确，如"Vue3最新版本"而不是"前端框架"'),
    }),
  }
)

// ── 工具2：读取知识库文档 ──────────────────────────────────────
// 从本项目的 RAG 知识库里搜索相关内容
export const readDocTool = tool(
  async ({ question }) => {
    logger.info('tool:read_doc', { question })

    try {
      // 复用第二章的 RAG 检索
      const { retrieveDocs } = await import('../rag/query.js')
      const docs = await retrieveDocs(question, { k: 3 })

      if (!docs.length) return `知识库中未找到关于"${question}"的相关内容。`

      return docs
        .map((doc, i) => `[文档${i + 1}] ${doc.title}：${doc.content}`)
        .join('\n\n')
    } catch {
      return `知识库暂时不可用，请稍后重试。`
    }
  },
  {
    name: 'read_doc',
    description: '从公司知识库检索文档内容。用于查询公司内部规定、产品手册、技术文档等。当问题涉及公司内部信息时优先使用。',
    schema: z.object({
      question: z.string().describe('要查询的问题或关键词'),
    }),
  }
)

// ── 工具3：数学计算 ────────────────────────────────────────────
export const calculateTool = tool(
  async ({ expression }) => {
    logger.info('tool:calculate', { expression })

    try {
      // 只允许纯数学表达式，防止代码注入
      const safeExpr = expression.replace(/[^0-9+\-*/().,\s%]/g, '').trim()
      if (!safeExpr) return '无效的数学表达式'

      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${safeExpr})`)()
      return `计算结果：${expression} = ${result}`
    } catch (e) {
      return `计算失败：${e.message}`
    }
  },
  {
    name: 'calculate',
    description: '执行数学计算，支持加减乘除、括号、百分比。用于需要精确计算数值的场景，比如报销金额合计、工作日计算等。',
    schema: z.object({
      expression: z.string().describe('数学表达式，如 "1500 + 800 * 0.8" 或 "(200 + 350) * 3"'),
    }),
  }
)

// ── 工具4：获取日期信息 ─────────────────────────────────────────
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
      if (isNaN(d1) || isNaN(d2)) return '日期格式不正确，请使用 YYYY-MM-DD 格式'

      const diffMs   = Math.abs(d2 - d1)
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

      // 计算工作日（简单版：减去周末）
      let workdays = 0
      const start = d1 < d2 ? d1 : d2
      const end   = d1 < d2 ? d2 : d1
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const day = d.getDay()
        if (day !== 0 && day !== 6) workdays++
      }

      return `${date1} 到 ${date2}：共 ${diffDays} 天，其中工作日 ${workdays} 天`
    }

    if (operation === 'add_days' && date1 && date2) {
      const d = new Date(date1)
      d.setDate(d.getDate() + parseInt(date2))
      return `${date1} 加 ${date2} 天后是 ${d.toISOString().slice(0, 10)}`
    }

    return `今天是 ${now.toISOString().slice(0, 10)}`
  },
  {
    name: 'get_date',
    description: '获取日期信息：查询今天日期、计算两个日期之间的天数和工作日数、日期加减。用于请假天数计算、项目工期估算等。',
    schema: z.object({
      operation: z.enum(['today', 'diff', 'add_days']).describe('today=获取今天日期, diff=计算日期差, add_days=日期加减'),
      date1: z.string().optional().nullable().describe('开始日期，格式 YYYY-MM-DD'),
      date2: z.string().optional().nullable().describe('结束日期或天数'),
    }),
  }
)

// ── 工具5：生成并保存报告 ─────────────────────────────────────
// 把分析结果整理成结构化报告（实际场景可以写到数据库或文件系统）
export const writeReportTool = tool(
  async ({ title, content, format }) => {
    logger.info('tool:write_report', { title, format })

    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
    const report = `# ${title}

> 生成时间：${timestamp}

${content}

---
*由 WorkMind AI Agent 自动生成*`

    // 实际项目中可以：
    // 1. 写入文件系统
    // 2. 存入数据库
    // 3. 通过邮件发送
    // 这里直接返回内容，前端展示

    return JSON.stringify({
      success: true,
      title,
      content: report,
      savedAt: timestamp,
      message: `报告「${title}」已生成，共 ${report.length} 字`,
    })
  },
  {
    name: 'write_report',
    description: '将分析结果整理成结构化报告并保存。当需要输出最终分析报告时使用，确保在收集到所有信息后才调用此工具。',
    schema: z.object({
      title:   z.string().describe('报告标题'),
      content: z.string().describe('报告正文内容，使用 Markdown 格式'),
      format:  z.enum(['markdown', 'plain']).nullable().default('markdown'),
    }),
  }
)

// ── 工具6：发送通知 ────────────────────────────────────────────
export const sendNotifyTool = tool(
  async ({ to, subject, message, channel }) => {
    logger.info('tool:send_notify', { to, subject, channel })

    // 模拟发送（生产接真实的飞书/钉钉/邮件 API）
    await new Promise(r => setTimeout(r, 200))  // 模拟网络延迟

    return JSON.stringify({
      success: true,
      to,
      subject,
      channel,
      sentAt: new Date().toISOString(),
      message: `通知已通过 ${channel} 发送给 ${to}`,
    })
  },
  {
    name: 'send_notify',
    description: '发送消息通知。可以发送邮件、飞书消息或钉钉消息。用于任务完成后通知相关人员，或发送报告摘要。',
    schema: z.object({
      to:      z.string().describe('接收人，如"张三"或"tech-team"'),
      subject: z.string().describe('消息主题'),
      message: z.string().describe('消息正文（简洁）'),
      channel: z.enum(['email', 'feishu', 'dingtalk']).nullable().default('feishu'),
    }),
  }
)

// 导出所有工具（供 AgentService 使用）
export const allTools = [
  searchTool,
  readDocTool,
  calculateTool,
  getDateTool,
  writeReportTool,
  sendNotifyTool,
]

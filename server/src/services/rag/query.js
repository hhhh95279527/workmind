// server/src/services/rag/query.js
// RAG 查询：检索相关文档 + 生成有来源标注的回答（支持多轮对话历史）
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { chatModel } from '../model.js'
import { getVectorStore } from './ingest.js'
import { logger } from '../../utils/logger.js'
import { rewriteQuery, addMessage, getMessageHistory } from './memory.js'

// ── 相似度阈值：低于此值的文档不纳入参考 ─────────────────────
// 0 = 完全无关，1 = 完全相同
const SIMILARITY_THRESHOLD = 0.4

// ── 检索配置 ──────────────────────────────────────────────────
const INITIAL_K = 10       // 第一次检索拉取更多文档，给重排留空间
const FINAL_K = 4          // 重排后最终保留的文档数
const MULTI_QUERY_COUNT = 3 // 多查询扩展的变体数量

// ── 多查询扩展：生成问题变体 ────────────────────────────────────
const QUERY_EXPANSION_PROMPT = `你是一个擅长从不同角度理解问题的助手。
给定用户的一个问题，请从 {count} 个不同的角度改写这个问题，使其更容易在知识库中检索到相关内容。
每个变体用单独的 {n}. 开头，直接输出问题本身，不要多余的解释。`

function parseQueryVariants(text) {
  const lines = text.split('\n').filter(l => /^\d+\./.test(l.trim()))
  return lines.map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(Boolean)
}

async function expandQuery(question, count = MULTI_QUERY_COUNT) {
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', QUERY_EXPANSION_PROMPT],
      ['human', '问题：{question}'],
    ])
    const chain = prompt.pipe(chatModel).pipe(new StringOutputParser())
    const result = await chain.invoke({ question, count: String(count) })
    const variants = parseQueryVariants(result)
    // 去重、去空，确保包含原问题
    const all = [question, ...variants.filter(v => v && v !== question)]
    logger.info('rag: query expansion', { original: question, variants: all })
    return all
  } catch (e) {
    logger.warn('rag: query expansion failed, using original', { error: e.message })
    return [question]
  }
}

// ── 检索相关文档（增强版：多查询 + 重排序）───────────────────────
/**
 * @param {string} question  - 用户问题
 * @param {object} options
 * @param {string}   options.category  - 可选：只在指定分类里搜索
 * @param {number}   options.k         - 返回文档数量（默认4）
 */
export async function retrieveDocs(question, { category, k = FINAL_K } = {}) {
  const vs = await getVectorStore()

  // 1. 多查询扩展
  const queries = await expandQuery(question)

  // 2. 为每个查询变体检索文档
  const allResults = new Map() // key: content, value: {doc, score}

  for (const q of queries) {
    // 构建 ChromaDB filter
    const filter = category ? { where: { category } } : undefined
    const results = await vs.similaritySearchWithScore(q, INITIAL_K, filter)

    for (const [doc, score] of results) {
      const similarity = 1 - score / 2  // 余弦距离 → 余弦相似度
      if (similarity < SIMILARITY_THRESHOLD) continue

      const key = doc.pageContent.slice(0, 100) // 用内容前缀去重
      if (!allResults.has(key) || similarity > allResults.get(key).score) {
        allResults.set(key, { doc, score: similarity })
      }
    }
  }

  let merged = [...allResults.values()]

  logger.info('rag: raw search results', {
    question: question.slice(0, 40),
    queriesCount: queries.length,
    mergedCount: merged.length,
    topScore: merged[0]?.score?.toFixed(3),
  })

  // 3. 重排序：按相似度降序排列
  merged.sort((a, b) => b.score - a.score)

  // 取 Top K
  const top = merged.slice(0, k)

  logger.info('rag: retrieved docs', {
    question: question.slice(0, 40),
    total: merged.length,
    relevant: top.length,
    topScore: top[0]?.score?.toFixed(3),
  })

  return top.map(({ doc, score }) => ({
    content:  doc.pageContent,
    score:    parseFloat(score.toFixed(3)),
    title:    doc.metadata?.title || '未知来源',
    docId:    doc.metadata?.docId,
    category: doc.metadata?.category,
    preview:  doc.pageContent?.slice(0, 80).replace(/\n/g, ' ') + '...',
  }))
}

// ── RAG Prompt 模板 ───────────────────────────────────────────
const RAG_SYSTEM = `你是 WorkMind AI 知识库助手，是一个严谨的智能问答系统。

## 核心规则
1. 只根据下方提供的参考文档回答问题，绝不使用文档之外的知识
2. 如果文档中没有相关内容，明确回复"知识库中未找到相关内容"
3. 回答要**准确、简洁、有条理**，必要时使用要点列表

## 回答质量要求
- 基于文档内容做概括、归纳，不要原文照抄
- 如果多个文档的信息可以互补，将它们整合起来回答
- 对于具体数据（数字、日期、名称等），确保与原文一致
- 如果文档之间存在矛盾，如实指出
- 保持对话连贯性，参考之前的对话历史理解用户意图

## 来源标注
在回答末尾另起一行，用 【来源：文档名】 格式标注使用了哪些文档。每个来源单独一行。`

// ── 带历史的多轮对话 Prompt ────────────────────────────────────
function buildRagPromptWithHistory(historyMessages) {
  const messages = [['system', RAG_SYSTEM]]

  // 添加历史对话
  for (const msg of historyMessages) {
    messages.push([msg.role === 'user' ? 'human' : 'assistant', msg.content])
  }

  return messages
}

// ── 上下文压缩 Prompt（用于精简过长文档）────────────────────────
const COMPRESS_PROMPT = `请从以下参考文档中提取与问题最相关的内容，去除无关信息。
保留关键数据、结论和论据。直接输出精简后的内容，不要加额外说明。

问题：{question}

文档内容：{content}`

/**
 * 压缩单个文档内容，只保留与问题最相关的部分
 */
async function compressDoc(content, question) {
  // 如果内容很短，不需要压缩
  if (content.length < 300) return content

  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['human', COMPRESS_PROMPT],
    ])
    const chain = prompt.pipe(chatModel).pipe(new StringOutputParser())
    return await chain.invoke({ question, content })
  } catch {
    return content
  }
}

// ── 非流式 RAG（支持历史记忆）──────────────────────────────────
export async function ragQuery(question, options = {}) {
  const { sessionId, ...retrieveOptions } = options

  // 1. 查询重写（结合历史上下文）
  const rewrittenQuestion = sessionId
    ? await rewriteQuery(question, sessionId)
    : question

  // 2. 检索文档
  const docs = await retrieveDocs(rewrittenQuestion, retrieveOptions)

  if (!docs.length) {
    const answer = '知识库中未找到与该问题相关的内容。请尝试换一种提问方式，或上传相关文档后再试。'
    // 记录到历史
    if (sessionId) {
      addMessage(sessionId, 'user', question)
      addMessage(sessionId, 'assistant', answer)
    }
    return { answer, sources: [] }
  }

  // 3. 压缩过长的文档内容
  const compressedDocs = await Promise.all(
    docs.map(async (doc) => ({
      ...doc,
      content: await compressDoc(doc.content, rewrittenQuestion),
    }))
  )

  // 4. 构建带历史的 Prompt
  const context = compressedDocs
    .map((doc, i) => `[参考${i + 1}] 来源：${doc.title}\n${doc.content}`)
    .join('\n\n---\n\n')

  const historyMessages = sessionId ? getMessageHistory(sessionId) : []
  const promptMessages = buildRagPromptWithHistory(historyMessages)

  // 添加当前问题和参考资料
  promptMessages.push([
    'human',
    `参考文档：\n${context}\n\n问题：${question}`,
  ])

  const prompt = ChatPromptTemplate.fromMessages(promptMessages)
  const chain = prompt.pipe(chatModel).pipe(new StringOutputParser())
  const answer = await chain.invoke({})

  // 5. 记录到历史
  if (sessionId) {
    addMessage(sessionId, 'user', question)
    addMessage(sessionId, 'assistant', answer)
  }

  return { answer, sources: docs }
}

// ── 流式 RAG：边生成边推送（支持历史记忆）───────────────────────
export async function ragQueryStream(question, options = {}) {
  const { sessionId, ...retrieveOptions } = options

  // 1. 查询重写（结合历史上下文）
  const rewrittenQuestion = sessionId
    ? await rewriteQuery(question, sessionId)
    : question

  // 2. 检索文档
  const docs = await retrieveDocs(rewrittenQuestion, retrieveOptions)

  // 3. 记录用户问题到历史
  if (sessionId) {
    addMessage(sessionId, 'user', question)
  }

  // 返回一个异步生成器，外层路由负责推 SSE
  return {
    sources: docs,
    rewrittenQuestion, // 返回改写后的问题，方便调试
    // streamAnswer() 是一个异步生成器函数
    async *streamAnswer() {
      if (!docs.length) {
        const answer = '知识库中未找到与该问题相关的内容。\n请尝试换一种提问方式，或上传相关文档后再试。'
        if (sessionId) addMessage(sessionId, 'assistant', answer)
        yield answer
        return
      }

      // 压缩过长的文档内容
      const compressedDocs = await Promise.all(
        docs.map(async (doc) => ({
          ...doc,
          content: await compressDoc(doc.content, rewrittenQuestion),
        }))
      )

      const context = compressedDocs
        .map((doc, i) => `[参考${i + 1}] 来源：${doc.title}\n${doc.content}`)
        .join('\n\n---\n\n')

      // 构建带历史的 Prompt
      const historyMessages = sessionId ? getMessageHistory(sessionId) : []
      // 移除最后一条用户消息（因为当前问题要单独处理）
      const previousHistory = historyMessages.slice(0, -1)
      const promptMessages = buildRagPromptWithHistory(previousHistory)

      promptMessages.push([
        'human',
        `参考文档：\n${context}\n\n问题：${question}`,
      ])

      const prompt = ChatPromptTemplate.fromMessages(promptMessages)
      const streamingModel = chatModel
      const chain = prompt.pipe(streamingModel)

      const stream = await chain.stream({})

      let fullAnswer = ''
      for await (const chunk of stream) {
        if (chunk.content) {
          fullAnswer += chunk.content
          yield chunk.content
        }
      }

      // 记录完整回答到历史
      if (sessionId) {
        addMessage(sessionId, 'assistant', fullAnswer)
      }
    },
  }
}

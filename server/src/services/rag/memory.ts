// server/src/services/rag/memory.js
// RAG 对话历史记忆管理
import { logger } from '../../utils/logger.js'

// ── 内存中的对话历史存储 ────────────────────────────────────────
// key: sessionId, value: { messages: [{role, content, timestamp}], lastAccess }
const sessionStore = new Map()

// ── 配置 ────────────────────────────────────────────────────────
const MAX_HISTORY_ROUNDS = 5      // 保留最近5轮对话（10条消息）
const SESSION_TIMEOUT_MS = 30 * 60 * 1000  // 30分钟无活动清理

// ── 获取或创建会话 ──────────────────────────────────────────────
export function getSession(sessionId) {
  if (!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      messages: [],
      lastAccess: Date.now(),
    })
  }
  const session = sessionStore.get(sessionId)
  session.lastAccess = Date.now()
  return session
}

// ── 添加消息到历史 ──────────────────────────────────────────────
export function addMessage(sessionId, role, content) {
  const session = getSession(sessionId)
  session.messages.push({
    role,
    content,
    timestamp: Date.now(),
  })

  // 只保留最近 N 轮对话
  const maxMessages = MAX_HISTORY_ROUNDS * 2
  if (session.messages.length > maxMessages) {
    session.messages = session.messages.slice(-maxMessages)
  }

  logger.info('rag: message added', { sessionId, role, historyLength: session.messages.length })
}

// ── 获取格式化的对话历史 ────────────────────────────────────────
export function getFormattedHistory(sessionId, maxRounds = MAX_HISTORY_ROUNDS) {
  const session = sessionStore.get(sessionId)
  if (!session || session.messages.length === 0) {
    return ''
  }

  const recentMessages = session.messages.slice(-maxRounds * 2)
  return recentMessages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}：${m.content}`)
    .join('\n')
}

// ── 获取原始消息数组（用于 LLM 输入）─────────────────────────────
export function getMessageHistory(sessionId, maxRounds = MAX_HISTORY_ROUNDS) {
  const session = sessionStore.get(sessionId)
  if (!session) return []
  return session.messages.slice(-maxRounds * 2)
}

// ── 清空会话历史 ────────────────────────────────────────────────
export function clearSession(sessionId) {
  sessionStore.delete(sessionId)
  logger.info('rag: session cleared', { sessionId })
}

// ── 清理过期会话（可定时调用）───────────────────────────────────
export function cleanupExpiredSessions() {
  const now = Date.now()
  let cleaned = 0
  for (const [sessionId, session] of sessionStore) {
    if (now - session.lastAccess > SESSION_TIMEOUT_MS) {
      sessionStore.delete(sessionId)
      cleaned++
    }
  }
  if (cleaned > 0) {
    logger.info('rag: cleaned up expired sessions', { count: cleaned })
  }
  return cleaned
}

// ── 查询重写：结合历史理解当前问题 ──────────────────────────────
const REWRITE_PROMPT = `你是一个对话理解助手。请根据对话历史，理解用户的当前问题。
如果当前问题指代不明（如"这个文档"、"它"、"总结一下"等），请结合历史将其改写为完整、明确的问题。
只输出改写后的问题，不要解释。

对话历史：
{history}

当前问题：{question}

改写后的问题：`;

import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { chatModel } from '../model.js'

export async function rewriteQuery(question, sessionId) {
  const history = getFormattedHistory(sessionId, 3) // 只取最近3轮用于改写

  // 如果没有历史或历史为空，直接返回原问题
  if (!history) {
    return question
  }

  try {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', REWRITE_PROMPT],
    ])
    const chain = prompt.pipe(chatModel).pipe(new StringOutputParser())

    const rewritten = await chain.invoke({ history, question })
    const result = rewritten.trim() || question

    logger.info('rag: query rewritten', {
      sessionId,
      original: question.slice(0, 50),
      rewritten: result.slice(0, 50),
    })

    return result
  } catch (e) {
    logger.warn('rag: query rewrite failed, using original', { error: e.message })
    return question
  }
}

// ── 启动定时清理（每10分钟）─────────────────────────────────────
setInterval(cleanupExpiredSessions, 10 * 60 * 1000)

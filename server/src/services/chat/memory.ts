// server/src/services/chat/memory.ts
// 会话记忆管理：短期记忆（当前对话历史）+ 用户画像（跨会话）
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { chatModel } from '../model.js'
import { DatabaseService } from '../../database/database.service.js'
import { logger } from '../../utils/logger.js'

// ── Token 估算（不调 API，本地估算）────────────────────────────
function estTokens(text = '') {
  const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length
  return Math.ceil(cn * 0.6 + (text.length - cn) * 0.25)
}

// ── 数据库服务引用（由 ChatController 注入）──────────────────────
let db: DatabaseService | null = null

export function setDatabase(database: DatabaseService) {
  db = database
}

// ── 会话历史管理（数据库持久化）──────────────────────────────────

export async function getHistory(sessionId: string) {
  if (!db) throw new Error('Database not initialized')
  
  // 从 DB 加载消息并转换为 LangChain Message 格式
  const messages = await db.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: 100, // 最多加载最近 100 条
  })
  
  return messages.map(msg => {
    if (msg.role === 'USER') return new HumanMessage(msg.content)
    if (msg.role === 'ASSISTANT') return new AIMessage(msg.content)
    return new HumanMessage(msg.content)
  })
}

export async function saveMessage(sessionId: string, userId: string | null, role: string, content: string, metadata?: any) {
  if (!db) throw new Error('Database not initialized')
  
  return db.message.create({
    data: {
      sessionId,
      userId,
      role: role === 'user' ? 'USER' : role === 'assistant' ? 'ASSISTANT' : 'SYSTEM',
      content,
      inputTokens: metadata?.inputTokens || 0,
      outputTokens: metadata?.outputTokens || 0,
      latencyMs: metadata?.latencyMs || 0,
      fromCache: metadata?.fromCache || false,
      feature: metadata?.feature || 'chat',
      metadata: metadata || {},
    },
  })
}

export async function clearHistory(sessionId: string) {
  if (!db) throw new Error('Database not initialized')
  
  await db.message.deleteMany({ where: { sessionId } })
}

// Token 感知截取：从最新消息往前，塞满为止
export function trimHistory(history: any[], maxTokens = 2000) {
  const result = []
  let total = 0

  for (let i = history.length - 1; i >= 0; i--) {
    const t = estTokens(history[i].content || '')
    if (total + t > maxTokens) break
    result.unshift(history[i])
    total += t
  }

  return result
}

// ── 用户画像（数据库持久化）──────────────────────────────────────

export async function getProfile(userId: string) {
  if (!db) throw new Error('Database not initialized')
  
  const profile = await db.userProfile.findUnique({
    where: { userId },
  })
  
  if (!profile) return {}
  
  return {
    name: profile.name || undefined,
    dept: profile.dept || undefined,
    techLevel: profile.techLevel || undefined,
    primaryStack: profile.primaryStack || [],
    currentGoal: profile.currentGoal || undefined,
    prefersShort: profile.prefersShort,
    prefersCode: profile.prefersCode,
  }
}

// 把画像转成 system 上下文片段
export function profileToContext(profile: any) {
  if (!profile || !Object.keys(profile).length) return ''

  const parts = []
  if (profile.name)         parts.push(`用户姓名：${profile.name}`)
  if (profile.dept)         parts.push(`部门：${profile.dept}`)
  if (profile.techLevel)    parts.push(`技术水平：${profile.techLevel}`)
  if (profile.primaryStack?.length)
    parts.push(`技术栈：${profile.primaryStack.join(', ')}`)
  if (profile.currentGoal)  parts.push(`当前目标：${profile.currentGoal}`)
  if (profile.prefersShort) parts.push('偏好简短回答')
  if (profile.prefersCode)  parts.push('偏好带代码示例的回答')

  return parts.length ? `\n\n用户背景：\n${parts.map(p => `- ${p}`).join('\n')}` : ''
}

// 从对话中异步提取用户信息，更新画像
// 用 withStructuredOutput 保证返回 JSON 格式
export async function extractAndUpdateProfile(userId: string, userMsg: string, aiReply: string) {
  if (!db) throw new Error('Database not initialized')
  
  try {
    const current = await getProfile(userId)

    const extractModel = chatModel.withStructuredOutput({
      type: 'object',
      properties: {
        hasInfo: { type: 'boolean' },
        name:    { type: 'string' },
        dept:    { type: 'string' },
        techLevel: { type: 'string', enum: ['初级', '中级', '高级', '架构师'] },
        primaryStack: { type: 'array', items: { type: 'string' } },
        currentGoal:  { type: 'string' },
        prefersShort: { type: 'boolean' },
        prefersCode:  { type: 'boolean' },
      },
      required: ['hasInfo'],
    })

    const result = await extractModel.invoke([
      {
        role: 'system',
        content: `从对话中提取用户信息，只填写有明确依据的字段。
当前已知画像：${JSON.stringify(current)}
如果没有新信息，hasInfo 返回 false。`,
      },
      {
        role: 'user',
        content: `用户说：${userMsg}\nAI回复：${aiReply.slice(0, 200)}`,
      },
    ])

    if (!result.hasInfo) return

    // 合并更新（数组字段去重追加）
    const updated: any = { ...current }
    if (result.name)        updated.name = result.name
    if (result.dept)        updated.dept = result.dept
    if (result.techLevel)   updated.techLevel = result.techLevel
    if (result.currentGoal) updated.currentGoal = result.currentGoal
    if (result.prefersShort !== undefined) updated.prefersShort = result.prefersShort
    if (result.prefersCode  !== undefined) updated.prefersCode  = result.prefersCode
    if (result.primaryStack?.length) {
      updated.primaryStack = [...new Set([...(current.primaryStack || []), ...result.primaryStack])]
    }

    // 写入数据库（upsert）
    await db.userProfile.upsert({
      where: { userId },
      update: {
        name: updated.name,
        dept: updated.dept,
        techLevel: updated.techLevel,
        primaryStack: updated.primaryStack,
        currentGoal: updated.currentGoal,
        prefersShort: updated.prefersShort,
        prefersCode: updated.prefersCode,
      },
      create: {
        userId,
        name: updated.name,
        dept: updated.dept,
        techLevel: updated.techLevel,
        primaryStack: updated.primaryStack,
        currentGoal: updated.currentGoal,
        prefersShort: updated.prefersShort || false,
        prefersCode: updated.prefersCode || false,
      },
    })
  } catch (e) {
    logger.warn('extractAndUpdateProfile failed', { error: (e as Error).message })
    // 画像提取失败不影响主流程，静默处理
  }
}

// 返回所有会话列表（前端展示用）
export async function listSessions(userId: string) {
  if (!db) throw new Error('Database not initialized')
  
  const sessions = await db.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: {
        select: { messages: true },
      },
    },
  })
  
  return sessions.map(s => ({
    id: s.id,
    title: s.title,
    messageCount: s._count.messages,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }))
}

// 会话详情（含消息，切换会话时懒加载）
export async function getSessionDetail(userId: string, sessionId: string) {
  if (!db) throw new Error('Database not initialized')

  const session = await db.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: { orderBy: { createdAt: 'asc' }, take: 200 },
    },
  })
  if (!session) return null

  return {
    id: session.id,
    title: session.title,
    role: session.role,
    createdAt: session.createdAt.toISOString(),
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role === 'USER' ? 'user' : 'assistant',
      content: m.content,
      time: m.createdAt.toISOString(),
      fromCache: m.fromCache,
    })),
  }
}

export async function createSession(userId: string, title: string, role: string) {
  if (!db) throw new Error('Database not initialized')
  
  return db.chatSession.create({
    data: {
      userId,
      title,
      role,
    },
  })
}

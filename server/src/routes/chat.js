// server/src/routes/chat.js
// 对话路由：流式对话 + 缓存 + 会话管理 + 画像
import express from 'express'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { chatModel } from '../services/model.js'
import { cache } from '../services/cache.js'
import {
  getHistory, trimHistory, clearHistory,
  getProfile, profileToContext, extractAndUpdateProfile,
  listSessions,
} from '../services/chat/memory.js'
import { validateChat, rateLimiter, securityCheck } from '../middleware/index.js'
import { sendSseError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'
import { recordApiCall } from './monitor.js'

export const chatRouter = express.Router()

// 内置角色预设
const ROLES = {
  default: '你是 WorkMind AI，一个智能办公助手，回答简洁专业。',
  tech:    '你是资深技术顾问，精通 Vue3、React、Node.js 等前端技术栈。回答要有代码示例，说明清楚原理。',
  hr:      '你是 HR 助理，熟悉劳动法规、公司政策、绩效管理、招聘流程。回答要有温度，兼顾政策合规和员工关怀。',
  legal:   '你是法务助理，熟悉合同法、知识产权、劳动合同。回答要严谨，必要时建议咨询专业律师。',
}

// ── POST /api/chat/stream ──────────────────────────────────────
// 核心接口：流式对话，集成缓存、会话历史、用户画像
chatRouter.post('/stream',
  rateLimiter,
  validateChat,
  securityCheck,
  async (req, res) => {
    const {
      message,
      sessionId = 'default',
      role = 'default',
      userId = 'anonymous',
    } = req.body

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    // 开发环境关闭 nginx 缓冲（如果有的话）
    res.setHeader('X-Accel-Buffering', 'no')

    const send = (event, data) => {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    }

    try {
      // 1. 拼接 system prompt：角色 + 用户画像
      const baseSystem = ROLES[role] || ROLES.default
      const profile = getProfile(userId)
      const profileCtx = profileToContext(profile)
      const systemPrompt = baseSystem + profileCtx

      // 2. 精确缓存检查
      const cached = cache.get(systemPrompt, message)
      if (cached) {
        logger.info('cache hit', { sessionId, msg: message.slice(0, 30) })
        send('cache_hit', {})
        // 模拟流式输出缓存内容（让前端体验一致）
        const words = cached.content.split('')
        for (let i = 0; i < words.length; i += 3) {
          send('token', { token: words.slice(i, i + 3).join('') })
          await new Promise(r => setTimeout(r, 6))
        }
        // 记录缓存命中
        recordApiCall({
          feature: 'chat',
          inputTokens: cached.tokens || 0,
          outputTokens: 0,
          latencyMs: words.length * 6,
          fromCache: true,
        })
        send('done', { fromCache: true })
        return res.end()
      }

      // 3. 获取当前会话历史
      const history = getHistory(sessionId)
      const trimmed = trimHistory(history, 2000)

      // 4. 构造消息列表
      const messages = [
        new SystemMessage(systemPrompt),
        ...trimmed,
        new HumanMessage(message),
      ]

      send('start', { sessionId })

      // 5. 流式调用模型
      let fullReply = ''
      let inputTokens = 0, outputTokens = 0
      const startTime = Date.now()

      const stream = await chatModel.stream(messages)

      for await (const chunk of stream) {
        if (chunk.content) {
          fullReply += chunk.content
          send('token', { token: chunk.content })
        }
        // DeepSeek 在最后一个 chunk 里返回 usage
        if (chunk.usage_metadata) {
          inputTokens  = chunk.usage_metadata.input_tokens  || 0
          outputTokens = chunk.usage_metadata.output_tokens || 0
        }
      }

      // 6. 更新会话历史
      history.push(new HumanMessage(message))
      history.push(new AIMessage(fullReply))
      // 超过 20 条时删掉最老的 2 条（保持最近 10 轮）
      if (history.length > 20) history.splice(0, 2)

      // 7. 写入缓存
      cache.set(systemPrompt, message, {
        content: fullReply,
        tokens: inputTokens + outputTokens,
      })

      // 8. 异步更新用户画像（不阻塞响应）
      extractAndUpdateProfile(userId, message, fullReply).catch(() => {})

      const latencyMs = Date.now() - startTime

      // 记录 API 调用统计
      recordApiCall({
        feature: 'chat',
        inputTokens,
        outputTokens,
        latencyMs,
        fromCache: false,
      })

      send('done', { fromCache: false, inputTokens, outputTokens })
      logger.info('chat done', {
        sessionId,
        inputTokens,
        outputTokens,
        replyLen: fullReply.length,
      })
    } catch (err) {
      logger.error('chat error', { error: err.message, traceId: req.traceId })
      sendSseError(res, err)
    } finally {
      if (!res.writableEnded) res.end()
    }
  }
)

// ── GET /api/chat/sessions ─────────────────────────────────────
// 获取所有会话列表
chatRouter.get('/sessions', (req, res) => {
  res.json({ sessions: listSessions() })
})

// ── DELETE /api/chat/sessions/:id ─────────────────────────────
// 清空某个会话的历史
chatRouter.delete('/sessions/:id', (req, res) => {
  clearHistory(req.params.id)
  res.json({ success: true })
})

// ── GET /api/chat/profile/:userId ─────────────────────────────
// 获取用户画像（前端展示用）
chatRouter.get('/profile/:userId', (req, res) => {
  res.json(getProfile(req.params.userId))
})

// ── GET /api/chat/roles ────────────────────────────────────────
// 获取可用角色列表
chatRouter.get('/roles', (req, res) => {
  res.json({
    roles: [
      { id: 'default', label: '通用助手',  icon: '🤖', desc: '日常问答、通用任务' },
      { id: 'tech',    label: '技术顾问',  icon: '💻', desc: '代码、架构、技术方案' },
      { id: 'hr',      label: 'HR 助理',   icon: '📋', desc: '人事政策、绩效、招聘' },
      { id: 'legal',   label: '法务助理',  icon: '⚖️',  desc: '合同、合规、法律问题' },
    ],
  })
})

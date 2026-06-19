// server/src/routes/prompt.js
// Prompt 调试路由：单次测试(流式) + A/B对比 + 模板管理
import express from 'express'
import { createChatModel } from '../services/model.js'
import {
  listTemplates, getTemplate, saveTemplate, deleteTemplate, scoreAbTest,
} from '../services/prompt/promptService.js'
import { rateLimiter } from '../middleware/index.js'
import { sendSseError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const promptRouter = express.Router()

// ── POST /api/prompt/test/stream ───────────────────────────────
// 单次 Prompt 测试（流式），支持自定义 temperature 和 maxTokens
promptRouter.post('/test/stream', rateLimiter, async (req, res) => {
  const {
    systemPrompt = '',
    userMessage,
    temperature  = 0.7,
    maxTokens    = 1000,
  } = req.body

  if (!userMessage?.trim()) {
    return res.status(400).json({ error: { message: '测试消息不能为空' } })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const send = (event, data) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
  }

  try {
    // 每次调试用独立的模型实例（不复用全局单例，参数可能不同）
    const testModel = createChatModel({ temperature, streaming: true })

    const messages = []
    if (systemPrompt.trim()) {
      messages.push({ role: 'system', content: systemPrompt })
    }
    messages.push({ role: 'user', content: userMessage })

    send('start', { temperature, maxTokens })

    let fullReply  = ''
    let inputTokens = 0, outputTokens = 0
    const startMs  = Date.now()

    const stream = await testModel.stream(messages, { maxTokens })

    for await (const chunk of stream) {
      if (chunk.content) {
        fullReply += chunk.content
        send('token', { token: chunk.content })
      }
      if (chunk.usage_metadata) {
        inputTokens  = chunk.usage_metadata.input_tokens  || 0
        outputTokens = chunk.usage_metadata.output_tokens || 0
      }
    }

    const latencyMs = Date.now() - startMs

    send('done', {
      latencyMs,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costCNY: ((inputTokens / 1e6 * 0.27) + (outputTokens / 1e6 * 1.10)) * 7.2,
    })

    logger.info('prompt test done', { latencyMs, inputTokens, outputTokens })
  } catch (err) {
    logger.error('prompt test error', { error: err.message })
    sendSseError(res, err)
  } finally {
    if (!res.writableEnded) res.end()
  }
})

// ── POST /api/prompt/ab-test ───────────────────────────────────
// A/B 测试：两个 Prompt 同时跑，AI 自动评分对比（非流式）
promptRouter.post('/ab-test', rateLimiter, async (req, res) => {
  const {
    question,
    systemPromptA,
    systemPromptB,
    temperature = 0,
    maxTokens   = 800,
  } = req.body

  if (!question?.trim()) {
    return res.status(400).json({ error: { message: '测试问题不能为空' } })
  }

  try {
    const testModel = createChatModel({ temperature })

    // 并发执行两个 Prompt
    const [resA, resB] = await Promise.all([
      testModel.invoke([
        ...(systemPromptA ? [{ role: 'system', content: systemPromptA }] : []),
        { role: 'user', content: question },
      ], { maxTokens }),
      testModel.invoke([
        ...(systemPromptB ? [{ role: 'system', content: systemPromptB }] : []),
        { role: 'user', content: question },
      ], { maxTokens }),
    ])

    const answerA = resA.content
    const answerB = resB.content

    // AI 自动评分
    const evaluation = await scoreAbTest({ question, answerA, answerB })

    res.json({
      answerA,
      answerB,
      evaluation,
    })
  } catch (err) {
    logger.error('ab test error', { error: err.message })
    res.status(500).json({ error: { message: '测试失败，请重试' } })
  }
})

// ── CRUD：模板管理 ────────────────────────────────────────────

promptRouter.get('/templates', (req, res) => {
  res.json({ templates: listTemplates() })
})

promptRouter.get('/templates/:id', (req, res) => {
  const t = getTemplate(req.params.id)
  if (!t) return res.status(404).json({ error: { message: '模板不存在' } })
  res.json(t)
})

promptRouter.post('/templates', (req, res) => {
  const { name, systemPrompt, description, tags } = req.body
  if (!name?.trim() || !systemPrompt?.trim()) {
    return res.status(400).json({ error: { message: '模板名称和内容不能为空' } })
  }
  const template = saveTemplate({ name, systemPrompt, description, tags })
  res.json({ success: true, template })
})

promptRouter.put('/templates/:id', (req, res) => {
  const { name, systemPrompt, description, tags } = req.body
  const template = saveTemplate({ name, systemPrompt, description, tags, existingId: req.params.id })
  res.json({ success: true, template })
})

promptRouter.delete('/templates/:id', (req, res) => {
  try {
    deleteTemplate(req.params.id)
    res.json({ success: true })
  } catch (err) {
    res.status(400).json({ error: { message: err.message } })
  }
})

// server/src/routes/agent.js
// Agent 路由：流式执行任务，实时推送每一步状态
import express from 'express'
import { runAgent, getToolList } from '../services/agent/agent.js'
import { rateLimiter, securityCheck, validateChat } from '../middleware/index.js'
import { sendSseError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const agentRouter = express.Router()

// ── POST /api/agent/run ────────────────────────────────────────
// 执行 Agent 任务，SSE 流式推送执行步骤
agentRouter.post('/run',
  rateLimiter,
  securityCheck,
  async (req, res) => {
    const { task } = req.body

    if (!task?.trim()) {
      return res.status(400).json({ error: { message: '任务不能为空' } })
    }

    if (task.length > 2000) {
      return res.status(400).json({ error: { message: '任务描述过长，请简洁描述' } })
    }

    // 设置 SSE 响应头
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
      send('start', { task, timestamp: new Date().toISOString() })

      // 执行 Agent，通过回调把每一步推送给前端
      await runAgent(task, (type, data) => {
        send(type, data)
      })
    } catch (err) {
      logger.error('agent route error', { error: err.message, traceId: req.traceId })
      sendSseError(res, err)
    } finally {
      if (!res.writableEnded) res.end()
    }
  }
)

// ── GET /api/agent/tools ───────────────────────────────────────
// 获取可用工具列表（前端展示用）
agentRouter.get('/tools', (req, res) => {
  res.json({ tools: getToolList() })
})

// ── GET /api/agent/examples ────────────────────────────────────
// 示例任务（前端快捷输入用）
agentRouter.get('/examples', (req, res) => {
  res.json({
    examples: [
      {
        title: '技术调研',
        task: '对比 Vue3 和 React 2024年的最新状态，分别查询它们的最新版本和主要特性，生成一份技术选型报告',
        icon: '🔍',
      },
      {
        title: '费用计算',
        task: '我出差3天，酒店每晚580元，机票往返1200元，餐费每天150元，帮我计算总报销金额，并查询一下公司差旅报销标准',
        icon: '💰',
      },
      {
        title: '工期计算',
        task: '项目计划从2024年3月1日开始，需要45个工作日完成，帮我计算预计完成日期，并生成一份项目时间轴摘要',
        icon: '📅',
      },
      {
        title: '知识查询',
        task: '从知识库查询公司的年假政策，计算一下我今年还剩多少年假（假设今年已用6天，总共15天），并发送结果通知给HR',
        icon: '📚',
      },
    ],
  })
})

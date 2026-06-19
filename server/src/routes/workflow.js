// server/src/routes/workflow.js
// 工作流路由：启动/查询/推进/获取结果
import express from 'express'
import { WORKFLOW_BUILDERS, WORKFLOW_META } from '../services/workflow/workflows.js'
import { rateLimiter } from '../middleware/index.js'
import { sendSseError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const workflowRouter = express.Router()

// 存活的工作流实例：threadId → { graph, meta }
const activeWorkflows = new Map()

// ── GET /api/workflow/templates ────────────────────────────────
// 获取所有工作流模板（前端选择用）
workflowRouter.get('/templates', (req, res) => {
  res.json({ templates: Object.values(WORKFLOW_META) })
})

// ── POST /api/workflow/start/stream ────────────────────────────
// 启动工作流，SSE 实时推送每个节点的执行状态
// 工作流会在 human_review 节点前自动暂停，推送 paused 事件
workflowRouter.post('/start/stream', rateLimiter, async (req, res) => {
  const { workflowId, input } = req.body

  if (!workflowId || !WORKFLOW_BUILDERS[workflowId]) {
    return res.status(400).json({ error: { message: `未知工作流：${workflowId}` } })
  }

  const threadId = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const config   = { configurable: { thread_id: threadId } }

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
    // 创建工作流实例
    const builder = WORKFLOW_BUILDERS[workflowId]
    const graph   = builder()
    const meta    = WORKFLOW_META[workflowId]

    // 存起来，后面 resume 时用
    activeWorkflows.set(threadId, { graph, meta, config })

    send('start', { threadId, workflowId })
    logger.info('workflow: started', { workflowId, threadId })

    // 用 streamEvents 监听每个节点的执行
    let lastNodeName = null

    for await (const event of graph.streamEvents(input, { ...config, version: 'v2' })) {
      const { event: eventType, name } = event

      // 节点开始执行
      if (eventType === 'on_chain_start' && name !== '__start__' && name !== 'LangGraph') {
        // 判断这个节点是不是工作流里定义的业务节点
        const nodeInMeta = meta.nodes.find(n => n.id === name)
        if (nodeInMeta && name !== lastNodeName) {
          lastNodeName = name
          send('node_start', { nodeId: name, label: nodeInMeta.label })
        }
      }

      // 节点执行完毕
      if (eventType === 'on_chain_end' && name !== '__end__' && name !== 'LangGraph') {
        const nodeInMeta = meta.nodes.find(n => n.id === name)
        if (nodeInMeta) {
          // 输出一些预览内容给前端
          const output = event.data?.output
          let preview = ''
          if (output && typeof output === 'object') {
            const firstVal = Object.values(output)[0]
            if (typeof firstVal === 'string' && firstVal) {
              preview = firstVal.slice(0, 80) + (firstVal.length > 80 ? '...' : '')
            }
          }
          send('node_done', { nodeId: name, preview })
        }
      }
    }

    // 到这里说明工作流暂停了（interruptBefore）或者完成了
    const state = await graph.getState(config)

    if (state.next?.length > 0) {
      // 在 human_review 前暂停了
      send('paused', {
        threadId,
        nextNode:       state.next[0],
        // 把当前各步骤的中间产物给前端，供人工审核查看
        intermediates:  getIntermediates(state.values, workflowId),
      })
    } else {
      // 工作流完成（理论上不走这里，因为有 interruptBefore）
      const result = state.values[meta.resultKey] || ''
      send('completed', { threadId, result })
    }

  } catch (err) {
    logger.error('workflow: start error', { error: err.message, threadId })
    sendSseError(res, err)
  } finally {
    if (!res.writableEnded) res.end()
  }
})

// ── POST /api/workflow/resume/stream ───────────────────────────
// 恢复被暂停的工作流（注入人工反馈后继续执行）
workflowRouter.post('/resume/stream', rateLimiter, async (req, res) => {
  const { threadId, feedback } = req.body

  const wf = activeWorkflows.get(threadId)
  if (!wf) {
    return res.status(404).json({ error: { message: '工作流不存在或已过期，请重新启动' } })
  }

  const { graph, meta, config } = wf

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
    // 注入人工反馈到工作流状态
    if (feedback?.trim()) {
      await graph.updateState(config, { humanFeedback: feedback })
    }

    logger.info('workflow: resumed', { threadId, hasFeedback: !!feedback })
    send('resumed', { threadId })

    // 继续执行（传 null 表示从暂停处继续）
    let lastNode = null
    for await (const event of graph.streamEvents(null, { ...config, version: 'v2' })) {
      const { event: eventType, name } = event

      if (eventType === 'on_chain_start' && name !== '__end__' && name !== 'LangGraph') {
        const nodeInMeta = meta.nodes.find(n => n.id === name)
        if (nodeInMeta && name !== lastNode) {
          lastNode = name
          send('node_start', { nodeId: name, label: nodeInMeta.label })
        }
      }

      // 最终输出节点：流式推送内容
      if (eventType === 'on_chat_model_stream' && event.data?.chunk?.content) {
        send('token', { token: event.data.chunk.content })
      }

      if (eventType === 'on_chain_end') {
        const nodeInMeta = meta.nodes.find(n => n.id === name)
        if (nodeInMeta) {
          send('node_done', { nodeId: name })
        }
      }
    }

    // 获取最终结果
    const finalState = await graph.getState(config)
    const result = finalState.values[meta.resultKey] || ''

    send('completed', { threadId, result })

    // 清理实例
    activeWorkflows.delete(threadId)
    logger.info('workflow: completed', { threadId })

  } catch (err) {
    logger.error('workflow: resume error', { error: err.message, threadId })
    sendSseError(res, err)
  } finally {
    if (!res.writableEnded) res.end()
  }
})

// ── 工具函数：提取中间产物供审核展示 ─────────────────────────
function getIntermediates(values, workflowId) {
  const maps = {
    weekly_report:   { highlights: '提炼的亮点', risks: '风险/阻塞项' },
    meeting_minutes: { attendees: '参会人与议题', conclusions: '会议结论', actionItems: 'Action Items' },
    email_polish:    { purpose: '意图分析', issues: '发现的问题' },
    prd_skeleton:    { features: '功能点', constraints: '约束条件' },
  }

  const fieldMap = maps[workflowId] || {}
  return Object.entries(fieldMap)
    .filter(([key]) => values[key])
    .map(([key, label]) => ({ key, label, value: values[key] }))
}

// server/src/routes/erp.js
// ERP 路由：智能填单（自然语言→结构化）+ 审批流（Multi-Agent）
import express from 'express'
import { parseExpenseForm, parseLeaveForm, checkCompliance } from '../services/erp/parser.js'
import { runApprovalFlow, APPROVAL_ROLES } from '../services/erp/approval.js'
import { rateLimiter } from '../middleware/index.js'
import { sendSseError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const erpRouter = express.Router()

// 申请记录（生产换数据库）
const applications = new Map()

// ── POST /api/erp/parse ────────────────────────────────────────
// 自然语言 → 结构化表单（非流式，快速返回）
erpRouter.post('/parse', rateLimiter, async (req, res) => {
  const { text, formType } = req.body

  if (!text?.trim()) {
    return res.status(400).json({ error: { message: '描述不能为空' } })
  }

  if (!['expense', 'leave'].includes(formType)) {
    return res.status(400).json({ error: { message: 'formType 必须是 expense 或 leave' } })
  }

  try {
    let form
    if (formType === 'expense') {
      form = await parseExpenseForm(text)
      // 额外的合规检查
      const complianceAlerts = checkCompliance(form)
      form.warnings = [...(form.warnings || []), ...complianceAlerts]
    } else {
      form = await parseLeaveForm(text)
    }

    res.json({ success: true, form, formType })
  } catch (err) {
    logger.error('erp: parse error', { error: err.message })
    res.status(500).json({ error: { message: '解析失败，请检查输入内容' } })
  }
})

// ── POST /api/erp/submit/stream ────────────────────────────────
// 提交申请，启动 Multi-Agent 审批流（SSE 流式推送审批对话）
erpRouter.post('/submit/stream', rateLimiter, async (req, res) => {
  const { formData, formType, applicantName } = req.body

  if (!formData || !formType) {
    return res.status(400).json({ error: { message: '缺少表单数据' } })
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

  // 生成申请编号
  const appId = `APP${Date.now()}`
  const application = {
    id:        appId,
    formType,
    formData:  { ...formData, applicantName: applicantName || '申请人' },
    status:    'pending',
    messages:  [],
    createdAt: new Date().toISOString(),
  }
  applications.set(appId, application)

  send('start', { appId, formType })

  try {
    const result = await runApprovalFlow(
      application.formData,
      formType,
      (type, data) => {
        // 把 Agent 的每条消息记录到申请里
        if (type === 'message') {
          application.messages.push(data)
        }
        send(type, data)
      }
    )

    // 更新申请状态
    application.status    = result.status
    application.result    = result
    application.updatedAt = new Date().toISOString()

    send('done', { appId })

  } catch (err) {
    logger.error('erp: approval error', { error: err.message, appId })
    sendSseError(res, err)
  } finally {
    if (!res.writableEnded) res.end()
  }
})

// ── GET /api/erp/applications ──────────────────────────────────
// 获取所有申请记录（我的申请列表）
erpRouter.get('/applications', (req, res) => {
  const list = [...applications.values()]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(app => ({
      id:          app.id,
      formType:    app.formType,
      status:      app.status,
      amount:      app.formData.totalAmount,
      reason:      app.formData.reason,
      days:        app.formData.workdays,
      createdAt:   app.createdAt,
    }))
  res.json({ applications: list })
})

// ── GET /api/erp/applications/:id ─────────────────────────────
// 获取某条申请的详细记录（含完整审批对话）
erpRouter.get('/applications/:id', (req, res) => {
  const app = applications.get(req.params.id)
  if (!app) return res.status(404).json({ error: { message: '申请不存在' } })
  res.json(app)
})

// ── GET /api/erp/roles ─────────────────────────────────────────
// 审批角色列表（前端展示用）
erpRouter.get('/roles', (req, res) => {
  res.json({ roles: Object.values(APPROVAL_ROLES) })
})

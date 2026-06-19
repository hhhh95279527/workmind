// server/src/routes/knowledge.js
// 知识库路由：文档管理（上传/列表/删除）+ RAG 问答（流式）
import express from 'express'
import multer from 'multer'
import path from 'path'
import { ingestDocument, getDocRegistry, deleteDocument } from '../services/rag/ingest.js'
import { ragQueryStream, ragQuery } from '../services/rag/query.js'
import { clearSession } from '../services/rag/memory.js'
import { rateLimiter } from '../middleware/index.js'
import { sendSseError } from '../utils/errors.js'
import { logger } from '../utils/logger.js'

export const knowledgeRouter = express.Router()

// ── multer 文件上传配置 ────────────────────────────────────────
// memoryStorage：文件先存内存，再由业务代码决定怎么处理
// diskStorage：直接存磁盘（大文件推荐）
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename:    (req, file, cb) => {
      const ext  = path.extname(file.originalname)
      const name = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`
      cb(null, name)
    },
  }),
  limits: {
    fileSize: 30 * 1024 * 1024,  // 最大 10MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许这几种格式
    const allowed = ['.txt', '.md', '.pdf']
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowed.includes(ext)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的文件格式 ${ext}，只支持 ${allowed.join(', ')}`))
    }
  },
})

// ── POST /api/knowledge/documents ─────────────────────────────
// 上传文档并入库
// 支持两种方式：1) 上传文件  2) 直接传文本内容
knowledgeRouter.post('/documents', rateLimiter, async (req, res) => {
  // 先尝试文件上传
  upload.single('file')(req, res, async (uploadErr) => {
    try {
      let docMeta

      if (req.file) {
        // 方式1：上传文件
        docMeta = await ingestDocument({
          filePath: req.file.path,
          fileName: req.file.originalname,
          title:    req.body.title || req.file.originalname.replace(/\.[^.]+$/, ''),
          category: req.body.category || '通用',
          mimeType: req.file.mimetype,
        })
      } else if (req.body.content) {
        // 方式2：直接传文本（前端粘贴内容）
        // 先写到临时文件，再走统一入库流程
        const fs = await import('fs/promises')
        const tmpPath = `./uploads/tmp_${Date.now()}.txt`
        await fs.writeFile(tmpPath, req.body.content, 'utf-8')

        docMeta = await ingestDocument({
          filePath: tmpPath,
          fileName: (req.body.title || '文本内容') + '.txt',
          title:    req.body.title || '未命名文档',
          category: req.body.category || '通用',
          mimeType: 'text/plain',
        })
      } else {
        return res.status(400).json({ error: { message: '请上传文件或提供文本内容' } })
      }

      res.json({ success: true, document: docMeta })
    } catch (err) {
      logger.error('knowledge: ingest error', { error: err.message })
      res.status(500).json({ error: { message: err.message || '文档处理失败' } })
    }
  })
})

// ── GET /api/knowledge/documents ──────────────────────────────
// 获取所有已入库的文档
knowledgeRouter.get('/documents', (req, res) => {
  const docs = getDocRegistry()
  const { category } = req.query

  const filtered = category
    ? docs.filter(d => d.category === category)
    : docs

  res.json({ documents: filtered })
})

// ── DELETE /api/knowledge/documents/:docId ─────────────────────
// 删除文档（从向量库和注册表中删除）
knowledgeRouter.delete('/documents/:docId', async (req, res) => {
  try {
    await deleteDocument(req.params.docId)
    res.json({ success: true })
  } catch (err) {
    res.status(404).json({ error: { message: err.message } })
  }
})

// ── POST /api/knowledge/query/stream ──────────────────────────
// RAG 问答（流式）：先推送来源，再流式推送回答（支持历史记忆）
knowledgeRouter.post('/query/stream', rateLimiter, async (req, res) => {
  const { question, category, sessionId } = req.body

  if (!question?.trim()) {
    return res.status(400).json({ error: { message: '问题不能为空' } })
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
    send('status', { message: '正在检索相关文档...' })

    const { sources, streamAnswer, rewrittenQuestion } = await ragQueryStream(question, {
      category,
      sessionId,
    })

    // 先推送检索到的来源（让用户看到在参考哪些文档）
    send('sources', { sources })

    // 如果有查询重写，推送改写后的问题（方便调试）
    if (rewrittenQuestion && rewrittenQuestion !== question) {
      send('rewritten', { original: question, rewritten: rewrittenQuestion })
    }

    if (!sources.length) {
      send('token', { token: '知识库中未找到相关内容，请尝试上传相关文档后再提问。' })
      send('done', {})
      return res.end()
    }

    send('status', { message: '正在生成回答...' })

    // 流式推送回答
    for await (const token of streamAnswer()) {
      send('token', { token })
    }

    send('done', {})
    logger.info('knowledge: query done', {
      sessionId,
      question: question.slice(0, 40),
      sources:  sources.length,
    })
  } catch (err) {
    logger.error('knowledge: query error', { error: err.message })
    sendSseError(res, err)
  } finally {
    if (!res.writableEnded) res.end()
  }
})

// ── POST /api/knowledge/query ─────────────────────────────────
// RAG 问答（非流式）：适用于短问题或不需要流式展示的场景（支持历史记忆）
knowledgeRouter.post('/query', rateLimiter, async (req, res) => {
  const { question, category, sessionId } = req.body

  if (!question?.trim()) {
    return res.status(400).json({ error: { message: '问题不能为空' } })
  }

  try {
    const { answer, sources } = await ragQuery(question, { category, sessionId })
    res.json({ answer, sources })
  } catch (err) {
    logger.error('knowledge: query error', { error: err.message })
    res.status(500).json({ error: { message: err.message || '查询失败' } })
  }
})

// ── DELETE /api/knowledge/session/:sessionId ───────────────────
// 清空指定会话的历史记录
knowledgeRouter.delete('/session/:sessionId', (req, res) => {
  clearSession(req.params.sessionId)
  res.json({ success: true, message: '会话历史已清空' })
})

// ── GET /api/knowledge/categories ─────────────────────────────
// 获取所有分类（前端筛选用）
knowledgeRouter.get('/categories', (req, res) => {
  const docs = getDocRegistry()
  const categories = [...new Set(docs.map(d => d.category))]
  res.json({
    categories: [
      { value: '', label: '全部文档' },
      ...categories.map(c => ({ value: c, label: c })),
    ],
  })
})

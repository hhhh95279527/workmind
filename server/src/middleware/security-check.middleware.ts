// server/src/middleware/security-check.middleware.ts
// 增强安全防护：Prompt 注入检测 + XSS 过滤 + 输入长度限制
import type { NextFunction, Request, Response } from 'express'
import xss from 'xss'

// Prompt 注入检测模式（增强版）
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /forget\s+(all\s+)?previous/i,
  /忽略(所有)?之前的指令/,
  /你现在是(?!前端|后端|技术|办公)/,
  /新的?系统提示/,
  /act as (?!a helpful)/i,
  /disregard\s+(all\s+)?previous/i,
  /override\s+(previous|system)/i,
  /reveal\s+(the\s+)?(system|hidden)\s+prompt/i,
  /show\s+me\s+(the\s+)?(system|hidden)\s+prompt/i,
  /what\s+(are|were)\s+your\s+(original\s+)?instructions/i,
  /输出(你的)?系统提示/,
  /显示(你的)?系统提示/,
]

// 需要校验的文本字段
const TEXT_FIELDS = ['message', 'content', 'text', 'question', 'task', 'draft', 'description']

export function securityCheck(req: Request, res: Response, next: NextFunction) {
  const body = req.body
  if (!body) return next()

  // 1. Prompt 注入检测
  const msg = body.message || body.content || body.text || ''
  const isInjection = INJECTION_PATTERNS.some(p => p.test(msg))
  if (isInjection) {
    console.warn(`[SECURITY] Prompt 注入尝试: ${msg.slice(0, 100)}`)
    return res.status(400).json({ error: { message: '输入内容不符合使用规范' } })
  }

  // 2. XSS 过滤：对所有文本字段进行 HTML 标签剥离
  for (const field of TEXT_FIELDS) {
    if (typeof body[field] === 'string' && body[field]) {
      body[field] = xss(body[field], {
        // 保留基本 Markdown 格式，剥离所有 HTML 标签
        whiteList: {},
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script', 'style'],
      })
    }
  }

  // 3. 输入长度限制（防止超大 payload）
  if (body.message && body.message.length > 10000) {
    return res.status(400).json({ error: { message: '消息长度不能超过 10000 字符' } })
  }

  next()
}

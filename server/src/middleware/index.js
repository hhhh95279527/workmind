// server/src/middleware/index.js
// 通用中间件：请求日志、限流、输入校验、安全检查
import { randomUUID } from 'crypto'
import { z } from 'zod'

// ── 请求日志 + traceId ─────────────────────────────────────────
export function requestLogger(req, res, next) {
  const traceId = req.headers['x-trace-id'] || randomUUID()
  req.traceId = traceId
  res.setHeader('X-Trace-Id', traceId)

  const start = Date.now()
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO'
    console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms [${traceId.slice(0, 8)}]`)
  })
  next()
}

// ── 简单令牌桶限流 ─────────────────────────────────────────────
class TokenBucket {
  constructor(capacity = 30, refillRate = 10) {
    this.capacity   = capacity
    this.refillRate = refillRate  // 每秒补充
    this.tokens     = capacity
    this.lastRefill = Date.now()
  }

  consume() {
    const elapsed = (Date.now() - this.lastRefill) / 1000
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate)
    this.lastRefill = Date.now()
    if (this.tokens >= 1) { this.tokens--; return true }
    return false
  }
}

const bucket = new TokenBucket()

export function rateLimiter(req, res, next) {
  if (!bucket.consume()) {
    return res.status(429).json({ error: { code: 'RATE_LIMIT', message: '请求太频繁，请稍后重试' } })
  }
  next()
}

// ── 输入校验 ──────────────────────────────────────────────────
const ChatSchema = z.object({
  message:      z.string().min(1, '消息不能为空').max(4000, '消息过长'),
  sessionId:    z.string().optional(),
  systemPrompt: z.string().max(2000).optional(),
  role:         z.string().optional(),
})

export function validateChat(req, res, next) {
  const result = ChatSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: { message: result.error.errors[0].message } })
  }
  req.body = result.data
  next()
}

// ── Prompt 注入检测 ────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /forget\s+(all\s+)?previous/i,
  /忽略(所有)?之前的指令/,
  /你现在是(?!前端|后端|技术|办公)/,   // 排除正常角色描述
  /新的?系统提示/,
  /act as (?!a helpful)/i,
]

export function securityCheck(req, res, next) {
  const msg = req.body.message || ''
  const isInjection = INJECTION_PATTERNS.some(p => p.test(msg))
  if (isInjection) {
    console.warn(`[SECURITY] Prompt 注入尝试: ${msg.slice(0, 100)}`)
    return res.status(400).json({ error: { message: '输入内容不符合使用规范' } })
  }
  next()
}

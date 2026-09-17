// server/src/middleware/chat-validator.middleware.ts
// 对话输入校验（zod）
import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'

const ChatSchema = z.object({
  message:      z.string().min(1, '消息不能为空').max(4000, '消息过长'),
  sessionId:    z.string().optional(),
  systemPrompt: z.string().max(2000).optional(),
  role:         z.string().optional(),
  // 关联合同 id（cuid/seed id）；controller 还会再做租户归属校验
  contractId:   z.string().max(100).optional(),
})

export function validateChat(req: Request, res: Response, next: NextFunction) {
  const result = ChatSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: { message: result.error.errors[0].message } })
  }
  req.body = result.data
  next()
}

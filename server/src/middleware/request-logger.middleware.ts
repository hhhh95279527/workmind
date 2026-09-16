// server/src/middleware/request-logger.middleware.ts
// 请求日志 + traceId
import { randomUUID } from 'crypto'
import type { NextFunction, Request, Response } from 'express'

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const traceId = (req.headers['x-trace-id'] as string) || randomUUID()
  ;(req as any).traceId = traceId
  res.setHeader('X-Trace-Id', traceId)

  const start = Date.now()
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO'
    console.log(`[${level}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms [${traceId.slice(0, 8)}]`)
  })
  next()
}

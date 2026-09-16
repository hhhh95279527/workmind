// server/src/utils/sse.ts
// SSE 流式响应辅助：统一设置响应头 + send/end/error
import type { Response } from 'express'
import { sendSseError } from './errors.js'

export function initSse(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  // 开发环境关闭 nginx 缓冲（如果有的话）
  res.setHeader('X-Accel-Buffering', 'no')

  return {
    send(event: string, data: unknown) {
      if (!res.writableEnded) {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      }
    },
    end() {
      if (!res.writableEnded) res.end()
    },
    error(err: unknown) {
      sendSseError(res, err)
    },
  }
}

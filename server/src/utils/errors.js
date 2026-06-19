// server/src/utils/errors.js
// 统一错误处理：错误分类、用户友好提示

export class AppError extends Error {
  constructor(message, { code = 'UNKNOWN', statusCode = 500, retryable = false, userMessage } = {}) {
    super(message)
    this.code        = code
    this.statusCode  = statusCode
    this.retryable   = retryable
    this.userMessage = userMessage || '服务暂时不可用，请稍后重试'
  }
}

// 把 API 原始错误转成 AppError
export function classifyError(err) {
  if (err instanceof AppError) return err
  const status = err.status || err.statusCode

  if (status === 429) return new AppError('API 限流', {
    code: 'RATE_LIMIT', statusCode: 429, retryable: true,
    userMessage: '请求太频繁，请稍后重试',
  })
  if (status === 401 || status === 403) return new AppError('认证失败', {
    code: 'AUTH_ERROR', statusCode: 500, retryable: false,
    userMessage: '服务配置错误，请联系管理员',
  })
  if (status >= 500 || err.message?.includes('ECONNRESET')) return new AppError('服务不可用', {
    code: 'SERVICE_ERROR', statusCode: 503, retryable: true,
    userMessage: '服务暂时不可用，请稍后重试',
  })
  if (err.message?.includes('timeout')) return new AppError('请求超时', {
    code: 'TIMEOUT', statusCode: 504, retryable: true,
    userMessage: '响应超时，请重试',
  })
  return new AppError(err.message, { code: 'UNKNOWN', retryable: false })
}

// Express 错误中间件
export function errorMiddleware(err, req, res, next) {
  const appErr = classifyError(err)
  console.error(JSON.stringify({
    level: 'error', code: appErr.code, msg: appErr.message,
    path: req.path, traceId: req.traceId,
  }))
  res.status(appErr.statusCode).json({
    error: { code: appErr.code, message: appErr.userMessage, retryable: appErr.retryable },
  })
}

// SSE 流中的错误推送
export function sendSseError(res, err) {
  const appErr = classifyError(err)
  if (!res.writableEnded) {
    res.write(`event: error\ndata: ${JSON.stringify({ message: appErr.userMessage, retryable: appErr.retryable })}\n\n`)
    res.end()
  }
}

// server/src/utils/errors.ts
// 统一错误处理：错误分类、用户友好提示

export interface AppErrorOptions {
  code?: string
  statusCode?: number
  retryable?: boolean
  userMessage?: string
}

export class AppError extends Error {
  code: string
  statusCode: number
  retryable: boolean
  userMessage: string

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.code = options.code ?? 'UNKNOWN'
    this.statusCode = options.statusCode ?? 500
    this.retryable = options.retryable ?? false
    this.userMessage = options.userMessage ?? '服务暂时不可用，请稍后重试'
  }
}

// 把 API 原始错误转成 AppError
export function classifyError(err: any): AppError {
  if (err instanceof AppError) return err
  const status = err?.status || err?.statusCode

  if (status === 429) return new AppError('API 限流', {
    code: 'RATE_LIMIT', statusCode: 429, retryable: true,
    userMessage: '请求太频繁，请稍后重试',
  })
  if (status === 401 || status === 403) return new AppError('认证失败', {
    code: 'AUTH_ERROR', statusCode: 500, retryable: false,
    userMessage: '服务配置错误，请联系管理员',
  })
  if (status >= 500 || err?.message?.includes('ECONNRESET')) return new AppError('服务不可用', {
    code: 'SERVICE_ERROR', statusCode: 503, retryable: true,
    userMessage: '服务暂时不可用，请稍后重试',
  })
  if (err?.message?.includes('timeout')) return new AppError('请求超时', {
    code: 'TIMEOUT', statusCode: 504, retryable: true,
    userMessage: '响应超时，请重试',
  })
  return new AppError(err?.message || '未知错误', { code: 'UNKNOWN', retryable: false })
}

// SSE 流中的错误推送（流式接口无法走全局异常过滤器，这里保持与其一致的错误语义）
export function sendSseError(res: any, err: any) {
  if (res.writableEnded) return

  // 租户配额超额：透传真实文案与业务码，前端可引导升级
  if (err?.quotaExceeded === true) {
    res.write(`event: error\ndata: ${JSON.stringify({ code: 'QUOTA_EXCEEDED', message: err.message, retryable: false })}\n\n`)
    res.end()
    return
  }

  // Nest HttpException（403/400 等）：取其响应文案
  if (err?.getStatus && typeof err.getResponse === 'function') {
    const resp = err.getResponse()
    const message = typeof resp === 'string' ? resp : resp?.message
    res.write(`event: error\ndata: ${JSON.stringify({ message: Array.isArray(message) ? message[0] : message || '请求被拒绝' })}\n\n`)
    res.end()
    return
  }

  const appErr = classifyError(err)
  res.write(`event: error\ndata: ${JSON.stringify({ code: appErr.code, message: appErr.userMessage, retryable: appErr.retryable })}\n\n`)
  res.end()
}

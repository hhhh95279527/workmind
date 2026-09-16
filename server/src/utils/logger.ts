// server/src/utils/logger.ts
// 结构化日志：开发环境彩色输出，生产环境 JSON 输出
type LogLevel = 'info' | 'warn' | 'error' | 'debug'
type LogCtx = Record<string, unknown>

const isProd = process.env.NODE_ENV === 'production'

function log(level: LogLevel, msg: string, ctx: LogCtx = {}) {
  const entry = { time: new Date().toISOString(), level, msg, ...ctx }

  if (isProd) {
    process.stdout.write(JSON.stringify(entry) + '\n')
    return
  }

  const colors: Record<LogLevel, string> = {
    info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m',
  }
  const c = colors[level] || ''
  const reset = '\x1b[0m'
  const time = entry.time.slice(11, 19)
  const ctxStr = Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : ''
  console.log(`${c}[${time}] ${level.toUpperCase()} ${msg}${ctxStr}${reset}`)
}

export const logger = {
  info:  (msg: string, ctx?: LogCtx) => log('info', msg, ctx),
  warn:  (msg: string, ctx?: LogCtx) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogCtx) => log('error', msg, ctx),
  debug: (msg: string, ctx?: LogCtx) => { if (!isProd) log('debug', msg, ctx) },
}

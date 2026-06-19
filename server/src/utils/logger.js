// server/src/utils/logger.js
// 结构化日志：开发环境彩色输出，生产环境 JSON 输出
const isProd = process.env.NODE_ENV === 'production'

function log(level, msg, ctx = {}) {
  const entry = {
    time: new Date().toISOString(),
    level,
    msg,
    ...ctx,
  }

  if (isProd) {
    process.stdout.write(JSON.stringify(entry) + '\n')
    return
  }

  const colors = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m', debug: '\x1b[90m' }
  const c = colors[level] || ''
  const reset = '\x1b[0m'
  const time = entry.time.slice(11, 19)
  const ctxStr = Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : ''
  console.log(`${c}[${time}] ${level.toUpperCase()} ${msg}${ctxStr}${reset}`)
}

export const logger = {
  info:  (msg, ctx) => log('info',  msg, ctx),
  warn:  (msg, ctx) => log('warn',  msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),
  debug: (msg, ctx) => { if (!isProd) log('debug', msg, ctx) },
}

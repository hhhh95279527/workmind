// server/src/config/index.js
// 统一配置入口：所有环境变量从这里读取，业务代码不直接用 process.env
import 'dotenv/config'

export const config = {
  app: {
    port: Number(process.env.PORT) || 3000,
    env:  process.env.NODE_ENV || 'development',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  },
  ai: {
    deepseekKey:   process.env.DEEPSEEK_API_KEY,
    openaiKey:     process.env.OPENAI_API_KEY,
    zhipuKey:      process.env.ZHIPU_API_KEY,
    tavilyKey:     process.env.TAVILY_API_KEY,
    primaryModel:  process.env.PRIMARY_MODEL  || 'deepseek-chat',
    embedModel:    process.env.EMBED_MODEL    || 'BAAI/bge-m3',
    baseURL:       'https://api.deepseek.com/v1',
    embedBaseURL:  process.env.EMBED_BASE_URL || 'https://api.siliconflow.cn/v1',
  },
  chroma: {
    url: process.env.CHROMA_URL || 'http://localhost:8000',
  },
  cache: {
    ttl: Number(process.env.CACHE_TTL) || 1800000,  // 30 分钟
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://workmind:workmind123@localhost:5432/workmind?schema=public',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret:          process.env.JWT_SECRET || 'workmind-jwt-secret',
    expiresIn:       process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret:   process.env.JWT_REFRESH_SECRET || 'workmind-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
}

/** Key 是否像真 key（ASCII 可打印字符，DeepSeek/OpenAI 兼容格式均以 sk- 开头） */
export function isValidAiKey(key?: string): boolean {
  return !!key && /^sk-[\x21-\x7e]{10,}$/.test(key)
}

export function validateConfig() {
  // 无 key 也允许启动（注册/登录/管理页可正常演示），仅 AI 调用时返回明确错误
  if (!config.ai.deepseekKey) {
    console.warn('⚠ 未配置 DEEPSEEK_API_KEY：服务可启动，但 AI 对话/审查功能不可用')
  } else if (!isValidAiKey(config.ai.deepseekKey)) {
    console.warn('⚠ DEEPSEEK_API_KEY 格式异常（疑似占位文本而非真实密钥）：AI 调用将失败，请替换为 https://platform.deepseek.com 申请的真实 key')
  }
  console.log('✓ 配置校验通过')
}

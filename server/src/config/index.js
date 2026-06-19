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
}

export function validateConfig() {
  if (!config.ai.deepseekKey) {
    console.error('❌ 缺少 DEEPSEEK_API_KEY，请在 .env 文件中配置')
    process.exit(1)
  }
  console.log('✓ 配置校验通过')
}

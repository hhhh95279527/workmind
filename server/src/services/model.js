// server/src/services/model.js
// 模型工厂：统一创建模型实例，业务代码不直接 new ChatOpenAI
import { ChatOpenAI } from '@langchain/openai'
import { OpenAIEmbeddings } from '@langchain/openai'
import { ZhipuAIEmbeddings } from '@langchain/community/embeddings/zhipuai'
import { config } from '../config/index.js'

/**
 * 创建对话模型
 * @param {object} options
 * @param {number}  options.temperature  - 随机性，0=确定，1=创意
 * @param {boolean} options.streaming    - 是否流式输出
 * @param {array}   options.callbacks    - LangChain 回调（如成本追踪）
 */
export function createChatModel({ temperature = 0.7, streaming = false, callbacks = [] } = {}) {
  const instance = new ChatOpenAI({
    model:         config.ai.primaryModel,
    apiKey:        config.ai.deepseekKey,
    configuration: { baseURL: config.ai.baseURL },
    temperature,
    streaming,
    callbacks,
    timeout: 30000,
  })
  // modelName 仅用于 tiktoken token 计数查表，不影响实际 API 调用的 model 字段
  // DeepSeek 与 gpt-3.5-turbo 同用 cl100k_base 编码，数量估算是准确的
  instance.modelName = 'gpt-3.5-turbo'
  return instance
}

/**
 * 创建 Embedding 模型（向量化文本，RAG 必用）
 * 注意：DeepSeek 暂无 embedding 模型，这里用 OpenAI 的
 * 如果没有 OpenAI Key，可以换成本地 Ollama 的 embedding 模型
 */
export function createEmbeddings() {
  // 优先使用智谱 AI（key 格式 xxxx.xxxx）
  if (config.ai.zhipuKey) {
    return new ZhipuAIEmbeddings({
      apiKey:    config.ai.zhipuKey,
      modelName: 'embedding-3',
    })
  }
  // 其次使用 SiliconFlow / OpenAI 兼容接口
  if (config.ai.openaiKey) {
    return new OpenAIEmbeddings({
      model:         config.ai.embedModel,
      apiKey:        config.ai.openaiKey,
      configuration: { baseURL: config.ai.embedBaseURL },
    })
  }
  console.warn('⚠️  未配置 ZHIPU_API_KEY 或 OPENAI_API_KEY，RAG 功能将不可用')
  return null
}

// 单例：应用启动时创建一次，全局复用
// 不每次请求都 new，节省内存
export const chatModel = createChatModel({ temperature: 0.7, streaming: true })
export const embeddings = createEmbeddings()

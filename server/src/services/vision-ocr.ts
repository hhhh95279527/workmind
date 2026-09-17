// server/src/services/vision-ocr.ts
// 图片合同 OCR：把手机拍照/扫描的合同图片（JPG/PNG）交给 deepseek-flash 视觉模型
// 逐字转录为纯文本，之后复用既有「条款切分 → 双轨审查」链路，下游不感知输入是图片。
// 相比本地 tesseract：VLM 能处理中文排版、表格、印章与手写批注，且无需原生依赖。
import fs from 'fs/promises'
import { HumanMessage } from '@langchain/core/messages'
import type { BaseCallbackHandler } from '@langchain/core/callbacks/base'
import { config, isValidAiKey } from '../config/index.js'
import { visionModel } from './model.js'
import { logger } from '../utils/logger.js'

const OCR_PROMPT = `你是合同文书 OCR 转录引擎。请把图片中的合同/协议内容逐字转录为纯文本，要求：
1. 完整、忠实转录所有印刷文字，按阅读顺序输出，保留原条款编号（第一条、1.1、（一）等）与标题换行；
2. 表格内容转为「列名：值」或带分隔的文本行，不要丢失单元格；
3. 页眉页脚、页码、水印广告不要输出；
4. 印章/签名/手写批注若影响权利义务理解（如「同意」「已收款」），在正文对应位置保留并在文末以【批注】单列；
5. 只输出转录后的合同文本本身，不要任何解释、总结或 markdown 代码块。`

/** 图片字节上限 20MB（base64 膨胀约 1.33 倍，DeepSeek 请求体上限 48MiB） */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export async function ocrImageFile(
  filePath: string,
  ext: string,
  callbacks?: BaseCallbackHandler[],
): Promise<string> {
  if (!isValidAiKey(config.ai.deepseekKey)) {
    throw new Error('图片合同识别需要配置有效的 DEEPSEEK_API_KEY（deepseek-flash 视觉模型）')
  }

  const buffer = await fs.readFile(filePath)
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大（${(buffer.length / 1024 / 1024).toFixed(1)}MB），请压缩到 20MB 以内后上传`)
  }
  const mime = ext === '.png' ? 'image/png' : 'image/jpeg'
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`

  const message = new HumanMessage({
    content: [
      { type: 'text', text: OCR_PROMPT },
      // 合同多为密集小字，保留原图分辨率
      { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } } as any,
    ],
  })

  const started = Date.now()
  const res = await visionModel.invoke([message], { callbacks })
  const text = String((res as any).content ?? '').trim()
  logger.info('vision-ocr: transcribed', {
    model: config.ai.visionModel,
    imageBytes: buffer.length,
    chars: text.length,
    costMs: Date.now() - started,
  })

  if (!text) throw new Error('视觉模型未返回任何文字，图片可能模糊或不含合同内容，请换一张更清晰的照片')
  return text
}

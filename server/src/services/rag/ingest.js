// server/src/services/rag/ingest.js
// 文档入库：上传 → 读取文本 → 分片 → 向量化 → 存入 ChromaDB
import fs from 'fs/promises'
import path from 'path'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { Chroma } from '@langchain/community/vectorstores/chroma'
import { embeddings } from '../model.js'
import { logger } from '../../utils/logger.js'

// 单次入库最多 300 个 chunk，防止 embedding API 调用过多
const MAX_CHUNKS = 300

// ChromaDB 配置
const CHROMA_URL = process.env.CHROMA_URL || 'http://localhost:8000'
const COLLECTION_NAME = 'workmind_docs'

// ── 向量库单例 ─────────────────────────────────────────────────
let vectorStore = null

export async function getVectorStore() {
  if (vectorStore) return vectorStore

  if (!embeddings) {
    throw new Error('未配置 ZHIPU_API_KEY，无法使用 RAG 功能')
  }

  try {
    vectorStore = await Chroma.fromExistingCollection(embeddings, {
      collectionName: COLLECTION_NAME,
      url: CHROMA_URL,
    })
    logger.info('rag: chroma vector store connected', { url: CHROMA_URL })
  } catch (err) {
    // 集合不存在，创建新的
    logger.info('rag: creating new chroma collection', { collectionName: COLLECTION_NAME })
    vectorStore = await Chroma.fromDocuments([], embeddings, {
      collectionName: COLLECTION_NAME,
      url: CHROMA_URL,
    })
  }

  return vectorStore
}

// ── 文档元数据注册表（内存中，用于快速列表查询）───────────────────
const docRegistry = new Map()

export function getDocRegistry() {
  return [...docRegistry.values()]
}

export function getDoc(docId) {
  return docRegistry.get(docId) || null
}

// ── 从 ChromaDB 加载文档注册表 ─────────────────────────────────
export async function loadDocRegistryFromChroma() {
  try {
    const vs = await getVectorStore()
    // 获取所有唯一的 docId
    const allDocs = await vs.collection.get()
    const seen = new Set()

    for (const metadata of allDocs.metadatas || []) {
      if (metadata && metadata.docId && !seen.has(metadata.docId)) {
        seen.add(metadata.docId)
        docRegistry.set(metadata.docId, {
          id: metadata.docId,
          title: metadata.title || '未命名文档',
          fileName: metadata.fileName || metadata.title,
          category: metadata.category || '通用',
          uploadedAt: metadata.uploadedAt || new Date().toISOString(),
          chunks: 0,
          chars: 0,
        })
      }
    }

    // 统计每个文档的 chunk 数量
    for (const [docId, docMeta] of docRegistry) {
      const docChunks = await vs.collection.get({
        where: { docId }
      })
      docMeta.chunks = docChunks.ids?.length || 0
    }

    logger.info('rag: loaded doc registry from chroma', { count: docRegistry.size })
  } catch (err) {
    logger.warn('rag: failed to load doc registry from chroma', { error: err.message })
  }
}

// ── 文本提取：根据文件类型读取内容 ───────────────────────────
async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.txt' || ext === '.md') {
    return fs.readFile(filePath, 'utf-8')
  }

  if (ext === '.pdf') {
    // pdfjs-dist v5 需要 DOMMatrix，Node.js 低版本没有，在此注入 polyfill
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init) {
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0
          this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0
          this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0
          this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0
          this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1
          this.is2D = true; this.isIdentity = true
          if (Array.isArray(init) && init.length === 6) {
            [this.a, this.b, this.c, this.d, this.e, this.f] = init
            this.m11 = this.a; this.m12 = this.b
            this.m21 = this.c; this.m22 = this.d
            this.m41 = this.e; this.m42 = this.f
          }
        }
        multiply(o) {
          const m = new globalThis.DOMMatrix()
          m.a = this.a * o.a + this.c * o.b
          m.b = this.b * o.a + this.d * o.b
          m.c = this.a * o.c + this.c * o.d
          m.d = this.b * o.c + this.d * o.d
          m.e = this.a * o.e + this.c * o.f + this.e
          m.f = this.b * o.e + this.d * o.f + this.f
          return m
        }
        inverse() {
          const det = this.a * this.d - this.b * this.c
          const m = new globalThis.DOMMatrix()
          if (det === 0) return m
          m.a =  this.d / det;  m.b = -this.b / det
          m.c = -this.c / det;  m.d =  this.a / det
          m.e = (this.c * this.f - this.d * this.e) / det
          m.f = (this.b * this.e - this.a * this.f) / det
          return m
        }
        transformPoint(p) {
          return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f }
        }
        scale(sx, sy = sx) {
          const m = new globalThis.DOMMatrix()
          m.a = sx; m.d = sy
          return this.multiply(m)
        }
        translate(tx, ty) {
          const m = new globalThis.DOMMatrix()
          m.e = tx; m.f = ty
          return this.multiply(m)
        }
      }
    }
    try {
      const { PDFParse } = await import('pdf-parse')
      const buffer = await fs.readFile(filePath)
      const parser = new PDFParse({ data: buffer })
      await parser.load()
      const result = await parser.getText()
      return result.text
    } catch (e) {
      logger.warn('pdf-parse failed', { error: e.message })
      throw new Error(`PDF 解析失败：${e.message}`)
    }
  }

  return fs.readFile(filePath, 'utf-8')
}

// ── 核心：文档入库 ─────────────────────────────────────────────
export async function ingestDocument({ filePath, fileName, title, category = '通用' }) {
  const docId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

  logger.info('rag: ingesting document', { docId, title, category })

  // 1. 提取文本
  const rawText = await extractText(filePath)
  if (!rawText.trim()) {
    throw new Error('文档内容为空，无法处理')
  }

  // 2. 文档分片
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize:    500,
    chunkOverlap: 50,
    separators: ['\n\n', '\n', '。', '；', '，', ' ', ''],
  })

  let chunks = await splitter.createDocuments(
    [rawText],
    [{ docId, title: title || fileName, category, fileName, uploadedAt: new Date().toISOString() }]
  )

  if (chunks.length > MAX_CHUNKS) {
    logger.warn('rag: too many chunks, truncating', {
      original: chunks.length, truncated: MAX_CHUNKS,
    })
    chunks = chunks.slice(0, MAX_CHUNKS)
  }

  logger.info('rag: document split', { docId, chunks: chunks.length })

  // 3. 向量化并存入 ChromaDB
  const vs = await getVectorStore()
  await vs.addDocuments(chunks)

  // 4. 注册文档元数据
  const docMeta = {
    id:         docId,
    title:      title || fileName,
    fileName,
    category,
    chunks:     chunks.length,
    chars:      rawText.length,
    uploadedAt: new Date().toISOString(),
    preview:    rawText.slice(0, 120).replace(/\n/g, ' ') + '...',
  }

  docRegistry.set(docId, docMeta)

  // 5. 清理临时文件
  await fs.unlink(filePath).catch(() => {})

  logger.info('rag: ingest complete', { docId, chunks: chunks.length })
  return docMeta
}

// ── 删除文档 ──────────────────────────────────────────────────
export async function deleteDocument(docId) {
  const doc = docRegistry.get(docId)
  if (!doc) throw new Error('文档不存在')

  try {
    const vs = await getVectorStore()
    // 删除该文档的所有 chunks
    await vs.collection.delete({
      where: { docId }
    })
  } catch (err) {
    logger.error('rag: failed to delete from chroma', { docId, error: err.message })
    throw new Error('删除文档失败')
  }

  docRegistry.delete(docId)
  logger.info('rag: document deleted', { docId })
}

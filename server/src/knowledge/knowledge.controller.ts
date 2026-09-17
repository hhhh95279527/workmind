// server/src/knowledge/knowledge.controller.ts
// 知识库控制器：文档管理（上传/列表/删除）+ RAG 问答（流式）
import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, OnModuleInit, Param, Post, Query, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import path from 'path'
import fs from 'fs/promises'
import { assertRealFileType } from '../utils/file-guard.js'
import { ingestDocument, ingestText, getDocRegistry, deleteDocument, setDatabase } from '../services/rag/ingest.js'
import { ragQueryStream, ragQuery } from '../services/rag/query.js'
import { clearSession } from '../services/rag/memory.js'
import { logger } from '../utils/logger.js'
import { initSse } from '../utils/sse'
import { DatabaseService } from '../database/database.service.js'
import { TraceService } from '../observability/trace.service.js'
import { QuotaService } from '../observability/quota.service.js'

/**
 * RAG 会话历史存于进程内存，sessionId 由前端生成且无属主列。
 * 用 租户+用户 做键前缀命名空间，杜绝枚举/碰撞 sessionId 读写他人对话或清空他人会话。
 */
function scopeSession(tenantId: string, userId: string, sessionId?: string) {
  return sessionId ? `rt:${tenantId}:${userId}:${sessionId}` : undefined
}

@Controller('api/knowledge')
export class KnowledgeController implements OnModuleInit {
  constructor(
    private db: DatabaseService,
    private tracer: TraceService,
    private quota: QuotaService,
  ) {}

  onModuleInit() {
    // 注入数据库服务到 RAG 模块
    setDatabase(this.db)
    logger.info('KnowledgeController: Database injected into RAG module')
  }

  // ── POST /api/knowledge/documents ─────────────────────────────
  // 上传文档并入库
  // 支持两种方式：1) 上传文件  2) 直接传文本内容
  @Post('documents')
  async uploadDocument(@Req() req: Request, @Body() body: any) {
    try {
      let docMeta

      const tenantId: string = (req as any).user.tenantId
      const userId: string = (req as any).user.userId

      if ((req as any).file) {
        // 方式1：上传文件（magic number 校验通过后才入库，不通过删除临时文件）
        const file = (req as any).file
        try {
          await assertRealFileType(file.path, path.extname(file.originalname).toLowerCase())
        } catch (e) {
          await fs.unlink(file.path).catch(() => {})
          throw e
        }
        docMeta = await ingestDocument({
          filePath:   file.path,
          fileName:   file.originalname,
          title:      body.title || file.originalname.replace(/\.[^.]+$/, ''),
          category:   body.category || '通用',
          docType:    body.docType || 'GENERAL',
          tenantId,
          uploadedBy: userId,
        })
      } else if (body.content) {
        // 方式2：直接传文本（前端粘贴内容），走 ingestText 统一入库流程
        docMeta = await ingestText({
          title:      body.title || '未命名文档',
          content:    body.content,
          category:   body.category || '通用',
          docType:    body.docType || 'GENERAL',
          tenantId,
          uploadedBy: userId,
        })
      } else {
        throw new BadRequestException('请上传文件或提供文本内容')
      }

      return { success: true, document: docMeta }
    } catch (err) {
      if (err instanceof BadRequestException) throw err
      logger.error('knowledge: ingest error', { error: (err as Error).message })
      throw err
    }
  }

  // ── GET /api/knowledge/documents ──────────────────────────────
  // 已入库文档列表（默认只看本租户 + 平台共享；docType=LEGAL 为平台法规库）
  @Get('documents')
  async listDocuments(@Req() req: Request, @Query('category') category?: string, @Query('docType') docType?: any) {
    const tenantId: string = (req as any).user.tenantId
    const docs = await getDocRegistry({ tenantId, docType })
    const filtered = category
      ? docs.filter((d: any) => d.category === category)
      : docs
    return { documents: filtered }
  }

  // ── DELETE /api/knowledge/documents/:docId ─────────────────────
  // 删除文档（从向量库和注册表中删除）
  @Delete('documents/:docId')
  async removeDocument(@Req() req: Request, @Param('docId') docId: string) {
    try {
      await deleteDocument(docId, (req as any).user.tenantId)
      return { success: true }
    } catch (err) {
      const msg = (err as Error).message
      // 不向调用方区分"不存在/无权"，避免文档 id 枚举
      throw new NotFoundException(msg.includes('无权') ? '文档不存在' : msg)
    }
  }

  // ── POST /api/knowledge/query/stream ──────────────────────────
  // RAG 问答（流式）：先推送来源，再流式推送回答（支持历史记忆）
  @Post('query/stream')
  async queryStream(@Req() req: Request, @Body() body: { question: string; category?: string; docType?: any; sessionId?: string }, @Res() res: Response) {
    const { question, category } = body
    const docType = body.docType
    const userId: string = (req as any).user.userId
    const tenantId: string = (req as any).user.tenantId
    const sessionId = scopeSession(tenantId, userId, body.sessionId)

    if (!question?.trim()) {
      throw new BadRequestException('问题不能为空')
    }

    const sse = initSse(res)
    const send = sse.send

    try {
      await this.tracer.run(
        { feature: 'knowledge', name: `知识库问答：${question.slice(0, 30)}`, tenantId, userId },
        async (handle) => {
          await this.quota.assert(tenantId)
          send('status', { message: '正在检索相关文档...' })

          const { sources, streamAnswer, rewrittenQuestion } = await ragQueryStream(question, {
            category,
            docType,
            tenantId,
            sessionId,
            callbacks: handle.callbacks,
          })

          send('sources', { sources })
          if (rewrittenQuestion && rewrittenQuestion !== question) {
            send('rewritten', { original: question, rewritten: rewrittenQuestion })
          }

          if (!sources.length) {
            send('token', { token: '知识库中未找到相关内容，请尝试上传相关文档后再提问。' })
            send('done', {})
            return
          }

          send('status', { message: '正在生成回答...' })
          for await (const token of streamAnswer()) {
            send('token', { token })
          }
          send('done', {})
          logger.info('knowledge: query done', { sessionId, question: question.slice(0, 40), sources: sources.length })
        },
      )
    } catch (err) {
      logger.error('knowledge: query error', { error: (err as Error).message })
      sse.error(err)
    } finally {
      sse.end()
    }
  }

  // ── POST /api/knowledge/query ─────────────────────────────────
  // RAG 问答（非流式）：适用于短问题或不需要流式展示的场景（支持历史记忆）
  @Post('query')
  async query(@Req() req: Request, @Body() body: { question: string; category?: string; docType?: any; sessionId?: string }) {
    const { question, category, docType } = body
    const tenantId: string = (req as any).user.tenantId
    const sessionId = scopeSession(tenantId, (req as any).user.userId, body.sessionId)

    if (!question?.trim()) {
      throw new BadRequestException('问题不能为空')
    }

    return this.tracer.run(
      { feature: 'knowledge', name: `知识库问答：${question.slice(0, 30)}`, tenantId, userId: (req as any).user.userId },
      async (handle) => {
        await this.quota.assert(tenantId)
        const { answer, sources } = await ragQuery(question, {
          category,
          docType,
          tenantId,
          sessionId,
          callbacks: handle.callbacks,
        })
        return { answer, sources }
      },
    )
  }

  // ── DELETE /api/knowledge/session/:sessionId ───────────────────
  // 清空指定会话的历史记录（sessionId 经租户+用户命名空间隔离）
  @Delete('session/:sessionId')
  clearSession(@Req() req: Request, @Param('sessionId') sessionId: string) {
    const scoped = scopeSession((req as any).user.tenantId, (req as any).user.userId, sessionId)
    clearSession(scoped!)
    return { success: true, message: '会话历史已清空' }
  }

  // ── GET /api/knowledge/categories ─────────────────────────────
  // 获取可见分类（本租户 + 平台共享，前端筛选用）
  @Get('categories')
  async categories(@Req() req: Request) {
    const docs = await getDocRegistry({ tenantId: (req as any).user.tenantId })
    const categories = [...new Set(docs.map((d: any) => d.category))]
    return {
      categories: [
        { value: '', label: '全部文档' },
        ...categories.map(c => ({ value: c, label: c })),
      ],
    }
  }
}

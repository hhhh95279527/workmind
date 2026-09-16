// server/src/contract/contract.controller.ts
// 合同业务接口：上传/列表/详情 → 发起审查(SSE) → 待审列表 → 人工决策恢复 → 意见书
// 所有查询强制 tenantId 过滤；跨租户访问一律 404。
import {
  BadRequestException, Body, Controller, Delete, ForbiddenException, Get,
  NotFoundException, OnModuleInit, Param, Post, Req, Res,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { DatabaseService } from '../database/database.service.js'
import { TraceService } from '../observability/trace.service.js'
import { QuotaService } from '../observability/quota.service.js'
import { Roles } from '../auth/decorators/roles.decorator.js'
import { initSse } from '../utils/sse.js'
import { logger } from '../utils/logger.js'
import { ContractParseService } from './parsing/contract-parse.service.js'
import { setReviewDatabase, startReview, resumeReview, serializeRisk } from './review/review.agent.js'

@Controller('api')
export class ContractController implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly parseService: ContractParseService,
    private readonly tracer: TraceService,
    private readonly quota: QuotaService,
  ) {}

  onModuleInit() {
    setReviewDatabase(this.db)
    // multer diskStorage 不会自动建目录
    fs.mkdir('./uploads', { recursive: true }).catch(() => {})
  }

  // ── 上传合同文件（multipart：file + title）────────────────────
  @Post('contracts/upload')
  async upload(@Req() req: Request, @Body() body: { title?: string }) {
    const file = (req as any).file as Express.Multer.File | undefined
    if (!file) throw new BadRequestException('请选择合同文件')

    const tenantId = (req as any).user.tenantId
    const userId = (req as any).user.userId
    const ext = path.extname(file.originalname).toLowerCase()

    const contract = await this.db.contract.create({
      data: {
        tenantId,
        uploadedBy: userId,
        title: (body.title || file.originalname.replace(/\.[^.]+$/, '')).slice(0, 200),
        fileName: file.originalname,
        fileType: ext.slice(1) || 'txt',
        status: 'UPLOADED',
      },
    })
    await this.parseService.enqueue(contract.id, file.path)
    logger.info('contract: uploaded', { contractId: contract.id, file: file.originalname })
    return { contract }
  }

  // ── 直接粘贴合同文本 ─────────────────────────────────────────
  @Post('contracts/text')
  async uploadText(
    @Req() req: Request,
    @Body() body: { title?: string; content?: string },
  ) {
    if (!body.content?.trim()) throw new BadRequestException('合同内容不能为空')

    const tenantId = (req as any).user.tenantId
    const userId = (req as any).user.userId
    await fs.mkdir('./uploads', { recursive: true })
    const tmpPath = `./uploads/contract_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.txt`
    await fs.writeFile(tmpPath, body.content, 'utf-8')

    const contract = await this.db.contract.create({
      data: {
        tenantId,
        uploadedBy: userId,
        title: (body.title || `合同文本 ${new Date().toLocaleDateString('zh-CN')}`).slice(0, 200),
        fileName: '粘贴文本.txt',
        fileType: 'txt',
        status: 'UPLOADED',
      },
    })
    await this.parseService.enqueue(contract.id, tmpPath)
    return { contract }
  }

  // ── 合同列表（status 可选；含最近一次审查状态）─────────────────
  @Get('contracts')
  async list(@Req() req: Request) {
    const tenantId = (req as any).user.tenantId
    const status = new URL(req.url, 'http://x').searchParams.get('status')
    const contracts = await this.db.contract.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reviewTasks: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
        _count: { select: { clauses: true } },
      },
    })
    return {
      contracts: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        fileName: c.fileName,
        status: c.status,
        progress: c.progress,
        parseError: c.parseError,
        fileType: c.fileType,
        charCount: c.charCount,
        clausesCount: c.clausesCount,
        createdAt: c.createdAt,
        review: c.reviewTasks[0] ?? null,
      })),
    }
  }

  // ── 合同详情：条款 + 最近一次审查任务及全部风险 ─────────────────
  @Get('contracts/:id')
  async detail(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user.tenantId
    const contract = await this.db.contract.findFirst({
      where: { id, tenantId },
      include: {
        clauses: { orderBy: { indexNo: 'asc' } },
        reviewTasks: { orderBy: { createdAt: 'desc' }, take: 1, include: { risks: { orderBy: { createdAt: 'asc' } } } },
      },
    })
    if (!contract) throw new NotFoundException('合同不存在')
    return {
      contract: {
        id: contract.id,
        title: contract.title,
        fileName: contract.fileName,
        status: contract.status,
        progress: contract.progress,
        parseError: contract.parseError,
        fileType: contract.fileType,
        charCount: contract.charCount,
        clausesCount: contract.clausesCount,
        reportMd: contract.reportMd,
        createdAt: contract.createdAt,
      },
      clauses: contract.clauses.map((c) => ({
        id: c.id, indexNo: c.indexNo, title: c.title, clauseType: c.clauseType, content: c.content,
      })),
      review: contract.reviewTasks[0]
        ? {
            id: contract.reviewTasks[0].id,
            status: contract.reviewTasks[0].status,
            threadId: contract.reviewTasks[0].threadId,
            stats: contract.reviewTasks[0].stats,
            createdAt: contract.reviewTasks[0].createdAt,
            risks: contract.reviewTasks[0].risks.map(serializeRisk),
          }
        : null,
    }
  }

  @Delete('contracts/:id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user.tenantId
    const result = await this.db.contract.deleteMany({ where: { id, tenantId } })
    if (!result.count) throw new NotFoundException('合同不存在')
    return { success: true }
  }

  // ── 发起审查（SSE：stage/risk/waiting/done）──────────────────
  @Post('contracts/:id/reviews')
  async startReviewStream(@Req() req: Request, @Res() res: Response, @Param('id') id: string) {
    const tenantId = (req as any).user.tenantId
    const userId = (req as any).user.userId
    const sse = initSse(res)

    try {
      const contract = await this.db.contract.findFirst({ where: { id, tenantId } })
      if (!contract) throw new NotFoundException('合同不存在')
      if (!['READY', 'WAITING_REVIEW', 'COMPLETED'].includes(contract.status)) {
        throw new BadRequestException(`合同当前状态（${contract.status}）不可发起审查，请等待解析完成或处理解析失败`)
      }

      const reviewTask = await this.tracer.run(
        { feature: 'contract_review', name: `合同审查：${contract.title}`, tenantId, userId },
        async (handle) => {
          await this.quota.assert(tenantId)

          const task = await this.db.reviewTask.create({
            data: {
              tenantId,
              contractId: contract.id,
              threadId: `rev_${randomUUID()}`,
              status: 'RUNNING',
            },
          })
          sse.send('task', { taskId: task.id })

          await startReview({
            contract,
            reviewTask: task,
            traceCallbacks: handle.callbacks,
            onEvent: (type, data) => sse.send(type, data),
          })
          return task
        },
      )

      sse.send('done', { taskId: reviewTask.id, status: 'WAITING_REVIEW' })
    } catch (err) {
      logger.error('contract: review start failed', { error: (err as Error).message })
      sse.error(err)
    } finally {
      sse.end()
    }
  }

  // ── 待人工终审列表 ───────────────────────────────────────────
  @Get('reviews/pending')
  async pending(@Req() req: Request) {
    const tenantId = (req as any).user.tenantId
    const tasks = await this.db.reviewTask.findMany({
      where: { tenantId, status: 'WAITING_REVIEW' },
      orderBy: { updatedAt: 'desc' },
      include: { contract: { select: { id: true, title: true, fileName: true } } },
    })
    return { tasks: tasks.map((t) => ({ id: t.id, contract: t.contract, stats: t.stats, createdAt: t.createdAt })) }
  }

  // ── 单条审查任务详情 ─────────────────────────────────────────
  @Get('reviews/:taskId')
  async reviewDetail(@Req() req: Request, @Param('taskId') taskId: string) {
    const tenantId = (req as any).user.tenantId
    const task = await this.db.reviewTask.findFirst({
      where: { id: taskId, tenantId },
      include: { contract: true, risks: { orderBy: { createdAt: 'asc' } } },
    })
    if (!task) throw new NotFoundException('审查任务不存在')
    return {
      id: task.id,
      status: task.status,
      stats: task.stats,
      createdAt: task.createdAt,
      contract: { id: task.contract.id, title: task.contract.title, status: task.contract.status },
      risks: task.risks.map(serializeRisk),
      reportMd: task.contract.reportMd,
    }
  }

  // ── 人工终审：逐条处置 + 整体通过/驳回，恢复 LangGraph ─────────
  @Post('reviews/:taskId/decision')
  @Roles('ADMIN', 'MANAGER')
  async decision(
    @Req() req: Request,
    @Param('taskId') taskId: string,
    @Body() body: {
      finalDecision?: 'APPROVED' | 'REJECTED'
      actions?: Array<{ riskId: string; status: 'ACCEPTED' | 'IGNORED' | 'EDITED'; comment?: string | null }>
    },
  ) {
    const tenantId = (req as any).user.tenantId
    const userId = (req as any).user.userId
    if (!body.finalDecision || !['APPROVED', 'REJECTED'].includes(body.finalDecision)) {
      throw new BadRequestException('finalDecision 必须是 APPROVED 或 REJECTED')
    }

    const task = await this.db.reviewTask.findFirst({ where: { id: taskId, tenantId } })
    if (!task) throw new NotFoundException('审查任务不存在')
    if (task.status !== 'WAITING_REVIEW') throw new BadRequestException('该任务不在待审状态')

    const actions = (body.actions || []).filter((a) => a.riskId && ['ACCEPTED', 'IGNORED', 'EDITED'].includes(a.status))

    await this.tracer.run(
      { feature: 'contract_review', name: `人工终审恢复：${taskId}`, tenantId, userId },
      async (handle) => {
        await resumeReview({
          reviewTask: task,
          actions,
          finalDecision: body.finalDecision as 'APPROVED' | 'REJECTED',
          reviewerId: userId,
          traceCallbacks: handle.callbacks,
        })
      },
    )

    const updated = await this.db.reviewTask.findUniqueOrThrow({
      where: { id: taskId },
      include: { contract: true, risks: true },
    })
    return {
      status: updated.status,
      contractStatus: updated.contract.status,
      reportMd: updated.contract.reportMd,
      stats: updated.stats,
    }
  }

  // ── 意见书 Markdown ─────────────────────────────────────────
  @Get('reviews/:taskId/report')
  async report(@Req() req: Request, @Param('taskId') taskId: string) {
    const tenantId = (req as any).user.tenantId
    const task = await this.db.reviewTask.findFirst({
      where: { id: taskId, tenantId },
      include: { contract: true },
    })
    if (!task) throw new NotFoundException('审查任务不存在')
    if (!task.contract.reportMd) throw new ForbiddenException('审查尚未终审完成，意见书未生成')
    return { reportMd: task.contract.reportMd, title: task.contract.title }
  }
}

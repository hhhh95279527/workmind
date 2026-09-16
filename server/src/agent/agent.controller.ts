// server/src/agent/agent.controller.ts
// Agent 控制器：配额断言 → Trace 包裹 → SSE 流式推送每一步
import { BadRequestException, Body, Controller, Get, OnModuleInit, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { runAgent, getToolList } from '../services/agent/agent.js'
import { setToolsDatabase } from '../services/agent/tools.js'
import { DatabaseService } from '../database/database.service.js'
import { TraceService } from '../observability/trace.service.js'
import { QuotaService } from '../observability/quota.service.js'
import { logger } from '../utils/logger.js'
import { initSse } from '../utils/sse'

@Controller('api/agent')
export class AgentController implements OnModuleInit {
  constructor(
    private readonly db: DatabaseService,
    private readonly tracer: TraceService,
    private readonly quota: QuotaService,
  ) {}

  onModuleInit() {
    setToolsDatabase(this.db)
  }

  // ── POST /api/agent/run ────────────────────────────────────────
  @Post('run')
  async run(@Req() req: Request, @Body() body: { task: string }, @Res() res: Response) {
    const { task } = body ?? {}
    const userId: string = (req as any).user.userId
    const tenantId: string = (req as any).user.tenantId

    if (!task?.trim()) throw new BadRequestException('任务不能为空')
    if (task.length > 2000) throw new BadRequestException('任务描述过长，请简洁描述')

    const sse = initSse(res)
    const send = sse.send

    try {
      await this.tracer.run(
        { feature: 'agent', name: `Agent 任务：${task.slice(0, 30)}`, tenantId, userId },
        async ({ callbacks }) => {
          await this.quota.assert(tenantId) // 放在 trace 内：被拦截的调用也留有审计痕迹
          send('start', { task, timestamp: new Date().toISOString() })
          await runAgent(task, { callbacks }, (type: string, data: unknown) => send(type, data))
        },
      )
    } catch (err) {
      logger.error('agent route error', { error: (err as Error).message, traceId: (req as any).traceId })
      sse.error(err)
    } finally {
      sse.end()
    }
  }

  // ── GET /api/agent/tools ───────────────────────────────────────
  @Get('tools')
  tools() {
    return { tools: getToolList() }
  }

  // ── GET /api/agent/examples ────────────────────────────────────
  @Get('examples')
  examples() {
    return {
      examples: [
        { title: '法规核查', task: '查一下法规库：劳动合同约定试用期6个月、违约金5万元是否合法？给出条文依据', icon: '⚖️' },
        { title: '费用计算', task: '出差3天，酒店每晚580元，机票往返1200元，餐费每天150元，计算总报销金额', icon: '💰' },
        { title: '工期计算', task: '项目从2026-09-15开始，需要45个工作日完成，计算预计完成日期', icon: '📅' },
        { title: '技术调研', task: '调研2026年主流前端构建工具的现状并给出选型建议', icon: '🔍' },
      ],
    }
  }
}

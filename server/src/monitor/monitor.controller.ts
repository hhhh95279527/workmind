// server/src/monitor/monitor.controller.ts
// 用量看板：API 调用统计、Token 消耗、缓存命中率、成本
import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { MonitorService } from './monitor.service'
import { BillingService } from './billing.service.js'
import { QuotaService } from '../observability/quota.service.js'

@Controller('api/monitor')
export class MonitorController {
  constructor(
    private readonly monitorService: MonitorService,
    private readonly billingService: BillingService,
    private readonly quotaService: QuotaService,
  ) {}

  // ── GET /api/monitor/stats ─────────────────────────────────────
  // 返回当前租户的完整统计数据（前端定时轮询）
  @Get('stats')
  stats(@Req() req: Request) {
    return this.monitorService.getStats((req as any).user.tenantId)
  }

  // ── GET /api/monitor/quota ─────────────────────────────────────
  // 当前租户本月套餐配额用量
  @Get('quota')
  quota(@Req() req: Request) {
    return this.quotaService.getUsage((req as any).user.tenantId)
  }

  // ── GET /api/monitor/billing ───────────────────────────────────
  // 配额账单：本月配额进度、按天峰谷费用、功能占比、历史账期/超额记录
  @Get('billing')
  billing(@Req() req: Request) {
    return this.billingService.getBilling((req as any).user.tenantId)
  }

  // ── GET /api/monitor/traces ────────────────────────────────────
  // 链路列表（Trace 瀑布页左侧）：分页 + feature/status 过滤，强制当前租户
  @Get('traces')
  traces(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('feature') feature?: string,
    @Query('status') status?: string,
  ) {
    const tenantId = (req as any).user.tenantId
    return this.monitorService.listTraces(tenantId, {
      page: Math.max(1, Number(page) || 1),
      pageSize: Math.min(100, Math.max(1, Number(pageSize) || 20)),
      feature,
      status,
    })
  }

  // ── GET /api/monitor/traces/:id ───────────────────────────────
  // 链路详情：含按开始时间升序的 LLM/TOOL/RETRIEVER spans（瀑布右侧）
  @Get('traces/:id')
  async traceDetail(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user.tenantId
    const detail = await this.monitorService.getTraceDetail(tenantId, id)
    if (!detail) throw new NotFoundException('链路不存在或无权查看')
    return detail
  }

  // ── PUT /api/monitor/budget ────────────────────────────────────
  @Put('budget')
  budget(@Body() body: { dailyBudget: number }) {
    const { dailyBudget } = body
    if (typeof dailyBudget !== 'number' || dailyBudget <= 0) {
      throw new BadRequestException('预算必须是正数')
    }
    this.monitorService.setBudget(dailyBudget)
    return { success: true, dailyBudget }
  }
}

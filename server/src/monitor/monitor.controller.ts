// server/src/monitor/monitor.controller.ts
// 用量看板：API 调用统计、Token 消耗、缓存命中率、成本
import { BadRequestException, Body, Controller, Get, Put, Req } from '@nestjs/common'
import type { Request } from 'express'
import { MonitorService } from './monitor.service'
import { QuotaService } from '../observability/quota.service.js'

@Controller('api/monitor')
export class MonitorController {
  constructor(
    private readonly monitorService: MonitorService,
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

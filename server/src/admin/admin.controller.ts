// server/src/admin/admin.controller.ts
// 管理后台：租户内用户管理、系统配置、基于 Trace 的用量聚合
import { Body, Controller, Delete, ForbiddenException, Get, Param, Put, Query, Req } from '@nestjs/common'
import type { Request } from 'express'
import { DatabaseService } from '../database/database.service'
import { Roles } from '../auth/decorators/roles.decorator'
import { logger } from '../utils/logger.js'

@Controller('api/admin')
@Roles('ADMIN')
export class AdminController {
  constructor(private db: DatabaseService) {}

  // ── 用户管理（限本租户）────────────────────────────────────────
  @Get('users')
  async listUsers(@Req() req: Request, @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    const tenantId = (req as any).user.tenantId
    const skip = (Number(page) - 1) * Number(pageSize)
    const take = Number(pageSize)

    const [users, total] = await Promise.all([
      this.db.user.findMany({
        where: { tenantId },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, email: true, role: true, status: true,
          createdAt: true, lastLoginAt: true,
        },
      }),
      this.db.user.count({ where: { tenantId } }),
    ])

    return { users, total, page: Number(page), pageSize: Number(pageSize) }
  }

  @Put('users/:id')
  async updateUser(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const tenantId = (req as any).user.tenantId
    const target = await this.db.user.findUnique({ where: { id }, select: { tenantId: true } })
    if (!target || target.tenantId !== tenantId) throw new ForbiddenException('无权操作该用户')

    const { role, status } = body
    const user = await this.db.user.update({
      where: { id },
      data: {
        ...(role && { role }),
        ...(status !== undefined && { status }),
      },
    })

    logger.info('admin: user updated', { id, role, status })
    return { success: true, user }
  }

  @Delete('users/:id')
  async deleteUser(@Req() req: Request, @Param('id') id: string) {
    const tenantId = (req as any).user.tenantId
    const target = await this.db.user.findUnique({ where: { id }, select: { tenantId: true } })
    if (!target || target.tenantId !== tenantId) throw new ForbiddenException('无权操作该用户')

    // 软删除：禁用而非物理删除（保留审计关联）
    await this.db.user.update({ where: { id }, data: { status: 'DISABLED' } })
    logger.info('admin: user disabled', { id })
    return { success: true }
  }

  // ── 系统配置 ──────────────────────────────────────────────────
  @Get('config')
  async getConfig() {
    const configs = await this.db.systemConfig.findMany()
    const configMap: Record<string, any> = {}
    configs.forEach((c) => { configMap[c.key] = c.value })
    return { config: configMap }
  }

  @Put('config')
  async updateConfig(@Body() body: Record<string, any>) {
    await Promise.all(
      Object.entries(body).map(([key, value]) =>
        this.db.systemConfig.upsert({
          where: { key },
          update: { value: value as any },
          create: { key, value: value as any },
        }),
      ),
    )
    logger.info('admin: config updated', { keys: Object.keys(body) })
    return { success: true }
  }

  // ── 用量统计（从 Trace 聚合，近 N 天）──────────────────────────
  @Get('usage')
  async getUsage(@Req() req: Request, @Query('days') days = '30') {
    const tenantId = (req as any).user.tenantId
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number(days))

    // 按天聚合：Prisma 不支持 date_trunc，用原生 SQL
    const daily = await this.db.$queryRaw<any[]>`
      SELECT date_trunc('day', created_at)::date AS date,
             COUNT(*)::int                          AS calls,
             COALESCE(SUM(input_tokens + output_tokens), 0)::bigint AS tokens,
             COALESCE(SUM(cost_cny), 0)::float       AS cost
      FROM traces
      WHERE tenant_id = ${tenantId} AND created_at >= ${startDate}
      GROUP BY 1 ORDER BY 1`

    const byFeature = await this.db.trace.groupBy({
      by: ['feature'],
      where: { tenantId, createdAt: { gte: startDate } },
      _sum: { inputTokens: true, outputTokens: true, costCny: true },
      _count: { _all: true },
    })

    const total = await this.db.trace.aggregate({
      where: { tenantId, createdAt: { gte: startDate } },
      _sum: { inputTokens: true, outputTokens: true, costCny: true },
      _count: { _all: true },
    })

    return {
      daily: daily.map((d) => ({
        date: d.date,
        calls: d.calls,
        tokens: Number(d.tokens),
        costCny: Number(d.cost),
      })),
      byFeature: byFeature.map((f) => ({
        feature: f.feature,
        calls: f._count._all,
        tokens: (f._sum.inputTokens || 0) + (f._sum.outputTokens || 0),
        costCny: Number(f._sum.costCny || 0),
      })),
      total: {
        calls: total._count._all,
        tokens: (total._sum.inputTokens || 0) + (total._sum.outputTokens || 0),
        costCny: Number(total._sum.costCny || 0),
      },
    }
  }

  // ── 成员用量排行 ──────────────────────────────────────────────
  @Get('usage/users')
  async getUserUsage(@Req() req: Request, @Query('days') days = '30') {
    const tenantId = (req as any).user.tenantId
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number(days))

    const usage = await this.db.trace.groupBy({
      by: ['userId'],
      where: { tenantId, createdAt: { gte: startDate }, userId: { not: null } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { _all: true },
      orderBy: { _sum: { outputTokens: 'desc' } },
      take: 50,
    })

    const userIds = usage.map((u) => u.userId!).filter(Boolean)
    const users = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, email: true },
    })
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

    return {
      users: usage.map((u) => ({
        userId: u.userId,
        username: userMap[u.userId!]?.username || 'Unknown',
        email: userMap[u.userId!]?.email || '',
        calls: u._count._all,
        tokens: (u._sum.inputTokens || 0) + (u._sum.outputTokens || 0),
      })),
    }
  }
}

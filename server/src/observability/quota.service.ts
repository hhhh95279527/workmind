// server/src/observability/quota.service.ts
// 租户月度配额：调用前断言、调用后计量。FREE 默认 50 万 token/月（见 schema Tenant）。
import { ForbiddenException, Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service.js'
import { logger } from '../utils/logger.js'

export class QuotaExceededException extends Error {
  readonly quotaExceeded = true
  constructor(
    public usedTokens: number,
    public quota: number,
  ) {
    super(`本月 token 用量已达套餐上限（${usedTokens}/${quota}），请升级套餐或次月恢复`)
    this.name = 'QuotaExceededException'
  }
}

/** 北京时间 YYYY-MM，配额账期与 DeepSeek 一样按国内账期对齐 */
export function currentPeriod(now: Date = new Date()): string {
  const bj = new Date(now.getTime() + 8 * 3600_000)
  return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}`
}

@Injectable()
export class QuotaService {
  constructor(private readonly db: DatabaseService) {}

  /** 调用前断言：租户状态正常且本月未超额，超额抛 QuotaExceededException（由异常过滤器转 429） */
  async assert(tenantId: string): Promise<{ plan: string; usedTokens: number; quota: number }> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new Error('租户不存在')
    if (tenant.status === 'DISABLED') {
      throw new ForbiddenException('工作空间已被停用，请联系平台管理员')
    }

    const usage = await this.db.quotaUsage.findUnique({
      where: { tenantId_period: { tenantId, period: currentPeriod() } },
    })
    const usedTokens = usage ? Number(usage.inputTokens) + Number(usage.outputTokens) : 0
    if (usedTokens >= tenant.monthlyTokenQuota) {
      throw new QuotaExceededException(usedTokens, tenant.monthlyTokenQuota)
    }
    return { plan: tenant.plan, usedTokens, quota: tenant.monthlyTokenQuota }
  }

  /** 查询本月配额用量（前端配额账单用） */
  async getUsage(tenantId: string) {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } })
    const usage = await this.db.quotaUsage.findUnique({
      where: { tenantId_period: { tenantId, period: currentPeriod() } },
    })
    return {
      plan: tenant?.plan ?? 'FREE',
      period: currentPeriod(),
      inputTokens: usage ? Number(usage.inputTokens) : 0,
      outputTokens: usage ? Number(usage.outputTokens) : 0,
      costCny: usage ? Number(usage.costCny) : 0,
      quota: tenant?.monthlyTokenQuota ?? 0,
      usedTokens: usage ? Number(usage.inputTokens) + Number(usage.outputTokens) : 0,
    }
  }

  /**
   * 调用后计量：upsert 月度行并自增。
   * 首次并发插入撞唯一约束时退化为 update 自增，保证不丢账。
   */
  async record(tenantId: string, inputTokens: number, outputTokens: number, costCny: number) {
    const period = currentPeriod()
    try {
      await this.db.quotaUsage.upsert({
        where: { tenantId_period: { tenantId, period } },
        create: { tenantId, period, inputTokens, outputTokens, costCny },
        update: {
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          costCny: { increment: costCny },
        },
      })
    } catch (e) {
      logger.warn('quota upsert race, fallback to update', { error: (e as Error).message })
      await this.db.quotaUsage.update({
        where: { tenantId_period: { tenantId, period } },
        data: {
          inputTokens: { increment: inputTokens },
          outputTokens: { increment: outputTokens },
          costCny: { increment: costCny },
        },
      })
    }
  }
}

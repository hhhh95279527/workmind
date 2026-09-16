// server/src/audit/audit.service.ts
// 审计日志服务：记录关键操作，支持查询
import { Injectable } from '@nestjs/common'
import { DatabaseService } from '../database/database.service'
import { logger } from '../utils/logger.js'

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * 记录审计事件
   */
  async log(params: {
    userId?: string
    action: string
    resource: string
    resourceId?: string
    detail?: any
    ip?: string
    userAgent?: string
    tenantId?: string
  }) {
    try {
      await this.db.auditLog.create({
        data: {
          userId: params.userId,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          detail: params.detail || undefined,
          ip: params.ip,
          userAgent: params.userAgent,
          tenantId: params.tenantId,
        },
      })
    } catch (err) {
      // 审计日志写入失败不应影响业务，只打日志
      logger.error('audit log write failed', { error: (err as Error).message })
    }
  }

  /**
   * 查询审计日志（管理员用）
   */
  async list(params: {
    userId?: string
    action?: string
    page?: number
    pageSize?: number
  }) {
    const { userId, action, page = 1, pageSize = 50 } = params
    const where: any = {}
    if (userId) where.userId = userId
    if (action) where.action = { contains: action, mode: 'insensitive' }

    const [items, total] = await Promise.all([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.auditLog.count({ where }),
    ])

    return { items, total, page, pageSize }
  }
}

// server/src/audit/audit.controller.ts
// 审计日志接口（管理员/审查负责人）
import { Controller, Get, Query } from '@nestjs/common'
import { AuditService } from './audit.service'
import { Roles } from '../auth/decorators/roles.decorator'

@Controller('api/audit')
@Roles('ADMIN', 'MANAGER')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('logs')
  async listLogs(
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditService.list({
      userId,
      action,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 50,
    })
  }
}

// server/src/app.module.ts
// 根模块：全局守卫（JWT 默认开启 + RBAC）+ 业务模块注册 + 中间件按路由挂载
import { MiddlewareConsumer, Module, NestModule, OnApplicationShutdown, RequestMethod } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { requestLogger, RateLimiterMiddleware, validateChat, securityCheck, fileUpload, contractFileUpload } from './middleware'
import { DatabaseModule } from './database/database.module'
import { RedisModule } from './redis/redis.module'
import { ObservabilityModule } from './observability/observability.module'
import { QueueModule } from './queue/queue.module'
import { AuthModule } from './auth/auth.module'
import { AuditModule } from './audit/audit.module'
import { HealthModule } from './health/health.module'
import { ChatModule } from './chat/chat.module'
import { KnowledgeModule } from './knowledge/knowledge.module'
import { AgentModule } from './agent/agent.module'
import { MonitorModule } from './monitor/monitor.module'
import { AdminModule } from './admin/admin.module'
import { ContractModule } from './contract/contract.module.js'
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard'
import { RolesGuard } from './auth/guards/roles.guard'
import { logger } from './utils/logger.js'

@Module({
  imports: [
    // 平台基础设施
    DatabaseModule,
    RedisModule,
    ObservabilityModule,
    QueueModule,
    AuthModule,
    AuditModule,
    // 业务模块
    HealthModule,
    ChatModule,
    KnowledgeModule,
    AgentModule,
    MonitorModule,
    AdminModule,
    // 业务层：合同风险审查
    ContractModule,
  ],
  providers: [
    // 全局守卫：先认证后鉴权。默认所有路由需登录，@Public() 放行
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule, OnApplicationShutdown {
  configure(consumer: MiddlewareConsumer) {
    // 全局请求日志 + traceId
    consumer.apply(requestLogger).forRoutes('*')

    // 入口限流（Redis 令牌桶，IP 维度）；租户级月度配额在 QuotaService
    consumer.apply(RateLimiterMiddleware).forRoutes(
      { path: 'api/chat/stream',            method: RequestMethod.POST },
      { path: 'api/knowledge/documents',    method: RequestMethod.POST },
      { path: 'api/knowledge/query/stream', method: RequestMethod.POST },
      { path: 'api/knowledge/query',        method: RequestMethod.POST },
      { path: 'api/agent/run',              method: RequestMethod.POST },
    )

    // 对话入口：输入校验 + Prompt 注入检测
    consumer.apply(validateChat, securityCheck)
      .forRoutes({ path: 'api/chat/stream', method: RequestMethod.POST })

    // 知识库文档上传：multer 文件解析
    consumer.apply(fileUpload)
      .forRoutes({ path: 'api/knowledge/documents', method: RequestMethod.POST })

    // 合同上传：multer（支持 .docx）
    consumer.apply(contractFileUpload)
      .forRoutes({ path: 'api/contracts/upload', method: RequestMethod.POST })

    // 发起审查属 AI 消耗入口，纳入入口限流
    consumer.apply(RateLimiterMiddleware).forRoutes(
      { path: 'api/contracts/*/reviews', method: RequestMethod.POST },
    )
  }

  onApplicationShutdown(signal: string) {
    logger.info('shutdown', { signal })
    // 最多等 10s，超时强制退出
    setTimeout(() => process.exit(1), 10000).unref()
  }
}

// server/src/observability/observability.module.ts
// 全局可观测模块：Trace/Span 采集 + 峰谷成本 + 租户配额计量
import { Global, Module } from '@nestjs/common'
import { TraceService } from './trace.service.js'
import { QuotaService } from './quota.service.js'

@Global()
@Module({
  providers: [TraceService, QuotaService],
  exports: [TraceService, QuotaService],
})
export class ObservabilityModule {}

// server/src/monitor/monitor.module.ts
// Global：让 ChatController 等可直接注入 MonitorService
import { Global, Module } from '@nestjs/common'
import { MonitorController } from './monitor.controller'
import { MonitorService } from './monitor.service'
import { BillingService } from './billing.service.js'

@Global()
@Module({
  controllers: [MonitorController],
  providers: [MonitorService, BillingService],
  exports: [MonitorService, BillingService],
})
export class MonitorModule {}

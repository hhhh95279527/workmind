// server/src/monitor/monitor.module.ts
// Global：让 ChatController 等可直接注入 MonitorService
import { Global, Module } from '@nestjs/common'
import { MonitorController } from './monitor.controller'
import { MonitorService } from './monitor.service'

@Global()
@Module({
  controllers: [MonitorController],
  providers: [MonitorService],
  exports: [MonitorService],
})
export class MonitorModule {}

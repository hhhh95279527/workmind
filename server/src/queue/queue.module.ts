// server/src/queue/queue.module.ts
import { Global, Module } from '@nestjs/common'
import { QueueService } from './queue.service.js'

@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}

// server/src/admin/admin.module.ts
import { Module } from '@nestjs/common'
import { AdminController } from './admin.controller.js'
import { DatabaseModule } from '../database/database.module.js'
import { RuleAdminService } from './rule-admin.service.js'

@Module({
  imports: [DatabaseModule],
  controllers: [AdminController],
  providers: [RuleAdminService],
})
export class AdminModule {}

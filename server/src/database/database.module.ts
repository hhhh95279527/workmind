// server/src/database/database.module.ts
// 数据库模块：全局可用，导出 Prisma 服务
import { Global, Module } from '@nestjs/common'
import { DatabaseService } from './database.service'

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}

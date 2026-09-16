// server/src/database/database.service.ts
// Prisma 数据库服务：NestJS 全局可注入，管理连接生命周期
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { logger } from '../utils/logger.js'

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect()
      logger.info('PostgreSQL connected')
    } catch (err) {
      logger.error('PostgreSQL connection failed', { error: (err as Error).message })
      throw err
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
    logger.info('PostgreSQL disconnected')
  }
}

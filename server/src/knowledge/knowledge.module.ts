// server/src/knowledge/knowledge.module.ts
import { Module } from '@nestjs/common'
import { KnowledgeController } from './knowledge.controller'

@Module({
  controllers: [KnowledgeController],
})
export class KnowledgeModule {}

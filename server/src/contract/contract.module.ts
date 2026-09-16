// server/src/contract/contract.module.ts
// 合同风险审查业务模块（业务层）：平台能力（DB/Trace/Quota/Queue）由全局模块提供
import { Module } from '@nestjs/common'
import { ContractController } from './contract.controller.js'
import { ContractParseService } from './parsing/contract-parse.service.js'

@Module({
  controllers: [ContractController],
  providers: [ContractParseService],
})
export class ContractModule {}

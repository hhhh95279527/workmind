// server/src/chat/chat.module.ts
import { Module } from '@nestjs/common'
import { ChatController } from './chat.controller'

@Module({
  controllers: [ChatController],
})
export class ChatModule {}

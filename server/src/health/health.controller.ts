// server/src/health/health.controller.ts
// 健康检查（公开，供容器探针/负载均衡使用）
import { Controller, Get } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator'
import { cache } from '../services/cache.js'

@Public()
@Controller('health')
export class HealthController {
  private readonly startTime = Date.now()

  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.floor((Date.now() - this.startTime) / 1000) }
  }

  @Get()
  health() {
    return {
      status: 'healthy',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      cache: cache.getStats(),
      version: '2.0.0',
    }
  }
}

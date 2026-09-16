// server/src/middleware/rate-limiter.middleware.ts
// 入口限流：Redis 令牌桶（多实例共享计数），按 IP 维度。
// 中间件执行早于 JWT Guard，此时尚无用户身份；租户维度的配额在 QuotaService 做。
// Redis 不可用时自动降级为单机令牌桶，保证防护不中断。
import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { RedisService } from '../redis/redis.service.js'
import { logger } from '../utils/logger.js'

const CAPACITY = 30        // 桶容量：突发 30 个请求
const REFILL_RATE = 10     // 每秒补充 10 个令牌

interface LocalBucket { tokens: number; lastRefill: number }

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  private local = new Map<string, LocalBucket>()

  constructor(private readonly redisService: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const key = `wm:rl:${ip}`

    let allowed: boolean
    try {
      allowed = await this.redisService.consumeToken(key, CAPACITY, REFILL_RATE)
    } catch {
      allowed = this.localConsume(ip)
    }

    if (!allowed) {
      res.setHeader('Retry-After', '1')
      return res.status(429).json({ error: { code: 'RATE_LIMIT', message: '请求太频繁，请稍后重试', retryable: true } })
    }
    next()
  }

  /** 本地兜底令牌桶（仅在 Redis 异常时使用） */
  private localConsume(ip: string): boolean {
    const now = Date.now()
    let bucket = this.local.get(ip)
    if (!bucket) {
      bucket = { tokens: CAPACITY, lastRefill: now }
      this.local.set(ip, bucket)
    }
    const elapsed = (now - bucket.lastRefill) / 1000
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_RATE)
    bucket.lastRefill = now
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }
    logger.warn('rate limiter fallback (redis down)', { ip })
    return false
  }
}

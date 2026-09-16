// server/src/redis/redis.service.ts
// Redis 服务：缓存、会话存储、分布式限流
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'
import { config } from '../config/index.js'
import { cache } from '../services/cache.js'
import { logger } from '../utils/logger.js'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis

  async onModuleInit() {
    this.client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000)
        return delay
      },
      lazyConnect: false,
    })

    this.client.on('connect', () => {
      logger.info('Redis connected')
      // 把 Redis 接入 AI 响应两级缓存（Redis 抖动时缓存模块自动降级内存）
      cache.setRedis(this.client)
    })
    this.client.on('error', (err) => logger.error('Redis error', { error: err.message }))
  }

  async onModuleDestroy() {
    await this.client.quit()
  }

  getClient(): Redis {
    return this.client
  }

  // ── 便捷方法 ──────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key)
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    if (ttlMs) {
      await this.client.set(key, value, 'PX', ttlMs)
    } else {
      await this.client.set(key, value)
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key)
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1
  }

  // JSON 序列化/反序列化
  async getJson<T = any>(key: string): Promise<T | null> {
    const raw = await this.client.get(key)
    return raw ? JSON.parse(raw) : null
  }

  async setJson<T = any>(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttlMs)
  }

  // 令牌桶限流（分布式）
  async consumeToken(bucketKey: string, capacity: number, refillRate: number): Promise<boolean> {
    const now = Date.now()
    const luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])

      local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(bucket[1]) or capacity
      local lastRefill = tonumber(bucket[2]) or now

      local elapsed = (now - lastRefill) / 1000
      tokens = math.min(capacity, tokens + elapsed * refillRate)

      if tokens >= 1 then
        tokens = tokens - 1
        redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
        redis.call('EXPIRE', key, 60)
        return 1
      end
      return 0
    `

    const result = await this.client.eval(luaScript, 1, bucketKey, String(capacity), String(refillRate), String(now))
    return result === 1
  }
}

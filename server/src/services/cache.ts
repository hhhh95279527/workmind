// server/src/services/cache.ts
// AI 响应精确缓存：L1 进程内存（60s，抗热点）+ L2 Redis（30min，跨实例共享）。
//
// 安全要点：key 必须带租户命名空间。旧实现仅 hash(system+message)，
// 不同租户问同样的问题会互相命中，构成跨租户数据泄露。
import crypto from 'crypto'
import type { Redis } from 'ioredis'
import { config } from '../config/index.js'

interface CacheEntry { content: string; tokens: number; ts: number }
interface CacheStats { hits: number; misses: number; savedTokens: number; redisUp: boolean }

const L1_TTL = 60_000          // L1 仅抗短时间热点
const L1_MAX = 200
const REDIS_PREFIX = 'wm:aicache:'

class AiResponseCache {
  private l1 = new Map<string, { entry: CacheEntry; exp: number }>()
  private redis: Redis | null = null
  private stats: CacheStats = { hits: 0, misses: 0, savedTokens: 0, redisUp: false }

  /** 由 RedisModule 初始化时注入；null 时自动降级为纯内存缓存 */
  setRedis(client: Redis | null) {
    this.redis = client
    this.stats.redisUp = !!client
  }

  private digest(systemPrompt: string, message: string, namespace: string) {
    return crypto
      .createHash('sha256')
      .update(`${namespace}||${systemPrompt || ''}||${message}`)
      .digest('hex')
  }

  async get(systemPrompt: string, message: string, namespace = 'default'): Promise<CacheEntry | null> {
    const key = this.digest(systemPrompt, message, namespace)

    // L1
    const l1Hit = this.l1.get(key)
    if (l1Hit && l1Hit.exp > Date.now()) {
      this.stats.hits++
      this.stats.savedTokens += l1Hit.entry.tokens
      return l1Hit.entry
    }
    if (l1Hit) this.l1.delete(key)

    // L2
    if (this.redis) {
      try {
        const raw = await this.redis.get(REDIS_PREFIX + key)
        if (raw) {
          const entry: CacheEntry = JSON.parse(raw)
          this.putL1(key, entry)
          this.stats.hits++
          this.stats.savedTokens += entry.tokens || 0
          return entry
        }
      } catch {
        // Redis 抖动：降级继续走模型，不阻断业务
        this.stats.redisUp = false
      }
    }

    this.stats.misses++
    return null
  }

  async set(systemPrompt: string, message: string, value: { content: string; tokens?: number }, namespace = 'default') {
    const key = this.digest(systemPrompt, message, namespace)
    const entry: CacheEntry = { content: value.content, tokens: value.tokens || 0, ts: Date.now() }
    this.putL1(key, entry)

    if (this.redis) {
      try {
        await this.redis.set(REDIS_PREFIX + key, JSON.stringify(entry), 'PX', config.cache.ttl)
      } catch {
        this.stats.redisUp = false
      }
    }
  }

  private putL1(key: string, entry: CacheEntry) {
    if (this.l1.size >= L1_MAX) {
      // 淘汰最老的 20 条（Map 保持插入序）
      let i = 0
      for (const k of this.l1.keys()) {
        if (i++ >= 20) break
        this.l1.delete(k)
      }
    }
    this.l1.set(key, { entry, exp: Date.now() + L1_TTL })
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses
    return {
      l1Size: this.l1.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      savedTokens: this.stats.savedTokens,
      hitRate: total === 0 ? '0%' : `${(this.stats.hits / total * 100).toFixed(1)}%`,
      redisUp: this.stats.redisUp,
    }
  }
}

// 全局单例（函数式旧模块与 Nest 服务共用）
export const cache = new AiResponseCache()

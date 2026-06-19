// server/src/routes/monitor.js
// 用量看板路由：API 调用统计、Token 消耗、缓存命中率、成本
import express from 'express'
import { cache } from '../services/cache.js'
import { logger } from '../utils/logger.js'

export const monitorRouter = express.Router()

// 全局统计数据（生产用 Redis/TimeSeries 数据库）
const startTime = Date.now()
const stats = {
  calls:        [],    // [{ time, feature, inputT, outputT, costUSD, fromCache, latencyMs }]
  dailyBudget:  50,    // ¥50 日预算
}

// 给其他服务调用，记录一次 API 调用
export function recordApiCall({ feature = 'chat', inputTokens = 0, outputTokens = 0, latencyMs = 0, fromCache = false } = {}) {
  const costUSD = (inputTokens / 1e6 * 0.27) + (outputTokens / 1e6 * 1.10)
  stats.calls.push({
    time:      new Date().toISOString(),
    feature,
    inputT:    inputTokens,
    outputT:   outputTokens,
    costUSD,
    costCNY:   costUSD * 7.2,
    latencyMs,
    fromCache,
  })
  // 只保留最近 500 条
  if (stats.calls.length > 500) stats.calls.shift()
}

// ── GET /api/monitor/stats ─────────────────────────────────────
// 返回完整统计数据（前端定时轮询）
monitorRouter.get('/stats', (req, res) => {
  const now = Date.now()

  // 今日数据
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayCalls = stats.calls.filter(c => new Date(c.time) >= todayStart)

  // 近7天数据（按天汇总）
  const last7Days = getLast7DaysStats(stats.calls)

  // 按功能模块分布
  const byFeature = getByFeature(todayCalls)

  // 最近50条调用记录
  const recentCalls = [...stats.calls].reverse().slice(0, 50)

  // P50、P90、P99 延迟
  const latencies = todayCalls.filter(c => !c.fromCache && c.latencyMs > 0).map(c => c.latencyMs)

  const todayTotalCNY = todayCalls.reduce((s, c) => s + (c.fromCache ? 0 : c.costCNY), 0)
  const cacheHits     = todayCalls.filter(c => c.fromCache).length
  const totalCalls    = todayCalls.length

  res.json({
    overview: {
      totalCallsToday:  totalCalls,
      apiCallsToday:    totalCalls - cacheHits,
      cacheHitsToday:   cacheHits,
      cacheHitRate:     totalCalls ? `${(cacheHits / totalCalls * 100).toFixed(1)}%` : '0%',
      tokenInputToday:  todayCalls.reduce((s, c) => s + c.inputT, 0),
      tokenOutputToday: todayCalls.reduce((s, c) => s + c.outputT, 0),
      costCNYToday:     parseFloat(todayTotalCNY.toFixed(4)),
      dailyBudget:      stats.dailyBudget,
      budgetUsedPct:    Math.min(100, parseFloat((todayTotalCNY / stats.dailyBudget * 100).toFixed(1))),
      uptimeSeconds:    Math.floor((now - startTime) / 1000),
    },
    latency: {
      p50:  percentile(latencies, 50),
      p90:  percentile(latencies, 90),
      p99:  percentile(latencies, 99),
      avg:  latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    },
    byFeature,
    last7Days,
    recentCalls: recentCalls.map(c => ({
      time:       c.time,
      feature:    c.feature,
      inputT:     c.inputT,
      outputT:    c.outputT,
      costCNY:    parseFloat(c.costCNY.toFixed(5)),
      latencyMs:  c.latencyMs,
      fromCache:  c.fromCache,
    })),
    cacheStats:  cache.getStats(),
  })
})

// ── PUT /api/monitor/budget ────────────────────────────────────
monitorRouter.put('/budget', (req, res) => {
  const { dailyBudget } = req.body
  if (typeof dailyBudget !== 'number' || dailyBudget <= 0) {
    return res.status(400).json({ error: { message: '预算必须是正数' } })
  }
  stats.dailyBudget = dailyBudget
  res.json({ success: true, dailyBudget })
})

// ── 辅助函数 ──────────────────────────────────────────────────
function percentile(arr, p) {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx    = Math.ceil(sorted.length * p / 100) - 1
  return sorted[Math.max(0, idx)]
}

function getLast7DaysStats(calls) {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(0, 0, 0, 0)
    const nextDay = new Date(d)
    nextDay.setDate(nextDay.getDate() + 1)

    const dayCalls = calls.filter(c => {
      const t = new Date(c.time)
      return t >= d && t < nextDay
    })

    days.push({
      date:       d.toISOString().slice(0, 10),
      label:      `${d.getMonth() + 1}/${d.getDate()}`,
      totalCalls: dayCalls.length,
      apiCalls:   dayCalls.filter(c => !c.fromCache).length,
      inputT:     dayCalls.reduce((s, c) => s + c.inputT, 0),
      outputT:    dayCalls.reduce((s, c) => s + c.outputT, 0),
      costCNY:    parseFloat(dayCalls.reduce((s, c) => s + (c.fromCache ? 0 : c.costCNY), 0).toFixed(4)),
    })
  }
  return days
}

function getByFeature(calls) {
  const features = {}
  calls.forEach(c => {
    if (!features[c.feature]) features[c.feature] = { calls: 0, costCNY: 0, tokens: 0 }
    features[c.feature].calls++
    features[c.feature].costCNY  += c.fromCache ? 0 : c.costCNY
    features[c.feature].tokens   += c.inputT + c.outputT
  })

  const featureNames = { chat: '对话助手', knowledge: 'RAG 知识库', agent: '任务 Agent', workflow: '内容工作流', erp: 'ERP 审批', prompt: 'Prompt 调试' }

  return Object.entries(features).map(([key, v]) => ({
    feature: key,
    label:   featureNames[key] || key,
    calls:   v.calls,
    costCNY: parseFloat(v.costCNY.toFixed(4)),
    tokens:  v.tokens,
  })).sort((a, b) => b.calls - a.calls)
}

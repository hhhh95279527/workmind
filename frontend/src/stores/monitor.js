// frontend/src/stores/monitor.js
// 成本监控 store：本地估算 API 调用成本，超预算预警
import { create } from 'zustand'

export const useMonitorStore = create((set, get) => ({
  dailyBudget: 50,     // ¥50 日预算
  todaySpend: 0,       // 今日消费（¥）
  totalCalls: 0,       // 总调用次数
  cacheHits: 0,        // 缓存命中次数

  // 超过日预算 80% 时触发预警
  budgetWarning: () => {
    const { todaySpend, dailyBudget } = get()
    const ratio = todaySpend / dailyBudget
    if (ratio >= 0.8) {
      return `¥${todaySpend.toFixed(2)} / ¥${dailyBudget}`
    }
    return null
  },

  // 记录一次 API 调用
  recordCall: ({ inputTokens = 0, outputTokens = 0, fromCache = false, feature = 'chat' } = {}) => {
    set((s) => {
      const totalCalls = s.totalCalls + 1
      if (fromCache) {
        return { totalCalls, cacheHits: s.cacheHits + 1 }
      }
      // 按 DeepSeek 价格估算：输入 $0.27/M，输出 $1.10/M，汇率 7.2
      const usd = (inputTokens / 1e6 * 0.27) + (outputTokens / 1e6 * 1.10)
      return { totalCalls, todaySpend: s.todaySpend + usd * 7.2 }
    })
  },
}))

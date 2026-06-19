// frontend/src/stores/monitor.js
// 成本监控 store（第七章完整实现，这里先放基础结构）
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useMonitorStore = defineStore('monitor', () => {
  const dailyBudget = ref(50)     // ¥50 日预算
  const todaySpend  = ref(0)      // 今日消费（¥）
  const totalCalls  = ref(0)      // 总调用次数
  const cacheHits   = ref(0)      // 缓存命中次数

  // 超过日预算 80% 时触发预警
  const budgetWarning = computed(() => {
    const ratio = todaySpend.value / dailyBudget.value
    if (ratio >= 0.8) {
      return `¥${todaySpend.value.toFixed(2)} / ¥${dailyBudget.value}`
    }
    return null
  })

  // 记录一次 API 调用
  function recordCall({ inputTokens = 0, outputTokens = 0, fromCache = false, feature = 'chat' }) {
    totalCalls.value++
    if (fromCache) {
      cacheHits.value++
      return
    }
    // 按 DeepSeek 价格估算：输入 $0.27/M，输出 $1.10/M，汇率 7.2
    const usd = (inputTokens / 1e6 * 0.27) + (outputTokens / 1e6 * 1.10)
    todaySpend.value += usd * 7.2
  }

  return { dailyBudget, todaySpend, totalCalls, cacheHits, budgetWarning, recordCall }
})

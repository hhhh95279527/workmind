// frontend/src/utils/analytics.js
// 前端埋点工具：页面 PV、功能点击、性能指标、异常上报
import { useAuthStore } from '@/stores/auth.js'

// 埋点上报端点（轻量方案：后端收集接口）
const TRACK_URL = '/api/analytics/track'

// ── 核心上报方法 ──────────────────────────────────────────────
function track(eventType, data = {}) {
  const { user } = useAuthStore.getState()
  const payload = {
    eventType,
    userId: user?.id || null,
    timestamp: Date.now(),
    url: window.location.href,
    pathname: window.location.pathname,
    userAgent: navigator.userAgent,
    ...data,
  }

  // 使用 sendBeacon 保证页面卸载时也能发送
  if (navigator.sendBeacon) {
    navigator.sendBeacon(TRACK_URL, JSON.stringify(payload))
  } else {
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {})
  }
}

// ── 便捷方法 ──────────────────────────────────────────────────

// 页面 PV
export function trackPageView(pageName) {
  track('page_view', { pageName })
}

// 功能点击
export function trackClick(feature, detail = {}) {
  track('click', { feature, ...detail })
}

// 性能指标（Web Vitals）
export function trackPerformance(metric) {
  track('performance', {
    name: metric.name,    // FCP, LCP, CLS, FID, INP
    value: metric.value,
    rating: metric.rating, // good, needs-improvement, poor
  })
}

// 异常上报
export function trackError(error, context = {}) {
  track('error', {
    message: error.message,
    stack: error.stack?.slice(0, 500),
    ...context,
  })
}

// API 错误上报
export function trackApiError(url, status, message) {
  track('api_error', { url, status, message })
}

// SSE 断连上报
export function trackSseDisconnect(feature, reason) {
  track('sse_disconnect', { feature, reason })
}

// ── 路由监听（自动 PV）─────────────────────────────────────────
export function setupRouteTracking() {
  let lastPath = ''
  const observer = new MutationObserver(() => {
    const currentPath = window.location.pathname
    if (currentPath !== lastPath) {
      lastPath = currentPath
      trackPageView(currentPath)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}

export default { trackPageView, trackClick, trackPerformance, trackError, trackApiError, trackSseDisconnect, setupRouteTracking }

// frontend/src/utils/http.js
// 统一封装 axios：请求拦截、响应拦截、错误处理
import axios from 'axios'
import { useAppStore } from '@/stores/app.js'

// 创建 axios 实例
const http = axios.create({
  baseURL: '/api',           // 配合 vite proxy，开发时自动转发到 :3000
  timeout: 30000,            // 普通请求 30s 超时
})

// ── 请求拦截器 ─────────────────────────────────────────────────
http.interceptors.request.use(
  (config) => {
    // 可以在这里加 token：config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error)
)

// ── 响应拦截器 ─────────────────────────────────────────────────
http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const appStore = useAppStore()

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      appStore.toast.error('请求超时，请稍后重试')
    } else if (error.response) {
      const status = error.response.status
      const msg = error.response.data?.error || '请求失败'

      if (status === 429) {
        appStore.toast.warning('请求太频繁，请稍后再试')
      } else if (status >= 500) {
        appStore.toast.error('服务器异常，请稍后重试')
      } else {
        appStore.toast.error(msg)
      }
    } else {
      appStore.toast.error('网络异常，请检查连接')
    }

    return Promise.reject(error)
  }
)

// ── SSE 流式请求工具 ───────────────────────────────────────────
// 浏览器原生 fetch + ReadableStream，不走 axios
// onToken：每收到一个 token 的回调
// onEvent：收到特定事件（sources、tool_start 等）的回调
// onDone：流结束时的回调
// onError：出错时的回调
export async function fetchStream(url, body, { onToken, onEvent, onDone, onError } = {}) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || `HTTP ${response.status}`)
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE 格式：event 和 data 之间用 \n\n 分隔
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (!part.trim()) continue

        const lines = part.split('\n')
        let event = 'message'
        let dataStr = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.slice(7).trim()
          if (line.startsWith('data: '))  dataStr = line.slice(6)
        }

        if (!dataStr) continue

        let data
        try { data = JSON.parse(dataStr) } catch { continue }

        // 分发事件
        if (event === 'token' && onToken) {
          onToken(data.token || '')
        } else if (event === 'done' && onDone) {
          onDone(data)
        } else if (event === 'error') {
          onError?.(new Error(data.message || '流式请求出错'))
          return
        } else if (onEvent) {
          onEvent(event, data)
        }
      }
    }
  } catch (err) {
    onError?.(err)
  }
}

export default http

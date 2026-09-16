// frontend/src/stores/app.js
// 全局应用状态：主题 + Toast（基于 antd message）
import { create } from 'zustand'
import { message as staticMessage } from 'antd'

// antd <App> 组件挂载后注入的 message 实例（可消费动态主题上下文）
let messageApi = null
export function setMessageApi(api) {
  messageApi = api
}
const msg = () => messageApi || staticMessage

export const useAppStore = create((set) => ({
  // ── 主题 ────────────────────────────────────────────────────
  theme: localStorage.getItem('theme') || 'light',

  toggleTheme: () => set((s) => {
    const theme = s.theme === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', theme)
    return { theme }
  }),

  // ── 全局 Toast 消息（优先使用上下文 message 实例）──────────
  toast: {
    success: (m) => msg().success(m),
    error:   (m) => msg().error(m),
    warning: (m) => msg().warning(m),
    info:    (m) => msg().info(m),
  },
}))

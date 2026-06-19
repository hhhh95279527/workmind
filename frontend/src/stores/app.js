// frontend/src/stores/app.js
// 全局应用状态：主题、全局 loading、toast 提示
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAppStore = defineStore('app', () => {
  // ── 主题 ────────────────────────────────────────────────────
  const theme = ref(localStorage.getItem('theme') || 'light')

  function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
    localStorage.setItem('theme', theme.value)
  }

  // ── 全局 Toast 消息 ──────────────────────────────────────────
  const toasts = ref([])
  let toastId = 0

  function showToast(message, type = 'info', duration = 3000) {
    const id = ++toastId
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== id)
    }, duration)
  }

  const toast = {
    success: (msg) => showToast(msg, 'success'),
    error:   (msg) => showToast(msg, 'error'),
    warning: (msg) => showToast(msg, 'warning'),
    info:    (msg) => showToast(msg, 'info'),
  }

  return {
    theme,
    toggleTheme,
    toasts,
    toast,
  }
})

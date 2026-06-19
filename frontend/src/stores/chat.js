// frontend/src/stores/chat.js
// 对话模块全局状态：会话列表、当前会话消息、角色、用户画像
import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { fetchStream } from '@/utils/http.js'
import http from '@/utils/http.js'
import { useAppStore } from './app.js'
import { useMonitorStore } from './monitor.js'

export const useChatStore = defineStore('chat', () => {
  const appStore     = useAppStore()
  const monitorStore = useMonitorStore()

  // ── 会话列表 ──────────────────────────────────────────────────
  // 每个会话：{ id, title, messages: [], createdAt }
  const sessions    = ref([])
  const currentId   = ref(null)

  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentId.value) || null
  )

  const messages = computed(() =>
    currentSession.value?.messages || []
  )

  // ── 初始化：创建第一个会话 ────────────────────────────────────
  function init() {
    if (sessions.value.length === 0) {
      newSession()
    }
  }

  function newSession() {
    const id = `session_${Date.now()}`
    sessions.value.unshift({
      id,
      title: '新对话',
      messages: [],
      createdAt: new Date().toISOString(),
    })
    currentId.value = id
    return id
  }

  function switchSession(id) {
    currentId.value = id
  }

  function deleteSession(id) {
    const idx = sessions.value.findIndex(s => s.id === id)
    if (idx === -1) return
    sessions.value.splice(idx, 1)

    // 如果删的是当前会话，切到第一个
    if (currentId.value === id) {
      currentId.value = sessions.value[0]?.id || null
      if (!currentId.value) newSession()
    }

    // 同步删除服务端会话历史
    http.delete(`/chat/sessions/${id}`).catch(() => {})
  }

  // 根据第一条消息自动生成会话标题
  function updateTitle(sessionId, firstMessage) {
    const s = sessions.value.find(s => s.id === sessionId)
    if (s && s.title === '新对话') {
      s.title = firstMessage.slice(0, 20) + (firstMessage.length > 20 ? '...' : '')
    }
  }

  // ── 角色 ──────────────────────────────────────────────────────
  const selectedRole = ref('default')
  const roles = ref([])

  async function loadRoles() {
    try {
      const data = await http.get('/chat/roles')
      roles.value = data.roles
    } catch {}
  }

  // ── 用户画像 ──────────────────────────────────────────────────
  const profile = ref({})
  const userId  = ref('user-demo')

  async function loadProfile() {
    try {
      const data = await http.get(`/chat/profile/${userId.value}`)
      profile.value = data
    } catch {}
  }

  // ── 发送消息（核心）──────────────────────────────────────────
  const loading = ref(false)

  async function sendMessage(text) {
    if (!text.trim() || loading.value) return
    if (!currentId.value) newSession()

    const session = currentSession.value
    loading.value = true

    // 添加用户消息
    const userMsg = {
      id:      `msg_${Date.now()}`,
      role:    'user',
      content: text,
      time:    new Date().toISOString(),
    }
    session.messages.push(userMsg)
    updateTitle(currentId.value, text)

    // 添加 AI 消息占位（流式填充）
    // 必须用 reactive() 包裹，使本地引用也是响应式代理
    // 否则 push 后 Vue 给数组元素套的 Proxy 与本地变量是两个对象，onToken 里的赋值不触发更新
    const aiMsg = reactive({
      id:         `msg_${Date.now() + 1}`,
      role:       'assistant',
      content:    '',
      fromCache:  false,
      streaming:  true,
      time:       new Date().toISOString(),
    })
    session.messages.push(aiMsg)

    await fetchStream(
      '/api/chat/stream',
      {
        message:   text,
        sessionId: currentId.value,
        role:      selectedRole.value,
        userId:    userId.value,
      },
      {
        onToken: (token) => {
          aiMsg.content += token
        },
        onEvent: (event, data) => {
          if (event === 'cache_hit') aiMsg.fromCache = true
          if (event === 'start')     aiMsg.streaming = true
        },
        onDone: (data) => {
          aiMsg.streaming = false
          // 记录用量
          if (!data.fromCache) {
            monitorStore.recordCall({
              inputTokens:  data.inputTokens || 0,
              outputTokens: data.outputTokens || 0,
              fromCache:    false,
              feature:      'chat',
            })
          } else {
            monitorStore.recordCall({ fromCache: true, feature: 'chat' })
          }
          // 刷新画像（后台可能更新了）
          loadProfile()
        },
        onError: (err) => {
          aiMsg.streaming = false
          aiMsg.content   = aiMsg.content || '抱歉，出现了一些问题，请重试。'
          appStore.toast.error(err.message || '发送失败')
        },
      }
    )

    loading.value = false
  }

  // 重新生成最后一条 AI 回复
  async function regenerate() {
    const msgs = currentSession.value?.messages || []
    // 找最后一条用户消息
    const lastUser = [...msgs].reverse().find(m => m.role === 'user')
    if (!lastUser) return

    // 移除最后一条 AI 消息
    const lastAiIdx = msgs.length - 1
    if (msgs[lastAiIdx]?.role === 'assistant') {
      msgs.splice(lastAiIdx, 1)
    }

    await sendMessage(lastUser.content)
  }

  // 复制消息内容
  async function copyMessage(content) {
    await navigator.clipboard.writeText(content)
    appStore.toast.success('已复制到剪贴板')
  }

  return {
    sessions, currentId, currentSession, messages,
    selectedRole, roles,
    profile, userId,
    loading,
    init, newSession, switchSession, deleteSession,
    loadRoles, loadProfile,
    sendMessage, regenerate, copyMessage,
  }
})

// frontend/src/stores/chat.js
// 对话模块状态：服务端会话为准 + 本地草稿会话（首条消息发出后由后端分配真实 id）
import { create } from 'zustand'
import { fetchStream, default as http } from '@/utils/http.js'
import { useAppStore } from './app.js'
import { useMonitorStore } from './monitor.js'

// 草稿会话固定 id：尚未与后端建立会话时使用
const DRAFT = 'draft'

// 根据第一条消息自动生成会话标题
const autoTitle = (firstMessage) =>
  firstMessage.slice(0, 20) + (firstMessage.length > 20 ? '...' : '')

const emptyDraft = () => ({
  id: DRAFT,
  title: '新对话',
  messages: [],
  messageCount: 0,
  loaded: true,
  createdAt: new Date().toISOString(),
  isDraft: true,
})

export const useChatStore = create((set, get) => {
  // 局部更新某个会话中指定消息的字段
  const patchMessage = (sessionId, msgId, patchFn) => set((s) => ({
    sessions: s.sessions.map((sess) => sess.id !== sessionId ? sess : ({
      ...sess,
      messages: sess.messages.map((m) => m.id === msgId ? { ...m, ...patchFn(m) } : m),
    })),
  }))

  // 保证草稿会话存在且置顶
  const ensureDraft = (sessions) => {
    const rest = sessions.filter((x) => x.id !== DRAFT)
    const draft = sessions.find((x) => x.id === DRAFT) || emptyDraft()
    return [draft, ...rest]
  }

  return {
    // ── 会话列表 ──────────────────────────────────────────────────
    sessions: [],
    currentId: DRAFT,

    // ── 角色 ──────────────────────────────────────────────────────
    selectedRole: 'default',
    roles: [],

    // ── 用户画像 ──────────────────────────────────────────────────
    profile: {},

    setProfile: (profile) => set({ profile }),
    setSelectedRole: (role) => set({ selectedRole: role }),

    // ── 初始化：拉取服务端会话 ────────────────────────────────────
    init: async () => {
      await get().loadSessions()
    },

    loadSessions: async () => {
      try {
        const data = await http.get('/chat/sessions')
        set((s) => {
          // 保留本地已加载的消息与草稿内容
          const prev = new Map(s.sessions.map((x) => [x.id, x]))
          const merged = (data.sessions || []).map((r) => {
            const old = prev.get(r.id)
            return {
              id: r.id,
              title: r.title,
              messages: old?.loaded ? old.messages : [],
              messageCount: r.messageCount ?? 0,
              loaded: !!old?.loaded,
              createdAt: r.createdAt,
            }
          })
          return { sessions: ensureDraft(merged) }
        })
      } catch { /* 401 等由拦截器处理 */ }
    },

    newSession: () => set((s) => ({
      currentId: DRAFT,
      sessions: ensureDraft(s.sessions.map((x) => x.id === DRAFT ? emptyDraft() : x)),
    })),

    switchSession: async (id) => {
      if (id === DRAFT) {
        set({ currentId: DRAFT })
        return
      }
      set({ currentId: id })

      // 懒加载历史消息
      const sess = get().sessions.find((x) => x.id === id)
      if (sess && !sess.loaded) {
        try {
          const detail = await http.get(`/chat/sessions/${id}`)
          set((s) => ({
            sessions: s.sessions.map((x) => x.id !== id ? x : ({
              ...x,
              title: detail.title,
              messages: detail.messages,
              messageCount: detail.messages.length,
              loaded: true,
            })),
          }))
        } catch { /* toast 由拦截器处理 */ }
      }
    },

    deleteSession: async (id) => {
      const { sessions, currentId } = get()

      if (id === DRAFT) {
        // 草稿直接重置
        set((s) => ({
          currentId: DRAFT,
          sessions: s.sessions.map((x) => x.id === DRAFT ? emptyDraft() : x),
        }))
        return
      }

      // 乐观删除：先更新 UI，再请求服务端
      const rest = sessions.filter((s) => s.id !== id)
      set({
        sessions: id === currentId ? ensureDraft(rest) : rest,
        currentId: id === currentId ? DRAFT : currentId,
      })
      try {
        await http.delete(`/chat/sessions/${id}`)
      } catch {
        // 回滚由下次 loadSessions 自然纠正
        get().loadSessions()
      }
    },

    loadRoles: async () => {
      try {
        const data = await http.get('/chat/roles')
        set({ roles: data.roles })
      } catch {}
    },

    loadProfile: async () => {
      try {
        const data = await http.get('/chat/profile')
        set({ profile: data || {} })
      } catch {}
    },

    // ── 发送消息（核心）──────────────────────────────────────────
    loading: false,
    stopLoading: () => set({ loading: false }),

    sendMessage: async (text) => {
      if (!text.trim() || get().loading) return
      const isDraft = get().currentId === DRAFT
      let sessionId = get().currentId

      set({ loading: true })

      const now = new Date().toISOString()
      const userMsg = { id: `msg_${Date.now()}`, role: 'user', content: text, time: now }
      const aiMsg = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant',
        content: '',
        fromCache: false,
        streaming: true,
        time: now,
      }

      // 追加本地消息
      set((s) => ({
        sessions: s.sessions.map((sess) => sess.id !== sessionId ? sess : ({
          ...sess,
          title: sess.id === DRAFT ? autoTitle(text) : sess.title,
          messageCount: sess.messageCount + 2,
          messages: [...sess.messages, userMsg, aiMsg],
        })),
      }))

      // 草稿转正：用后端返回的真实 sessionId 替换本地 id
      const promote = (realId) => {
        sessionId = realId
        set((s) => ({
          currentId: realId,
          sessions: s.sessions.map((sess) => sess.id !== DRAFT ? sess : ({
            ...sess,
            id: realId,
            isDraft: false,
            loaded: true,
          })),
        }))
      }

      const { selectedRole } = get()

      await fetchStream(
        '/api/chat/stream',
        // 草稿态不传 sessionId，由后端创建
        { message: text, role: selectedRole, ...(isDraft ? {} : { sessionId }) },
        {
          onToken: (token) => {
            patchMessage(sessionId, aiMsg.id, (m) => ({ content: m.content + token }))
          },
          onEvent: (event, data) => {
            if (event === 'start' && isDraft && data.sessionId) promote(data.sessionId)
            if (event === 'cache_hit') {
              patchMessage(sessionId, aiMsg.id, () => ({ fromCache: true }))
            }
          },
          onDone: (data) => {
            patchMessage(sessionId, aiMsg.id, () => ({ streaming: false }))
            if (!data.fromCache) {
              useMonitorStore.getState().recordCall({
                inputTokens: data.inputTokens || 0,
                outputTokens: data.outputTokens || 0,
                fromCache: false,
                feature: 'chat',
              })
            } else {
              useMonitorStore.getState().recordCall({ fromCache: true, feature: 'chat' })
            }
            get().loadProfile()
            // 若本次新建了会话，刷新列表顺序
            if (isDraft) get().loadSessions()
          },
          onError: (err) => {
            patchMessage(sessionId, aiMsg.id, (m) => ({
              streaming: false,
              content: m.content || '抱歉，出现了一些问题，请重试。',
            }))
            useAppStore.getState().toast.error(err.message || '发送失败')
          },
        }
      )

      set({ loading: false })
    },

    // 重新生成最后一条 AI 回复
    regenerate: async () => {
      const { sessions, currentId } = get()
      const session = sessions.find((s) => s.id === currentId)
      const msgs = session?.messages || []
      const lastUser = [...msgs].reverse().find((m) => m.role === 'user')
      if (!lastUser) return

      if (msgs[msgs.length - 1]?.role === 'assistant') {
        set((s) => ({
          sessions: s.sessions.map((sess) => sess.id !== currentId ? sess : ({
            ...sess,
            messages: sess.messages.slice(0, -1),
          })),
        }))
      }

      await get().sendMessage(lastUser.content)
    },

    copyMessage: async (content) => {
      await navigator.clipboard.writeText(content)
      useAppStore.getState().toast.success('已复制到剪贴板')
    },
  }
})

// ── 常用选择器 ──────────────────────────────────────────────────
const EMPTY_MESSAGES = []
export const selectCurrentSession = (s) =>
  s.sessions.find((x) => x.id === s.currentId) || null
export const selectMessages = (s) =>
  selectCurrentSession(s)?.messages || EMPTY_MESSAGES

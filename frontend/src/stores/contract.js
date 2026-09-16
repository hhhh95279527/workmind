// frontend/src/stores/contract.js
// 合同风险审查模块状态：合同列表/上传（文件或粘贴文本）/详情/发起审查(SSE)/人工终审/意见书
import { create } from 'zustand'
import http, { fetchStream } from '@/utils/http.js'
import { useAppStore } from './app.js'

// 合同状态 → antd Tag 颜色与中文
export const CONTRACT_STATUS_META = {
  UPLOADED:        { color: 'default',      text: '待解析' },
  PARSING:         { color: 'processing',   text: '解析中' },
  READY:           { color: 'blue',         text: '待审查' },
  REVIEWING:       { color: 'processing',   text: '审查中' },
  WAITING_REVIEW:  { color: 'orange',       text: '待人工终审' },
  COMPLETED:       { color: 'success',      text: '审查完成' },
  FAILED:          { color: 'error',        text: '解析失败' },
}

export const RISK_STATUS_META = {
  PENDING:  { text: '待确认' },
  ACCEPTED: { text: '已采纳' },
  IGNORED:  { text: '已忽略' },
  EDITED:   { text: '已修改' },
}

export const SEVERITY_COLOR = { HIGH: '#dc2626', MED: '#d97706', LOW: '#2563eb' }
export const SEVERITY_TEXT = { HIGH: '高风险', MED: '中风险', LOW: '低风险' }

export const useContractStore = create((set, get) => ({
  contracts: [],
  loadingList: false,
  detail: null,          // { contract, clauses, review }
  loadingDetail: false,

  // ── 合同列表 ────────────────────────────────────────────────
  loadContracts: async (status = '') => {
    set({ loadingList: true })
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}` : ''
      const data = await http.get(`/contracts${qs}`)
      set({ contracts: data.contracts })
    } finally {
      set({ loadingList: false })
    }
  },

  // ── 上传合同文件（XHR 监听进度；服务端异步入队解析）────────────
  uploadFile: async (file, title) => {
    const formData = new FormData()
    formData.append('file', file)
    if (title) formData.append('title', title)

    const result = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', '/api/contracts/upload')
      xhr.setRequestHeader('Authorization', `Bearer ${useAuthToken()}`)
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
        else reject(new Error(JSON.parse(xhr.responseText)?.error?.message || '上传失败'))
      })
      xhr.addEventListener('error', () => reject(new Error('网络错误')))
      xhr.send(formData)
    })
    useAppStore.getState().toast.success(`「${result.contract.title}」已上传，正在解析条款…`)
    await get().loadContracts()
    return result.contract
  },

  // ── 粘贴文本建档 ────────────────────────────────────────────
  uploadText: async ({ title, content }) => {
    const result = await http.post('/contracts/text', { title, content })
    useAppStore.getState().toast.success('合同已创建，正在解析条款…')
    await get().loadContracts()
    return result.contract
  },

  deleteContract: async (id) => {
    await http.delete(`/contracts/${id}`)
    set((s) => ({ contracts: s.contracts.filter((c) => c.id !== id) }))
    useAppStore.getState().toast.success('合同已删除')
  },

  // ── 合同详情（条款 + 最近审查）──────────────────────────────
  loadDetail: async (id) => {
    set({ loadingDetail: true })
    try {
      const data = await http.get(`/contracts/${id}`)
      set({ detail: data })
      return data
    } finally {
      set({ loadingDetail: false })
    }
  },
  clearDetail: () => set({ detail: null }),

  // ── 发起审查（SSE：stage 进度 / risk 增量 / waiting 挂起）────
  reviewing: false,
  reviewStages: [],     // [{ stage, message }]
  liveRisks: [],        // Agent 轨实时增量风险（规则轨在结束后随详情返回）
  reviewStats: null,
  reviewError: '',

  resetReviewRun: () => set({ reviewStages: [], liveRisks: [], reviewStats: null, reviewError: '' }),

  startReview: async (contractId) => {
    set({ reviewing: true, reviewStages: [], liveRisks: [], reviewStats: null, reviewError: '' })
    let taskId = null
    await fetchStream(`/api/contracts/${contractId}/reviews`, {}, {
      onEvent: (event, data) => {
        if (event === 'task') taskId = data.taskId
        if (event === 'stage') {
          set((s) => ({ reviewStages: [...s.reviewStages, { stage: data.stage, message: data.message }] }))
        }
        if (event === 'risk') {
          set((s) => ({ liveRisks: [...s.liveRisks, data] }))
        }
        if (event === 'waiting') set({ reviewStats: data.stats })
      },
      onDone: () => {},
      onError: (err) => {
        set({ reviewError: err.message })
        useAppStore.getState().toast.error('审查失败：' + err.message)
      },
    })
    set({ reviewing: false })
    await get().loadDetail(contractId)
    return taskId
  },

  // ── 待人工终审列表 ─────────────────────────────────────────
  loadPending: async () => (await http.get('/reviews/pending')).tasks,

  // ── 提交终审决策（同步 JSON：服务端 resume LangGraph 后返回结果）─
  submitDecision: async (taskId, { finalDecision, actions }) =>
    http.post(`/reviews/${taskId}/decision`, { finalDecision, actions }),

  // ── 意见书 ─────────────────────────────────────────────────
  loadReport: async (taskId) => (await http.get(`/reviews/${taskId}/report`)).reportMd,
}))

// 组件外取 token（避免在 store 文件里直接耦合响应式 API）
import { useAuthStore } from './auth.js'
function useAuthToken() {
  return useAuthStore.getState().accessToken
}

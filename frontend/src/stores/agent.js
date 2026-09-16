// frontend/src/stores/agent.js
// Agent 模块状态：任务历史、工具调用步骤、执行状态
import { create } from 'zustand'
import { fetchStream } from '@/utils/http.js'
import http from '@/utils/http.js'
import { useAppStore } from './app.js'

let taskId = 0

export const useAgentStore = create((set, get) => {
  // 局部更新某个任务（patchFn 接收任务对象，返回部分更新）
  const patchTask = (id, patchFn) => set((s) => ({
    tasks: s.tasks.map((t) => t.id === id ? { ...t, ...patchFn(t) } : t),
  }))

  return {
    // ── 工具列表（从后端加载，默认值保证首屏可见；后端按环境能力动态下发）──
    toolList: [
      { name: 'read_doc',     label: '知识库检索', description: '从公司知识库检索内部文档' },
      { name: 'legal_search', label: '法规库检索', description: '检索民法典、劳动法等条文原文' },
      { name: 'calculate',    label: '数学计算', description: '金额、工期等精确计算' },
      { name: 'get_date',     label: '日期计算', description: '日期查询和工作日计算' },
    ],
    examples: [
      { title: '技术调研', task: '对比 Vue3 和 React 2024年的最新状态，分别查询它们的最新版本和主要特性，生成一份技术选型报告' },
      { title: '费用计算', task: '我出差3天，酒店每晚580元，机票往返1200元，餐费每天150元，帮我计算总报销金额，并查询一下公司差旅报销标准' },
      { title: '工期计算', task: '项目计划从2024年3月1日开始，需要45个工作日完成，帮我计算预计完成日期，并生成一份项目时间轴摘要' },
      { title: '知识查询', task: '从知识库查询公司的年假政策，计算一下我今年还剩多少年假（假设今年已用6天，总共15天），并发送结果通知给HR' },
    ],

    loadMeta: async () => {
      try {
        const [toolsRes, examplesRes] = await Promise.all([
          http.get('/agent/tools'),
          http.get('/agent/examples'),
        ])
        const patch = {}
        if (toolsRes.tools?.length)      patch.toolList = toolsRes.tools
        if (examplesRes.examples?.length) patch.examples = examplesRes.examples
        if (Object.keys(patch).length) set(patch)
      } catch {}
    },

    // ── 任务执行历史 ───────────────────────────────────────────
    // 每个任务是一条记录：{ id, task, steps, answer, status, startTime, duration }
    tasks: [],
    running: false,
    currentTaskId: null,

    // ── 执行任务 ───────────────────────────────────────────────
    runTask: async (taskText) => {
      if (!taskText.trim() || get().running) return

      const id = ++taskId
      const startTime = Date.now()

      // 创建任务记录（先加进列表，实时更新）
      const task = {
        id,
        task:      taskText,
        steps:     [],        // 工具调用步骤数组
        answer:    '',        // 最终回答
        status:    'running', // running | done | error
        startTime: new Date().toISOString(),
        duration:  0,
      }

      set((s) => ({ running: true, tasks: [task, ...s.tasks], currentTaskId: id }))

      await fetchStream(
        '/api/agent/run',
        { task: taskText },
        {
          onToken: (token) => {
            patchTask(id, (t) => ({ answer: t.answer + token }))
          },

          onEvent: (event, data) => {
            // 工具被调用：记录步骤
            if (event === 'tool_call') {
              patchTask(id, (t) => ({
                steps: [...t.steps, {
                  id:       t.steps.length + 1,
                  toolName: data.toolName,
                  label:    data.label,
                  args:     data.args,
                  result:   null,
                  status:   'running',   // running | done
                  startMs:  Date.now(),
                }],
              }))
            }

            // 工具执行完毕：更新最后一个 running 步骤
            if (event === 'tool_result') {
              patchTask(id, (t) => {
                const idx = [...t.steps].reverse().findIndex(
                  (s) => s.toolName === data.toolName && s.status === 'running'
                )
                if (idx === -1) return {}
                const realIdx = t.steps.length - 1 - idx
                return {
                  steps: t.steps.map((s, i) => i === realIdx ? ({
                    ...s,
                    result:     data.resultText,
                    status:     'done',
                    durationMs: Date.now() - s.startMs,
                  }) : s),
                }
              })
            }

            if (event === 'done') {
              patchTask(id, () => ({ status: 'done', duration: Date.now() - startTime }))
              set({ currentTaskId: null })
            }

            if (event === 'error') {
              patchTask(id, (t) => ({
                status: 'error',
                answer: t.answer || data.message || '任务执行失败',
              }))
              set({ currentTaskId: null })
              useAppStore.getState().toast.error(data.message || '执行出错')
            }
          },

          onDone: () => {
            patchTask(id, () => ({ status: 'done', duration: Date.now() - startTime }))
            set({ currentTaskId: null })
          },

          onError: (err) => {
            patchTask(id, (t) => ({
              status: 'error',
              answer: t.answer || '网络错误，请重试',
            }))
            set({ currentTaskId: null })
            useAppStore.getState().toast.error(err.message)
          },
        }
      )

      set({ running: false })
    },

    clearTasks: () => set({ tasks: [], currentTaskId: null }),
  }
})

// frontend/src/stores/prompt.js
// Prompt 调试模块状态：单次测试、A/B 对比、模板管理
import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { fetchStream } from '@/utils/http.js'
import http from '@/utils/http.js'
import { useAppStore } from './app.js'

export const usePromptStore = defineStore('prompt', () => {
  const appStore = useAppStore()

  // ── 单次测试状态 ────────────────────────────────────────────
  const testConfig = reactive({
    systemPrompt: '',
    userMessage:  '',
    temperature:  0.7,
    maxTokens:    1000,
  })

  const testResult = reactive({
    content:      '',
    streaming:    false,
    latencyMs:    0,
    inputTokens:  0,
    outputTokens: 0,
    totalTokens:  0,
    costCNY:      0,
  })

  const testing = ref(false)

  async function runTest() {
    if (!testConfig.userMessage.trim() || testing.value) return
    testing.value      = true
    testResult.content  = ''
    testResult.streaming = true

    const startMs = Date.now()

    await fetchStream(
      '/api/prompt/test/stream',
      {
        systemPrompt: testConfig.systemPrompt,
        userMessage:  testConfig.userMessage,
        temperature:  testConfig.temperature,
        maxTokens:    testConfig.maxTokens,
      },
      {
        onToken: (token) => { testResult.content += token },
        onEvent: (event, data) => {
          if (event === 'done') {
            testResult.streaming    = false
            testResult.latencyMs    = data.latencyMs || (Date.now() - startMs)
            testResult.inputTokens  = data.inputTokens  || 0
            testResult.outputTokens = data.outputTokens || 0
            testResult.totalTokens  = data.totalTokens  || 0
            testResult.costCNY      = data.costCNY || 0
          }
        },
        onDone: () => {
          testResult.streaming = false
          testing.value = false
        },
        onError: (err) => {
          testResult.streaming = false
          testing.value = false
          appStore.toast.error(err.message || '测试失败')
        },
      }
    )

    testing.value = false
  }

  // ── A/B 测试状态 ────────────────────────────────────────────
  const abConfig = reactive({
    question:      '',
    systemPromptA: '',
    systemPromptB: '',
    temperature:   0,
    maxTokens:     800,
  })

  const abResult = reactive({
    answerA:    '',
    answerB:    '',
    evaluation: null,  // { scoreA, scoreB, winner, reason }
  })

  const abTesting = ref(false)

  async function runAbTest() {
    if (!abConfig.question.trim() || abTesting.value) return
    abTesting.value = true
    abResult.answerA    = ''
    abResult.answerB    = ''
    abResult.evaluation = null

    try {
      const data = await http.post('/prompt/ab-test', {
        question:      abConfig.question,
        systemPromptA: abConfig.systemPromptA,
        systemPromptB: abConfig.systemPromptB,
        temperature:   abConfig.temperature,
        maxTokens:     abConfig.maxTokens,
      })
      abResult.answerA    = data.answerA
      abResult.answerB    = data.answerB
      abResult.evaluation = data.evaluation
    } catch (err) {
      appStore.toast.error('A/B 测试失败，请重试')
    } finally {
      abTesting.value = false
    }
  }

  // ── 模板管理 ────────────────────────────────────────────────
  const templates    = ref([])
  const editingId    = ref('')   // 正在编辑的模板 ID（空=新建）

  async function loadTemplates() {
    try {
      const data = await http.get('/prompt/templates')
      templates.value = data.templates
    } catch {}
  }

  // 把某个模板加载到测试区
  function applyTemplate(template) {
    testConfig.systemPrompt = template.systemPrompt
    appStore.toast.success(`已加载模板「${template.name}」`)
  }

  // 把 A 或 B 区的 Prompt 加载到模板
  function applyAbTemplate(side, template) {
    if (side === 'A') abConfig.systemPromptA = template.systemPrompt
    else              abConfig.systemPromptB = template.systemPrompt
    appStore.toast.success(`已将「${template.name}」加载到 ${side} 区`)
  }

  async function saveTemplate(form) {
    try {
      const url = editingId.value
        ? `/prompt/templates/${editingId.value}`
        : '/prompt/templates'
      const method = editingId.value ? 'put' : 'post'
      await http[method](url, form)
      await loadTemplates()
      appStore.toast.success(editingId.value ? '模板已更新' : '模板已保存')
      editingId.value = ''
    } catch (err) {
      appStore.toast.error('保存失败')
    }
  }

  async function deleteTemplate(id) {
    try {
      await http.delete(`/prompt/templates/${id}`)
      await loadTemplates()
      appStore.toast.success('模板已删除')
    } catch (err) {
      appStore.toast.error(err.response?.data?.error?.message || '删除失败')
    }
  }

  // 把当前测试的 system prompt 快速另存为模板
  async function saveCurrentAsTemplate(name) {
    if (!testConfig.systemPrompt.trim()) {
      appStore.toast.warning('System Prompt 为空，无法保存')
      return
    }
    await saveTemplate({ name, systemPrompt: testConfig.systemPrompt })
  }

  return {
    testConfig, testResult, testing,
    abConfig, abResult, abTesting,
    templates, editingId,
    runTest, runAbTest,
    loadTemplates, applyTemplate, applyAbTemplate,
    saveTemplate, deleteTemplate, saveCurrentAsTemplate,
  }
})

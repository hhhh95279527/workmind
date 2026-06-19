<!-- frontend/src/components/rag/RagChat.vue -->
<!-- RAG 问答界面：带来源标注的对话，展示检索到的文档片段 -->
<template>
  <div class="rag-chat">
    <!-- 分类过滤选择器 -->
    <div class="filter-bar">
      <span class="filter-label">搜索范围：</span>
      <select v-model="knStore.filterCategory" class="input filter-select">
        <option
          v-for="cat in knStore.categories"
          :key="cat.value"
          :value="cat.value"
        >
          {{ cat.label }}
        </option>
      </select>
      <button v-if="knStore.messages.length" class="btn-ghost btn-sm" @click="knStore.clearMessages()">
        清空记录
      </button>
    </div>

    <!-- 消息列表 -->
    <div class="message-list" ref="listEl">
      <!-- 空状态 -->
      <div v-if="!knStore.messages.length" class="empty-state">
        <div class="icon">🔍</div>
        <div class="title">向知识库提问</div>
        <div class="desc">AI 会检索相关文档，给出有来源标注的回答</div>
        <!-- 示例问题 -->
        <div class="examples">
          <button
            v-for="q in exampleQuestions"
            :key="q"
            class="example-btn"
            @click="knStore.query(q)"
          >
            {{ q }}
          </button>
        </div>
      </div>

      <!-- 消息 -->
      <div v-for="msg in knStore.messages" :key="msg.id" class="message-wrap" :class="msg.role">
        <!-- 用户问题 -->
        <div v-if="msg.role === 'user'" class="user-msg">
          <div class="bubble user-bubble">{{ msg.content }}</div>
        </div>

        <!-- AI 回答 -->
        <div v-else class="ai-msg">
          <!-- 检索状态提示 -->
          <div v-if="msg.status && !msg.content" class="status-hint">
            <div class="spinner" />
            <span>{{ msg.status }}</span>
          </div>

          <!-- 来源文档（在回答之前展示） -->
          <div v-if="msg.sources?.length" class="sources-panel">
            <div class="sources-label">📎 参考文档（{{ msg.sources.length }} 条）</div>
            <div class="source-list">
              <div
                v-for="(src, i) in msg.sources"
                :key="i"
                class="source-item"
                :title="src.content"
              >
                <span class="source-num">[{{ i + 1 }}]</span>
                <span class="source-title">{{ src.title }}</span>
                <span class="source-score">{{ (src.score * 100).toFixed(0) }}%</span>
                <!-- 展开显示片段内容 -->
                <button
                  class="source-expand"
                  @click="toggleSource(msg.id, i)"
                >
                  {{ expandedSources[`${msg.id}_${i}`] ? '▲' : '▼' }}
                </button>
                <div
                  v-if="expandedSources[`${msg.id}_${i}`]"
                  class="source-content"
                >
                  {{ src.content }}
                </div>
              </div>
            </div>
          </div>

          <!-- 回答内容 -->
          <div
            v-if="msg.content || msg.streaming"
            class="bubble ai-bubble markdown-body"
            v-html="renderMarkdown(msg.content)"
          />
          <span v-if="msg.streaming && msg.content" class="cursor-blink" />
        </div>
      </div>

      <div ref="bottomEl" />
    </div>

    <!-- 输入框 -->
    <div class="input-area">
      <div class="input-wrap" :class="{ focused }">
        <textarea
          v-model="question"
          @focus="focused = true"
          @blur="focused = false"
          @keydown.enter.exact.prevent="handleEnter"
          @keydown.shift.enter="null"
          placeholder="向知识库提问... (Enter 发送，Shift+Enter 换行)"
          :disabled="knStore.querying"
          rows="1"
          class="qa-input"
          ref="textareaEl"
          @input="autoResize"
        />
        <button
          class="btn-send"
          @click="send"
          :disabled="!question.trim() || knStore.querying"
        >
          {{ knStore.querying ? '...' : '提问' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, reactive } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import { useKnowledgeStore } from '@/stores/knowledge.js'

const knStore   = useKnowledgeStore()
const listEl    = ref(null)
const bottomEl  = ref(null)
const textareaEl = ref(null)
const question  = ref('')
const focused   = ref(false)
const expandedSources = reactive({})

const exampleQuestions = [
  '请介绍一下员工请假的相关规定',
  '差旅费报销标准是多少？',
  '产品的主要功能有哪些？',
]

marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value
    return hljs.highlightAuto(code).value
  },
  breaks: true,
})

function renderMarkdown(text) {
  if (!text) return ''
  try { return marked(text) } catch { return text }
}

function handleEnter(e) {
  if (e.shiftKey) return   // Shift+Enter 换行
  send()
}

async function send() {
  const q = question.value.trim()
  if (!q || knStore.querying) return
  question.value = ''
  resetHeight()
  await knStore.query(q)
}

function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 100) + 'px'
}

function resetHeight() {
  if (textareaEl.value) textareaEl.value.style.height = 'auto'
}

function toggleSource(msgId, idx) {
  const key = `${msgId}_${idx}`
  expandedSources[key] = !expandedSources[key]
}

// 新消息自动滚底
watch(
  () => knStore.messages.length,
  async () => {
    await nextTick()
    bottomEl.value?.scrollIntoView({ behavior: 'smooth' })
  }
)

// 流式内容也滚底
watch(
  () => knStore.messages[knStore.messages.length - 1]?.content,
  async () => {
    if (knStore.querying) {
      await nextTick()
      bottomEl.value?.scrollIntoView({ behavior: 'instant' })
    }
  }
)
</script>

<style scoped>
.rag-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px var(--space-xl);
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-surface);
  flex-shrink: 0;
}
.filter-label { font-size: 12px; color: var(--color-text-muted); white-space: nowrap; }
.filter-select { width: 160px; padding: 5px 10px; }
.btn-sm { padding: 5px 12px; font-size: 12px; }

/* 消息列表 */
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-muted);
  text-align: center;
}
.empty-state .icon  { font-size: 44px; }
.empty-state .title { font-size: 16px; font-weight: 600; color: var(--color-text); }
.empty-state .desc  { font-size: 13px; }
.examples { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 8px; }
.example-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  font-size: 12px;
  color: var(--color-text-sub);
  cursor: pointer;
  transition: all var(--transition);
}
.example-btn:hover { border-color: var(--color-primary); color: var(--color-primary); }

/* 用户消息 */
.message-wrap.user { display: flex; justify-content: flex-end; }
.user-bubble {
  max-width: 70%;
  padding: 10px 14px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 14px 4px 14px 14px;
  font-size: 14px;
  line-height: 1.7;
}

/* AI 消息 */
.ai-msg { display: flex; flex-direction: column; gap: 8px; max-width: 82%; }

.status-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
  padding: 6px 0;
}

/* 来源面板 */
.sources-panel {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.sources-label {
  font-size: 11px;
  font-weight: 600;
  color: #1d4ed8;
  margin-bottom: 8px;
}

.source-list { display: flex; flex-direction: column; gap: 4px; }

.source-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  flex-wrap: wrap;
}

.source-num { color: #3b82f6; font-weight: 700; }
.source-title { color: #1d4ed8; font-weight: 500; }
.source-score { color: #6b7280; background: #fff; padding: 1px 5px; border-radius: 8px; }
.source-expand {
  background: none; border: none;
  font-size: 10px; color: #6b7280;
  cursor: pointer; padding: 0 2px;
}

.source-content {
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  background: #fff;
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: #374151;
  line-height: 1.6;
  border: 1px solid #bfdbfe;
}

/* AI 回答气泡 */
.ai-bubble {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px 14px 14px 14px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.75;
}

/* 输入区 */
.input-area {
  padding: var(--space-md) var(--space-xl);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.input-wrap {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
  transition: border-color var(--transition);
}
.input-wrap.focused { border-color: var(--color-primary); }

.qa-input {
  flex: 1;
  background: transparent;
  border: none;
  resize: none;
  font-size: 14px;
  line-height: 1.65;
  color: var(--color-text);
  min-height: 24px;
  max-height: 100px;
  overflow-y: auto;
  padding: 0;
}
.qa-input::placeholder { color: var(--color-text-muted); }

.btn-send {
  padding: 6px 16px;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  flex-shrink: 0;
  transition: all var(--transition);
}
.btn-send:hover { background: var(--color-primary-light); }
.btn-send:disabled { opacity: .4; cursor: not-allowed; }
</style>

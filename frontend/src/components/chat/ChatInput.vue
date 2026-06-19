<!-- frontend/src/components/chat/ChatInput.vue -->
<!-- 消息输入框：支持多行、Ctrl+Enter 发送、停止生成 -->
<template>
  <div class="chat-input-area">
    <div class="input-wrapper" :class="{ focused }">
      <textarea
        ref="textareaEl"
        v-model="inputText"
        @focus="focused = true"
        @blur="focused = false"
        @keydown="handleKeydown"
        @input="autoResize"
        placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
        :disabled="chatStore.loading"
        rows="1"
        class="message-textarea"
      />
      <div class="input-actions">
        <!-- 字数提示 -->
        <span class="char-count" :class="{ warn: inputText.length > 3500 }">
          {{ inputText.length }}/4000
        </span>
        <!-- 停止生成 -->
        <button
          v-if="chatStore.loading"
          class="btn-stop"
          @click="stopGenerate"
        >
          ⏹ 停止
        </button>
        <!-- 发送 -->
        <button
          v-else
          class="btn-send"
          @click="send"
          :disabled="!inputText.trim()"
        >
          发送 ↵
        </button>
      </div>
    </div>
    <div class="input-tips">
      <span>Enter 发送 · Shift+Enter 换行</span>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat.js'

const chatStore  = useChatStore()
const inputText  = ref('')
const focused    = ref(false)
const textareaEl = ref(null)

async function send() {
  const text = inputText.value.trim()
  if (!text || chatStore.loading) return
  inputText.value = ''
  resetHeight()
  await chatStore.sendMessage(text)
}

function handleKeydown(e) {
  // Enter 发送（Shift+Enter 换行）
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// 文本框自动撑高（最多 5 行）
function autoResize() {
  const el = textareaEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 130) + 'px'
}

function resetHeight() {
  if (textareaEl.value) {
    textareaEl.value.style.height = 'auto'
  }
}

// 停止生成（目前靠关闭 SSE 连接来实现，这里只是 UI 状态）
function stopGenerate() {
  chatStore.loading = false
}
</script>

<style scoped>
.chat-input-area {
  padding: var(--space-md) var(--space-xl);
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: var(--space-sm);
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 8px 12px;
  transition: border-color var(--transition);
}
.input-wrapper.focused { border-color: var(--color-primary); }

.message-textarea {
  flex: 1;
  background: transparent;
  border: none;
  resize: none;
  font-size: 14px;
  line-height: 1.65;
  color: var(--color-text);
  min-height: 24px;
  max-height: 130px;
  padding: 0;
  overflow-y: auto;
}
.message-textarea::placeholder { color: var(--color-text-muted); }
.message-textarea:disabled { opacity: .7; cursor: not-allowed; }

.input-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.char-count {
  font-size: 11px;
  color: var(--color-text-muted);
}
.char-count.warn { color: var(--color-warning); }

.btn-send, .btn-stop {
  padding: 6px 14px;
  border-radius: var(--radius-md);
  font-size: 12px;
  font-weight: 500;
  transition: all var(--transition);
}

.btn-send {
  background: var(--color-primary);
  color: #fff;
}
.btn-send:hover { background: var(--color-primary-light); }
.btn-send:disabled { opacity: .4; cursor: not-allowed; }

.btn-stop {
  background: #fee2e2;
  color: var(--color-danger);
  border: 1px solid #fecaca;
}
.btn-stop:hover { background: #fecaca; }

.input-tips {
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
}
</style>

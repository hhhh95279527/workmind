<!-- frontend/src/components/chat/MessageBubble.vue -->
<!-- 消息气泡：支持 Markdown 渲染、代码高亮、操作按钮 -->
<template>
  <div class="message-wrap" :class="message.role">
    <!-- 用户消息 -->
    <div v-if="message.role === 'user'" class="user-msg">
      <div class="bubble user-bubble">{{ message.content }}</div>
      <div class="user-avatar">我</div>
    </div>

    <!-- AI 消息 -->
    <div v-else class="ai-msg">
      <div class="ai-avatar">AI</div>
      <div class="ai-content">
        <!-- 缓存标签 -->
        <div v-if="message.fromCache" class="cache-badge">缓存</div>

        <!-- 消息内容（Markdown 渲染） -->
        <div
          class="bubble ai-bubble markdown-body"
          v-html="renderedContent"
        />

        <!-- 流式输出时的光标 -->
        <span v-if="message.streaming" class="cursor-blink" />

        <!-- 操作按钮（hover 显示） -->
        <div v-if="!message.streaming" class="msg-actions">
          <button class="action-btn" @click="copy" title="复制">
            {{ copied ? '✓ 已复制' : '复制' }}
          </button>
          <button class="action-btn" @click="emit('regenerate')" title="重新生成">重新生成</button>
          <button class="action-btn like" :class="{ active: liked }" @click="like" title="有帮助">赞</button>
          <button class="action-btn dislike" :class="{ active: disliked }" @click="dislike" title="没帮助">踩</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { useChatStore } from '@/stores/chat.js'

const props = defineProps({
  message: { type: Object, required: true },
})

const emit = defineEmits(['regenerate'])

const chatStore = useChatStore()
const copied    = ref(false)
const liked     = ref(false)
const disliked  = ref(false)

// 配置 marked：代码块自动高亮
marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value
    }
    return hljs.highlightAuto(code).value
  },
  breaks: true,     // 换行转 <br>
  gfm: true,        // GitHub Flavored Markdown
})

// 把 Markdown 文本转成 HTML
const renderedContent = computed(() => {
  if (!props.message.content) return ''
  try {
    return marked(props.message.content)
  } catch {
    return props.message.content
  }
})

async function copy() {
  await chatStore.copyMessage(props.message.content)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

function like() {
  liked.value = !liked.value
  disliked.value = false
}

function dislike() {
  disliked.value = !disliked.value
  liked.value = false
}
</script>

<style scoped>
.message-wrap { display: flex; flex-direction: column; }

/* 用户消息 */
.user-msg {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-success);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-bubble {
  max-width: 72%;
  padding: 10px 14px;
  background: var(--color-primary);
  color: #fff;
  border-radius: 14px 4px 14px 14px;
  font-size: 14px;
  line-height: 1.7;
  word-break: break-word;
}

/* AI 消息 */
.ai-msg {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ai-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.ai-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cache-badge {
  display: inline-block;
  font-size: 10px;
  color: #6d28d9;
  background: #ede9fe;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-bottom: 4px;
}

.ai-bubble {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px 14px 14px 14px;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 1.75;
  word-break: break-word;
  max-width: 78%;
}

/* 操作按钮（平时隐藏，hover 显示） */
.msg-actions {
  display: none;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.ai-content:hover .msg-actions { display: flex; }

.action-btn {
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  background: var(--color-border-light);
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition);
}
.action-btn:hover { background: var(--color-border); color: var(--color-text); }
.action-btn.active { background: var(--color-primary-bg); color: var(--color-primary); border-color: var(--color-primary); }

/* 打字机光标 */
.cursor-blink {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-primary);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: blink 0.7s step-end infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
</style>

<!-- Markdown 渲染全局样式（非 scoped） -->
<style>
.markdown-body h1, .markdown-body h2, .markdown-body h3 {
  margin: 1em 0 .5em;
  font-weight: 600;
  line-height: 1.4;
}
.markdown-body h1 { font-size: 1.4em; }
.markdown-body h2 { font-size: 1.2em; }
.markdown-body h3 { font-size: 1.05em; }
.markdown-body p  { margin: .6em 0; }
.markdown-body ul, .markdown-body ol {
  padding-left: 1.5em;
  margin: .5em 0;
}
.markdown-body li { margin: .25em 0; }
.markdown-body strong { font-weight: 600; }
.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin: .75em 0;
  font-size: 13px;
}
.markdown-body th, .markdown-body td {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  text-align: left;
}
.markdown-body th { background: var(--color-border-light); font-weight: 600; }
.markdown-body blockquote {
  border-left: 3px solid var(--color-primary);
  padding-left: 12px;
  color: var(--color-text-sub);
  margin: .5em 0;
}
</style>

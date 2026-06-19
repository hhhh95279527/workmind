<!-- frontend/src/components/agent/ToolCallCard.vue -->
<!-- 单次工具调用卡片：工具名、入参、出参、执行时间、状态 -->
<template>
  <div class="tool-card" :class="step.status">
    <!-- 卡片头部 -->
    <div class="card-header" @click="toggle">
      <div class="left">
        <!-- 状态指示点 -->
        <span class="status-dot" :class="`dot-${step.status}`" />
        <!-- 步骤编号 -->
        <span class="step-num">#{{ step.id }}</span>
        <span class="tool-label">{{ step.label || step.toolName }}</span>
      </div>
      <div class="right">
        <!-- 执行时间 -->
        <span v-if="step.durationMs" class="duration">{{ step.durationMs }}ms</span>
        <!-- 状态标签 -->
        <span class="status-tag" :class="step.status">
          {{ statusText }}
        </span>
        <!-- 展开箭头 -->
        <span class="arrow">{{ expanded ? '▴' : '▾' }}</span>
      </div>
    </div>

    <!-- 展开内容：入参 + 出参 -->
    <Transition name="slide">
      <div v-if="expanded" class="card-body">
        <!-- 入参 -->
        <div v-if="argsText" class="detail-section">
          <div class="section-label">输入参数</div>
          <pre class="code-block args">{{ argsText }}</pre>
        </div>

        <!-- 出参（工具执行结果） -->
        <div v-if="step.result" class="detail-section">
          <div class="section-label">执行结果</div>
          <pre class="code-block result">{{ resultText }}</pre>
        </div>

        <!-- 执行中：等待动画 -->
        <div v-if="step.status === 'running'" class="loading-row">
          <div class="spinner" />
          <span>正在执行...</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  step: { type: Object, required: true },
})

const expanded = ref(true)   // 默认展开，完成后可折叠

function toggle() {
  if (props.step.status !== 'running') {
    expanded.value = !expanded.value
  }
}

const statusText = computed(() => ({
  running: '执行中',
  done:    '完成',
  error:   '失败',
}[props.step.status] || props.step.status))

// 格式化入参为可读文本
const argsText = computed(() => {
  const args = props.step.args
  if (!args) return ''
  if (typeof args === 'string') return args
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
})

// 格式化出参
const resultText = computed(() => {
  const r = props.step.result
  if (!r) return ''
  if (typeof r === 'string') {
    // 尝试 pretty print JSON
    try {
      return JSON.stringify(JSON.parse(r), null, 2)
    } catch {
      return r
    }
  }
  try { return JSON.stringify(r, null, 2) }
  catch { return String(r) }
})
</script>

<style scoped>
.tool-card {
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-surface);
  transition: all var(--transition);
}

/* 执行中：蓝色边框发光 */
.tool-card.running {
  border-color: var(--color-info);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, .12);
}

/* 完成：绿色边框 */
.tool-card.done {
  border-color: #86efac;
  background: #f0fdf4;
}

/* 卡片头部 */
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
  background: rgba(0, 0, 0, .015);
}

.left, .right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.step-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.tool-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.duration {
  font-size: 10px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.status-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
}
.status-tag.running { background: #dbeafe; color: #1d4ed8; }
.status-tag.done    { background: #dcfce7; color: #166534; }
.status-tag.error   { background: #fee2e2; color: #991b1b; }

.arrow { font-size: 10px; color: var(--color-text-muted); }

/* 卡片内容 */
.card-body {
  padding: 10px 14px;
  border-top: 1px solid var(--color-border-light);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-section {}

.section-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--color-text-muted);
  margin-bottom: 5px;
}

.code-block {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  font-size: 12px;
  font-family: var(--font-mono);
  overflow-x: auto;
  max-height: 180px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--color-text);
}

.code-block.result {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #166534;
}

.loading-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 4px 0;
}

/* 展开/收起动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all .25s ease;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
}
.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
  opacity: 1;
}
</style>

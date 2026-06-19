<!-- frontend/src/components/workflow/WorkflowGraph.vue -->
<!-- 工作流节点可视化：纵向流程图，展示每个节点的状态 -->
<template>
  <div class="wf-graph">
    <div
      v-for="(node, idx) in nodes"
      :key="node.id"
      class="wf-step"
    >
      <!-- 节点卡片 -->
      <div class="node-card" :class="nodeClass(node)">
        <!-- 左侧：状态圆圈 -->
        <div class="node-status-circle" :class="nodeClass(node)">
          <span v-if="nodeState(node.id) === 'done'"    class="icon-done">✓</span>
          <span v-else-if="nodeState(node.id) === 'running'"  class="spinner-sm" />
          <span v-else-if="nodeState(node.id) === 'waiting'"  class="icon-wait">⏸</span>
          <span v-else class="step-num">{{ idx + 1 }}</span>
        </div>

        <!-- 节点内容 -->
        <div class="node-body">
          <div class="node-row">
            <span class="node-label">{{ node.label }}</span>
            <!-- 人工节点特殊标识 -->
            <span v-if="node.isHuman" class="human-badge">人工</span>
            <!-- 状态标签 -->
            <span class="status-label" :class="nodeState(node.id)">
              {{ statusText(node.id, node.isHuman) }}
            </span>
          </div>

          <!-- 节点输出预览 -->
          <div v-if="nodeOutput(node.id)" class="node-output">
            {{ nodeOutput(node.id) }}
          </div>

          <!-- 人工审核节点：等待时展示审核区域 -->
          <div v-if="node.isHuman && nodeState(node.id) === 'waiting'" class="review-hint">
            👆 请查看上方的中间产物，填写修改意见后点击继续
          </div>
        </div>
      </div>

      <!-- 节点之间的连接线（最后一个节点不显示） -->
      <div v-if="idx < nodes.length - 1" class="connector">
        <div class="connector-line" :class="{ lit: nodeState(node.id) === 'done' }" />
        <div class="connector-arrow" :class="{ lit: nodeState(node.id) === 'done' }">▼</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useWorkflowStore } from '@/stores/workflow.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
})

const wfStore = useWorkflowStore()

function nodeState(id) {
  return wfStore.nodeStates[id] || 'idle'
}

function nodeOutput(id) {
  return wfStore.nodeOutputs[id] || ''
}

function nodeClass(node) {
  return nodeState(node.id)
}

function statusText(id, isHuman) {
  const s = nodeState(id)
  if (s === 'running') return '执行中'
  if (s === 'done')    return '完成'
  if (s === 'waiting') return '等待审核'
  if (s === 'idle')    return isHuman ? '待审核' : '等待'
  return s
}
</script>

<style scoped>
.wf-graph {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: var(--space-md) 0;
}

.wf-step {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

/* 节点卡片 */
.node-card {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md);
  padding: 12px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  transition: all 0.25s ease;
}

.node-card.running {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(79, 70, 229, .1);
}

.node-card.done {
  border-color: #86efac;
  background: #f0fdf4;
}

.node-card.waiting {
  border-color: var(--color-warning);
  background: #fffbeb;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, .1);
}

/* 状态圆圈 */
.node-status-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  transition: all 0.2s;
}

.node-status-circle.running {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.node-status-circle.done {
  border-color: var(--color-success);
  background: #dcfce7;
}

.node-status-circle.waiting {
  border-color: var(--color-warning);
  background: #fef3c7;
}

.icon-done { color: var(--color-success); font-size: 14px; }
.icon-wait { color: var(--color-warning); font-size: 14px; }
.step-num  { color: var(--color-text-muted); font-size: 12px; }

/* 旋转动画（执行中） */
.spinner-sm {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(79, 70, 229, .3);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 节点内容 */
.node-body { flex: 1; min-width: 0; }

.node-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.node-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.human-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  background: #fef3c7;
  color: #92400e;
  border-radius: var(--radius-full);
  border: 1px solid #fde68a;
}

.status-label {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  margin-left: auto;
}
.status-label.idle    { background: var(--color-border-light); color: var(--color-text-muted); }
.status-label.running { background: #dbeafe; color: #1d4ed8; }
.status-label.done    { background: #dcfce7; color: #166534; }
.status-label.waiting { background: #fef3c7; color: #92400e; }

.node-output {
  margin-top: 6px;
  font-size: 11px;
  color: var(--color-text-sub);
  background: rgba(0,0,0,.03);
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.review-hint {
  margin-top: 6px;
  font-size: 11px;
  color: #92400e;
  font-style: italic;
}

/* 连接线 */
.connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 28px;
  margin: 2px 0 2px 15px;   /* 对齐圆圈中心 */
}

.connector-line {
  width: 2px;
  flex: 1;
  background: var(--color-border);
  transition: background .3s;
}
.connector-line.lit { background: var(--color-success); }

.connector-arrow {
  font-size: 10px;
  color: var(--color-border);
  transition: color .3s;
  line-height: 1;
}
.connector-arrow.lit { color: var(--color-success); }
</style>

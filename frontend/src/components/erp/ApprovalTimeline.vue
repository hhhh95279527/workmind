<!-- frontend/src/components/erp/ApprovalTimeline.vue -->
<!-- 审批流程展示：左侧审批人步骤 + 右侧对话气泡 -->
<template>
  <div class="approval-timeline">

    <!-- 审批人步骤列表（左侧，固定） -->
    <div class="steps-panel">
      <div class="steps-title">审批流程</div>

      <!-- 审批等待中 loading -->
      <div v-if="erpStore.approving && !erpStore.approvalSteps.length" class="steps-loading">
        <div class="spinner" />
        <span>正在安排审批流程...</span>
      </div>

      <div class="steps-list">
        <div
          v-for="(step, idx) in erpStore.approvalSteps"
          :key="step.roleId"
          class="step-item"
          :class="step.status"
        >
          <!-- 连接线 -->
          <div class="step-line" v-if="idx < erpStore.approvalSteps.length - 1" :class="{ active: step.status === 'approved' }" />

          <!-- 角色头像 -->
          <div class="step-avatar" :style="{ background: step.role.color + '22', color: step.role.color }">
            {{ step.role.name?.slice(0,1) }}
          </div>

          <!-- 角色信息 -->
          <div class="step-info">
            <div class="step-name">{{ step.role.name }}</div>
            <div class="step-status" :class="step.status">
              {{ stepStatusText(step.status) }}
            </div>
          </div>
        </div>
      </div>

      <!-- 最终结果 -->
      <div v-if="erpStore.finalResult" class="final-result" :class="erpStore.finalResult.status">
        <div class="final-text">
          {{ erpStore.finalResult.approved ? '审批通过' : '审批驳回' }}
        </div>
      </div>
    </div>

    <!-- 对话区域（右侧） -->
    <div class="conversation" ref="convEl">
      <!-- 空状态 -->
      <div v-if="!erpStore.approvalMessages.length && !erpStore.approving" class="conv-empty">
        <div>审批开始后，各角色的对话将在此显示</div>
      </div>

      <!-- 执行中占位 -->
      <div v-if="erpStore.approving && !erpStore.approvalMessages.length" class="conv-thinking">
        <div class="spinner" />
        <span>审批人正在审核...</span>
      </div>

      <!-- 对话气泡 -->
      <div
        v-for="msg in erpStore.approvalMessages"
        :key="msg.id"
        class="msg-bubble-wrap"
        :class="{ 'is-applicant': msg.from === 'applicant' }"
      >
        <!-- 非申请人：左对齐 -->
        <template v-if="msg.from !== 'applicant'">
          <div class="msg-avatar" :style="{ background: msg.role?.color + '22', color: msg.role?.color }">
            {{ msg.role?.name?.slice(0,1) || '?' }}
          </div>
          <div class="msg-content left">
            <div class="msg-sender">{{ msg.role?.name }}</div>
            <div class="msg-bubble" :class="`type-${msg.type}`">
              {{ msg.content }}
            </div>
            <div class="msg-type-tag">
              {{ typeLabel(msg.type) }}
            </div>
          </div>
        </template>

        <!-- 申请人：右对齐 -->
        <template v-else>
          <div class="msg-content right">
            <div class="msg-sender right">申请人</div>
            <div class="msg-bubble applicant">
              {{ msg.content }}
            </div>
          </div>
          <div class="msg-avatar applicant">我</div>
        </template>
      </div>

      <!-- 等待中（有对话后显示） -->
      <div v-if="erpStore.approving && erpStore.approvalMessages.length" class="conv-thinking inline">
        <div class="typing-dots">
          <span /><span /><span />
        </div>
        <span>审批人正在思考...</span>
      </div>

      <div ref="bottomEl" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useErpStore } from '@/stores/erp.js'

const erpStore = useErpStore()
const convEl   = ref(null)
const bottomEl = ref(null)

function stepStatusText(status) {
  return { pending: '待审核', running: '审核中', approved: '已通过', rejected: '已驳回' }[status] || status
}

function typeLabel(type) {
  return { question: '提出问题', answer: '申请人回复', decision: '最终决定' }[type] || ''
}

// 新消息来了自动滚底
watch(
  () => erpStore.approvalMessages.length,
  async () => {
    await nextTick()
    bottomEl.value?.scrollIntoView({ behavior: 'smooth' })
  }
)
</script>

<style scoped>
.approval-timeline {
  display: flex;
  height: 100%;
  gap: 0;
  overflow: hidden;
}

/* ── 左侧步骤面板 ─────────────────────────────────────────── */
.steps-panel {
  width: 180px;
  flex-shrink: 0;
  padding: var(--space-md);
  background: var(--color-bg);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow-y: auto;
}

.steps-title {
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--color-text-muted);
}

.steps-loading {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--color-text-muted);
  padding: 4px 0;
}

.steps-list { display: flex; flex-direction: column; gap: 0; position: relative; }

.step-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  position: relative;
}

/* 步骤连接线 */
.step-line {
  position: absolute;
  left: 18px;
  top: 42px;
  width: 2px;
  height: calc(100% - 10px);
  background: var(--color-border);
  transition: background .3s;
}
.step-line.active { background: var(--color-success); }

.step-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
  z-index: 1;
}

.step-info { flex: 1; min-width: 0; }
.step-name { font-size: 12px; font-weight: 600; color: var(--color-text); }
.step-status { font-size: 10px; margin-top: 2px; }
.step-status.pending  { color: var(--color-text-muted); }
.step-status.running  { color: var(--color-info); }
.step-status.approved { color: var(--color-success); font-weight: 600; }
.step-status.rejected { color: var(--color-danger); font-weight: 600; }

/* 最终结果 */
.final-result {
  margin-top: var(--space-md);
  padding: 10px 12px;
  border-radius: var(--radius-lg);
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; font-size: 13px;
}
.final-result.approved { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
.final-result.rejected { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }

/* ── 右侧对话区 ───────────────────────────────────────────── */
.conversation {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.conv-empty {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 8px; color: var(--color-text-muted); font-size: 13px;
}

.conv-thinking {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--color-text-muted);
  padding: 8px 0;
}
.conv-thinking.inline { justify-content: flex-start; }

/* 打字动画 */
.typing-dots {
  display: flex; gap: 3px;
}
.typing-dots span {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--color-text-muted);
  animation: typing .8s infinite;
}
.typing-dots span:nth-child(2) { animation-delay: .15s; }
.typing-dots span:nth-child(3) { animation-delay: .3s; }
@keyframes typing { 0%,100%{opacity:.3;transform:scale(1)} 50%{opacity:1;transform:scale(1.2)} }

/* 消息气泡 */
.msg-bubble-wrap {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.msg-bubble-wrap.is-applicant { flex-direction: row-reverse; }

.msg-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}
.msg-avatar.applicant { background: #dcfce7; color: #166534; }

.msg-content { flex: 1; min-width: 0; max-width: 72%; }
.msg-content.right { text-align: right; }

.msg-sender { font-size: 11px; font-weight: 700; color: var(--color-text-muted); margin-bottom: 4px; }
.msg-sender.right { text-align: right; }

.msg-bubble {
  display: inline-block;
  padding: 10px 14px;
  border-radius: 4px 14px 14px 14px;
  font-size: 13px; line-height: 1.7;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  text-align: left;
  max-width: 100%;
  word-break: break-word;
}

.msg-bubble.applicant {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  border-radius: 14px 4px 14px 14px;
}

/* 不同类型气泡的微差异 */
.msg-bubble.type-decision {
  border-color: var(--color-primary);
  background: var(--color-primary-bg);
}

.msg-type-tag {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 3px;
}
</style>

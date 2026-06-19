<!-- frontend/src/views/ErpView.vue -->
<template>
  <div class="erp-view">
    <aside class="erp-sidebar">
      <div class="type-tabs">
        <button class="type-tab" :class="{ active: erpStore.formType === 'expense' }" @click="switchType('expense')" :disabled="erpStore.approving">报销申请</button>
        <button class="type-tab" :class="{ active: erpStore.formType === 'leave' }" @click="switchType('leave')" :disabled="erpStore.approving">请假申请</button>
      </div>
      <div class="sidebar-scroll">
        <SmartFormParser @submit="startApproval" />
      </div>
      <div class="record-section">
        <div class="record-header" @click="showRecords = !showRecords">
          <span>申请记录 ({{ erpStore.applications.length }})</span>
          <span>{{ showRecords ? '▴' : '▾' }}</span>
        </div>
        <div v-if="showRecords" class="record-list">
          <div v-if="!erpStore.applications.length" class="record-empty">暂无申请记录</div>
          <div v-for="app in erpStore.applications" :key="app.id" class="record-item">
            <div class="record-top">
              <span class="record-id">{{ app.id }}</span>
              <span class="record-status" :class="app.status">{{ statusLabel(app.status) }}</span>
            </div>
            <div class="record-desc">{{ app.reason || (app.formType === 'leave' ? `请假 ${app.days} 天` : '') }}</div>
            <div class="record-meta">{{ app.formType === 'expense' ? `¥${app.amount}` : `${app.days}天` }} · {{ formatTime(app.createdAt) }}</div>
          </div>
        </div>
      </div>
    </aside>

    <main class="erp-main">
      <div v-if="!erpStore.approving && !erpStore.approvalMessages.length && !erpStore.finalResult" class="main-empty">
        <div class="empty-title">ERP 智能报销与请假</div>
        <div class="empty-desc">在左侧用自然语言描述，AI 自动填表后提交，多个 Agent 模拟真实审批流程</div>
        <div class="feature-list">
          <div class="feature-item">自然语言填单，告别繁琐表格</div>
          <div class="feature-item">多 Agent 模拟真实审批对话</div>
          <div class="feature-item">自动检测不合规费用</div>
        </div>
      </div>
      <div v-else class="approval-area">
        <div class="app-summary">
          <span class="app-type">
            {{ erpStore.formType === 'expense' ? '报销申请' : '请假申请' }}
          </span>
          <span v-if="erpStore.formType === 'expense' && erpStore.parsedForm">{{ erpStore.parsedForm.reason }} · ¥{{ erpStore.parsedForm.totalAmount }}</span>
          <span v-if="erpStore.formType === 'leave' && erpStore.parsedForm">{{ erpStore.parsedForm.reason }} · {{ erpStore.parsedForm.workdays }} 个工作日</span>
          <span class="app-id">{{ erpStore.currentAppId }}</span>
        </div>
        <ApprovalTimeline class="timeline-area" />
        <div v-if="erpStore.finalResult" class="done-actions">
          <button class="btn btn-ghost" @click="erpStore.reset()">开始新申请</button>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useErpStore } from '@/stores/erp.js'
import SmartFormParser from '@/components/erp/SmartFormParser.vue'
import ApprovalTimeline from '@/components/erp/ApprovalTimeline.vue'

const erpStore    = useErpStore()
const showRecords = ref(false)

function switchType(type) { erpStore.formType = type; erpStore.reset() }
async function startApproval() { await erpStore.submitApproval('申请人') }
function statusLabel(s) { return { pending: '审批中', approved: '已通过', rejected: '已驳回' }[s] || s }
function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`
}
onMounted(() => erpStore.loadApplications())
</script>

<style scoped>
.erp-view { display:flex; height:100%; overflow:hidden; background:var(--color-bg); }
.erp-sidebar { width:360px; flex-shrink:0; background:var(--color-surface); border-right:1px solid var(--color-border); display:flex; flex-direction:column; overflow:hidden; }
.type-tabs { display:flex; border-bottom:1px solid var(--color-border); flex-shrink:0; }
.type-tab { display:inline-flex; align-items:center; justify-content:center; gap:5px; flex:1; padding:12px; background:transparent; border:none; font-size:13px; font-weight:600; color:var(--color-text-sub); cursor:pointer; transition:all var(--transition); border-bottom:2px solid transparent; }
.type-tab:hover { color:var(--color-text); background:var(--color-bg); }
.type-tab.active { color:var(--color-primary); border-bottom-color:var(--color-primary); }
.type-tab:disabled { opacity:.5; cursor:not-allowed; }
.sidebar-scroll { flex:1; overflow-y:auto; padding:var(--space-lg); }
.record-section { border-top:1px solid var(--color-border); flex-shrink:0; }
.record-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; font-size:12px; font-weight:600; color:var(--color-text-sub); cursor:pointer; }
.record-header:hover { background:var(--color-border-light); }
.record-list { max-height:200px; overflow-y:auto; }
.record-empty { padding:12px 16px; font-size:12px; color:var(--color-text-muted); text-align:center; }
.record-item { padding:10px 16px; border-bottom:1px solid var(--color-border-light); }
.record-top { display:flex; align-items:center; gap:6px; margin-bottom:3px; }
.record-id   { font-size:10px; color:var(--color-text-muted); font-family:var(--font-mono); flex:1; }
.record-status { font-size:10px; font-weight:600; padding:1px 7px; border-radius:var(--radius-full); }
.record-status.pending  { background:#dbeafe; color:#1d4ed8; }
.record-status.approved { background:#dcfce7; color:#166534; }
.record-status.rejected { background:#fee2e2; color:#991b1b; }
.record-desc { font-size:12px; color:var(--color-text); margin-bottom:2px; }
.record-meta { font-size:10px; color:var(--color-text-muted); }
.erp-main { flex:1; overflow:hidden; display:flex; flex-direction:column; }
.main-empty { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:var(--color-text-muted); text-align:center; padding:var(--space-2xl); }
.empty-title { font-size:18px; font-weight:600; color:var(--color-text); }
.empty-desc { font-size:13px; max-width:360px; line-height:1.7; }
.feature-list { display:flex; flex-direction:column; gap:6px; margin-top:8px; text-align:left; }
.feature-item { font-size:13px; color:var(--color-text-sub); }
.approval-area { flex:1; display:flex; flex-direction:column; overflow:hidden; }
.app-summary { display:flex; align-items:center; gap:var(--space-md); padding:10px var(--space-xl); background:var(--color-surface); border-bottom:1px solid var(--color-border); font-size:13px; color:var(--color-text-sub); flex-shrink:0; }
.app-type { display:inline-flex; align-items:center; gap:4px; font-weight:700; color:var(--color-text); }
.app-id   { font-size:11px; font-family:var(--font-mono); margin-left:auto; color:var(--color-text-muted); }
.timeline-area { flex:1; overflow:hidden; }
.done-actions { padding:var(--space-md) var(--space-xl); border-top:1px solid var(--color-border); display:flex; justify-content:flex-end; background:var(--color-surface); flex-shrink:0; }
</style>

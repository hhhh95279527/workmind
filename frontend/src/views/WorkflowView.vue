<!-- frontend/src/views/WorkflowView.vue -->
<template>
  <div class="workflow-view">
    <!-- 左侧：模板选择 + 流程图 -->
    <aside class="wf-sidebar">
      <div class="template-section">
        <div class="section-label">选择工作流模板</div>
        <div class="template-grid">
          <div
            v-for="t in wfStore.templates"
            :key="t.id"
            class="template-card"
            :class="{ active: wfStore.selectedTemplate === t.id }"
            @click="selectAndReset(t.id)"
          >
            <!-- <span class="tpl-icon">{{ t.icon }}</span> -->
            <div class="tpl-info">
              <div class="tpl-title">{{ t.title }}</div>
              <div class="tpl-desc">{{ t.desc }}</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="currentMeta" class="graph-section">
        <div class="section-label">执行流程</div>
        <WorkflowGraph :nodes="currentMeta.nodes" />
      </div>
    </aside>

    <!-- 右侧：输入/审核/结果 -->
    <main class="wf-main">
      <!-- 未选模板 -->
      <div v-if="!wfStore.selectedTemplate" class="empty-state">
        <div class="empty-icon">⚙️</div>
        <div class="empty-title">选择一个工作流模板</div>
        <div class="empty-desc">从左侧选择工作流类型，然后输入内容开始执行</div>
      </div>

      <template v-else>
        <!-- 输入阶段 -->
        <div v-if="!wfStore.running && !wfStore.paused && !wfStore.result" class="input-phase">
          <div class="phase-title">
            <!-- <span class="phase-icon">{{ currentMeta.icon }}</span> -->
            {{ currentMeta.title }}
          </div>

          <div v-if="currentMeta.extraField" class="form-field">
            <label class="field-label">{{ currentMeta.extraField.label }}</label>
            <input v-model="extraValue" class="input" :placeholder="currentMeta.extraField.placeholder" />
          </div>

          <div class="form-field">
            <label class="field-label">{{ currentMeta.inputLabel }}</label>
            <textarea v-model="mainInput" class="input" :placeholder="currentMeta.inputPlaceholder" rows="8" />
            <div class="char-count">{{ mainInput.length }} 字</div>
          </div>

          <button class="btn btn-primary start-btn" @click="startWorkflow" :disabled="!mainInput.trim()">
            ▶ 开始执行
          </button>
        </div>

        <!-- 执行中 -->
        <div v-if="wfStore.running && !wfStore.paused && !wfStore.streamBuffer" class="running-phase">
          <div class="running-header">
            <div class="spinner" />
            <span>工作流执行中，请稍候...</span>
          </div>
        </div>

        <!-- 人工审核 -->
        <div v-if="wfStore.paused" class="review-phase">
          <HumanReviewPanel @approve="resumeWithFeedback" @abort="handleAbort" />
        </div>

        <!-- 流式输出最终内容 -->
        <div v-if="wfStore.running && wfStore.streamBuffer" class="streaming-phase">
          <div class="streaming-label">正在生成最终内容...</div>
          <div class="streaming-content markdown-body" v-html="renderMd(wfStore.streamBuffer)" />
          <span class="cursor-blink" />
        </div>

        <!-- 结果展示 -->
        <div v-if="wfStore.result && !wfStore.running" class="result-phase">
          <div class="result-header">
            <span>✅ 生成完成</span>
            <div class="result-actions">
              <button class="btn btn-ghost btn-sm" @click="copyResult">复制内容</button>
              <button class="btn btn-ghost btn-sm" @click="restart">重新开始</button>
            </div>
          </div>
          <div class="result-content markdown-body" v-html="renderMd(wfStore.result)" />
        </div>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import { useWorkflowStore } from '@/stores/workflow.js'
import { useAppStore } from '@/stores/app.js'
import WorkflowGraph from '@/components/workflow/WorkflowGraph.vue'
import HumanReviewPanel from '@/components/workflow/HumanReviewPanel.vue'

const wfStore  = useWorkflowStore()
const appStore = useAppStore()

const mainInput  = ref('')
const extraValue = ref('')

marked.setOptions({
  highlight: (c, l) => l && hljs.getLanguage(l) ? hljs.highlight(c, { language: l }).value : c,
  breaks: true,
})
function renderMd(t) { try { return marked(t || '') } catch { return t } }

const currentMeta = computed(() =>
  wfStore.templates.find(t => t.id === wfStore.selectedTemplate) || null
)

function selectAndReset(id) {
  wfStore.selectTemplate(id)
  mainInput.value = ''
  extraValue.value = ''
}

async function startWorkflow() {
  if (!mainInput.value.trim() || !currentMeta.value) return

  const fieldMaps = {
    weekly_report:   { mainKey: 'points',      extraKey: 'dept' },
    meeting_minutes: { mainKey: 'rawNotes',    extraKey: 'meetingTitle' },
    email_polish:    { mainKey: 'draft',       extraKey: 'recipient' },
    prd_skeleton:    { mainKey: 'description', extraKey: null },
  }

  const m = fieldMaps[wfStore.selectedTemplate] || { mainKey: 'input', extraKey: null }
  const payload = { [m.mainKey]: mainInput.value }
  if (m.extraKey && extraValue.value.trim()) payload[m.extraKey] = extraValue.value

  await wfStore.startWorkflow(payload)
}

async function resumeWithFeedback(feedback) {
  await wfStore.resumeWorkflow(feedback)
}

function handleAbort() {
  wfStore.reset()
  mainInput.value = ''
  extraValue.value = ''
}

async function copyResult() {
  await navigator.clipboard.writeText(wfStore.result)
  appStore.toast.success('已复制到剪贴板')
}

function restart() {
  wfStore.reset()
}

onMounted(() => wfStore.loadTemplates())
</script>

<style scoped>
.workflow-view { display:flex; height:100%; overflow:hidden; background:var(--color-bg); }

/* 左侧 */
.wf-sidebar { width:280px; flex-shrink:0; background:var(--color-surface); border-right:1px solid var(--color-border); overflow-y:auto; display:flex; flex-direction:column; }
.template-section, .graph-section { padding:var(--space-md); border-bottom:1px solid var(--color-border-light); }
.section-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--color-text-muted); margin-bottom:var(--space-sm); }
.template-grid { display:flex; flex-direction:column; gap:6px; }
.template-card { display:flex; align-items:flex-start; gap:10px; padding:10px 12px; border-radius:var(--radius-lg); border:1.5px solid var(--color-border); cursor:pointer; transition:all var(--transition); background:var(--color-bg); }
.template-card:hover { border-color:var(--color-primary); }
.template-card.active { border-color:var(--color-primary); background:var(--color-primary-bg); }
.tpl-icon { font-size:18px; flex-shrink:0; }
.tpl-title { font-size:12px; font-weight:600; color:var(--color-text); }
.tpl-desc { font-size:11px; color:var(--color-text-muted); margin-top:2px; line-height:1.4; }

/* 右侧 */
.wf-main { flex:1; overflow-y:auto; padding:var(--space-xl) var(--space-2xl); display:flex; flex-direction:column; }
.empty-state { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:var(--color-text-muted); text-align:center; }
.empty-icon { font-size:48px; }
.empty-title { font-size:18px; font-weight:600; color:var(--color-text); }
.empty-desc { font-size:13px; max-width:360px; line-height:1.7; }
.phase-title { display:flex; align-items:center; gap:10px; font-size:16px; font-weight:700; color:var(--color-text); margin-bottom:var(--space-lg); }
.phase-icon { font-size:20px; }
.input-phase { display:flex; flex-direction:column; gap:var(--space-md); max-width:680px; }
.form-field { display:flex; flex-direction:column; gap:6px; }
.field-label { font-size:13px; font-weight:600; color:var(--color-text); }
.char-count { font-size:11px; color:var(--color-text-muted); text-align:right; }
.start-btn { align-self:flex-end; padding:10px 28px; }
.running-phase { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:var(--space-lg); }
.running-header { display:flex; align-items:center; gap:12px; font-size:15px; font-weight:500; color:var(--color-text-sub); }
.review-phase { max-width:680px; }
.streaming-phase { max-width:680px; }
.streaming-label { font-size:12px; color:var(--color-text-muted); margin-bottom:10px; }
.streaming-content { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:var(--space-lg); font-size:14px; line-height:1.75; min-height:100px; }
.result-phase { max-width:680px; }
.result-header { display:flex; align-items:center; gap:10px; margin-bottom:var(--space-md); font-size:14px; font-weight:600; color:var(--color-text); }
.result-actions { display:flex; gap:6px; margin-left:auto; }
.btn-sm { padding:5px 12px; font-size:12px; }
.result-content { background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-lg); padding:var(--space-xl); font-size:14px; line-height:1.8; }
</style>

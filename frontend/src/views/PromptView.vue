<!-- frontend/src/views/PromptView.vue -->
<template>
  <div class="prompt-view">
    <div class="top-tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="top-tab"
        :class="{ active: activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        <el-icon><component :is="tab.icon" /></el-icon>{{ tab.label }}
      </button>
    </div>

    <!-- 单次测试 -->
    <div v-if="activeTab === 'test'" class="tab-panel">
      <div class="two-col">
        <div class="edit-panel">
          <div class="panel-section">
            <div class="section-row">
              <label class="field-label">System Prompt</label>
              <div class="section-actions">
                <button
                  class="btn-text"
                  @click="showTemplates = !showTemplates"
                >
                  <el-icon><FolderOpened /></el-icon> 从模板加载
                </button>
                <button class="btn-text" @click="quickSave">
                  <el-icon><DocumentAdd /></el-icon> 另存为模板
                </button>
              </div>
            </div>
            <textarea
              v-model="ps.testConfig.systemPrompt"
              class="input editor-area"
              placeholder="输入 System Prompt（可为空）..."
              rows="6"
            />
            <div class="char-info">
              {{ ps.testConfig.systemPrompt.length }} 字
            </div>
          </div>
          <div class="panel-section">
            <label class="field-label">User Message</label>
            <textarea
              v-model="ps.testConfig.userMessage"
              class="input editor-area"
              placeholder="输入测试问题..."
              rows="3"
            />
          </div>
          <div class="params-row">
            <div class="param-item">
              <label class="param-label">Temperature</label>
              <div class="slider-wrap">
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  v-model.number="ps.testConfig.temperature"
                  class="slider"
                />
                <span class="param-val">{{ ps.testConfig.temperature }}</span>
              </div>
              <div class="param-hint">
                {{ tempDesc(ps.testConfig.temperature) }}
              </div>
            </div>
            <div class="param-item">
              <label class="param-label">Max Tokens</label>
              <input
                type="number"
                min="100"
                max="4096"
                step="100"
                v-model.number="ps.testConfig.maxTokens"
                class="input param-input"
              />
            </div>
          </div>
          <button
            class="btn btn-primary run-btn"
            @click="ps.runTest()"
            :disabled="!ps.testConfig.userMessage.trim() || ps.testing"
          >
            <template v-if="ps.testing"
              ><el-icon><Loading /></el-icon> 测试中...</template
            >
            <template v-else
              ><el-icon><CaretRight /></el-icon> 运行测试</template
            >
          </button>
        </div>
        <div class="result-panel">
          <div v-if="ps.testResult.totalTokens" class="metrics-bar">
            <span class="metric"
              ><el-icon><Timer /></el-icon>{{ ps.testResult.latencyMs }}ms</span
            >
            <span class="metric"
              ><el-icon><Download /></el-icon
              >{{ ps.testResult.inputTokens }}</span
            >
            <span class="metric"
              ><el-icon><Upload /></el-icon
              >{{ ps.testResult.outputTokens }}</span
            >
            <span class="metric"
              ><el-icon><Coin /></el-icon>¥{{
                ps.testResult.costCNY.toFixed(5)
              }}</span
            >
          </div>
          <div class="result-content">
            <div
              v-if="!ps.testResult.content && !ps.testing"
              class="result-empty"
            >
              运行测试后，AI 回复将在此显示
            </div>
            <div
              v-else
              class="result-text markdown-body"
              v-html="renderMd(ps.testResult.content)"
            />
            <span v-if="ps.testResult.streaming" class="cursor-blink" />
          </div>
        </div>
      </div>

      <div
        v-if="showTemplates"
        class="overlay"
        @click.self="showTemplates = false"
      >
        <div class="template-picker">
          <div class="picker-header">
            <span>选择模板</span
            ><button class="btn-close" @click="showTemplates = false">×</button>
          </div>
          <div class="picker-list">
            <div
              v-for="t in ps.templates"
              :key="t.id"
              class="picker-item"
              @click="loadTemplate(t)"
            >
              <div class="picker-name">{{ t.name }}</div>
              <div class="picker-desc">
                {{ t.systemPrompt.slice(0, 50) }}...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- A/B 对比 -->
    <div v-if="activeTab === 'ab'" class="tab-panel ab-panel">
      <div class="ab-question">
        <label class="field-label">测试问题（A 和 B 共用同一个问题）</label>
        <div class="question-row">
          <textarea
            v-model="ps.abConfig.question"
            class="input"
            placeholder="输入测试问题..."
            rows="2"
          />
          <button
            class="btn btn-primary"
            @click="ps.runAbTest()"
            :disabled="!ps.abConfig.question.trim() || ps.abTesting"
          >
            <template v-if="ps.abTesting">测试中...</template>
            <template v-else
              ><el-icon><CaretRight /></el-icon> 开始对比</template
            >
          </button>
        </div>
      </div>
      <div class="ab-columns">
        <div
          class="ab-col"
          :class="{ winner: ps.abResult.evaluation?.winner === 'A' }"
        >
          <div class="ab-col-header">
            <span class="ab-label ab-a">A</span
            ><span class="ab-col-title">System Prompt A</span>
          </div>
          <textarea
            v-model="ps.abConfig.systemPromptA"
            class="input ab-input"
            placeholder="System Prompt A..."
            rows="5"
          />
          <div v-if="ps.abResult.answerA" class="ab-answer">
            <div class="ab-answer-label">A 的回答</div>
            <div
              class="ab-answer-text"
              v-html="renderMd(ps.abResult.answerA)"
            />
            <div v-if="ps.abResult.evaluation?.scoreA" class="score-row">
              <span v-for="k in scoreKeys" :key="k" class="score-chip">
                {{ scoreLabelMap[k] }}: {{ ps.abResult.evaluation.scoreA[k] }}
              </span>
            </div>
          </div>
          <div
            v-if="ps.abResult.evaluation?.winner === 'A'"
            class="winner-badge"
          >
            <el-icon><Trophy /></el-icon> 胜出
          </div>
        </div>
        <div
          class="ab-col"
          :class="{ winner: ps.abResult.evaluation?.winner === 'B' }"
        >
          <div class="ab-col-header">
            <span class="ab-label ab-b">B</span
            ><span class="ab-col-title">System Prompt B</span>
          </div>
          <textarea
            v-model="ps.abConfig.systemPromptB"
            class="input ab-input"
            placeholder="System Prompt B..."
            rows="5"
          />
          <div v-if="ps.abResult.answerB" class="ab-answer">
            <div class="ab-answer-label">B 的回答</div>
            <div
              class="ab-answer-text"
              v-html="renderMd(ps.abResult.answerB)"
            />
            <div v-if="ps.abResult.evaluation?.scoreB" class="score-row">
              <span v-for="k in scoreKeys" :key="k" class="score-chip">
                {{ scoreLabelMap[k] }}: {{ ps.abResult.evaluation.scoreB[k] }}
              </span>
            </div>
          </div>
          <div
            v-if="ps.abResult.evaluation?.winner === 'B'"
            class="winner-badge"
          >
            <el-icon><Trophy /></el-icon> 胜出
          </div>
        </div>
      </div>
      <div v-if="ps.abResult.evaluation" class="ab-verdict">
        <span>{{
          ps.abResult.evaluation.winner === "tie"
            ? "效果相当"
            : ps.abResult.evaluation.winner === "A"
            ? "A 更好"
            : "B 更好"
        }}</span>
        <span class="verdict-reason">{{ ps.abResult.evaluation.reason }}</span>
      </div>
    </div>

    <!-- 模板库 -->
    <div v-if="activeTab === 'templates'" class="tab-panel">
      <div class="template-manager">
        <div class="tpl-list-panel">
          <div class="tpl-list-header">
            <span>模板库 ({{ ps.templates.length }})</span
            ><button class="btn btn-primary btn-sm" @click="startNew">
              <el-icon><Plus /></el-icon> 新建
            </button>
          </div>
          <div class="tpl-list">
            <div
              v-for="t in ps.templates"
              :key="t.id"
              class="tpl-list-item"
              :class="{ selected: selectedId === t.id }"
              @click="selectTpl(t)"
            >
              <div class="tpl-item-name">{{ t.name }}</div>
              <div class="tpl-item-desc">{{ t.description || "无描述" }}</div>
            </div>
          </div>
        </div>
        <div class="tpl-edit-panel">
          <div v-if="!editing" class="tpl-edit-empty">
            从左侧选择模板，或点击新建
          </div>
          <div v-else class="tpl-edit-form">
            <div class="tpl-edit-header">
              <input
                v-model="editing.name"
                class="input tpl-name-input"
                placeholder="模板名称"
              />
              <div class="tpl-edit-actions">
                <button class="btn btn-ghost btn-sm" @click="loadToTest">
                  加载到测试
                </button>
                <button
                  class="btn btn-ghost btn-sm"
                  @click="doDelete"
                  :disabled="editing.id?.startsWith('t_default_')"
                >
                  删除
                </button>
                <button class="btn btn-primary btn-sm" @click="doSave">
                  保存
                </button>
              </div>
            </div>
            <label class="field-label">System Prompt</label>
            <textarea
              v-model="editing.systemPrompt"
              class="input tpl-prompt-area"
              rows="10"
              placeholder="System Prompt 内容..."
            />
            <label class="field-label" style="margin-top: 12px">描述</label>
            <input
              v-model="editing.description"
              class="input"
              placeholder="简短描述这个 Prompt 的用途"
            />
            <div v-if="editing.versions?.length" class="version-history">
              <div class="version-title">版本历史</div>
              <div
                v-for="v in [...editing.versions].reverse()"
                :key="v.version"
                class="version-item"
              >
                <span class="version-num">v{{ v.version }}</span>
                <span class="version-time">{{ fmtTime(v.savedAt) }}</span>
                <span class="version-preview"
                  >{{ v.systemPrompt.slice(0, 40) }}...</span
                >
                <button
                  class="version-restore"
                  @click="
                    editing.systemPrompt = v.systemPrompt;
                    appStore.toast.success('已恢复');
                  "
                >
                  <el-icon><RefreshLeft /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { marked } from "marked";
import { usePromptStore } from "@/stores/prompt.js";
import { useAppStore } from "@/stores/app.js";

const ps = usePromptStore();
const appStore = useAppStore();

const activeTab = ref("test");
const showTemplates = ref(false);
const selectedId = ref("");
const editing = ref(null);

const tabs = [
  { id: "test", icon: "CaretRight", label: "单次测试" },
  { id: "ab", icon: "DataAnalysis", label: "A/B 对比" },
  { id: "templates", icon: "FolderOpened", label: "模板库" },
];

const scoreKeys = [
  "relevance",
  "accuracy",
  "clarity",
  "conciseness",
  "overall",
];
const scoreLabelMap = {
  relevance: "相关性",
  accuracy: "准确性",
  clarity: "清晰度",
  conciseness: "简洁度",
  overall: "综合",
};

function renderMd(t) {
  try {
    return marked(t || "");
  } catch {
    return t || "";
  }
}
function tempDesc(t) {
  if (t <= 0.3) return "确定性强，适合代码/分析";
  if (t <= 0.7) return "平衡创意和准确性";
  if (t <= 1.2) return "较有创意";
  return "高度随机";
}
function fmtTime(iso) {
  return iso
    ? new Date(iso).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}

function loadTemplate(t) {
  ps.applyTemplate(t);
  showTemplates.value = false;
}
async function quickSave() {
  const name = prompt("输入模板名称：");
  if (name?.trim()) await ps.saveCurrentAsTemplate(name);
}
function selectTpl(t) {
  selectedId.value = t.id;
  editing.value = { ...t };
}
function startNew() {
  selectedId.value = "";
  editing.value = { name: "", systemPrompt: "", description: "", versions: [] };
}
async function doSave() {
  if (!editing.value.name?.trim() || !editing.value.systemPrompt?.trim()) {
    appStore.toast.warning("名称和内容不能为空");
    return;
  }
  ps.editingId = selectedId.value || "";
  await ps.saveTemplate({
    name: editing.value.name,
    systemPrompt: editing.value.systemPrompt,
    description: editing.value.description,
  });
  editing.value = null;
  selectedId.value = "";
}
async function doDelete() {
  if (!confirm(`确定删除「${editing.value.name}」？`)) return;
  await ps.deleteTemplate(editing.value.id);
  editing.value = null;
  selectedId.value = "";
}
function loadToTest() {
  ps.applyTemplate(editing.value);
  activeTab.value = "test";
}
onMounted(() => ps.loadTemplates());
</script>

<style scoped>
.prompt-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
}
.top-tabs {
  display: flex;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  padding: 0 var(--space-xl);
}
.top-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 12px 20px;
  background: none;
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-sub);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all var(--transition);
}
.top-tab:hover {
  color: var(--color-text);
}
.top-tab.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
.tab-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.two-col {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.edit-panel {
  width: 400px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow-y: auto;
}
.panel-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}
.section-actions {
  display: flex;
  gap: 8px;
}
.btn-text {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--color-primary);
  background: none;
  border: none;
  cursor: pointer;
}
.editor-area {
  font-family: var(--font-mono);
  font-size: 12px;
  resize: none;
  line-height: 1.65;
}
.char-info {
  font-size: 10px;
  color: var(--color-text-muted);
  text-align: right;
}
.params-row {
  display: flex;
  gap: var(--space-md);
  flex-wrap: wrap;
}
.param-item {
  flex: 1;
  min-width: 160px;
}
.param-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  display: block;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.slider-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.slider {
  flex: 1;
  -webkit-appearance: none;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
}
.param-val {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  width: 28px;
  text-align: right;
}
.param-hint {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 3px;
}
.param-input {
  width: 90px;
  padding: 5px 8px;
}
.run-btn {
  width: 100%;
  justify-content: center;
}
.result-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.metrics-bar {
  display: flex;
  gap: var(--space-lg);
  padding: 8px var(--space-xl);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.metric {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--color-text-sub);
  font-family: var(--font-mono);
}
.result-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-xl);
}
.result-empty {
  color: var(--color-text-muted);
  font-size: 13px;
}
.result-text {
  font-size: 14px;
  line-height: 1.75;
}
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.template-picker {
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}
.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
}
.btn-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--color-text-muted);
  cursor: pointer;
}
.picker-list {
  overflow-y: auto;
  padding: 8px;
}
.picker-item {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition);
}
.picker-item:hover {
  background: var(--color-border-light);
}
.picker-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.picker-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.ab-panel {
  padding: var(--space-lg) var(--space-xl);
  overflow-y: auto;
}
.ab-question {
  margin-bottom: var(--space-lg);
}
.question-row {
  display: flex;
  gap: var(--space-md);
  margin-top: 6px;
}
.question-row textarea {
  flex: 1;
}
.ab-columns {
  display: flex;
  gap: var(--space-lg);
  margin-bottom: var(--space-lg);
}
.ab-col {
  flex: 1;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  position: relative;
}
.ab-col.winner {
  border-color: var(--color-success);
  background: #f0fdf4;
}
.ab-col-header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ab-label {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
}
.ab-a {
  background: var(--color-primary);
}
.ab-b {
  background: var(--color-info);
}
.ab-col-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.ab-input {
  font-family: var(--font-mono);
  font-size: 12px;
  resize: none;
}
.ab-answer {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}
.ab-answer-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 6px;
}
.ab-answer-text {
  font-size: 13px;
  line-height: 1.7;
  max-height: 180px;
  overflow-y: auto;
}
.score-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border-light);
}
.score-chip {
  font-size: 10px;
  padding: 2px 7px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-full);
}
.winner-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-success);
}
.ab-verdict {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}
.verdict-reason {
  font-size: 12px;
  color: var(--color-text-sub);
  font-weight: 400;
}
.template-manager {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.tpl-list-panel {
  width: 260px;
  flex-shrink: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tpl-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}
.btn-sm {
  padding: 5px 12px;
  font-size: 12px;
}
.tpl-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}
.tpl-list-item {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition);
  margin-bottom: 4px;
}
.tpl-list-item:hover {
  background: var(--color-border-light);
}
.tpl-list-item.selected {
  background: var(--color-primary-bg);
}
.tpl-item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.tpl-item-desc {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}
.tpl-edit-panel {
  flex: 1;
  padding: var(--space-lg);
  overflow-y: auto;
}
.tpl-edit-empty {
  color: var(--color-text-muted);
  font-size: 13px;
  padding-top: 40px;
  text-align: center;
}
.tpl-edit-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.tpl-edit-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-sm);
}
.tpl-name-input {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
}
.tpl-edit-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.tpl-prompt-area {
  font-family: var(--font-mono);
  font-size: 12px;
  resize: none;
}
.version-history {
  margin-top: var(--space-lg);
  padding: var(--space-md);
  background: var(--color-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
}
.version-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 8px;
}
.version-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 11px;
}
.version-num {
  font-weight: 700;
  color: var(--color-primary);
  width: 24px;
}
.version-time {
  color: var(--color-text-muted);
  width: 80px;
}
.version-preview {
  flex: 1;
  color: var(--color-text-sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version-restore {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 13px;
}
.version-restore:hover {
  color: var(--color-primary);
}
</style>

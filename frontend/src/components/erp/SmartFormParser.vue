<!-- frontend/src/components/erp/SmartFormParser.vue -->
<!-- 智能填单：输入自然语言描述，AI 解析成结构化表单 -->
<template>
  <div class="smart-parser">
    <!-- 输入区域 -->
    <div class="input-section">
      <div class="input-header">
        <span class="input-label">用自然语言描述</span>
        <div class="example-chips">
          <span
            v-for="eg in currentExamples"
            :key="eg"
            class="example-chip"
            @click="inputText = eg"
          >
            {{ eg.slice(0, 18) }}...
          </span>
        </div>
      </div>
      <textarea
        v-model="inputText"
        class="input nl-input"
        :placeholder="currentPlaceholder"
        rows="3"
        :disabled="erpStore.parsing"
      />
      <div class="parse-actions">
        <span class="char-hint">{{ inputText.length }} 字</span>
        <button
          class="btn btn-primary"
          @click="doParse"
          :disabled="!inputText.trim() || erpStore.parsing"
        >
          <span v-if="erpStore.parsing" class="spinner" />
          {{ erpStore.parsing ? "解析中..." : "AI 解析" }}
        </button>
      </div>
    </div>

    <!-- 解析结果：报销表单 -->
    <div
      v-if="erpStore.parsedForm && erpStore.formType === 'expense'"
      class="parsed-form"
    >
      <div class="form-title">
        <span>报销申请单</span>
        <span class="form-badge">AI 自动填写</span>
      </div>

      <!-- 警告提示 -->
      <div v-if="erpStore.parsedForm.warnings?.length" class="warnings">
        <div
          v-for="w in erpStore.parsedForm.warnings"
          :key="w"
          class="warning-item"
        >
          {{ w }}
        </div>
      </div>

      <!-- 基本信息 -->
      <div class="form-grid">
        <FormField label="费用类型" :value="expenseTypeLabel" />
        <FormField label="报销事由" :value="erpStore.parsedForm.reason" />
        <FormField
          label="总金额"
          :value="`¥ ${erpStore.parsedForm.totalAmount}`"
          highlight
        />
      </div>

      <!-- 费用明细 -->
      <div class="detail-title">费用明细</div>
      <table class="detail-table">
        <thead>
          <tr>
            <th>项目</th>
            <th>金额</th>
            <th>日期</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, i) in erpStore.parsedForm.items" :key="i">
            <td>{{ item.name }}</td>
            <td class="amount">¥ {{ item.amount }}</td>
            <td>{{ item.date || "—" }}</td>
            <td>{{ item.note || "—" }}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3"><strong>合计</strong></td>
            <td class="amount total">
              ¥ {{ erpStore.parsedForm.totalAmount }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- 解析结果：请假表单 -->
    <div
      v-if="erpStore.parsedForm && erpStore.formType === 'leave'"
      class="parsed-form"
    >
      <div class="form-title">
        <span>请假申请单</span>
        <span class="form-badge">AI 自动填写</span>
      </div>

      <div v-if="erpStore.parsedForm.warnings?.length" class="warnings">
        <div
          v-for="w in erpStore.parsedForm.warnings"
          :key="w"
          class="warning-item"
        >
          {{ w }}
        </div>
      </div>

      <div class="form-grid">
        <FormField label="假期类型" :value="leaveTypeLabel" />
        <FormField label="开始日期" :value="erpStore.parsedForm.startDate" />
        <FormField label="结束日期" :value="erpStore.parsedForm.endDate" />
        <FormField
          label="请假天数（自然日）"
          :value="`${erpStore.parsedForm.days} 天`"
        />
        <FormField
          label="工作日天数"
          :value="`${erpStore.parsedForm.workdays} 天`"
          highlight
        />
        <FormField label="请假原因" :value="erpStore.parsedForm.reason" />
      </div>
    </div>

    <!-- 提交按钮（解析完成后显示） -->
    <div
      v-if="erpStore.parsedForm && !erpStore.approving && !erpStore.finalResult"
      class="submit-area"
    >
      <div class="submit-hint">确认表单内容无误后，点击提交进入审批流程</div>
      <div class="submit-row">
        <button class="btn btn-ghost" @click="erpStore.reset()">
          重新填写
        </button>
        <button class="btn btn-primary" @click="emit('submit')">
          提交审批
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useErpStore } from "@/stores/erp.js";
import FormField from "./FormField.vue";

const emit = defineEmits(["submit"]);
const erpStore = useErpStore();
const inputText = ref("");

// 示例文本（按类型）
const examples = {
  expense: [
    "上周去上海出差，高铁票来回980元，住宿两晚共1100元，餐饮三天共420元，请帮我填报销单",
    "购买了两本技术书籍，共158元，用于学习新框架",
    "和客户吃工作餐，消费460元，请帮我报销",
  ],
  leave: [
    "我下周一到周三请年假，去外地旅游，请帮我走申请流程",
    "我明天需要请一天事假，去医院体检",
    "我想请婚假，结婚典礼在下个月5号",
  ],
};

const currentExamples = computed(() => examples[erpStore.formType] || []);

const currentPlaceholder = computed(() =>
  erpStore.formType === "expense"
    ? '如："上周去北京出差，高铁来回820元，住宿两晚1160元，帮我填报销单"'
    : '如："我下周一到周三请年假，去外地旅游，请帮我走请假申请"'
);

const expenseTypeLabels = {
  travel: "差旅费",
  meal: "餐饮费",
  office: "办公用品",
  training: "培训费",
  other: "其他",
};
const leaveTypeLabels = {
  annual: "年假",
  personal: "事假",
  sick: "病假",
  compensatory: "调休",
  marriage: "婚假",
  maternity: "产假",
};

const expenseTypeLabel = computed(
  () => expenseTypeLabels[erpStore.parsedForm?.type] || "—"
);
const leaveTypeLabel = computed(
  () => leaveTypeLabels[erpStore.parsedForm?.type] || "—"
);

async function doParse() {
  await erpStore.parseForm(inputText.value);
}
</script>

<style scoped>
.smart-parser {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* 输入区 */
.input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 8px;
}
.input-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.example-chips {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.example-chip {
  font-size: 10px;
  padding: 2px 9px;
  background: var(--color-border-light);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  color: var(--color-text-sub);
  cursor: pointer;
  transition: all var(--transition);
}
.example-chip:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.nl-input {
  min-height: 80px;
}
.parse-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}
.char-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

/* 解析结果表单 */
.parsed-form {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  overflow: hidden;
}

.form-title {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border-light);
}

.form-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  background: var(--color-primary-bg);
  color: var(--color-primary);
  border-radius: var(--radius-full);
}

/* 警告 */
.warnings {
  padding: 10px 20px;
  background: #fffbeb;
  border-bottom: 1px solid #fde68a;
}
.warning-item {
  font-size: 12px;
  color: #92400e;
  padding: 2px 0;
}

/* 表单字段网格 */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1px;
  background: var(--color-border-light);
  border-bottom: 1px solid var(--color-border-light);
}

.form-field-item {
  padding: 12px 20px;
  background: var(--color-surface);
  min-height: 60px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ff-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
  margin-bottom: 4px;
}
.ff-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}
.ff-value.highlight {
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 700;
}

/* 明细表格 */
.detail-title {
  padding: 12px 20px 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}
.detail-table {
  width: 100%;
  border-collapse: collapse;
}
.detail-table th,
.detail-table td {
  padding: 8px 20px;
  font-size: 12px;
  border-bottom: 1px solid var(--color-border-light);
  text-align: left;
}
.detail-table th {
  background: var(--color-bg);
  font-weight: 600;
  color: var(--color-text-sub);
  font-size: 11px;
}
.detail-table tfoot td {
  background: var(--color-bg);
  font-weight: 600;
}
.amount {
  color: var(--color-primary);
  font-weight: 600;
}
.total {
  font-size: 15px;
}

/* 提交区 */
.submit-area {
  padding: var(--space-lg) var(--space-xl);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
}
.submit-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-bottom: var(--space-md);
}
.submit-row {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>

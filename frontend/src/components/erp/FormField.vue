<!-- frontend/src/components/erp/FormField.vue -->
<!-- 表单字段展示组件 -->
<template>
  <div class="form-field-item">
    <div class="ff-label">{{ label }}</div>
    <div class="ff-value" :class="{ highlight }">{{ value || '—' }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: String,
  value: [String, Number],
  highlight: Boolean
})
</script>

<style scoped>
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
  font-weight: 600;
}
</style>

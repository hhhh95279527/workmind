<!-- frontend/src/components/common/ToastList.vue -->
<!-- 全局 Toast 提示：挂在 App.vue，全局复用 -->
<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in appStore.toasts"
          :key="toast.id"
          class="toast"
          :class="`toast-${toast.type}`"
        >
          <span class="toast-icon">{{ icons[toast.type] }}</span>
          <span class="toast-msg">{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useAppStore } from '@/stores/app.js'

const appStore = useAppStore()
const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  box-shadow: var(--shadow-lg);
  min-width: 200px;
  max-width: 360px;
}

.toast-success { background: var(--color-success); }
.toast-error   { background: var(--color-danger); }
.toast-warning { background: var(--color-warning); }
.toast-info    { background: var(--color-info); }

.toast-icon { font-size: 14px; flex-shrink: 0; }

/* 进入/离开动画 */
.toast-enter-active,
.toast-leave-active { transition: all .3s ease; }
.toast-enter-from  { opacity: 0; transform: translateX(20px); }
.toast-leave-to    { opacity: 0; transform: translateX(20px); }
</style>

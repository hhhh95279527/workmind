<!-- frontend/src/components/chat/RoleSelector.vue -->
<!-- 角色选择器：切换 AI 的人格预设 -->
<template>
  <div class="role-selector">
    <button
      v-for="role in chatStore.roles"
      :key="role.id"
      class="role-btn"
      :class="{ active: chatStore.selectedRole === role.id }"
      @click="selectRole(role.id)"
      :title="role.desc"
    >
      <span class="role-icon">{{ role.icon }}</span>
      <span class="role-label">{{ role.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { useChatStore } from '@/stores/chat.js'

const chatStore = useChatStore()

function selectRole(id) {
  chatStore.selectedRole = id
}
</script>

<style scoped>
.role-selector {
  display: flex;
  gap: 6px;
  padding: 10px var(--space-xl);
  border-bottom: 1px solid var(--color-border-light);
  background: var(--color-surface);
  flex-shrink: 0;
  overflow-x: auto;
}

.role-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-sub);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition);
}
.role-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.role-btn.active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.role-icon { font-size: 13px; }
</style>

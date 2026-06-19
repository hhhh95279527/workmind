<!-- frontend/src/components/chat/ProfilePanel.vue -->
<!-- 用户画像面板：展示 AI 从对话中学到的用户信息 -->
<template>
  <div class="profile-panel">
    <div class="panel-header">
      <span class="panel-title">用户画像</span>
      <button class="btn-refresh" @click="chatStore.loadProfile()" title="刷新"><el-icon><Refresh /></el-icon></button>
    </div>

    <div class="panel-body">
      <!-- 画像为空时的提示 -->
      <div v-if="isEmpty" class="empty-hint">
        <el-icon class="empty-icon"><UserFilled /></el-icon>
        <div>多聊几句，AI 会自动记住你的偏好和背景</div>
      </div>

      <!-- 画像内容 -->
      <div v-else class="profile-items">
        <ProfileItem v-if="p.name"       label="姓名"   :value="p.name" icon="User" />
        <ProfileItem v-if="p.dept"       label="部门"   :value="p.dept" icon="OfficeBuilding" />
        <ProfileItem v-if="p.techLevel"  label="技术水平" :value="p.techLevel" icon="Star" />
        <ProfileItem v-if="p.currentGoal" label="当前目标" :value="p.currentGoal" icon="Aim" />

        <div v-if="p.primaryStack?.length" class="profile-row">
          <el-icon class="row-icon"><Monitor /></el-icon>
          <div>
            <div class="row-label">技术栈</div>
            <div class="row-tags">
              <span v-for="s in p.primaryStack" :key="s" class="tag tag-purple">{{ s }}</span>
            </div>
          </div>
        </div>

        <div class="profile-prefs" v-if="p.prefersShort || p.prefersCode">
          <el-icon class="row-icon"><Setting /></el-icon>
          <div>
            <div class="row-label">偏好</div>
            <div class="row-tags">
              <span v-if="p.prefersShort" class="tag tag-blue">简短回答</span>
              <span v-if="p.prefersCode"  class="tag tag-green">代码示例</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 清除画像按钮 -->
      <button v-if="!isEmpty" class="btn-clear" @click="clearProfile">
        <el-icon><Delete /></el-icon> 清除记忆
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat.js'

const chatStore = useChatStore()
const p = computed(() => chatStore.profile)

const isEmpty = computed(() => {
  const profile = p.value
  if (!profile) return true
  return !profile.name && !profile.dept && !profile.techLevel &&
         !profile.currentGoal && !profile.primaryStack?.length &&
         !profile.prefersShort && !profile.prefersCode
})

function clearProfile() {
  chatStore.profile = {}
}
</script>

<!-- ProfileItem 内联子组件 -->
<script>
const ProfileItem = {
  props: ['label', 'value', 'icon'],
  template: `
    <div class="profile-row">
      <el-icon class="row-icon"><component :is="icon" /></el-icon>
      <div>
        <div class="row-label">{{ label }}</div>
        <div class="row-value">{{ value }}</div>
      </div>
    </div>
  `,
}
export default { components: { ProfileItem } }
</script>

<style scoped>
.profile-panel {
  width: 200px;
  background: var(--color-surface);
  border-left: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--color-border-light);
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--color-text-muted);
}

.btn-refresh {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 14px;
  cursor: pointer;
  transition: color var(--transition);
}
.btn-refresh:hover { color: var(--color-primary); }

.panel-body {
  flex: 1;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  overflow-y: auto;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-lg) 0;
  color: var(--color-text-muted);
  font-size: 12px;
  text-align: center;
  line-height: 1.6;
}
.empty-icon { font-size: 28px; color: var(--color-text-muted); }

.profile-items { display: flex; flex-direction: column; gap: 12px; }

.profile-row, .profile-prefs {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.row-icon { font-size: 14px; margin-top: 1px; flex-shrink: 0; }

.row-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--color-text-muted);
  margin-bottom: 3px;
}

.row-value {
  font-size: 12px;
  color: var(--color-text);
  font-weight: 500;
}

.row-tags { display: flex; flex-wrap: wrap; gap: 4px; }

.btn-clear {
  margin-top: auto;
  padding: 7px 0;
  width: 100%;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}
.btn-clear:hover { border-color: var(--color-danger); color: var(--color-danger); }
</style>

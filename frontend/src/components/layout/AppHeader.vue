<!-- frontend/src/components/layout/AppHeader.vue -->
<!-- 顶部栏：当前页面标题 + 全局提示 + 用户信息 -->
<template>
  <header class="app-header">
    <!-- 左：页面标题 -->
    <div class="header-left">
      <h1 class="page-title">
        <el-icon class="page-icon"><component :is="currentMeta.icon" /></el-icon>
        {{ currentMeta.title }}
      </h1>
      <span v-if="currentMeta.desc" class="page-desc">{{ currentMeta.desc }}</span>
    </div>

    <!-- 右：通知 + 用户 -->
    <div class="header-right">
      <!-- 预算预警（超出预算时出现） -->
      <div v-if="budgetAlert" class="budget-alert">
        <el-icon><Warning /></el-icon> 今日用量已达 {{ budgetAlert }}，请注意控制
      </div>

      <!-- 用户头像（演示用） -->
      <div class="user-info">
        <div class="user-avatar">帅</div>
        <span class="user-name">大帅</span>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useMonitorStore } from '@/stores/monitor.js'

const route = useRoute()
const monitorStore = useMonitorStore()

// 各页面的标题和描述（icon 使用 Element Plus 图标名）
const pageMeta = {
  '/chat':      { title: '智能对话助手',   icon: 'ChatDotRound', desc: '多轮对话，流式输出，记住你的偏好' },
  '/knowledge': { title: '知识库问答',     icon: 'Reading',      desc: '上传文档，基于内容精准回答' },
  '/agent':     { title: '任务执行 Agent', icon: 'Cpu',          desc: '复杂任务自动拆解，工具调用可视化' },
  '/workflow':  { title: '内容生成工作流', icon: 'Operation',    desc: '周报、纪要、邮件、PRD 一键生成' },
  '/erp':       { title: 'ERP 报销与请假', icon: 'Tickets',      desc: '智能填单，AI 模拟审批流程' },
  '/prompt':    { title: 'Prompt 调试工具', icon: 'EditPen',     desc: 'A/B 测试，版本管理，效果对比' },
  '/monitor':   { title: '用量与成本看板', icon: 'DataAnalysis', desc: 'Token 消耗、费用、缓存命中率' },
}

const currentMeta = computed(() => {
  const path = route.path
  return pageMeta[path] || pageMeta[Object.keys(pageMeta).find(k => path.startsWith(k))] || { title: 'WorkMind', icon: 'Grid' }
})

// 预算预警（超过日预算80%时显示）
const budgetAlert = computed(() => monitorStore.budgetWarning)
</script>

<style scoped>
.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-xl);
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.page-icon { font-size: 18px; color: var(--color-primary); }

.page-desc {
  font-size: 12px;
  color: var(--color-text-muted);
  padding-left: var(--space-md);
  border-left: 1px solid var(--color-border);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.budget-alert {
  font-size: 12px;
  color: var(--color-warning);
  background: #fffbeb;
  border: 1px solid #fde68a;
  padding: 4px 12px;
  border-radius: var(--radius-full);
  animation: fadeIn .3s ease;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  transition: background var(--transition);
}
.user-info:hover { background: var(--color-border-light); }

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
}

.user-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
}

@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
</style>

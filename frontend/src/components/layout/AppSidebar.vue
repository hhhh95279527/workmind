<!-- frontend/src/components/layout/AppSidebar.vue -->
<!-- 左侧导航栏：Logo + 7个模块菜单 + 底部主题切换 -->
<template>
  <aside class="sidebar">
    <!-- Logo 区域 -->
    <div class="sidebar-logo">
      <el-icon class="logo-icon"><Briefcase /></el-icon>
      <span class="logo-text">WorkMind</span>
    </div>

    <!-- 主菜单 -->
    <nav class="sidebar-nav">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: currentPath.startsWith(item.path) }"
      >
        <el-icon class="nav-icon"><component :is="item.icon" /></el-icon>
        <span class="nav-label">{{ item.label }}</span>
        <!-- 新功能角标 -->
        <span v-if="item.badge" class="nav-badge">{{ item.badge }}</span>
      </RouterLink>
    </nav>

    <!-- 底部：主题切换 + 版本号 -->
    <div class="sidebar-footer">
      <button class="theme-toggle" @click="toggleTheme" :title="isDark ? '切换浅色' : '切换深色'">
        <el-icon><component :is="isDark ? 'Sunny' : 'Moon'" /></el-icon>
        <span>{{ isDark ? '浅色模式' : '深色模式' }}</span>
      </button>
      <div class="version">v1.0.0</div>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useAppStore } from '@/stores/app.js'

const route = useRoute()
const appStore = useAppStore()

const currentPath = computed(() => route.path)
const isDark = computed(() => appStore.theme === 'dark')

// 导航菜单配置（使用 Element Plus 图标名）
const navItems = [
  { path: '/chat',      icon: 'ChatDotRound',  label: '智能对话' },
  { path: '/knowledge', icon: 'Reading',        label: '知识库问答' },
  { path: '/agent',     icon: 'Cpu',            label: '任务 Agent' },
  { path: '/workflow',  icon: 'Operation',      label: '内容工作流' },
  { path: '/erp',       icon: 'Tickets',        label: '报销请假',  badge: 'ERP' },
  { path: '/prompt',    icon: 'EditPen',        label: 'Prompt 调试' },
  { path: '/monitor',   icon: 'DataAnalysis',   label: '用量看板' },
]

function toggleTheme() {
  appStore.toggleTheme()
}
</script>

<style scoped>
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow: hidden;
}

/* Logo */
.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}

.logo-icon {
  font-size: 20px;
  color: #fff;
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  letter-spacing: .02em;
}

/* 导航菜单 */
.sidebar-nav {
  flex: 1;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: var(--radius-md);
  color: var(--sidebar-text);
  font-size: 13px;
  font-weight: 500;
  transition: all var(--transition);
  text-decoration: none;
  position: relative;
}

.nav-item:hover {
  background: rgba(255,255,255,.07);
  color: #fff;
}

.nav-item.active {
  background: var(--sidebar-active);
  color: #fff;
  box-shadow: inset 3px 0 0 rgba(255,255,255,.4);
}

.nav-icon {
  font-size: 16px;
  width: 20px;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
  white-space: nowrap;
}

.nav-badge {
  font-size: 9px;
  font-weight: 700;
  background: var(--color-warning);
  color: #fff;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  letter-spacing: .04em;
}

/* 底部 */
.sidebar-footer {
  padding: 12px 10px;
  border-top: 1px solid rgba(255,255,255,.08);
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  background: transparent;
  border: none;
  color: var(--sidebar-text);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition);
}
.theme-toggle:hover {
  background: rgba(255,255,255,.07);
  color: #fff;
}

.version {
  text-align: center;
  font-size: 11px;
  color: rgba(255,255,255,.2);
  margin-top: 6px;
}
</style>

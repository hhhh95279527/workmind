<!-- frontend/src/App.vue -->
<!-- 根布局：左侧边栏导航 + 右侧主内容区 -->
<template>
  <div class="app-layout" :data-theme="theme">
    <!-- 左侧导航侧边栏 -->
    <AppSidebar />

    <!-- 右侧主区域 -->
    <div class="main-area">
      <!-- 顶部栏 -->
      <AppHeader />

      <!-- 页面内容（路由切换区） -->
      <main class="page-content">
        <RouterView />
      </main>
    </div>

    <!-- 全局 Toast 提示（挂在最外层，不受任何布局限制） -->
    <ToastList />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import ToastList from '@/components/common/ToastList.vue'
import { useAppStore } from '@/stores/app.js'

const appStore = useAppStore()
const theme = computed(() => appStore.theme)
</script>

<style scoped>
.app-layout {
  display: flex;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;  /* 防止 flex 子元素溢出 */
}

.page-content {
  flex: 1;
  overflow: hidden;   /* 各页面自己管理内部滚动 */
}
</style>

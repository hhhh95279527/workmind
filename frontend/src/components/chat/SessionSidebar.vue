<!-- frontend/src/components/chat/SessionSidebar.vue -->
<!-- 会话列表侧边栏：新建会话、切换会话、删除会话 -->
<template>
  <div class="session-sidebar">
    <div class="sidebar-header">
      <span class="sidebar-title">对话记录</span>
      <button class="btn-new" @click="chatStore.newSession()" title="新建对话">
        <span>＋</span>
      </button>
    </div>

    <div class="session-list">
      <div
        v-for="session in chatStore.sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === chatStore.currentId }"
        @click="chatStore.switchSession(session.id)"
      >
        <el-icon class="session-icon"><ChatDotRound /></el-icon>
        <div class="session-info">
          <div class="session-title">{{ session.title }}</div>
          <div class="session-meta">{{ session.messages.length }} 条消息</div>
        </div>
        <!-- 删除按钮（hover 显示） -->
        <button
          class="btn-delete"
          @click.stop="deleteSession(session.id)"
          title="删除会话"
        >×</button>
      </div>

      <div v-if="!chatStore.sessions.length" class="empty-hint">
        还没有对话记录
      </div>
    </div>
  </div>
</template>

<script setup>
import { useChatStore } from '@/stores/chat.js'
import { useAppStore } from '@/stores/app.js'

const chatStore = useChatStore()
const appStore  = useAppStore()

function deleteSession(id) {
  if (chatStore.sessions.length <= 1) {
    appStore.toast.warning('至少保留一个会话')
    return
  }
  chatStore.deleteSession(id)
}
</script>

<style scoped>
.session-sidebar {
  width: 200px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 10px;
  border-bottom: 1px solid var(--color-border-light);
}

.sidebar-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--color-text-muted);
}

.btn-new {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--color-primary-bg);
  color: var(--color-primary);
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition);
}
.btn-new:hover { background: var(--color-primary); color: #fff; }

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition);
  position: relative;
  group: true;
}
.session-item:hover { background: var(--color-border-light); }
.session-item.active { background: var(--color-primary-bg); }
.session-item.active .session-title { color: var(--color-primary); }

.session-icon { font-size: 14px; flex-shrink: 0; }

.session-info { flex: 1; min-width: 0; }

.session-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta {
  font-size: 10px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.btn-delete {
  display: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-border);
  color: var(--color-text-sub);
  font-size: 12px;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition);
}
.session-item:hover .btn-delete { display: flex; }
.btn-delete:hover { background: var(--color-danger); color: #fff; }

.empty-hint {
  padding: 20px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>

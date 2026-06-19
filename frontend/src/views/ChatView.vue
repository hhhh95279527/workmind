<!-- frontend/src/views/ChatView.vue -->
<!-- 对话页面：三栏布局 = 会话列表 | 消息区 | 用户画像 -->
<template>
  <div class="chat-view">
    <!-- 左：会话列表 -->
    <SessionSidebar />

    <!-- 中：消息区域 -->
    <div class="chat-main">
      <!-- 角色选择器 -->
      <RoleSelector />

      <!-- 消息列表 -->
      <div class="message-list" ref="listEl">
        <!-- 空状态 -->
        <div v-if="!chatStore.messages.length" class="empty-state">
          <el-icon class="role-icon"><component :is="roleIcon" /></el-icon>
          <div class="title">{{ currentRoleLabel }}</div>
          <div class="desc">{{ currentRoleDesc }}</div>
          <!-- 快捷问题 -->
          <div class="quick-questions">
            <button
              v-for="q in quickQuestions"
              :key="q"
              class="quick-btn"
              @click="sendQuick(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>

        <!-- 消息列表 -->
        <MessageBubble
          v-for="msg in chatStore.messages"
          :key="msg.id"
          :message="msg"
        />

        <!-- 底部锚点，用于滚动到底 -->
        <div ref="bottomEl" />
      </div>

      <!-- 输入区 -->
      <ChatInput />
    </div>

    <!-- 右：用户画像（可折叠） -->
    <ProfilePanel v-if="showProfile" />

    <!-- 折叠/展开画像按钮 -->
    <button class="profile-toggle" @click="showProfile = !showProfile" :title="showProfile ? '收起画像' : '展开画像'">
      {{ showProfile ? '›' : '‹' }}
    </button>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat.js'
import SessionSidebar from '@/components/chat/SessionSidebar.vue'
import RoleSelector from '@/components/chat/RoleSelector.vue'
import MessageBubble from '@/components/chat/MessageBubble.vue'
import ChatInput from '@/components/chat/ChatInput.vue'
import ProfilePanel from '@/components/chat/ProfilePanel.vue'

const chatStore  = useChatStore()
const listEl     = ref(null)
const bottomEl   = ref(null)
const showProfile = ref(true)

// 当前角色信息
const currentRole = computed(() =>
  chatStore.roles.find(r => r.id === chatStore.selectedRole) || { label: '通用助手', desc: '日常问答、通用任务' }
)
const currentRoleLabel = computed(() => currentRole.value.label)
const currentRoleDesc  = computed(() => currentRole.value.desc)

const roleIconMap = { default: 'ChatDotRound', tech: 'Monitor', hr: 'User', legal: 'Document' }
const roleIcon = computed(() => roleIconMap[chatStore.selectedRole] || 'ChatDotRound')

// 按角色显示不同的快捷问题
const quickQuestionsMap = {
  default: ['今天有什么需要注意的工作？', '帮我写一个工作汇报开头', '如何提高工作效率？'],
  tech:    ['解释一下 Vue3 的响应式原理', '帮我 review 一下代码', 'React 和 Vue 怎么选？'],
  hr:      ['年假怎么计算？', '试用期最长多久？', '绩效考核流程是怎样的？'],
  legal:   ['劳动合同必须包含哪些内容？', '知识产权归属如何约定？', 'NDA 协议要注意什么？'],
}
const quickQuestions = computed(() => quickQuestionsMap[chatStore.selectedRole] || quickQuestionsMap.default)

function sendQuick(q) {
  chatStore.sendMessage(q)
}

// 新消息到来时自动滚到底部
watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
    bottomEl.value?.scrollIntoView({ behavior: 'smooth' })
  }
)

// 流式 token 追加时也滚底
watch(
  () => {
    const msgs = chatStore.messages
    return msgs[msgs.length - 1]?.content
  },
  async () => {
    await nextTick()
    if (chatStore.loading) {
      bottomEl.value?.scrollIntoView({ behavior: 'instant' })
    }
  }
)

onMounted(() => {
  chatStore.init()
  chatStore.loadRoles()
  chatStore.loadProfile()
})
</script>

<style scoped>
.chat-view {
  display: flex;
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  position: relative;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-lg) var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* 空状态 */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-2xl);
  color: var(--color-text-muted);
  text-align: center;
}

.role-icon { font-size: 48px; color: var(--color-primary); margin-bottom: var(--space-md); }
.empty-state .title { font-size: 18px; font-weight: 600; color: var(--color-text); }
.empty-state .desc  { font-size: 13px; color: var(--color-text-sub); margin-bottom: var(--space-lg); }

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  justify-content: center;
  max-width: 560px;
}

.quick-btn {
  padding: 8px 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--color-text-sub);
  cursor: pointer;
  transition: all var(--transition);
}
.quick-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-bg);
}

/* 画像折叠按钮 */
.profile-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 48px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-right: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: all var(--transition);
}
.profile-toggle:hover { color: var(--color-primary); }
</style>

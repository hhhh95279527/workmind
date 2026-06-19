// frontend/src/router/index.js
// 路由配置：每个模块对应一个一级路由
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/chat',
  },
  {
    path: '/chat',
    name: 'Chat',
    component: () => import('@/views/ChatView.vue'),
    meta: { title: '智能对话', icon: '💬' },
  },
  {
    path: '/knowledge',
    name: 'Knowledge',
    component: () => import('@/views/KnowledgeView.vue'),
    meta: { title: '知识库', icon: '📚' },
  },
  {
    path: '/agent',
    name: 'Agent',
    component: () => import('@/views/AgentView.vue'),
    meta: { title: '任务 Agent', icon: '🤖' },
  },
  {
    path: '/workflow',
    name: 'Workflow',
    component: () => import('@/views/WorkflowView.vue'),
    meta: { title: '内容工作流', icon: '⚙️' },
  },
  {
    path: '/erp',
    name: 'ERP',
    component: () => import('@/views/ErpView.vue'),
    meta: { title: '报销请假', icon: '📋' },
  },
  {
    path: '/prompt',
    name: 'Prompt',
    component: () => import('@/views/PromptView.vue'),
    meta: { title: 'Prompt 调试', icon: '🔧' },
  },
  {
    path: '/monitor',
    name: 'Monitor',
    component: () => import('@/views/MonitorView.vue'),
    meta: { title: '用量看板', icon: '📊' },
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

// 路由切换时更新页面 title
router.afterEach((to) => {
  document.title = `${to.meta.title || 'WorkMind'} — WorkMind AI`
})

export default router

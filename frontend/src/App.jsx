// frontend/src/App.jsx
// 根布局：认证路由 + 左侧边栏导航 + 右侧主内容区 + antd ConfigProvider（主题联动）
import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ConfigProvider, App as AntdApp, theme as antdTheme, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppSidebar from '@/components/layout/AppSidebar.jsx'
import AppHeader from '@/components/layout/AppHeader.jsx'
import AuthGuard from '@/components/common/AuthGuard.jsx'
import { useAppStore, setMessageApi } from '@/stores/app.js'
import { pageMeta, fallbackMeta } from '@/config/navigation.jsx'

// 各页面懒加载
const LoginView     = lazy(() => import('@/views/LoginView.jsx'))
const ChatView      = lazy(() => import('@/views/ChatView.jsx'))
const KnowledgeView = lazy(() => import('@/views/KnowledgeView.jsx'))
const AgentView     = lazy(() => import('@/views/AgentView.jsx'))
const ContractList  = lazy(() => import('@/views/contract/ContractListView.jsx'))
const ReviewWorkbench = lazy(() => import('@/views/contract/ReviewWorkbench.jsx'))
const MonitorView   = lazy(() => import('@/views/MonitorView.jsx'))
const TraceWaterfall = lazy(() => import('@/views/monitor/TraceWaterfall.jsx'))
const BillingView   = lazy(() => import('@/views/monitor/BillingView.jsx'))
const AdminView     = lazy(() => import('@/views/AdminView.jsx'))
const EvalView      = lazy(() => import('@/views/admin/EvalView.jsx'))
const RuleAdminView = lazy(() => import('@/views/admin/RuleAdminView.jsx'))

function PageFallback() {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin />
    </div>
  )
}

// 将上下文内的 message 实例注入全局 store，使 toast 跟随动态主题
function MessageBridge() {
  const { message } = AntdApp.useApp()
  useEffect(() => {
    setMessageApi(message)
  }, [message])
  return null
}

export default function App() {
  const theme = useAppStore((s) => s.theme)
  const location = useLocation()
  const isDark = theme === 'dark'

  // 路由切换时更新页面 title
  useEffect(() => {
    const meta = pageMeta[location.pathname] || fallbackMeta
    document.title = `${meta.title} — WorkMind AI`
  }, [location.pathname])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#4f46e5',
          colorBgBase: isDark ? '#0f1117' : '#ffffff',
        },
      }}
    >
      <AntdApp>
        <MessageBridge />
        {/* data-theme 驱动 CSS 变量切换（global.css） */}
        <div className="app-layout" data-theme={theme}>
        <AppSidebar />

        <div className="main-area">
          <AppHeader />
          <main className="page-content">
            <Suspense fallback={<PageFallback />}>
              <Routes location={location}>
                {/* 公开页面：登录/注册 */}
                <Route path="/login" element={<LoginView />} />

                {/* 需要认证的页面 */}
                <Route path="/" element={<AuthGuard><Navigate to="/chat" replace /></AuthGuard>} />
                <Route path="/chat" element={<AuthGuard><ChatView /></AuthGuard>} />
                <Route path="/knowledge" element={<AuthGuard><KnowledgeView /></AuthGuard>} />
                <Route path="/agent" element={<AuthGuard><AgentView /></AuthGuard>} />
                <Route path="/contracts" element={<AuthGuard><ContractList /></AuthGuard>} />
                <Route path="/contracts/:id" element={<AuthGuard><ReviewWorkbench /></AuthGuard>} />
                <Route path="/monitor" element={<AuthGuard><MonitorView /></AuthGuard>} />
                <Route path="/monitor/traces" element={<AuthGuard><TraceWaterfall /></AuthGuard>} />
                <Route path="/monitor/billing" element={<AuthGuard><BillingView /></AuthGuard>} />
                <Route path="/admin" element={<AuthGuard><AdminView /></AuthGuard>} />
                <Route path="/admin/eval" element={<AuthGuard><EvalView /></AuthGuard>} />
                <Route path="/admin/billing" element={<AuthGuard><BillingView /></AuthGuard>} />
                <Route path="/admin/rules" element={<AuthGuard><RuleAdminView /></AuthGuard>} />

                <Route path="*" element={<Navigate to="/chat" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
        </div>
      </AntdApp>
    </ConfigProvider>
  )
}

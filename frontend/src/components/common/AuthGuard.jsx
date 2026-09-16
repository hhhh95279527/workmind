// frontend/src/components/common/AuthGuard.jsx
// 路由守卫：未登录重定向到登录页
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth.js'

export default function AuthGuard({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

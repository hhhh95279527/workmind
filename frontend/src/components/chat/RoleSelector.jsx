// frontend/src/components/chat/RoleSelector.jsx
// 角色选择器：切换 AI 的人格预设
import { useChatStore } from '@/stores/chat.js'
import styles from './RoleSelector.module.css'

export default function RoleSelector() {
  const roles = useChatStore((s) => s.roles)
  const selectedRole = useChatStore((s) => s.selectedRole)
  const setSelectedRole = useChatStore((s) => s.setSelectedRole)

  return (
    <div className={styles['role-selector']}>
      {roles.map((role) => (
        <button
          key={role.id}
          className={`${styles['role-btn']} ${selectedRole === role.id ? styles.active : ''}`}
          onClick={() => setSelectedRole(role.id)}
          title={role.desc}
        >
          <span className={styles['role-icon']}>{role.icon}</span>
          <span className={styles['role-label']}>{role.label}</span>
        </button>
      ))}
    </div>
  )
}

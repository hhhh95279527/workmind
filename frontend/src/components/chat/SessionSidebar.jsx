// frontend/src/components/chat/SessionSidebar.jsx
// 会话列表侧边栏：新建会话、切换会话、删除会话
import { MessageOutlined } from '@ant-design/icons'
import { useChatStore } from '@/stores/chat.js'
import styles from './SessionSidebar.module.css'

export default function SessionSidebar() {
  const sessions = useChatStore((s) => s.sessions)
  const currentId = useChatStore((s) => s.currentId)
  const newSession = useChatStore((s) => s.newSession)
  const switchSession = useChatStore((s) => s.switchSession)
  const deleteSession = useChatStore((s) => s.deleteSession)

  function handleDelete(id) {
    // 草稿始终存在，真实会话可任意删除
    deleteSession(id)
  }

  return (
    <div className={styles['session-sidebar']}>
      <div className={styles['sidebar-header']}>
        <span className={styles['sidebar-title']}>对话记录</span>
        <button className={styles['btn-new']} onClick={newSession} title="新建对话">
          <span>＋</span>
        </button>
      </div>

      <div className={styles['session-list']}>
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`${styles['session-item']} ${session.id === currentId ? styles.active : ''}`}
            onClick={() => switchSession(session.id)}
          >
            <MessageOutlined className={styles['session-icon']} />
            <div className={styles['session-info']}>
              <div className={styles['session-title']}>{session.title}</div>
              <div className={styles['session-meta']}>
                {session.loaded ? session.messages.length : (session.messageCount ?? 0)} 条消息
              </div>
            </div>
            {/* 删除按钮（hover 显示） */}
            <button
              className={styles['btn-delete']}
              onClick={(e) => {
                e.stopPropagation()
                handleDelete(session.id)
              }}
              title="删除会话"
            >×</button>
          </div>
        ))}

        {!sessions.length && (
          <div className={styles['empty-hint']}>还没有对话记录</div>
        )}
      </div>
    </div>
  )
}

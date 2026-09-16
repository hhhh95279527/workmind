// frontend/src/views/ChatView.jsx
// 对话页面：三栏布局 = 会话列表 | 消息区 | 用户画像
import { useState, useRef, useEffect } from 'react'
import {
  MessageOutlined,
  DesktopOutlined,
  UserOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import { useChatStore, selectMessages } from '@/stores/chat.js'
import SessionSidebar from '@/components/chat/SessionSidebar.jsx'
import RoleSelector from '@/components/chat/RoleSelector.jsx'
import MessageBubble from '@/components/chat/MessageBubble.jsx'
import ChatInput from '@/components/chat/ChatInput.jsx'
import ProfilePanel from '@/components/chat/ProfilePanel.jsx'
import styles from './ChatView.module.css'

// 按角色显示不同的快捷问题
const quickQuestionsMap = {
  default: ['今天有什么需要注意的工作？', '帮我写一个工作汇报开头', '如何提高工作效率？'],
  tech:    ['解释一下 Vue3 的响应式原理', '帮我 review 一下代码', 'React 和 Vue 怎么选？'],
  hr:      ['年假怎么计算？', '试用期最长多久？', '绩效考核流程是怎样的？'],
  legal:   ['劳动合同必须包含哪些内容？', '知识产权归属如何约定？', 'NDA 协议要注意什么？'],
}

const roleIconMap = {
  default: MessageOutlined,
  tech:    DesktopOutlined,
  hr:      UserOutlined,
  legal:   FileTextOutlined,
}

export default function ChatView() {
  const messages = useChatStore(selectMessages)
  const roles = useChatStore((s) => s.roles)
  const selectedRole = useChatStore((s) => s.selectedRole)
  const loading = useChatStore((s) => s.loading)
  const sendMessage = useChatStore((s) => s.sendMessage)

  const bottomEl = useRef(null)
  const [showProfile, setShowProfile] = useState(true)

  // 当前角色信息
  const currentRole =
    roles.find((r) => r.id === selectedRole) || { label: '通用助手', desc: '日常问答、通用任务' }
  const RoleIcon = roleIconMap[selectedRole] || MessageOutlined
  const quickQuestions = quickQuestionsMap[selectedRole] || quickQuestionsMap.default

  // 新消息到来时自动滚到底部
  useEffect(() => {
    bottomEl.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // 流式 token 追加时也滚底
  const lastContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (loading) {
      bottomEl.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [lastContent, loading])

  // 初始化：会话 / 角色 / 画像
  useEffect(() => {
    const s = useChatStore.getState()
    s.init()
    s.loadRoles()
    s.loadProfile()
  }, [])

  return (
    <div className={styles['chat-view']}>
      {/* 左：会话列表 */}
      <SessionSidebar />

      {/* 中：消息区域 */}
      <div className={styles['chat-main']}>
        {/* 角色选择器 */}
        <RoleSelector />

        {/* 消息列表 */}
        <div className={styles['message-list']}>
          {/* 空状态 */}
          {!messages.length && (
            <div className={styles['empty-state']}>
              <RoleIcon className={styles['role-icon']} />
              <div className={styles.title}>{currentRole.label}</div>
              <div className={styles.desc}>{currentRole.desc}</div>
              {/* 快捷问题 */}
              <div className={styles['quick-questions']}>
                {quickQuestions.map((q) => (
                  <button key={q} className={styles['quick-btn']} onClick={() => sendMessage(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 消息列表 */}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* 底部锚点，用于滚动到底 */}
          <div ref={bottomEl} />
        </div>

        {/* 输入区 */}
        <ChatInput />
      </div>

      {/* 右：用户画像（可折叠） */}
      {showProfile && <ProfilePanel />}

      {/* 折叠/展开画像按钮 */}
      <button
        className={styles['profile-toggle']}
        onClick={() => setShowProfile(!showProfile)}
        title={showProfile ? '收起画像' : '展开画像'}
      >
        {showProfile ? '›' : '‹'}
      </button>
    </div>
  )
}

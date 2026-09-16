// frontend/src/components/chat/MessageBubble.jsx
// 消息气泡：支持 Markdown 渲染、代码高亮、操作按钮
import { useState, useMemo } from 'react'
import { renderMarkdown } from '@/utils/markdown.js'
import { useChatStore } from '@/stores/chat.js'
import styles from './MessageBubble.module.css'

export default function MessageBubble({ message }) {
  const copyMessage = useChatStore((s) => s.copyMessage)
  const regenerate = useChatStore((s) => s.regenerate)

  const [copied, setCopied] = useState(false)
  const [liked, setLiked] = useState(false)
  const [disliked, setDisliked] = useState(false)

  // Markdown 渲染（内容变化时才重新解析）
  const html = useMemo(() => renderMarkdown(message.content), [message.content])

  async function copy() {
    await copyMessage(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function like() {
    setLiked(!liked)
    setDisliked(false)
  }

  function dislike() {
    setDisliked(!disliked)
    setLiked(false)
  }

  return (
    <div className={`${styles['message-wrap']} ${styles[message.role] || ''}`}>
      {/* 用户消息 */}
      {message.role === 'user' ? (
        <div className={styles['user-msg']}>
          <div className={`${styles.bubble} ${styles['user-bubble']}`}>{message.content}</div>
          <div className={styles['user-avatar']}>我</div>
        </div>
      ) : (
        /* AI 消息 */
        <div className={styles['ai-msg']}>
          <div className={styles['ai-avatar']}>AI</div>
          <div className={styles['ai-content']}>
            {/* 缓存标签 */}
            {message.fromCache && <div className={styles['cache-badge']}>缓存</div>}

            {/* 消息内容（Markdown 渲染） */}
            <div
              className={`${styles.bubble} ${styles['ai-bubble']} markdown-body`}
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {/* 流式输出时的光标 */}
            {message.streaming && <span className="cursor-blink" />}

            {/* 操作按钮（hover 显示） */}
            {!message.streaming && (
              <div className={styles['msg-actions']}>
                <button className={styles['action-btn']} onClick={copy} title="复制">
                  {copied ? '✓ 已复制' : '复制'}
                </button>
                <button className={styles['action-btn']} onClick={regenerate} title="重新生成">重新生成</button>
                <button
                  className={`${styles['action-btn']} ${styles.like} ${liked ? styles.active : ''}`}
                  onClick={like}
                  title="有帮助"
                >赞</button>
                <button
                  className={`${styles['action-btn']} ${styles.dislike} ${disliked ? styles.active : ''}`}
                  onClick={dislike}
                  title="没帮助"
                >踩</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

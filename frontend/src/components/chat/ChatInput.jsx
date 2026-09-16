// frontend/src/components/chat/ChatInput.jsx
// 消息输入框：支持多行、Enter 发送、停止生成
import { useState, useRef } from 'react'
import { useChatStore } from '@/stores/chat.js'
import styles from './ChatInput.module.css'

export default function ChatInput() {
  const loading = useChatStore((s) => s.loading)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const stopLoading = useChatStore((s) => s.stopLoading)

  const [inputText, setInputText] = useState('')
  const [focused, setFocused] = useState(false)
  const textareaEl = useRef(null)

  async function send() {
    const text = inputText.trim()
    if (!text || loading) return
    setInputText('')
    resetHeight()
    await sendMessage(text)
  }

  function handleKeydown(e) {
    // Enter 发送（Shift+Enter 换行）
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // 文本框自动撑高（最多约 5 行）
  function autoResize() {
    const el = textareaEl.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 130) + 'px'
  }

  function resetHeight() {
    if (textareaEl.current) {
      textareaEl.current.style.height = 'auto'
    }
  }

  return (
    <div className={styles['chat-input-area']}>
      <div className={`${styles['input-wrapper']} ${focused ? styles.focused : ''}`}>
        <textarea
          ref={textareaEl}
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value)
            autoResize()
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeydown}
          placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
          disabled={loading}
          rows={1}
          className={styles['message-textarea']}
        />
        <div className={styles['input-actions']}>
          {/* 字数提示 */}
          <span className={`${styles['char-count']} ${inputText.length > 3500 ? styles.warn : ''}`}>
            {inputText.length}/4000
          </span>
          {/* 停止生成 */}
          {loading ? (
            <button className={styles['btn-stop']} onClick={stopLoading}>
              ⏹ 停止
            </button>
          ) : (
            /* 发送 */
            <button
              className={styles['btn-send']}
              onClick={send}
              disabled={!inputText.trim()}
            >
              发送 ↵
            </button>
          )}
        </div>
      </div>
      <div className={styles['input-tips']}>
        <span>Enter 发送 · Shift+Enter 换行</span>
      </div>
    </div>
  )
}

// frontend/src/components/rag/RagChat.jsx
// RAG 问答界面：带来源标注的对话，展示检索到的文档片段
import { useState, useRef, useEffect, useMemo } from 'react'
import { renderMarkdown } from '@/utils/markdown.js'
import { useKnowledgeStore } from '@/stores/knowledge.js'
import styles from './RagChat.module.css'

const exampleQuestions = [
  '请介绍一下员工请假的相关规定',
  '差旅费报销标准是多少？',
  '产品的主要功能有哪些？',
]

export default function RagChat() {
  const messages = useKnowledgeStore((s) => s.messages)
  const querying = useKnowledgeStore((s) => s.querying)
  const categories = useKnowledgeStore((s) => s.categories)
  const filterCategory = useKnowledgeStore((s) => s.filterCategory)
  const setFilterCategory = useKnowledgeStore((s) => s.setFilterCategory)
  const clearMessages = useKnowledgeStore((s) => s.clearMessages)
  const query = useKnowledgeStore((s) => s.query)

  const [question, setQuestion] = useState('')
  const [focused, setFocused] = useState(false)
  const [expandedSources, setExpandedSources] = useState({})
  const bottomEl = useRef(null)
  const textareaEl = useRef(null)

  async function send() {
    const q = question.trim()
    if (!q || querying) return
    setQuestion('')
    resetHeight()
    await query(q)
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  function autoResize() {
    const el = textareaEl.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 100) + 'px'
  }

  function resetHeight() {
    if (textareaEl.current) textareaEl.current.style.height = 'auto'
  }

  function toggleSource(msgId, idx) {
    const key = `${msgId}_${idx}`
    setExpandedSources((s) => ({ ...s, [key]: !s[key] }))
  }

  // 新消息自动滚底
  useEffect(() => {
    bottomEl.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // 流式内容也滚底
  const lastContent = messages[messages.length - 1]?.content
  useEffect(() => {
    if (querying) {
      bottomEl.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [lastContent, querying])

  return (
    <div className={styles['rag-chat']}>
      {/* 分类过滤选择器 */}
      <div className={styles['filter-bar']}>
        <span className={styles['filter-label']}>搜索范围：</span>
        <select
          className={`input ${styles['filter-select']}`}
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.label}</option>
          ))}
        </select>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={clearMessages}>
            清空记录
          </button>
        )}
      </div>

      {/* 消息列表 */}
      <div className={styles['message-list']}>
        {/* 空状态 */}
        {!messages.length && (
          <div className={styles['empty-state']}>
            <div className={styles.icon}>🔍</div>
            <div className={styles.title}>向知识库提问</div>
            <div className={styles.desc}>AI 会检索相关文档，给出有来源标注的回答</div>
            {/* 示例问题 */}
            <div className={styles.examples}>
              {exampleQuestions.map((q) => (
                <button key={q} className={styles['example-btn']} onClick={() => query(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 消息 */}
        {messages.map((msg) => (
          <AiOrUserMsg
            key={msg.id}
            msg={msg}
            expandedSources={expandedSources}
            toggleSource={toggleSource}
          />
        ))}

        <div ref={bottomEl} />
      </div>

      {/* 输入框 */}
      <div className={styles['input-area']}>
        <div className={`${styles['input-wrap']} ${focused ? styles.focused : ''}`}>
          <textarea
            ref={textareaEl}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value)
              autoResize()
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeydown}
            placeholder="向知识库提问... (Enter 发送，Shift+Enter 换行)"
            disabled={querying}
            rows={1}
            className={styles['qa-input']}
          />
          <button
            className={styles['btn-send']}
            onClick={send}
            disabled={!question.trim() || querying}
          >
            {querying ? '...' : '提问'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 单条消息（用户 / AI）
function AiOrUserMsg({ msg, expandedSources, toggleSource }) {
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content])

  return (
    <div className={`${styles['message-wrap']} ${styles[msg.role] || ''}`}>
      {/* 用户问题 */}
      {msg.role === 'user' ? (
        <div className={styles['user-msg']}>
          <div className={`${styles.bubble} ${styles['user-bubble']}`}>{msg.content}</div>
        </div>
      ) : (
        /* AI 回答 */
        <div className={styles['ai-msg']}>
          {/* 检索状态提示 */}
          {msg.status && !msg.content && (
            <div className={styles['status-hint']}>
              <div className="spinner" />
              <span>{msg.status}</span>
            </div>
          )}

          {/* 来源文档（在回答之前展示） */}
          {msg.sources?.length > 0 && (
            <div className={styles['sources-panel']}>
              <div className={styles['sources-label']}>📎 参考文档（{msg.sources.length} 条）</div>
              <div className={styles['source-list']}>
                {msg.sources.map((src, i) => (
                  <div key={i} className={styles['source-item']} title={src.content}>
                    <span className={styles['source-num']}>[{i + 1}]</span>
                    <span className={styles['source-title']}>{src.title}</span>
                    <span className={styles['source-score']}>{(src.score * 100).toFixed(0)}%</span>
                    {/* 展开显示片段内容 */}
                    <button
                      className={styles['source-expand']}
                      onClick={() => toggleSource(msg.id, i)}
                    >
                      {expandedSources[`${msg.id}_${i}`] ? '▲' : '▼'}
                    </button>
                    {expandedSources[`${msg.id}_${i}`] && (
                      <div className={styles['source-content']}>{src.content}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 回答内容 */}
          {(msg.content || msg.streaming) && (
            <div
              className={`${styles.bubble} ${styles['ai-bubble']} markdown-body`}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          {msg.streaming && msg.content && <span className="cursor-blink" />}
        </div>
      )}
    </div>
  )
}

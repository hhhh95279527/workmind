// frontend/src/components/agent/ToolCallCard.jsx
// 单次工具调用卡片：工具名、入参、出参、执行时间、状态
import { useState, useMemo } from 'react'
import styles from './ToolCallCard.module.css'

const STATUS_TEXT = { running: '执行中', done: '完成', error: '失败' }

export default function ToolCallCard({ step }) {
  const [expanded, setExpanded] = useState(true)   // 默认展开，完成后可折叠

  function toggle() {
    if (step.status !== 'running') setExpanded(!expanded)
  }

  // 格式化入参为可读文本
  const argsText = useMemo(() => {
    const args = step.args
    if (!args) return ''
    if (typeof args === 'string') return args
    try {
      return JSON.stringify(args, null, 2)
    } catch {
      return String(args)
    }
  }, [step.args])

  // 格式化出参（尝试 pretty print JSON）
  const resultText = useMemo(() => {
    const r = step.result
    if (!r) return ''
    if (typeof r === 'string') {
      try {
        return JSON.stringify(JSON.parse(r), null, 2)
      } catch {
        return r
      }
    }
    try {
      return JSON.stringify(r, null, 2)
    } catch {
      return String(r)
    }
  }, [step.result])

  return (
    <div className={`${styles['tool-card']} ${styles[step.status] || ''}`}>
      {/* 卡片头部 */}
      <div className={styles['card-header']} onClick={toggle}>
        <div className={styles.left}>
          {/* 状态指示点 */}
          <span className={`dot-${step.status}`} style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
          {/* 步骤编号 */}
          <span className={styles['step-num']}>#{step.id}</span>
          <span className={styles['tool-label']}>{step.label || step.toolName}</span>
        </div>
        <div className={styles.right}>
          {/* 执行时间 */}
          {step.durationMs > 0 && (
            <span className={styles.duration}>{step.durationMs}ms</span>
          )}
          {/* 状态标签 */}
          <span className={`${styles['status-tag']} ${styles[step.status] || ''}`}>
            {STATUS_TEXT[step.status] || step.status}
          </span>
          {/* 展开箭头 */}
          <span className={styles.arrow}>{expanded ? '▴' : '▾'}</span>
        </div>
      </div>

      {/* 展开内容：入参 + 出参 */}
      {expanded && (
        <div className={styles['card-body']}>
          {/* 入参 */}
          {argsText && (
            <div className={styles['detail-section']}>
              <div className={styles['section-label']}>输入参数</div>
              <pre className={`${styles['code-block']} ${styles.args}`}>{argsText}</pre>
            </div>
          )}

          {/* 出参（工具执行结果） */}
          {step.result && (
            <div className={styles['detail-section']}>
              <div className={styles['section-label']}>执行结果</div>
              <pre className={`${styles['code-block']} ${styles.result}`}>{resultText}</pre>
            </div>
          )}

          {/* 执行中：等待动画 */}
          {step.status === 'running' && (
            <div className={styles['loading-row']}>
              <div className="spinner" />
              <span>正在执行...</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

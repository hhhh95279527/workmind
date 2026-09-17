// frontend/src/views/MonitorView.jsx
// 监控大盘：调用统计、预算、Token 消耗、调用记录
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import http from '@/utils/http.js'
import { useAppStore } from '@/stores/app.js'
import styles from './MonitorView.module.css'

const featureNames = {
  chat: '对话助手',
  knowledge: 'RAG 知识库',
  agent: '任务 Agent',
  workflow: '内容工作流',
}

function featureLabel(f) {
  return featureNames[f] || f
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div className={`${styles['metric-card']} ${styles[`color-${color}`]}`}>
      <div className={styles['metric-value']}>{value}</div>
      <div className={styles['metric-label']}>{label}</div>
      <div className={styles['metric-sub']}>{sub}</div>
    </div>
  )
}

export default function MonitorView() {
  const toast = useAppStore((s) => s.toast)
  const navigate = useNavigate()

  const [stats, setStats] = useState({})
  const [showBE, setShowBE] = useState(false)
  const [newBudget, setNewBudget] = useState(50)
  const [featureFilter, setFeatureFilter] = useState('')
  const timerRef = useRef(null)

  async function loadStats() {
    try {
      const d = await http.get('/monitor/stats')
      setStats(d)
      setNewBudget(d.overview?.dailyBudget ?? 50)
    } catch {}
  }

  async function updateBudget() {
    await http.put('/monitor/budget', { dailyBudget: newBudget })
    await loadStats()
    setShowBE(false)
    toast.success('预算已更新')
  }

  useEffect(() => {
    loadStats()
    timerRef.current = setInterval(loadStats, 10000)
    return () => clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const last7Days = stats.last7Days || []
  const byFeature = stats.byFeature || []
  const recentCalls = stats.recentCalls || []

  const maxT = Math.max(...last7Days.map((d) => d.inputT + d.outputT), 1)
  const maxC = Math.max(...byFeature.map((f) => f.calls), 1)

  function barH(val) {
    return Math.max(2, Math.round((val / maxT) * 80))
  }
  function featureBarW(calls) {
    return Math.round((calls / maxC) * 100)
  }

  const latencyItems = {
    P50: stats.latency?.p50 ?? 0,
    P90: stats.latency?.p90 ?? 0,
    P99: stats.latency?.p99 ?? 0,
    AVG: stats.latency?.avg ?? 0,
  }

  const filteredCalls = featureFilter
    ? recentCalls.filter((x) => x.feature === featureFilter)
    : recentCalls

  const featureOptions = [...new Set(recentCalls.map((c) => c.feature))].map((f) => ({
    feature: f,
    label: featureLabel(f),
  }))

  const budgetPct = stats.overview?.budgetUsedPct ?? 0

  return (
    <div className={styles['monitor-view']}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => navigate('/monitor/billing')}>
          💰 配额账单
        </button>
        <button className="btn btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={() => navigate('/monitor/traces')}>
          🔍 调用链路瀑布
        </button>
      </div>
      <div className={styles['metrics-grid']}>
        <MetricCard label="今日 API 调用" value={stats.overview?.apiCallsToday ?? 0} sub={`总计 ${stats.overview?.totalCallsToday ?? 0} 次`} color="blue" />
        <MetricCard label="缓存命中率" value={stats.overview?.cacheHitRate ?? '0%'} sub={`命中 ${stats.overview?.cacheHitsToday ?? 0} 次`} color="purple" />
        <MetricCard label="今日费用" value={`¥${stats.overview?.costCNYToday ?? 0}`} sub={`预算 ¥${stats.overview?.dailyBudget ?? 50}`} color="amber" />
        <MetricCard label="平均响应" value={`${stats.latency?.avg ?? 0}ms`} sub={`P99: ${stats.latency?.p99 ?? 0}ms`} color="green" />
      </div>

      <div className={styles['budget-bar-wrap']}>
        <div className={styles['budget-label']}>
          <span>今日预算使用</span>
          <span className={`${styles['budget-pct']} ${budgetPct >= 80 ? styles.warn : ''}`}>{budgetPct}%</span>
          <button className={styles['btn-text-xs']} onClick={() => setShowBE(!showBE)}>修改预算</button>
        </div>
        <div className={styles['budget-bar']}>
          <div
            className={`${styles['budget-fill']} ${budgetPct >= 100 ? styles.danger : budgetPct >= 80 ? styles.warn : ''}`}
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
        {showBE && (
          <div className={styles['budget-edit']}>
            <input
              type="number"
              value={newBudget}
              onChange={(e) => setNewBudget(Number(e.target.value))}
              className={`input ${styles['budget-input']}`}
              min="1"
            />
            <button className={`btn btn-primary ${styles['btn-xs']}`} onClick={updateBudget}>保存</button>
            <button className={`btn btn-ghost ${styles['btn-xs']}`} onClick={() => setShowBE(false)}>取消</button>
          </div>
        )}
      </div>

      <div className={styles['charts-row']}>
        <div className={styles['chart-card']}>
          <div className={styles['chart-title']}>近 7 日 Token 消耗</div>
          <div className={styles['bar-chart']}>
            {last7Days.map((day) => (
              <div key={day.date} className={styles['bar-col']}>
                <div className={styles['bar-group']}>
                  <div className={`${styles.bar} ${styles['input-bar']}`} style={{ height: `${barH(day.inputT)}px` }} title={`输入 ${day.inputT}`} />
                  <div className={`${styles.bar} ${styles['output-bar']}`} style={{ height: `${barH(day.outputT)}px` }} title={`输出 ${day.outputT}`} />
                </div>
                <div className={styles['bar-label']}>{day.label}</div>
                <div className={styles['bar-cost']}>¥{day.costCNY}</div>
              </div>
            ))}
          </div>
          <div className={styles['chart-legend']}>
            <span className={`${styles['legend-item']} ${styles.input}`}>输入</span>
            <span className={`${styles['legend-item']} ${styles.output}`}>输出</span>
          </div>
        </div>

        <div className={styles['chart-card']}>
          <div className={styles['chart-title']}>今日调用分布</div>
          {byFeature.length === 0 ? (
            <div className={styles['chart-empty']}>暂无今日数据</div>
          ) : (
            <div className={styles['feature-list']}>
              {byFeature.map((f) => (
                <div key={f.feature} className={styles['feature-row']}>
                  <span className={styles['feature-label']}>{f.label}</span>
                  <div className={styles['feature-bar-wrap']}>
                    <div className={styles['feature-bar']} style={{ width: `${featureBarW(f.calls)}%` }} />
                  </div>
                  <span className={styles['feature-calls']}>{f.calls}</span>
                  <span className={styles['feature-cost']}>¥{f.costCNY}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles['chart-card']}>
          <div className={styles['chart-title']}>响应时间</div>
          <div className={styles['latency-stats']}>
            {Object.entries(latencyItems).map(([key, val]) => (
              <div key={key} className={styles['lat-item']}>
                <div className={styles['lat-label']}>{key}</div>
                <div className={styles['lat-value']}>{val}ms</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles['table-card']}>
        <div className={styles['table-header']}>
          <span className={styles['table-title']}>最近调用记录</span>
          <div className={styles['table-filters']}>
            <select
              value={featureFilter}
              onChange={(e) => setFeatureFilter(e.target.value)}
              className={`input ${styles['filter-select']}`}
            >
              <option value="">全部功能</option>
              {featureOptions.map((f) => (
                <option key={f.feature} value={f.feature}>{f.label}</option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadStats}>刷新</button>
          </div>
        </div>
        <div className={styles['table-wrap']}>
          <table className={styles['call-table']}>
            <thead>
              <tr><th>时间</th><th>功能</th><th>输入 T</th><th>输出 T</th><th>费用</th><th>延迟</th><th>来源</th></tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 && (
                <tr><td colSpan={7} className={styles['empty-row']}>暂无记录，进行操作后刷新</td></tr>
              )}
              {filteredCalls.map((c, i) => (
                <tr key={i} className={c.fromCache ? styles['from-cache'] : ''}>
                  <td className={styles['time-cell']}>{fmtTime(c.time)}</td>
                  <td><span className={styles['feature-tag']}>{featureLabel(c.feature)}</span></td>
                  <td>{c.inputT}</td>
                  <td>{c.outputT}</td>
                  <td>{c.fromCache ? '—' : `¥${c.costCNY}`}</td>
                  <td>{c.fromCache ? '—' : `${c.latencyMs}ms`}</td>
                  <td>
                    <span className={c.fromCache ? styles['cache-badge'] : styles['api-badge']}>
                      {c.fromCache ? '缓存' : 'API'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

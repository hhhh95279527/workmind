// frontend/src/views/AdminView.jsx
// 管理后台主页面：用户管理、系统配置、用量统计
import { useState } from 'react'
import styles from './AdminView.module.css'

export default function AdminView() {
  const [activeTab, setActiveTab] = useState('users')

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>管理后台</h1>
        <p className={styles.subtitle}>用户管理 · 系统配置 · 用量监控</p>
      </header>

      <nav className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'users' ? styles.active : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 用户管理
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'config' ? styles.active : ''}`}
          onClick={() => setActiveTab('config')}
        >
          ⚙️ 系统配置
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'usage' ? styles.active : ''}`}
          onClick={() => setActiveTab('usage')}
        >
          📊 用量统计
        </button>
      </nav>

      <main className={styles.content}>
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'config' && <SystemConfig />}
        {activeTab === 'usage' && <UsageDashboard />}
      </main>
    </div>
  )
}

// ── 用户管理组件 ────────────────────────────────────────────────
function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  // TODO: 加载用户列表
  // useEffect(() => { loadUsers() }, [page])

  return (
    <div className={styles.section}>
      <h2>用户管理</h2>
      <p className={styles.hint}>管理系统用户、分配角色、控制访问权限</p>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>邮箱</th>
            <th>角色</th>
            <th>状态</th>
            <th>注册时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                加载中...
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                暂无用户数据
              </td>
            </tr>
          ) : (
            users.map(user => (
              <tr key={user.id}>
                <td>{user.id.slice(0, 8)}...</td>
                <td>{user.username}</td>
                <td>{user.email || '-'}</td>
                <td>
                  <span className={`${styles.badge} ${styles[user.role?.toLowerCase()]}`}>
                    {user.role || 'USER'}
                  </span>
                </td>
                <td>
                  <span className={`${styles.badge} ${styles[user.status?.toLowerCase()]}`}>
                    {user.status || 'ACTIVE'}
                  </span>
                </td>
                <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className={styles.btnSmall}>编辑</button>
                  <button className={`${styles.btnSmall} ${styles.danger}`}>禁用</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className={styles.pagination}>
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
        <span>第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>下一页</button>
      </div>
    </div>
  )
}

// ── 系统配置组件 ────────────────────────────────────────────────
function SystemConfig() {
  const [config, setConfig] = useState({})
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    // TODO: 调用 API 保存配置
    setTimeout(() => setSaving(false), 1000)
  }

  return (
    <div className={styles.section}>
      <h2>系统配置</h2>
      <p className={styles.hint}>配置 AI 模型、通知渠道、功能开关等系统级参数</p>

      <div className={styles.configGroup}>
        <h3>AI 模型配置</h3>
        <div className={styles.formRow}>
          <label>默认模型</label>
          <select value={config.model || 'gpt-4o-mini'} onChange={e => setConfig({ ...config, model: e.target.value })}>
            <option value="gpt-4o-mini">GPT-4o Mini</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="qwen-plus">Qwen Plus</option>
          </select>
        </div>
        <div className={styles.formRow}>
          <label>Temperature</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={config.temperature || 0.7}
            onChange={e => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      <div className={styles.configGroup}>
        <h3>通知渠道配置</h3>
        <div className={styles.formRow}>
          <label>SMTP 服务器</label>
          <input
            type="text"
            placeholder="smtp.example.com"
            value={config.smtpHost || ''}
            onChange={e => setConfig({ ...config, smtpHost: e.target.value })}
          />
        </div>
        <div className={styles.formRow}>
          <label>飞书 Webhook URL</label>
          <input
            type="text"
            placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
            value={config.feishuWebhook || ''}
            onChange={e => setConfig({ ...config, feishuWebhook: e.target.value })}
          />
        </div>
      </div>

      <div className={styles.configGroup}>
        <h3>功能开关</h3>
        <div className={styles.formRow}>
          <label>
            <input
              type="checkbox"
              checked={config.enableKnowledge || true}
              onChange={e => setConfig({ ...config, enableKnowledge: e.target.checked })}
            />
            启用知识库
          </label>
        </div>
        <div className={styles.formRow}>
          <label>
            <input
              type="checkbox"
              checked={config.enableWorkflow || true}
              onChange={e => setConfig({ ...config, enableWorkflow: e.target.checked })}
            />
            启用工作流
          </label>
        </div>
      </div>

      <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
        {saving ? '保存中...' : '保存配置'}
      </button>
    </div>
  )
}

// ── 用量统计组件 ────────────────────────────────────────────────
function UsageDashboard() {
  const [stats, setStats] = useState(null)
  const [days, setDays] = useState(30)

  // TODO: 加载用量数据
  // useEffect(() => { loadUsage(days) }, [days])

  return (
    <div className={styles.section}>
      <h2>用量统计</h2>
      <p className={styles.hint}>查看 API 调用量、Token 消耗、用户使用情况</p>

      <div className={styles.filterBar}>
        <label>时间范围：</label>
        <select value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>最近 7 天</option>
          <option value={30}>最近 30 天</option>
          <option value={90}>最近 90 天</option>
        </select>
      </div>

      {!stats ? (
        <div className={styles.emptyState}>
          <p>暂无统计数据</p>
        </div>
      ) : (
        <>
          <div className={styles.statsCards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>总调用次数</div>
              <div className={styles.cardValue}>{stats.total.calls.toLocaleString()}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>总 Token 消耗</div>
              <div className={styles.cardValue}>{stats.total.tokens.toLocaleString()}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>活跃用户数</div>
              <div className={styles.cardValue}>{stats.total.records}</div>
            </div>
          </div>

          <div className={styles.chartPlaceholder}>
            <p>📈 图表区域（需要集成 ECharts / Chart.js）</p>
            <p>展示每日调用趋势、功能使用分布等</p>
          </div>

          <h3>用户用量排行</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>用户</th>
                <th>邮箱</th>
                <th>调用次数</th>
                <th>Token 消耗</th>
              </tr>
            </thead>
            <tbody>
              {/* TODO: 渲染用户用量列表 */}
              <tr>
                <td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>
                  暂无数据
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

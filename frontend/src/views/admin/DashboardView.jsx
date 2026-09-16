// frontend/src/views/admin/DashboardView.jsx
// 管理后台仪表盘：概览统计
import { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, Spin } from 'antd'
import { UserOutlined, MessageOutlined, DollarOutlined, ThunderboltOutlined } from '@ant-design/icons'
import http from '@/utils/http.js'

export default function DashboardView() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    http.get('/monitor/stats')
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spin style={{ display: 'block', margin: '100px auto' }} />

  const overview = stats?.overview || {}

  return (
    <div>
      <h2 style={{ marginBottom: 24 }}>运营概览</h2>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日调用"
              value={overview.totalCallsToday || 0}
              prefix={<MessageOutlined />}
              suffix="次"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="缓存命中率"
              value={overview.cacheHitRate || '0%'}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="今日成本"
              value={overview.costCNYToday || 0}
              prefix={<DollarOutlined />}
              suffix="元"
              precision={4}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="预算使用"
              value={overview.budgetUsedPct || 0}
              suffix="%"
              valueStyle={{
                color: overview.budgetUsedPct > 80 ? '#cf1322' : '#3f8600',
              }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Token 输入" value={overview.tokenInputToday || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="Token 输出" value={overview.tokenOutputToday || 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="API 调用" value={overview.apiCallsToday || 0} suffix="次" />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="运行时间" value={Math.floor((overview.uptimeSeconds || 0) / 3600)} suffix="小时" />
          </Card>
        </Col>
      </Row>
    </div>
  )
}

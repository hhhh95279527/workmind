// frontend/src/views/LoginView.jsx
// 登录/注册页面
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, Input, Button, Card, Tabs, message, Typography } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, BankOutlined } from '@ant-design/icons'
import { useAuthStore } from '@/stores/auth.js'
import http from '@/utils/http.js'

const { Title, Text } = Typography

export default function LoginView() {
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  // ── 登录 ─────────────────────────────────────────────────────
  const handleLogin = async (values) => {
    setLoading(true)
    try {
      const data = await http.post('/auth/login', values)
      setAuth(data)
      message.success('登录成功')
      navigate('/chat', { replace: true })
    } catch (err) {
      // http 拦截器已处理 toast
    } finally {
      setLoading(false)
    }
  }

  // ── 注册 ─────────────────────────────────────────────────────
  const handleRegister = async (values) => {
    setLoading(true)
    try {
      const data = await http.post('/auth/register', values)
      setAuth(data)
      message.success('注册成功')
      navigate('/chat', { replace: true })
    } catch (err) {
      // http 拦截器已处理 toast
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card
        style={{ width: 420, borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
        styles={{ body: { padding: '32px 32px 16px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>WorkMind AI</Title>
          <Text type="secondary">企业智能办公助手</Text>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          centered
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form onFinish={handleLogin} size="large" autoComplete="off">
                  <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                    <Input prefix={<UserOutlined />} placeholder="用户名 / 邮箱" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      登录
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form onFinish={handleRegister} size="large" autoComplete="off">
                  <Form.Item name="orgName" rules={[
                    { required: true, message: '请输入组织名称' },
                    { min: 2, message: '至少 2 个字符' },
                  ]}>
                    <Input prefix={<BankOutlined />} placeholder="组织名称（将为你开通独立工作空间）" />
                  </Form.Item>
                  <Form.Item name="username" rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 3, message: '至少 3 个字符' },
                  ]}>
                    <Input prefix={<UserOutlined />} placeholder="管理员用户名" />
                  </Form.Item>
                  <Form.Item name="email" rules={[
                    { type: 'email', message: '邮箱格式不正确' },
                  ]}>
                    <Input prefix={<MailOutlined />} placeholder="邮箱（选填）" />
                  </Form.Item>
                  <Form.Item name="password" rules={[
                    { required: true, message: '请输入密码' },
                    { min: 6, message: '至少 6 个字符' },
                  ]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="密码（至少 6 位）" />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading} block>
                      注册并开通工作空间
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}

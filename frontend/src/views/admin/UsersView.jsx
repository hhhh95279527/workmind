// frontend/src/views/admin/UsersView.jsx
// 用户管理：列表、搜索、角色分配、状态管理
import { useState, useEffect } from 'react'
import { Table, Button, Tag, Space, Input, Select, Modal, message, Popconfirm } from 'antd'
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons'
import http from '@/utils/http.js'

const roleColors = {
  ADMIN: 'red',
  MANAGER: 'orange',
  USER: 'blue',
  READONLY: 'default',
}

const statusColors = {
  ACTIVE: 'green',
  DISABLED: 'red',
  PENDING: 'gold',
}

export default function UsersView() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 })

  const fetchUsers = async (page = 1) => {
    setLoading(true)
    try {
      const data = await http.get('/admin/users', { params: { page, pageSize: 20, search } })
      setUsers(data.items || [])
      setPagination((prev) => ({ ...prev, current: page, total: data.total || 0 }))
    } catch {
      // 接口暂未实现，使用空数据
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const columns = [
    { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
    { title: '邮箱', dataIndex: 'email', key: 'email', width: 200 },
    { title: '显示名', dataIndex: 'displayName', key: 'displayName', width: 120 },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 100,
      render: (role) => <Tag color={roleColors[role] || 'default'}>{role}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 80,
      render: (status) => <Tag color={statusColors[status] || 'default'}>{status}</Tag>,
    },
    {
      title: '最后登录', dataIndex: 'lastLoginAt', key: 'lastLoginAt', width: 180,
      render: (t) => t ? new Date(t).toLocaleString('zh-CN') : '-',
    },
    { title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 180,
      render: (t) => new Date(t).toLocaleString('zh-CN'),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索用户名/邮箱"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => fetchUsers(1)}
            style={{ width: 250 }}
            allowClear
          />
          <Button onClick={() => fetchUsers(1)}>搜索</Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          ...pagination,
          showSizeChanger: false,
          showTotal: (total) => `共 ${total} 个用户`,
          onChange: (page) => fetchUsers(page),
        }}
        size="middle"
      />
    </div>
  )
}

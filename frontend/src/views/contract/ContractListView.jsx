// frontend/src/views/contract/ContractListView.jsx
// 合同风险审查 · 合同列表：上传（文件/粘贴文本）、状态筛选、进入审查工作台
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Table, Tag, Modal, Tabs, Upload, Input, Form, Segmented, Popconfirm, Typography, App,
} from 'antd'
import {
  UploadOutlined, FileTextOutlined, DeleteOutlined, AuditOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { useContractStore, CONTRACT_STATUS_META } from '@/stores/contract.js'
import styles from './ContractListView.module.css'

const { TextArea } = Input
const { Text } = Typography

// 列表筛选项 → 后端 status 参数
const FILTERS = [
  { label: '全部', value: '' },
  { label: '待审查', value: 'READY' },
  { label: '待终审', value: 'WAITING_REVIEW' },
  { label: '审查中', value: 'REVIEWING' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '解析失败', value: 'FAILED' },
]

const REVIEW_TAG = {
  WAITING_REVIEW: { color: 'orange', text: '待终审' },
  APPROVED: { color: 'success', text: '已通过' },
  REJECTED: { color: 'error', text: '已驳回' },
  RUNNING: { color: 'processing', text: '审查中' },
}

export default function ContractListView() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const {
    contracts, loadingList, loadContracts, uploadFile, uploadText, deleteContract,
  } = useContractStore()
  const [filter, setFilter] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [tab, setTab] = useState('file')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => { loadContracts(filter) }, [loadContracts, filter])

  // 存在解析中/审查中的合同时自动轮询刷新
  const hasPending = useMemo(
    () => contracts.some((c) => ['PARSING', 'UPLOADED', 'REVIEWING'].includes(c.status)),
    [contracts],
  )
  useEffect(() => {
    if (!hasPending) return
    const timer = setInterval(() => loadContracts(filter), 4000)
    return () => clearInterval(timer)
  }, [hasPending, filter, loadContracts])

  const handleFileOk = async () => {
    if (!file) { message.warning('请先选择合同文件'); return }
    const title = form.getFieldValue('title')
    setSubmitting(true)
    try {
      const c = await uploadFile(file, title)
      setUploadOpen(false); setFile(null); form.resetFields()
      navigate(`/contracts/${c.id}`)
    } finally { setSubmitting(false) }
  }

  const handleTextOk = async () => {
    try {
      const v = await form.validateFields(['textTitle', 'content'])
      setSubmitting(true)
      const c = await uploadText({ title: v.textTitle, content: v.content })
      setUploadOpen(false); form.resetFields()
      navigate(`/contracts/${c.id}`)
    } finally { setSubmitting(false) }
  }

  const columns = [
    {
      title: '合同',
      dataIndex: 'title',
      key: 'title',
      render: (t, row) => (
        <div>
          <FileTextOutlined style={{ marginRight: 8, color: 'var(--color-primary)' }} />
          <a onClick={() => navigate(`/contracts/${row.id}`)}>{t}</a>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{row.fileName}</div>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s, row) => {
        const meta = CONTRACT_STATUS_META[s] || { color: 'default', text: s }
        return (
          <div>
            <Tag color={meta.color}>{meta.text}</Tag>
            {s === 'PARSING' && <div style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{row.progress ?? 0}%</div>}
            {s === 'FAILED' && row.parseError && (
              <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{row.parseError}</div>
            )}
          </div>
        )
      },
    },
    {
      title: '条款数',
      dataIndex: 'clausesCount',
      key: 'clausesCount',
      width: 90,
      render: (n) => n ?? 0,
    },
    {
      title: '最近审查',
      key: 'review',
      width: 110,
      render: (_, row) => {
        if (!row.review) return <Text type="secondary">—</Text>
        const m = REVIEW_TAG[row.review.status]
        return m ? <Tag color={m.color}>{m.text}</Tag> : <Text type="secondary">—</Text>
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (t) => new Date(t).toLocaleString('zh-CN', { hour12: false }),
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_, row) => (
        <div className={styles.rowActions}>
          <Button
            type="link" size="small" icon={<AuditOutlined />}
            disabled={row.status === 'UPLOADED' || row.status === 'PARSING' || row.status === 'FAILED'}
            onClick={() => navigate(`/contracts/${row.id}`)}
          >
            审查工作台
          </Button>
          <Popconfirm
            title="确认删除该合同？条款、审查记录与风险将一并删除"
            onConfirm={() => deleteContract(row.id)}
            okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </div>
      ),
    },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div>
          <div className={styles.title}>合同风险审查</div>
          <div className={styles.subtitle}>规则引擎保底 + AI 语义审查双轨，人工终审后生成审查意见书</div>
        </div>
        <div className={styles.toolbarRight}>
          <Segmented
            options={FILTERS.map((f) => ({ label: f.label, value: f.value }))}
            value={filter}
            onChange={(v) => setFilter(v)}
          />
          <Button icon={<ReloadOutlined />} onClick={() => loadContracts(filter)} loading={loadingList}>刷新</Button>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => { setUploadOpen(true); setTab('file') }}>
            上传合同
          </Button>
        </div>
      </div>

      <div className={styles.card}>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={contracts}
          loading={loadingList}
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          onRow={(row) => ({ onClick: () => navigate(`/contracts/${row.id}`), style: { cursor: 'pointer' } })}
        />
      </div>

      <Modal
        title="上传合同"
        open={uploadOpen}
        width={620}
        onCancel={() => setUploadOpen(false)}
        confirmLoading={submitting}
        okText={tab === 'file' ? '上传并解析' : '创建并解析'}
        onOk={tab === 'file' ? handleFileOk : handleTextOk}
        destroyOnClose
      >
        <Tabs activeKey={tab} onChange={setTab} items={[
          {
            key: 'file',
            label: '文件上传',
            children: (
              <Form form={form} layout="vertical">
                <Form.Item name="title" label="合同标题（可选，默认用文件名）">
                  <Input placeholder="例如：2026 年度 SaaS 服务合同" />
                </Form.Item>
                <Upload.Dragger
                  accept=".txt,.md,.pdf,.docx"
                  maxCount={1}
                  beforeUpload={(f) => { setFile(f); return false }}
                  onRemove={() => setFile(null)}
                >
                  <p className="ant-upload-drag-icon"><UploadOutlined /></p>
                  <p className="ant-upload-text">点击选择或拖拽合同文件到此</p>
                  <p className="ant-upload-hint">支持 .txt / .md / .pdf / .docx（扫描版 PDF 暂不支持）</p>
                </Upload.Dragger>
              </Form>
            ),
          },
          {
            key: 'text',
            label: '粘贴文本',
            children: (
              <Form form={form} layout="vertical">
                <Form.Item name="textTitle" label="合同标题"><Input placeholder="例如：员工劳动合同（赵某）" /></Form.Item>
                <Form.Item name="content" label="合同正文" rules={[{ required: true, message: '合同内容不能为空' }]}>
                  <TextArea rows={10} placeholder="粘贴合同全文，条款请使用「第一条 / 第二条 …」格式以便自动切分" />
                </Form.Item>
              </Form>
            ),
          },
        ]} />
      </Modal>
    </div>
  )
}

// frontend/src/config/navigation.jsx
// 导航配置：侧边栏菜单 + 各页面标题元信息（图标已从 Element Plus 映射为 antd）
import {
  MessageOutlined,
  ReadOutlined,
  RobotOutlined,
  BarChartOutlined,
  SolutionOutlined,
  AppstoreOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'

// 侧边栏菜单
export const navItems = [
  { path: '/chat',      icon: MessageOutlined,   label: '智能对话' },
  { path: '/knowledge', icon: ReadOutlined,      label: '知识库问答' },
  { path: '/agent',     icon: RobotOutlined,     label: '任务 Agent' },
  { path: '/contracts', icon: SafetyCertificateOutlined, label: '合同风险审查' },
  { path: '/monitor',   icon: BarChartOutlined,  label: '用量看板' },
  { path: '/admin',     icon: SettingOutlined,   label: '管理后台' },
]

// 顶部栏页面元信息
export const pageMeta = {
  '/chat':      { title: '智能对话助手',   icon: MessageOutlined,   desc: '多轮对话，流式输出，记住你的偏好' },
  '/knowledge': { title: '知识库问答',     icon: ReadOutlined,      desc: '上传文档，基于内容精准回答' },
  '/agent':     { title: '任务执行 Agent', icon: RobotOutlined,     desc: '复杂任务自动拆解，工具调用可视化' },
  '/contracts': { title: '合同风险审查',   icon: SafetyCertificateOutlined, desc: '双轨智能审查 + 人工终审，生成审查意见书' },
  '/monitor':   { title: '用量与成本看板', icon: BarChartOutlined,  desc: 'Token 消耗、费用、缓存命中率' },
  '/monitor/traces': { title: '调用链路瀑布', icon: BarChartOutlined, desc: 'LLM/工具/检索 Span 时间轴' },
  '/monitor/billing': { title: '配额与账单', icon: BarChartOutlined, desc: '月度配额、峰谷费用、功能占比、超额记录' },
  '/admin':     { title: '管理后台',       icon: SettingOutlined,   desc: '用户管理、系统配置、用量监控' },
  '/admin/eval': { title: '离线评测报告',  icon: SettingOutlined,   desc: 'precision/recall/F1、recall@k、忠实度' },
  '/admin/billing': { title: '租户配额账单', icon: SettingOutlined, desc: '全租户配额、峰谷费用与超额账期' },
  '/admin/rules': { title: '审查规则管理', icon: SettingOutlined, desc: 'review_rules 规则 CRUD 与试运行' },
}

export const fallbackMeta = { title: 'WorkMind', icon: AppstoreOutlined }

// Logo 图标
export const LogoIcon = SolutionOutlined

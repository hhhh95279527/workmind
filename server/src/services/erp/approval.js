// server/src/services/erp/approval.js
// Multi-Agent 审批流：多个 Agent 扮演不同角色，模拟企业审批过程
// 每个 Agent 都有自己的角色定位和审批视角，会相互对话
import { createChatModel } from '../model.js'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { logger } from '../../utils/logger.js'

const model = createChatModel({ temperature: 0.3 })

// ── 审批角色定义 ──────────────────────────────────────────────
const APPROVAL_ROLES = {
  applicant: {
    id:    'applicant',
    name:  '申请人',
    icon:  '👤',
    color: '#4f46e5',
    desc:  '提交申请，回答审批人的问题',
  },
  manager: {
    id:    'manager',
    name:  '直属主管',
    icon:  '👔',
    color: '#0891b2',
    desc:  '审核申请合理性，确认业务必要性',
  },
  finance: {
    id:    'finance',
    name:  '财务专员',
    icon:  '💰',
    color: '#059669',
    desc:  '审核费用合规性，确认金额和票据',
  },
  hr: {
    id:    'hr',
    name:  'HR 专员',
    icon:  '📋',
    color: '#d97706',
    desc:  '审核假期政策合规性，确认余额',
  },
  director: {
    id:    'director',
    name:  '部门总监',
    icon:  '🏢',
    color: '#dc2626',
    desc:  '大额报销或长期请假时的最终审批',
  },
}

// ── 系统提示词（每个角色的人格设定）──────────────────────────
function getRoleSystem(roleId, formData, formType) {
  const formJson = JSON.stringify(formData, null, 2)

  const systems = {
    applicant: `你是${formData.applicantName || '小王'}，正在提交${formType === 'expense' ? '报销' : '请假'}申请。
申请内容：${formJson}
要求：简洁回答审批人的问题，提供必要的说明。语气自然，像真实对话。不超过60字。`,

    manager: `你是直属主管，正在审核下属的${formType === 'expense' ? '报销' : '请假'}申请。
申请内容：${formJson}
你的职责：
1. 判断这次${formType === 'expense' ? '报销是否有业务必要性' : '请假是否影响团队工作'}
2. 金额或时间是否合理
3. 可以提问补充信息，然后给出批准/驳回/要求补充的意见
4. 语气严肃专业，像真实的主管。不超过80字。`,

    finance: `你是财务专员，负责审核报销合规性。
申请内容：${formJson}
公司规定：
- 差旅：酒店每晚不超过800元，机票必须经济舱
- 餐饮：每次不超过500元
- 单笔超过3000元需附发票扫描件
你的职责：检查是否合规，发现问题要指出。不超过80字。`,

    hr: `你是 HR 专员，负责审核请假合规性。
申请内容：${formJson}
假期规定：
- 年假：入职满1年后享有5天，每多1年增加1天，最多15天
- 事假：每年最多10天，超过3天影响年终绩效
- 病假：需提供医院证明
- 婚假：3天，需提供结婚证
你的职责：核实假期余额和规定。不超过80字。`,

    director: `你是部门总监，只处理大额报销（>5000元）或长假（>5工作日）。
申请内容：${formJson}
你态度严格但公正，关注业务合理性和成本控制。
最终给出明确的批准或驳回，并说明理由。不超过100字。`,
  }

  return systems[roleId] || systems.manager
}

// ── 审批流程规划 ──────────────────────────────────────────────
// 根据申请内容决定需要哪些审批角色
function planApprovalFlow(formData, formType) {
  const flow = ['manager']  // 主管是必须的

  if (formType === 'expense') {
    flow.push('finance')  // 报销必须过财务
    if (formData.totalAmount > 5000) {
      flow.push('director')  // 大额需要总监
    }
  } else {
    // 请假
    flow.push('hr')  // 请假必须过 HR
    if ((formData.workdays || 0) > 5) {
      flow.push('director')  // 长假需要总监
    }
  }

  return flow
}

// ── 单个审批角色的对话执行 ────────────────────────────────────
// 每个角色会经历：审查 → 可能提问 → 申请人回答 → 给出决定
async function runApproverTurn(roleId, formData, formType, conversationHistory, onEvent) {
  const role = APPROVAL_ROLES[roleId]
  const systemPrompt = getRoleSystem(roleId, formData, formType)

  logger.info('erp: approver turn', { roleId })

  // 1. 审批人查看申请，给出初步意见（可能有问题）
  const questionResponse = await model.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(`请审核这份申请。如果有疑问，可以提问；如果信息充分，直接给出审批意见（批准/驳回）。`),
    ...conversationHistory,
  ])

  const questionText = questionResponse.content

  onEvent('message', {
    from:    roleId,
    role:    role,
    content: questionText,
    type:    'question',
  })

  conversationHistory.push(new AIMessage(`[${role.name}]：${questionText}`))

  // 2. 如果审批人有提问，申请人要回答
  const hasQuestion = questionText.includes('？') || questionText.includes('?') || questionText.includes('请问') || questionText.includes('能否')

  if (hasQuestion && roleId !== 'director') {
    const applicantSystem = getRoleSystem('applicant', formData, formType)
    const answerResponse  = await model.invoke([
      new SystemMessage(applicantSystem),
      ...conversationHistory,
      new HumanMessage(`${role.name}刚才提了问题，请以申请人身份回答`),
    ])

    const answerText = answerResponse.content

    onEvent('message', {
      from:    'applicant',
      role:    APPROVAL_ROLES.applicant,
      content: answerText,
      type:    'answer',
    })

    conversationHistory.push(new AIMessage(`[申请人]：${answerText}`))

    // 3. 审批人看到回答后，给出最终决定
    const decisionResponse = await model.invoke([
      new SystemMessage(systemPrompt),
      ...conversationHistory,
      new HumanMessage(`申请人已经回答了你的问题，现在请给出最终的审批意见：批准或驳回，并说明理由。`),
    ])

    const decisionText = decisionResponse.content

    onEvent('message', {
      from:    roleId,
      role:    role,
      content: decisionText,
      type:    'decision',
    })

    conversationHistory.push(new AIMessage(`[${role.name}]：${decisionText}`))

    return { approved: isApproved(decisionText), comment: decisionText }
  }

  // 没有追问，直接从第一个回复里判断结果
  return { approved: isApproved(questionText), comment: questionText }
}

// 判断审批是否通过（简单的关键词匹配）
function isApproved(text) {
  const rejectKeywords = ['驳回', '不批', '拒绝', '不同意', '不予批准', '无法批准']
  return !rejectKeywords.some(kw => text.includes(kw))
}

// ── 主函数：运行完整审批流 ────────────────────────────────────
/**
 * @param {object} formData   - 解析好的结构化表单数据
 * @param {string} formType   - 'expense' | 'leave'
 * @param {function} onEvent  - 事件回调
 *
 * onEvent 类型：
 *   'plan'     → 公布审批流程（需要哪些角色）
 *   'approver_start' → 某个审批人开始审核
 *   'message'  → 某个角色发出一条消息（对话气泡）
 *   'approver_done'  → 某个审批人给出决定
 *   'final'    → 最终审批结果
 */
export async function runApprovalFlow(formData, formType, onEvent) {
  logger.info('erp: approval flow started', { formType })

  // 1. 规划审批流程
  const approverIds = planApprovalFlow(formData, formType)

  onEvent('plan', {
    approvers: approverIds.map(id => APPROVAL_ROLES[id]),
    totalSteps: approverIds.length,
  })

  // 全局对话历史（所有审批人共享，能看到之前的对话）
  const conversationHistory = [
    new HumanMessage(
      `申请人提交了${formType === 'expense' ? '报销' : '请假'}申请：\n${JSON.stringify(formData, null, 2)}`
    ),
  ]

  // 2. 逐个审批角色走流程
  let allApproved = true
  let finalComment = ''

  for (const roleId of approverIds) {
    const role = APPROVAL_ROLES[roleId]

    onEvent('approver_start', { roleId, role })

    const { approved, comment } = await runApproverTurn(
      roleId, formData, formType, conversationHistory, onEvent
    )

    onEvent('approver_done', { roleId, role, approved, comment })

    if (!approved) {
      allApproved  = false
      finalComment = `被${role.name}驳回：${comment}`
      break  // 任一审批人驳回，流程终止
    }

    finalComment = comment
    await new Promise(r => setTimeout(r, 300))  // 稍微停顿，让前端看清楚
  }

  // 3. 输出最终结果
  const result = {
    approved:    allApproved,
    status:      allApproved ? 'approved' : 'rejected',
    comment:     finalComment,
    approvedBy:  allApproved ? approverIds.map(id => APPROVAL_ROLES[id].name) : [],
    completedAt: new Date().toISOString(),
  }

  onEvent('final', result)
  logger.info('erp: approval flow done', { formType, approved: allApproved })

  return result
}

export { APPROVAL_ROLES }

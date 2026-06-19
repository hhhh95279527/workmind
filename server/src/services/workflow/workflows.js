// server/src/services/workflow/workflows.js
// 四个内置工作流模板：每个工作流是一系列固定步骤的 LangGraph 图
// 和 Agent 的区别：工作流步骤是开发者提前设计好的，不由模型自主决定
import { StateGraph, END, START, Annotation } from '@langchain/langgraph'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'
import { MemorySaver } from '@langchain/langgraph'
import { createChatModel } from '../model.js'
import { logger } from '../../utils/logger.js'

// 工作流用 temperature=0.7，输出更自然
const model  = createChatModel({ temperature: 0.7 })
// 代码/结构化输出用 temperature=0，更确定
const model0 = createChatModel({ temperature: 0 })
const parser = new StringOutputParser()

// 每个工作流实例都有 checkpointer，支持暂停/恢复
const checkpointer = new MemorySaver()

// ══════════════════════════════════════════════════════════════
// 工作流一：周报生成
// 步骤：输入工作要点 → 提炼亮点 → 识别风险 → 生成周报
// ══════════════════════════════════════════════════════════════
export function buildWeeklyReport() {
  const State = Annotation.Root({
    // 输入
    points:    Annotation({ reducer: (_, n) => n, default: () => '' }),     // 用户填写的工作要点
    dept:      Annotation({ reducer: (_, n) => n, default: () => '' }),     // 部门名称
    // 各步骤产出
    highlights: Annotation({ reducer: (_, n) => n, default: () => '' }),   // 提炼的亮点
    risks:      Annotation({ reducer: (_, n) => n, default: () => '' }),   // 风险/阻塞项
    nextPlan:   Annotation({ reducer: (_, n) => n, default: () => '' }),   // 下周计划
    report:     Annotation({ reducer: (_, n) => n, default: () => '' }),   // 最终周报
    // Human-in-Loop 相关
    humanFeedback: Annotation({ reducer: (_, n) => n, default: () => '' }),
  })

  // 节点1：提炼本周亮点
  async function extractHighlights(state) {
    logger.info('workflow:weekly → extractHighlights')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', '你是写作助手，从工作要点中提炼亮点。输出3-5条，每条一行，用"• "开头，不超过30字。'],
      ['human', '工作要点：\n{points}'],
    ]).pipe(model).pipe(parser)

    const highlights = await chain.invoke({ points: state.points })
    return { highlights }
  }

  // 节点2：识别风险和阻塞项
  async function identifyRisks(state) {
    logger.info('workflow:weekly → identifyRisks')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', '从工作内容中识别风险和阻塞项。如果没有明显风险，输出"本周无明显风险项"。输出2-3条，每条一行。'],
      ['human', '工作要点：\n{points}'],
    ]).pipe(model0).pipe(parser)

    const risks = await chain.invoke({ points: state.points })
    return { risks }
  }

  // 节点3：Human-in-Loop（审核节点，这里是暂停点）
  // 注意：这个函数本身什么都不做，暂停由 interruptBefore 配置实现
  async function humanReview(state) {
    logger.info('workflow:weekly → humanReview (waiting)')
    return {}
  }

  // 节点4：生成完整周报（整合前三步 + 用户反馈）
  async function generateReport(state) {
    logger.info('workflow:weekly → generateReport')

    const feedbackNote = state.humanFeedback
      ? `\n\n注意事项：${state.humanFeedback}`
      : ''

    const chain = ChatPromptTemplate.fromMessages([
      ['system', `你是专业的报告撰写助手，生成结构清晰的周报。${feedbackNote}`],
      ['human', `部门：{dept}
本周工作亮点：
{highlights}

风险与阻塞：
{risks}

请生成一份完整的周工作报告，格式：
## 本周工作总结
（整合亮点，用叙述方式）

## 主要成果
（具体成果，带数据更好）

## 风险与阻塞
（风险项及应对措施）

## 下周计划
（3-5条，具体可执行）`],
    ]).pipe(model).pipe(parser)

    const report = await chain.invoke({
      dept:       state.dept || '研发部',
      highlights: state.highlights,
      risks:      state.risks,
    })
    return { report }
  }

  return new StateGraph(State)
    .addNode('extract_highlights', extractHighlights)
    .addNode('identify_risks',     identifyRisks)
    .addNode('human_review',       humanReview)    // 暂停点
    .addNode('generate_report',    generateReport)
    .addEdge(START,                'extract_highlights')
    .addEdge('extract_highlights', 'identify_risks')
    .addEdge('identify_risks',     'human_review')
    .addEdge('human_review',       'generate_report')
    .addEdge('generate_report',     END)
    .compile({
      checkpointer,
      interruptBefore: ['human_review'],   // 在 human_review 前暂停
    })
}

// ══════════════════════════════════════════════════════════════
// 工作流二：会议纪要
// 步骤：原始记录 → 提取参会人/议题 → 提取结论 → 整理 Action Items
// ══════════════════════════════════════════════════════════════
export function buildMeetingMinutes() {
  const State = Annotation.Root({
    rawNotes:    Annotation({ reducer: (_, n) => n, default: () => '' }),
    meetingTitle:Annotation({ reducer: (_, n) => n, default: () => '' }),
    attendees:   Annotation({ reducer: (_, n) => n, default: () => '' }),
    conclusions: Annotation({ reducer: (_, n) => n, default: () => '' }),
    actionItems: Annotation({ reducer: (_, n) => n, default: () => '' }),
    minutes:     Annotation({ reducer: (_, n) => n, default: () => '' }),
    humanFeedback: Annotation({ reducer: (_, n) => n, default: () => '' }),
  })

  async function extractAttendees(state) {
    logger.info('workflow:meeting → extractAttendees')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', '从会议记录中提取参会人员和主要议题。格式：参会人：xxx、xxx\n主要议题：xxx'],
      ['human', '会议记录：\n{rawNotes}'],
    ]).pipe(model0).pipe(parser)
    const attendees = await chain.invoke({ rawNotes: state.rawNotes })
    return { attendees }
  }

  async function extractConclusions(state) {
    logger.info('workflow:meeting → extractConclusions')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', '从会议记录中提取达成的结论和决策，每条以"✓"开头，不超过25字。如无明确结论，写"待下次会议确认"。'],
      ['human', '会议记录：\n{rawNotes}'],
    ]).pipe(model0).pipe(parser)
    const conclusions = await chain.invoke({ rawNotes: state.rawNotes })
    return { conclusions }
  }

  async function extractActionItems(state) {
    logger.info('workflow:meeting → extractActionItems')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', `从会议记录中提取 Action Items（后续行动项）。
每条格式：【负责人】事项内容（截止时间）
如果没有明确负责人，写"待定"。如果没有截止时间，写"尽快"。`],
      ['human', '会议记录：\n{rawNotes}'],
    ]).pipe(model0).pipe(parser)
    const actionItems = await chain.invoke({ rawNotes: state.rawNotes })
    return { actionItems }
  }

  async function humanReview(state) {
    logger.info('workflow:meeting → humanReview (waiting)')
    return {}
  }

  async function generateMinutes(state) {
    logger.info('workflow:meeting → generateMinutes')
    const today = new Date().toLocaleDateString('zh-CN')
    const feedback = state.humanFeedback ? `\n修改意见：${state.humanFeedback}` : ''

    const chain = ChatPromptTemplate.fromMessages([
      ['system', `你是会议纪要撰写助手，生成正式会议纪要。${feedback}`],
      ['human', `会议名称：{title}
日期：${today}
{attendees}

请生成正式会议纪要，包含：
## 会议基本信息
## 会议议题与讨论
## 会议结论
{conclusions}
## Action Items
{actionItems}
## 备注`],
    ]).pipe(model).pipe(parser)

    const minutes = await chain.invoke({
      title:       state.meetingTitle || '工作例会',
      attendees:   state.attendees,
      conclusions: state.conclusions,
      actionItems: state.actionItems,
    })
    return { minutes }
  }

  return new StateGraph(State)
    .addNode('extract_attendees',   extractAttendees)
    .addNode('extract_conclusions', extractConclusions)
    .addNode('extract_actions',     extractActionItems)
    .addNode('human_review',        humanReview)
    .addNode('generate_minutes',    generateMinutes)
    .addEdge(START,                 'extract_attendees')
    .addEdge('extract_attendees',   'extract_conclusions')
    .addEdge('extract_conclusions', 'extract_actions')
    .addEdge('extract_actions',     'human_review')
    .addEdge('human_review',        'generate_minutes')
    .addEdge('generate_minutes',     END)
    .compile({
      checkpointer,
      interruptBefore: ['human_review'],
    })
}

// ══════════════════════════════════════════════════════════════
// 工作流三：邮件润色
// 步骤：草稿 → 分析语气/目的 → 检查逻辑 → Human审核 → 生成正式版本
// ══════════════════════════════════════════════════════════════
export function buildEmailPolish() {
  const State = Annotation.Root({
    draft:       Annotation({ reducer: (_, n) => n, default: () => '' }),
    recipient:   Annotation({ reducer: (_, n) => n, default: () => '' }),
    purpose:     Annotation({ reducer: (_, n) => n, default: () => '' }),  // 分析结果
    issues:      Annotation({ reducer: (_, n) => n, default: () => '' }),  // 发现的问题
    polished:    Annotation({ reducer: (_, n) => n, default: () => '' }),  // 润色后的邮件
    humanFeedback: Annotation({ reducer: (_, n) => n, default: () => '' }),
  })

  async function analyzeIntent(state) {
    logger.info('workflow:email → analyzeIntent')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', '分析邮件的写作目的、语气和受众，输出2-3句话的简短分析。'],
      ['human', '收件人：{recipient}\n邮件草稿：\n{draft}'],
    ]).pipe(model0).pipe(parser)
    const purpose = await chain.invoke({ draft: state.draft, recipient: state.recipient || '对方' })
    return { purpose }
  }

  async function checkIssues(state) {
    logger.info('workflow:email → checkIssues')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', `检查邮件草稿的问题，按优先级列出，每条不超过20字。
检查维度：语气是否合适、逻辑是否清晰、用词是否专业、有无歧义、结尾是否得体。
如果没有明显问题，输出"整体质量良好，建议微调措辞使其更专业"。`],
      ['human', '邮件草稿：\n{draft}'],
    ]).pipe(model0).pipe(parser)
    const issues = await chain.invoke({ draft: state.draft })
    return { issues }
  }

  async function humanReview(state) {
    logger.info('workflow:email → humanReview (waiting)')
    return {}
  }

  async function polishEmail(state) {
    logger.info('workflow:email → polishEmail')
    const feedback = state.humanFeedback ? `\n用户要求：${state.humanFeedback}` : ''
    const chain = ChatPromptTemplate.fromMessages([
      ['system', `你是专业邮件润色助手，根据分析结果优化邮件。${feedback}
保持原意，不改变核心内容，只优化表达。输出完整的润色后邮件，包括称呼、正文、结尾。`],
      ['human', `原始草稿：
{draft}

写作目的分析：{purpose}

发现的问题：{issues}

请输出润色后的完整邮件：`],
    ]).pipe(model).pipe(parser)

    const polished = await chain.invoke({
      draft:   state.draft,
      purpose: state.purpose,
      issues:  state.issues,
    })
    return { polished }
  }

  return new StateGraph(State)
    .addNode('analyze_intent', analyzeIntent)
    .addNode('check_issues',   checkIssues)
    .addNode('human_review',   humanReview)
    .addNode('polish_email',   polishEmail)
    .addEdge(START,            'analyze_intent')
    .addEdge('analyze_intent', 'check_issues')
    .addEdge('check_issues',   'human_review')
    .addEdge('human_review',   'polish_email')
    .addEdge('polish_email',    END)
    .compile({
      checkpointer,
      interruptBefore: ['human_review'],
    })
}

// ══════════════════════════════════════════════════════════════
// 工作流四：PRD 骨架生成
// 步骤：需求描述 → 提取功能点 → 识别约束 → 生成 PRD 结构
// ══════════════════════════════════════════════════════════════
export function buildPrdSkeleton() {
  const State = Annotation.Root({
    description: Annotation({ reducer: (_, n) => n, default: () => '' }),
    features:    Annotation({ reducer: (_, n) => n, default: () => '' }),
    constraints: Annotation({ reducer: (_, n) => n, default: () => '' }),
    prd:         Annotation({ reducer: (_, n) => n, default: () => '' }),
    humanFeedback: Annotation({ reducer: (_, n) => n, default: () => '' }),
  })

  async function extractFeatures(state) {
    logger.info('workflow:prd → extractFeatures')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', '从需求描述中提取核心功能点。按优先级排序，格式：P0/P1/P2 + 功能描述，每条一行。'],
      ['human', '需求描述：\n{description}'],
    ]).pipe(model0).pipe(parser)
    const features = await chain.invoke({ description: state.description })
    return { features }
  }

  async function identifyConstraints(state) {
    logger.info('workflow:prd → identifyConstraints')
    const chain = ChatPromptTemplate.fromMessages([
      ['system', `从需求中识别技术约束和业务约束。
技术约束：性能要求、兼容性、安全性等。
业务约束：时间限制、预算、合规要求等。
如果描述中没有提及，写"待确认"。`],
      ['human', '需求描述：\n{description}'],
    ]).pipe(model0).pipe(parser)
    const constraints = await chain.invoke({ description: state.description })
    return { constraints }
  }

  async function humanReview(state) {
    logger.info('workflow:prd → humanReview (waiting)')
    return {}
  }

  async function generatePrd(state) {
    logger.info('workflow:prd → generatePrd')
    const feedback = state.humanFeedback ? `\n补充说明：${state.humanFeedback}` : ''

    const chain = ChatPromptTemplate.fromMessages([
      ['system', `你是产品经理助手，生成结构化 PRD 文档骨架。${feedback}
输出完整的 Markdown 格式 PRD，各章节有具体内容，不要只写标题。`],
      ['human', `需求描述：{description}

功能点：
{features}

约束条件：
{constraints}

生成 PRD 文档，包含以下章节：
## 一、背景与目标
## 二、核心功能
## 三、详细需求
## 四、非功能需求
## 五、验收标准
## 六、里程碑计划`],
    ]).pipe(model).pipe(parser)

    const prd = await chain.invoke({
      description: state.description,
      features:    state.features,
      constraints: state.constraints,
    })
    return { prd }
  }

  return new StateGraph(State)
    .addNode('extract_features',    extractFeatures)
    .addNode('identify_constraints',identifyConstraints)
    .addNode('human_review',        humanReview)
    .addNode('generate_prd',        generatePrd)
    .addEdge(START,                 'extract_features')
    .addEdge('extract_features',    'identify_constraints')
    .addEdge('identify_constraints','human_review')
    .addEdge('human_review',        'generate_prd')
    .addEdge('generate_prd',         END)
    .compile({
      checkpointer,
      interruptBefore: ['human_review'],
    })
}

// ── 工作流注册表 ──────────────────────────────────────────────
// 每次请求创建新实例（checkpointer 基于 thread_id 隔离，复用 graph 实例没问题）
// 但为了简单演示，这里每次调用都创建新实例
export const WORKFLOW_BUILDERS = {
  weekly_report:   buildWeeklyReport,
  meeting_minutes: buildMeetingMinutes,
  email_polish:    buildEmailPolish,
  prd_skeleton:    buildPrdSkeleton,
}

// 前端展示用的元数据
export const WORKFLOW_META = {
  weekly_report: {
    id:    'weekly_report',
    title: '周报生成',
    icon:  '📊',
    desc:  '输入本周工作要点，自动提炼亮点、识别风险，生成规范周报',
    inputLabel:       '本周工作要点',
    inputPlaceholder: '请简单描述本周完成的主要工作，一条一行...',
    extraField: { key: 'dept', label: '部门名称', placeholder: '如：前端研发组' },
    nodes: [
      { id: 'extract_highlights', label: '提炼工作亮点' },
      { id: 'identify_risks',     label: '识别风险阻塞' },
      { id: 'human_review',       label: '人工审核',  isHuman: true },
      { id: 'generate_report',    label: '生成周报' },
    ],
    resultKey: 'report',
  },
  meeting_minutes: {
    id:    'meeting_minutes',
    title: '会议纪要',
    icon:  '📝',
    desc:  '粘贴会议原始记录，自动提取结论和 Action Items，生成正式纪要',
    inputLabel:       '会议原始记录',
    inputPlaceholder: '粘贴会议记录，包括讨论内容、发言摘要等...',
    extraField: { key: 'meetingTitle', label: '会议名称', placeholder: '如：产品周会 2024-03' },
    nodes: [
      { id: 'extract_attendees',   label: '提取参会人与议题' },
      { id: 'extract_conclusions', label: '提取会议结论' },
      { id: 'extract_actions',     label: '整理 Action Items' },
      { id: 'human_review',        label: '人工审核',  isHuman: true },
      { id: 'generate_minutes',    label: '生成纪要' },
    ],
    resultKey: 'minutes',
  },
  email_polish: {
    id:    'email_polish',
    title: '邮件润色',
    icon:  '✉️',
    desc:  '输入邮件草稿，AI 分析语气和问题，润色成正式邮件',
    inputLabel:       '邮件草稿',
    inputPlaceholder: '粘贴你的邮件草稿...',
    extraField: { key: 'recipient', label: '收件人/场景', placeholder: '如：客户、上级、合作方' },
    nodes: [
      { id: 'analyze_intent', label: '分析写作意图' },
      { id: 'check_issues',   label: '检查问题' },
      { id: 'human_review',   label: '人工审核',  isHuman: true },
      { id: 'polish_email',   label: '生成润色版本' },
    ],
    resultKey: 'polished',
  },
  prd_skeleton: {
    id:    'prd_skeleton',
    title: 'PRD 骨架',
    icon:  '📋',
    desc:  '输入需求描述，自动提取功能点和约束，生成结构化 PRD 文档',
    inputLabel:       '需求描述',
    inputPlaceholder: '用自然语言描述你的产品需求...',
    nodes: [
      { id: 'extract_features',    label: '提取功能点' },
      { id: 'identify_constraints',label: '识别约束条件' },
      { id: 'human_review',        label: '人工审核',  isHuman: true },
      { id: 'generate_prd',        label: '生成 PRD' },
    ],
    resultKey: 'prd',
  },
}

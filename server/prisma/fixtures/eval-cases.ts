// server/prisma/fixtures/eval-cases.ts
// 离线评测集（平台基线集，tenantId=null）：
//  - RISK_DETECT 25 条：8 份全量埋雷合同（contractRef 引用 fixtures/contracts.ts）+ 14 条单风险迷你条款 + 3 条负样本
//  - RAG_RECALL   8 条：法律问题 → 应命中的法规 docId（评 recall@3；无 embedding key 时走关键词降级，故问题内嵌条文原句锚点）
//  - FAITHFULNESS 7 条：RAG 问答对，LLM-as-Judge 按 0/1 判忠实度（无真实 key 时该组 skipped，不阻塞）
// 标注口径：expected.ruleCodes = 条款客观上触及该规则法律风险点、需要人工关注/修订的规则集合；
//          合法但被关键词粗召回带出的命中算 FP（如实习协议社保条款），用于量化规则精度。

export type EvalCaseTypeSeed = 'RISK_DETECT' | 'RAG_RECALL' | 'FAITHFULNESS'

export interface EvalCaseSeed {
  /** 业务主键（固定 id，upsert 幂等） */
  id: string
  type: EvalCaseTypeSeed
  title: string
  input: Record<string, unknown>
  expected: Record<string, unknown>
  tags: string[]
}

// ── RISK_DETECT：8 份全量埋雷合同（expected 来自规则引擎实际回归 + 逐条人工核验埋雷点）──
const CONTRACT_CASES: Array<{ ref: string; title: string; ruleCodes: string[]; tags: string[]; note?: string }> = [
  {
    ref: 'seed_contract_labor_risky',
    title: '全量合同-两年期劳动合同（8 类风险）',
    ruleCodes: [
      'LABOR-TRIAL-PERIOD', 'LABOR-TRIAL-WAGE', 'LABOR-DEPOSIT-ID', 'LABOR-SOCIAL-INSURANCE',
      'LABOR-WORKER-PENALTY', 'LABOR-NONCOMPETE', 'COM-NO-TERMINATE', 'COM-JURISDICTION',
    ],
    tags: ['sample-contract', 'labor'],
  },
  {
    ref: 'seed_contract_software_risky',
    title: '全量合同-CRM 软件开发合同（5 类风险）',
    ruleCodes: [
      'COM-PENALTY-HIGH', 'COM-BLANK-EXEMPTION', 'COM-NO-TERMINATE',
      'COM-FINAL-INTERPRET', 'COM-JURISDICTION',
    ],
    tags: ['sample-contract', 'commercial'],
  },
  {
    ref: 'seed_contract_house_rent',
    title: '全量合同-商铺租赁合同（3 类风险）',
    ruleCodes: ['COM-DEPOSIT-LIMIT', 'COM-PENALTY-HIGH', 'COM-BLANK-EXEMPTION'],
    tags: ['sample-contract', 'commercial'],
  },
  {
    ref: 'seed_contract_nda',
    title: '全量合同-技术保密协议（2 类风险）',
    ruleCodes: ['COM-FINAL-INTERPRET', 'COM-JURISDICTION'],
    tags: ['sample-contract', 'commercial'],
  },
  {
    ref: 'seed_contract_tech_service',
    title: '全量合同-信息化运维服务合同（4 类风险）',
    ruleCodes: ['COM-PENALTY-HIGH', 'COM-NO-TERMINATE', 'COM-FINAL-INTERPRET', 'COM-JURISDICTION'],
    tags: ['sample-contract', 'commercial'],
    note: '5%/次且 30% 封顶的违约金语义上偏高，但规则名为"可能过高"属提示性召回，计为 TP。',
  },
  {
    ref: 'seed_contract_procurement',
    title: '全量合同-办公设备采购合同（5 类风险）',
    ruleCodes: [
      'COM-DEPOSIT-LIMIT', 'COM-PENALTY-HIGH', 'COM-BLANK-EXEMPTION',
      'COM-NO-TERMINATE', 'COM-JURISDICTION',
    ],
    tags: ['sample-contract', 'commercial'],
  },
  {
    ref: 'seed_contract_loan',
    title: '全量合同-个人借款合同（4 类风险）',
    ruleCodes: ['COM-PENALTY-HIGH', 'COM-NO-TERMINATE', 'COM-FINAL-INTERPRET', 'COM-JURISDICTION'],
    tags: ['sample-contract', 'commercial'],
  },
  {
    ref: 'seed_contract_intern',
    title: '全量合同-实习生实习协议（3 类风险 + 1 已知误报）',
    ruleCodes: ['LABOR-WORKER-PENALTY', 'LABOR-DEPOSIT-ID', 'COM-JURISDICTION'],
    tags: ['sample-contract', 'labor', 'known-fp'],
    note: '在校生实习无需缴纳社保是合法安排，关键词粗召回对"无需缴纳社会保险"误报 LABOR-SOCIAL-INSURANCE，计为 FP 纳入 precision。',
  },
]

// ── RISK_DETECT：单风险迷你条款（每条刻意埋一个风险点，验证规则精准触发）──
const MINI_CASES: Array<{ title: string; text: string; labor: boolean; ruleCodes: string[] }> = [
  {
    title: '迷你条款-试用期七个月超法定上限',
    text: `劳动合同书
甲方（用人单位）：甲公司。乙方（劳动者）：张某。
第一条 合同期限。本合同期限为三年。
第二条 试用期。试用期为七个月，试用期内甲方可随时解除合同。`,
    labor: true,
    ruleCodes: ['LABOR-TRIAL-PERIOD'],
  },
  {
    title: '迷你条款-试用期工资按 75% 发放',
    text: `第一条 试用期工资。试用期工资按转正工资的 75% 发放。`,
    labor: true,
    ruleCodes: ['LABOR-TRIAL-WAGE'],
  },
  {
    title: '迷你条款-毕业证书交单位保管',
    text: `第一条 证件管理。乙方的毕业证书、学位证书原件交由甲方人事部门统一保管。`,
    labor: true,
    ruleCodes: ['LABOR-DEPOSIT-ID'],
  },
  {
    title: '迷你条款-入职收取服装费',
    text: `第一条 入职费用。乙方入职时向甲方缴纳服装费 300 元。`,
    labor: true,
    ruleCodes: ['LABOR-DEPOSIT-ID'],
  },
  {
    title: '迷你条款-自愿申请放弃养老保险',
    text: `第一条 保险。乙方自愿申请放弃缴纳养老保险，甲方不承担由此产生的责任。`,
    labor: true,
    ruleCodes: ['LABOR-SOCIAL-INSURANCE'],
  },
  {
    title: '迷你条款-竞业限制义务未约定经济补偿',
    text: `第一条 竞业限制。乙方离职后一年内承担竞业限制义务，本条未约定经济补偿。`,
    labor: true,
    ruleCodes: ['LABOR-NONCOMPETE'],
  },
  {
    title: '迷你条款-主动离职支付违约金',
    text: `第一条 违约责任。乙方若主动离职，应向甲方支付违约金 20000 元。`,
    labor: true,
    ruleCodes: ['LABOR-WORKER-PENALTY'],
  },
  {
    title: '迷你条款-违约金为合同总金额 50%',
    text: `软件开发合同
甲方：某公司。乙方：某工作室。
第一条 违约责任。乙方严重违约导致合同解除的，应支付合同总金额 50% 的违约金。`,
    labor: false,
    ruleCodes: ['COM-PENALTY-HIGH'],
  },
  {
    title: '迷你条款-逾期付款千分之六滞纳金',
    text: `第一条 逾期付款。甲方逾期支付服务费的，每日按千分之六支付滞纳金。`,
    labor: false,
    ruleCodes: ['COM-PENALTY-HIGH'],
  },
  {
    title: '迷你条款-最终解释权归商家',
    text: `营销活动须知：本次活动最终解释权归商家所有。`,
    labor: false,
    ruleCodes: ['COM-FINAL-INTERPRET'],
  },
  {
    title: '迷你条款-争议由甲方所在地法院管辖',
    text: `第一条 争议解决。因本合同发生的争议，由甲方所在地人民法院管辖。`,
    labor: false,
    ruleCodes: ['COM-JURISDICTION'],
  },
  {
    title: '迷你条款-乙方不得解除合同',
    text: `第一条 合同解除。项目验收合格前，乙方不得以任何理由解除合同。`,
    labor: false,
    ruleCodes: ['COM-NO-TERMINATE'],
  },
  {
    title: '迷你条款-任何损失均不赔偿',
    text: `第一条 责任限制。乙方对任何损失均不承担赔偿责任。`,
    labor: false,
    ruleCodes: ['COM-BLANK-EXEMPTION'],
  },
  {
    title: '迷你条款-定金按合同总额 30%',
    text: `第一条 定金。乙方支付的定金按合同总金额的 30% 计算，签约时付清。`,
    labor: false,
    ruleCodes: ['COM-DEPOSIT-LIMIT'],
  },
]

// ── RISK_DETECT：负样本（合法条款，期望零命中，专测 precision 与 scope 隔离）──
const NEGATIVE_CASES: Array<{ title: string; text: string; labor: boolean; note: string }> = [
  {
    title: '负样本-商事合同正常押金（LABOR 规则不应跨界）',
    text: `商铺租赁合同
出租方甲方，承租方乙方。
第一条 押金。乙方支付押金 24000 元，合同期满结清费用后全额无息退还。`,
    labor: false,
    note: '押金在租赁关系中是正常安排，scope=LABOR 的押金规则不得在商事合同上误报。',
  },
  {
    title: '负样本-正常账期付款条款',
    text: `第一条 付款方式。甲方应于收到合规发票后 15 个工作日内以银行转账方式支付当期服务费。`,
    labor: false,
    note: '不含任何规则触发词的常规付款条款。',
  },
  {
    title: '负样本-劳动合同合法报酬条款',
    text: `劳动合同书
甲方用人单位，乙方劳动者。
第一条 劳动报酬。甲方于每月 10 日前以货币形式足额支付乙方劳动报酬，并依法办理用工备案。`,
    labor: true,
    note: '合法工资支付条款，不应触发任何劳动/通用规则。',
  },
]

// ── RAG_RECALL：问题措辞内嵌条文原句锚点（关键词降级依赖字面 contains，向量模式同样适用）──
const RAG_CASES: Array<{ title: string; question: string; docIds: string[] }> = [
  {
    title: '检索-试用期法定上限',
    question: '我想查询以下条文的出处与完整内容：试用期不得超过一个月，试用期不得超过六个月',
    docIds: ['legal_labor_contract_law'],
  },
  {
    title: '检索-不得扣押证件收取财物',
    question: '单位能不能扣证收钱？条文原文：不得扣押劳动者的居民身份证和其他证件，不得要求劳动者提供担保或者以其他名义向劳动者收取财物',
    docIds: ['legal_labor_contract_law'],
  },
  {
    title: '检索-服务期违约金上限',
    question: '劳动者服务期违约金怎么算？劳动者违反服务期约定的，违约金的数额不得超过用人单位提供的培训费用',
    docIds: ['legal_labor_contract_law'],
  },
  {
    title: '检索-竞业限制期限与补偿',
    question: '竞业限制到底多长时间、要不要给补偿？在竞业限制期限内按月给予劳动者经济补偿，竞业限制的约定不得违反法律',
    docIds: ['legal_labor_contract_law'],
  },
  {
    title: '检索-违约金过高可请求调减',
    question: '违约金太高了能不能要求法院调低？约定的违约金过分高于造成的损失的，可以请求予以适当减少',
    docIds: ['legal_civil_code_contract'],
  },
  {
    title: '检索-定金不得超过标的额 20%',
    question: '定金最多能约定多少？不得超过主合同标的额的百分之二十，超过部分不产生定金的效力',
    docIds: ['legal_civil_code_contract'],
  },
  {
    title: '检索-格式条款无效情形',
    question: '商家自己拟的条款说最终解释权归他所有有效吗？提供格式条款一方排除对方主要权利，该格式条款无效',
    docIds: ['legal_civil_code_contract'],
  },
  {
    title: '检索-协议管辖可选法院',
    question: '合同打官司可以约定去哪个法院？协议选择被告住所地，与争议有实际联系的地点的人民法院管辖',
    docIds: ['legal_civil_procedure_law'],
  },
]

// ── FAITHFULNESS：LLM-as-Judge（expected.faithful: 1=忠实于依据，0=矛盾/编造）──
const FAITHFULNESS_CASES: Array<{
  title: string
  question: string
  answer: string
  context: string
  faithful: 0 | 1
}> = [
  {
    title: '忠实-试用期三档上限回答正确',
    question: '劳动合同试用期最长能约定多久？',
    answer: '合同期限三个月以上不满一年的试用期不得超过一个月；一年以上不满三年的不得超过二个月；三年以上固定期限和无固定期限合同不得超过六个月。',
    context: '《劳动合同法》第十九条：劳动合同期限三个月以上不满一年的，试用期不得超过一个月；一年以上不满三年的，不得超过二个月；三年以上固定期限和无固定期限的劳动合同，试用期不得超过六个月。',
    faithful: 1,
  },
  {
    title: '忠实-定金 20% 上限回答正确',
    answer: '定金数额不得超过主合同标的额的百分之二十，超过部分不产生定金的效力。',
    question: '合同定金比例的法定上限是多少？',
    context: '《民法典》第五百八十六条：定金的数额由当事人约定；但是，不得超过主合同标的额的百分之二十，超过部分不产生定金的效力。',
    faithful: 1,
  },
  {
    title: '不忠实-谎称试用期可达一年',
    question: '劳动合同试用期最长能约定多久？',
    answer: '只要双方协商一致，试用期最长可以约定一年，法律没有强制性限制。',
    context: '《劳动合同法》第十九条：试用期最长不得超过六个月，且以合同期限三年以上为前提。',
    faithful: 0,
  },
  {
    title: '忠实-协议管辖法院回答正确',
    question: '合同纠纷可以约定由哪些法院管辖？',
    answer: '可以书面协议选择被告住所地、合同履行地、合同签订地、原告住所地、标的物所在地等与争议有实际联系的地点的人民法院管辖。',
    context: '《民事诉讼法》第三十五条：当事人可以书面协议选择被告住所地、合同履行地、合同签订地、原告住所地、标的物所在地等与争议有实际联系的地点的人民法院管辖。',
    faithful: 1,
  },
  {
    title: '不忠实-谎称定金上限 50%',
    question: '合同定金比例的法定上限是多少？',
    answer: '定金最高可以约定到主合同标的额的 50%，超过 50% 的部分才无效。',
    context: '《民法典》第五百八十六条：定金不得超过主合同标的额的百分之二十，超过部分不产生定金的效力。',
    faithful: 0,
  },
  {
    title: '不忠实-谎称竞业限制可约定五年',
    question: '竞业限制期限最长可以约定几年？',
    answer: '竞业限制期限由双方自由约定，最长可以约定五年，期限内用人单位无需支付补偿。',
    context: '《劳动合同法》第二十三条、第二十四条：竞业限制应约定并按月给予经济补偿，期限不得超过二年。',
    faithful: 0,
  },
  {
    title: '忠实-不得扣证收财物回答正确',
    question: '用人单位入职时能不能扣押身份证或收押金？',
    answer: '不能。用人单位不得扣押劳动者的居民身份证和其他证件，也不得要求劳动者提供担保或以其他名义收取财物。',
    context: '《劳动合同法》第九条：用人单位招用劳动者，不得扣押劳动者的居民身份证和其他证件，不得要求劳动者提供担保或者以其他名义向劳动者收取财物。',
    faithful: 1,
  },
]

export const EVAL_CASES: EvalCaseSeed[] = [
  // RISK_DETECT 1~8：全量埋雷合同
  ...CONTRACT_CASES.map((c, i) => ({
    id: `eval_risk_${String(i + 1).padStart(3, '0')}`,
    type: 'RISK_DETECT' as const,
    title: c.title,
    input: { contractRef: c.ref },
    expected: c.note ? { ruleCodes: c.ruleCodes, note: c.note } : { ruleCodes: c.ruleCodes },
    tags: c.tags,
  })),
  // RISK_DETECT 9~22：单风险迷你条款
  ...MINI_CASES.map((c, i) => ({
    id: `eval_risk_${String(i + 9).padStart(3, '0')}`,
    type: 'RISK_DETECT' as const,
    title: c.title,
    input: { text: c.text, labor: c.labor },
    expected: { ruleCodes: c.ruleCodes },
    tags: ['mini-clause', c.labor ? 'labor' : 'commercial'],
  })),
  // RISK_DETECT 23~25：负样本
  ...NEGATIVE_CASES.map((c, i) => ({
    id: `eval_risk_${String(i + 23).padStart(3, '0')}`,
    type: 'RISK_DETECT' as const,
    title: c.title,
    input: { text: c.text, labor: c.labor },
    expected: { ruleCodes: [], note: c.note },
    tags: ['negative', c.labor ? 'labor' : 'commercial'],
  })),
  // RAG_RECALL 1~8
  ...RAG_CASES.map((c, i) => ({
    id: `eval_rag_${String(i + 1).padStart(3, '0')}`,
    type: 'RAG_RECALL' as const,
    title: c.title,
    input: { question: c.question },
    expected: { docIds: c.docIds, k: 3 },
    tags: ['legal-search'],
  })),
  // FAITHFULNESS 1~7
  ...FAITHFULNESS_CASES.map((c, i) => ({
    id: `eval_faith_${String(i + 1).padStart(3, '0')}`,
    type: 'FAITHFULNESS' as const,
    title: c.title,
    input: { question: c.question, answer: c.answer, context: c.context },
    expected: { faithful: c.faithful },
    tags: c.faithful === 1 ? ['faithful-positive'] : ['faithful-negative'],
  })),
]

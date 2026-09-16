// server/src/contract/rules/rule.engine.ts
// 声明式规则引擎：对每条条款零成本确定性扫描，产出 RULE 来源风险，保证召回底线。
// 命中必须带原文句子作为 quote —— 规则轨同样不允许"无中生有"。
import type { ReviewRule, Severity } from '@prisma/client'

export interface EngineClause {
  id: string
  indexNo: number
  title: string
  content: string
}

export interface RuleFinding {
  ruleId: string
  code: string
  severity: Severity
  category: string
  title: string
  clauseId: string
  clauseTitle: string
  quote: string
  analysis: string
  suggestion: string | null
  legalBasis: string | null
}

const MAX_QUOTE = 220

/** 取命中位置所在句子（中文按句号/分号/换行切分），作为原文引用 */
function quoteSentence(content: string, matchIndex: number): string {
  const breaks = new Set(['。', '；', '！', '？', '\n', '!', ';'])
  let start = matchIndex
  let end = matchIndex
  while (start > 0 && !breaks.has(content[start - 1])) start--
  while (end < content.length && !breaks.has(content[end])) end++
  const sentence = content.slice(start, end === content.length ? end : end + 1).trim()
  if (sentence.length <= MAX_QUOTE) return sentence
  // 过长：以命中点为中心截取
  const center = Math.max(0, matchIndex - start - 80)
  return '…' + sentence.slice(center, center + MAX_QUOTE) + '…'
}

function ruleHits(rule: ReviewRule, content: string): number {
  if (rule.pattern) {
    try {
      const re = new RegExp(rule.pattern, 'm')
      const m = re.exec(content)
      if (m) return m.index
    } catch {
      // 规则配置错误不拖垮整份审查，降级为关键词判定
    }
  }
  if (rule.keywords?.length) {
    const allPresent = rule.keywords.every((kw) => kw && content.includes(kw))
    if (allPresent) {
      return content.indexOf(rule.keywords.find((kw) => content.includes(kw))!)
    }
  }
  return -1
}

export interface EngineOptions {
  /** 合同是否属于劳动/用工类（决定 scope=LABOR 规则是否参与） */
  labor?: boolean
}

export function runRuleEngine(clauses: EngineClause[], rules: ReviewRule[], opts: EngineOptions = {}): RuleFinding[] {
  const findings: RuleFinding[] = []
  const enabled = rules
    .filter((r) => r.enabled && (r.scope !== 'LABOR' || opts.labor))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  for (const clause of clauses) {
    for (const rule of enabled) {
      const idx = ruleHits(rule, clause.content)
      if (idx < 0) continue

      findings.push({
        ruleId: rule.id,
        code: rule.code,
        severity: rule.severity,
        category: rule.category,
        title: rule.name,
        clauseId: clause.id,
        clauseTitle: clause.title,
        quote: quoteSentence(clause.content, idx),
        analysis: rule.description || rule.name,
        suggestion: rule.suggestion,
        legalBasis: rule.legalBasis,
      })
    }
  }
  return findings
}

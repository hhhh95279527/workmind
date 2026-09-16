// server/prisma/seed.ts
// 种子数据：幂等执行（可重复跑）
//  1. 内置审查规则（ReviewRule）
//  2. 平台法规库 / 合同模板（Document + DocChunk，供 legal_search 检索）
//  3. 8 份样例合同 + 切分好的条款（Contract + Clause）
//  4. 演示租户与账号（已存在则跳过）
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { BUILTIN_RULES } from '../src/contract/rules/rules.seed.js'
import { splitClauses } from '../src/contract/parsing/clause-parser.js'
import { setDatabase, ingestText } from '../src/services/rag/ingest.js'
import { LEGAL_DOCS, TEMPLATE_DOCS } from './fixtures/legal.js'
import { SAMPLE_CONTRACTS } from './fixtures/contracts.js'

const prisma = new PrismaClient()
setDatabase(prisma as any)

async function ensureUser(username: string, orgName: string): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { username } })
  if (existing) {
    console.log(`  用户已存在：${username}`)
    return existing.tenantId
  }
  const tenant = await prisma.tenant.create({
    data: { name: orgName, plan: 'FREE', monthlyTokenQuota: 500000 },
  })
  await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash('Test1234', 10),
      displayName: username === 'testboss' ? '测试老板' : '二号老板',
      role: 'ADMIN',
      tenantId: tenant.id,
    },
  })
  console.log(`  创建用户：${username} / Test1234（${orgName}）`)
  return tenant.id
}

async function seedRules() {
  for (const r of BUILTIN_RULES) {
    const id = `rule_${r.code.toLowerCase()}`
    const data = {
      code: r.code,
      name: r.name,
      severity: r.severity,
      category: r.category,
      scope: r.scope,
      pattern: r.pattern ?? null,
      keywords: r.keywords ?? [],
      prompt: r.prompt,
      suggestion: r.suggestion,
      legalBasis: r.legalBasis,
      description: r.description,
      sortOrder: r.sortOrder,
      enabled: true,
    }
    await prisma.reviewRule.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    })
  }
  console.log(`✓ 审查规则 ${BUILTIN_RULES.length} 条`)
}

async function seedDocs() {
  for (const d of LEGAL_DOCS) {
    await ingestText({
      docId: d.docId,
      title: d.title,
      fileName: d.fileName,
      category: d.category,
      docType: 'LEGAL',
      content: d.content,
      tenantId: null,
    })
  }
  console.log(`✓ 法规库文档 ${LEGAL_DOCS.length} 份`)

  for (const d of TEMPLATE_DOCS) {
    await ingestText({
      docId: d.docId,
      title: d.title,
      fileName: d.fileName,
      category: d.category,
      docType: 'TEMPLATE',
      content: d.content,
      tenantId: null,
    })
  }
  console.log(`✓ 合同模板 ${TEMPLATE_DOCS.length} 份`)
}

async function seedContracts() {
  for (const sc of SAMPLE_CONTRACTS) {
    const owner = await prisma.user.findUnique({ where: { username: sc.tenantUser } })
    if (!owner) {
      console.warn(`  跳过 ${sc.title}：归属用户 ${sc.tenantUser} 不存在`)
      continue
    }

    // 级联清理旧任务/风险/条款
    await prisma.contract.deleteMany({ where: { id: sc.id } })

    const parsed = splitClauses(sc.content)
    await prisma.contract.create({
      data: {
        id: sc.id,
        tenantId: owner.tenantId,
        uploadedBy: owner.id,
        title: sc.title,
        fileName: sc.fileName,
        fileType: 'txt',
        status: 'READY',
        progress: 100,
        charCount: sc.content.length,
        clausesCount: parsed.length,
        clauses: {
          create: parsed.map((c, i) => ({
            indexNo: i,
            title: c.title.slice(0, 200),
            content: c.content,
            clauseType: c.clauseType,
          })),
        },
      },
    })
    console.log(`  合同：${sc.title}（${parsed.length} 条）`)
  }
  console.log(`✓ 样例合同 ${SAMPLE_CONTRACTS.length} 份`)
}

async function main() {
  console.log('开始播种...')
  await ensureUser('testboss', '测试科技')
  await ensureUser('boss2', '另一家公司')
  await seedRules()
  await seedDocs()
  await seedContracts()
  console.log('播种完成 ✓')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

// scripts/spike-checkpointer.ts
// P1 技术验证（一次性 spike）：官方 @langchain/langgraph-checkpoint-postgres 0.0.5
// 在我们的技术栈（langgraph 0.2.74 + PG16）上能否工作：建表、thread 状态持久化、跨连接恢复。
// 运行：npx ts-node -r ./register-js-ext.cjs scripts/spike-checkpointer.ts
// 结论写入 docs/adr（P3），决定 P2 人工终审续跑用官方 saver 还是自建 checkpoint 表。
import { Pool } from 'pg'
import { Annotation, StateGraph, START, END } from '@langchain/langgraph'
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres'

async function main() {
  const pool = new Pool({ connectionString: 'postgresql://workmind@localhost:5432/workmind' })

  // 0.0.5 的 d.ts 未暴露 fromConnPool（运行时存在），这里显式 any 桥接
  const saver: any = (PostgresSaver as any).fromConnPool
    ? (PostgresSaver as any).fromConnPool(pool)
    : new PostgresSaver(pool as any)
  // 官方 saver 负责建 checkpoint 表
  await (saver as any).setup()

  const State = Annotation.Root({
    round: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
    log: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  })

  const graph = new StateGraph(State as any)
    .addNode('step', async (s: any) => ({ round: s.round + 1, log: [`第${s.round + 1}轮`] }))
    .addEdge(START, 'step')
    .addEdge('step', END)
    .compile({ checkpointer: saver })

  const config = { configurable: { thread_id: 'spike-thread-001' } }

  const r1 = await graph.invoke({ round: 0, log: [] }, config)
  console.log('第一次 invoke:', JSON.stringify(r1))

  const r2 = await graph.invoke({ log: ['续跑'] }, config)
  console.log('同 thread 第二次 invoke（验证状态恢复）:', JSON.stringify(r2))

  const tuple = await (saver as any).getTuple(config)
  console.log('checkpoint 落库:', tuple ? `OK, checkpointId=${tuple.config.configurable.checkpoint_id}` : 'MISSING')

  await pool.query("DELETE FROM checkpoints WHERE thread_id = 'spike-thread-001'").catch(() => {})
  await pool.query("DELETE FROM checkpoint_writes WHERE thread_id = 'spike-thread-001'").catch(() => {})
  await pool.end()
  console.log('SPIKE_DONE')
}

main().catch((e) => {
  console.error('SPIKE_FAILED:', e.message)
  process.exit(1)
})

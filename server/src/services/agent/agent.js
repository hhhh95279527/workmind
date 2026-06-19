// server/src/services/agent/agent.js
// ReAct Agent：Reason + Act 循环
// 模型自主决定：思考 → 选工具 → 执行 → 观察结果 → 继续思考 → 直到完成
import { StateGraph, END, START, Annotation, messagesStateReducer } from '@langchain/langgraph'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { createChatModel } from '../model.js'
import { allTools } from './tools.js'
import { logger } from '../../utils/logger.js'

// ── Agent System Prompt ────────────────────────────────────────
const AGENT_SYSTEM = `你是 WorkMind AI 任务助手，专门处理办公场景的复杂任务。

可用工具：
- web_search：搜索最新技术资讯和信息
- read_doc：从公司知识库检索文档
- calculate：数学计算（金额、工期等）
- get_date：日期查询和计算
- write_report：生成并保存分析报告
- send_notify：发送通知给相关人员

工作原则：
1. 先理解任务的完整需求，想好需要哪些步骤
2. 按最少工具调用完成任务，避免重复查询
3. 获取到足够信息后立刻生成最终回答，不要继续无谓的工具调用
4. 回答要完整、准确，必要时生成报告

注意：
- 每次只调用一个工具，等结果回来再决定下一步
- 最多执行 8 步工具调用，超过后用已有信息给出最佳回答`

// ── LangGraph Agent 状态 ──────────────────────────────────────
const State = Annotation.Root({
  messages: Annotation({ reducer: messagesStateReducer, default: () => [] }),
  steps:    Annotation({ reducer: (_, n) => n, default: () => 0 }),
})

// 使用 temperature=0 让工具调用更确定
const agentModel = createChatModel({ temperature: 0, streaming: true })
const toolNode   = new ToolNode(allTools)

// Agent 节点：让模型决定下一步
async function agentNode(state) {
  const response = await agentModel.bindTools(allTools).invoke([
    new SystemMessage(AGENT_SYSTEM),
    ...state.messages,
  ])
  return { messages: [response], steps: state.steps + 1 }
}

// 路由函数：有工具调用且未超步数 → 继续；否则 → 结束
function shouldContinue(state) {
  const last = state.messages[state.messages.length - 1]
  if (state.steps >= 8) {
    logger.warn('agent: max steps reached', { steps: state.steps })
    return '__end__'
  }
  return last.tool_calls?.length ? 'tools' : '__end__'
}

// 构建 LangGraph
const agentGraph = new StateGraph(State)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', shouldContinue, {
    tools:   'tools',
    __end__: END,
  })
  .addEdge('tools', 'agent')  // 工具执行完，回到 agent 继续思考
  .compile()

// ── 流式执行 Agent，推送每一步的状态 ─────────────────────────
/**
 * @param {string}   task     - 用户输入的任务
 * @param {function} onEvent  - 事件回调，参数 (type, data)
 *
 * onEvent 的 type：
 *   'step_start'   → Agent 开始新的思考步骤
 *   'tool_call'    → 模型决定调用某个工具（含工具名和参数）
 *   'tool_result'  → 工具执行完成（含执行结果）
 *   'token'        → 最终回答的流式 token
 *   'done'         → 全部完成
 *   'error'        → 出错
 */
export async function runAgent(task, onEvent) {
  logger.info('agent: start', { task: task.slice(0, 60) })

  try {
    let stepCount = 0

    // streamEvents：LangGraph 内置的流式事件系统
    // 能拿到每个节点、每个工具调用、每个 token 的精细事件
    for await (const event of agentGraph.streamEvents(
      { messages: [new HumanMessage(task)], steps: 0 },
      { version: 'v2' }
    )) {
      const { event: eventType, name, data } = event

      // 工具开始执行
      if (eventType === 'on_tool_start') {
        stepCount++
        const toolInput = data?.input
        onEvent('tool_call', {
          step:     stepCount,
          toolName: name,
          args:     toolInput,
          label:    getToolLabel(name),
        })
      }

      // 工具执行完毕
      if (eventType === 'on_tool_end') {
        let result = data?.output
        // 工具返回的可能是字符串或对象
        if (typeof result === 'string') {
          try { result = JSON.parse(result) } catch {}
        }
        onEvent('tool_result', {
          toolName: name,
          result,
          resultText: typeof result === 'string' ? result : JSON.stringify(result),
        })
      }

      // 最终回答的流式 token
      if (
        eventType === 'on_chat_model_stream' &&
        data?.chunk?.content &&
        name === 'ChatOpenAI'  // 只取最后 agent 节点的输出，不取工具调用决策的
      ) {
        // 只推送没有 tool_calls 的 token（即最终回答阶段）
        const chunk = data.chunk
        if (!chunk.tool_call_chunks?.length && chunk.content) {
          onEvent('token', { token: chunk.content })
        }
      }
    }

    onEvent('done', { steps: stepCount })
    logger.info('agent: done', { steps: stepCount })
  } catch (err) {
    logger.error('agent: error', { error: err.message })
    onEvent('error', { message: err.message || 'Agent 执行出错' })
  }
}

// 工具中文标签（前端展示用）
function getToolLabel(toolName) {
  const labels = {
    web_search:   '联网搜索',
    read_doc:     '检索知识库',
    calculate:    '数学计算',
    get_date:     '日期查询',
    write_report: '生成报告',
    send_notify:  '发送通知',
  }
  return labels[toolName] || toolName
}

// 获取工具列表（供前端展示可用工具）
export function getToolList() {
  return allTools.map(t => ({
    name:        t.name,
    label:       getToolLabel(t.name),
    description: t.description,
  }))
}

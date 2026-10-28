# WorkBuddy 本地 Agent 技术分析报告

## 结论摘要

WorkBuddy 5.3.8 的“本地 Agent”不是 Electron Renderer 内的一个聊天函数，而是一条跨进程、跨协议的运行链：Renderer/主进程负责会话与交互，Sidecar 负责托管本地 CLI，CLI 通过 ACP（Agent Client Protocol）提供会话、提示词、权限和增量事件；Agent 内核再执行模型—工具循环。仓库中 `packages/agent-provider` 是从编译产物恢复出的宿主无关编排核心，`runtime-app/main/initialize.js` 和 `runtime-app/main/sidecar-entry.js` 是生产运行时证据。

可归纳为：

```text
Renderer / Agent UI
        │ IPC / channel
        ▼
LocalAgentProvider → LocalAgentConnection → ACP JSON-RPC
        │                                      │
        │                                      ▼
        │                              Sidecar / local CLI
        │                                      │
        └──────── session/update / permission ─┘
                                               ▼
AgentSession → Context → Model → Tool calls
             → validation → hooks → permission → execute
             → tool_result → next turn
```

## 1. 证据范围与可信度

本报告采用三层证据：

1. **生产产物证据**：`runtime-app/main/initialize.js` 保留了 `packages/agent-provider/src/...` 的 source-region 标记，能直接证明 ACP、LocalAgentConnection、SessionManager 和 Sidecar 的运行边界。
2. **恢复模块证据**：`packages/agent-provider/src/runtime`、`src/common` 和 `packages/context/src/runtime` 提供可读、可测试的循环、权限、工具和上下文实现。
3. **行为证据**：`packages/agent-provider/test/runtime.spec.js` 覆盖循环上限、压缩、工具并发、输入校验、权限、会话谱系和 ACP RPC。

恢复模块与编译 Bundle 的职责相互印证，但不能据此声称每一行都是原始 TypeScript；`docs/Agent源码映射.md` 也明确说明了这一点。因此下文把“确定事实”和“架构推断”分开表述。

## 2. 进程与会话边界

### 2.1 Renderer 到本地 Agent

`LocalAgentProvider` 以 `channel` 为桌面通信抽象，管理 cwd→连接、session→cwd 映射、归档会话、文件系统代理、MCP/Connector 广播请求和工作区打开（`packages/agent-provider/src/common/providers/local-agent-provider/local-provider.js`）。它不在 Renderer 中执行模型，而是通过 `LocalAgentConnection` 创建/加载会话并转发事件。

`ClientSessionManager` 将 provider 返回的连接包装成 `ActiveSession`，暴露 `prompts.send/cancel/rollback`、文件操作、模式/模型切换和权限响应（`packages/agent-provider/src/common/client/session-manager.js`、`session.js`）。这层把 UI API 与 ACP 细节隔离，且支持新建失败后的连接重试。

### 2.2 ACP JSON-RPC

`AcpJsonRpcClient` 为每个请求生成递增 id，将 `sessionId` 注入 JSON-RPC params，维护 pending request、超时和销毁时 reject；同时处理 `session/update`、权限请求和扩展通知（`packages/agent-provider/src/common/providers/local-agent-provider/acp/acp-json-rpc-client.js`）。保留的 Bundle 代码还显示生产实现同时监听 `message` 和 `acp-rpc-response`，并支持 `session/prompt`、`session/request_permission` 等方法。

特殊 session id（`__new__`、`__workspace__`、`__broadcast__`）是路由机制，而不是业务 Agent id：新建会话、工作区操作和全局能力广播可以绕过普通 session 路由。

### 2.3 Sidecar 与 CLI

主进程的 Sidecar 管理器负责 PID 文件、控制 socket/named pipe、版本探测、孤儿进程回收、重启和 host endpoint。生产产物中 `ensureSidecar` 的注释明确记录了“复用可达实例、清理 stale PID、协议版本不兼容时重启、等待就绪”。这说明本地 Agent 的可靠性边界在进程托管层，而不是 AgentLoop 本身。

## 3. Agent 内核循环

`runAgentLoop` 在 SessionStart/SessionEnd Hook 之间创建 loop state，按 `maxTurns` 重复执行：上下文压缩 → `runAgentTurn` → 记录结果；遇到完成、取消、达到上限或异常时分别进入 terminal/max_turns/failed 状态（`packages/agent-provider/src/runtime/agent-loop.js`、`agent-loop-state.js`）。默认最大轮数为 100，非正整数直接抛出 `RangeError`。

单轮 `runAgentTurn` 的顺序是：

1. 检查 `AbortController`；
2. 用 `buildAgentContext` 组装 system、project、memory、skills、connectors、files 和历史 messages；
3. 调用 `runtime.model.complete`；
4. 归一化 `tool_use`/`toolCalls` 与 stop reason，并追加 assistant message；
5. 若无工具调用或 stop reason 为 `end_turn`/`stop`/`completed`，立即结束；
6. 否则执行工具并追加 `tool_result`，回到下一轮。

这是一种显式的 Claude 风格 tool-use 状态机：模型不直接修改本地状态，所有副作用必须经过工具执行器。

## 4. 工具执行与并发

`ToolRegistry` 只接受具备 `name` 和 `execute` 的工具，并用 `buildTool` 补齐解析、校验、权限、并发安全和状态变更等默认契约。

`partitionToolCalls` 只把相邻且 `isConcurrencySafe(parsedInput)` 为真的调用放入并发批次；解析失败按保守策略视为不可并发。`runTools` 对并发批次使用受限 worker pool（默认 10），其余调用串行执行，并保持结果顺序（`tool-orchestration.js`）。因此“模型一次返回多个工具调用”不等于无条件并行。

`executeToolCall` 的安全顺序是：取消检查 → 工具存在性 → clone/backfill/parse/validate → PreToolUse Hook → 工具级权限 → 全局 PermissionController → 用户中断请求 → execute → PostToolUse Hook；异常进入 PostToolUseFailure 并返回结构化 `tool_result`。模型原始输入不会被修改，校验失败也不会触发 Hook、权限检查或工具副作用。

## 5. 权限、安全与中断

`PermissionController` 支持 `default`、`acceptEdits`、`auto`、`dontAsk`、`plan`、`bypassPermissions`、`delegate` 七类模式；规则优先于模式，`plan` 阻止 `mutatesState` 工具，`delegate` 只允许 `delegationSafe` 工具，auto/acceptEdits 仅自动批准标记为 `autoApprove` 的工具。

工具级拒绝/询问具有优先权；只有工具级结果为 allow/passthrough 时才进入全局权限判断（`tool-permission-coordinator.js`）。`InterruptionController` 用 request id 去重，以 Promise 挂起模型回合，默认 120 秒超时自动 deny，并可批量取消。

生产 ACP 侧还存在一层桌面权限桥：Bundle 中 `LocalAgentConnection.bindPermissionRequest` 将 CLI 权限请求映射为 UI 事件，记录 pending request，支持 selected/cancelled/timeout，并在断开连接时清理。由此形成“Agent 内核权限 + ACP/UI 审批”双层边界。

## 6. 上下文、压缩与历史

上下文构建器目前是轻量边界：将 system prompt、project、memory、skills、connectors、files 和 session.messages 组合成 provider 输入（`packages/context-viewer-components/src/context-builder.js`）。上下文策略独立于循环：默认窗口 200k token、保留 16k token、阈值 85%；token 估算按 UTF-8 字节数/4，触发后保留最近 8 条消息，将早期候选交给外部 summarizer，并插入 `compact_boundary`。

这种拆分允许本地模型、云模型或不同上下文窗口替换压缩策略，而无需修改 AgentLoop。但当前估算是启发式而非 tokenizer 精确计费，且压缩失败由上层异常路径处理，属于需要监控的可靠性点。

## 7. 子 Agent 与生命周期

`SubagentRunner` 为子 Agent 创建独立 `AgentSession`，继承 project 和默认 permission mode，记录 `parentSessionId`/`agentType`，执行 SubagentStart/Stop Hook；父 Session abort 会传播到子 Session。`SessionManager` 维护 children 集合，支持 lineage、递归 abort 和 close。

这意味着子 Agent 是“隔离历史 + 继承部分策略”的树，而不是同一消息数组上的线程。当前恢复实现没有看到跨子 Agent 的共享消息写入；共享能力应通过显式 runtime/tool/context 注入完成。

## 8. 事件、持久化与 UI 投影

CLI/ACP 侧的 session update 以增量事件表达文本、工具调用和工具结果。`session-activity.js` 将 stream-json assistant block 映射为 `tool_start`/`text`，将 result subtype 映射为 `result`/`error`，并过滤 synthetic、replay 和 tool-result user 消息。

主进程 SessionManager 还负责 session replay、事件历史、pending permission/question、toolResults、task status、usage 和 trace metadata。由此可见，Agent 内核的消息历史并不是 UI 最终呈现的唯一数据源；UI 通过 ACP 事件和本地持久化重放构造投影。

## 9. 关键设计优点

- **边界清晰**：模型、工具、权限、Hook、ACP、Sidecar 分层，便于替换 provider。
- **副作用可审计**：工具调用统一经过输入校验、权限和 Hook，结果带 toolUseId、错误和决策元数据。
- **并发保守**：只有工具显式声明 concurrency-safe 才并发，解析失败自动降级串行。
- **取消可传播**：Session、pending interruption、子 Agent、Sidecar 断连都有取消路径。
- **本地/云端可复用**：ClientSession 与 ActiveSession 不绑定具体 transport，Local/Cloud provider 共用会话 API。

## 10. 风险与改进建议

1. **生产实现与恢复模块需持续对账**：恢复代码是架构化重建，不应自动视为源码真相；建议为每个关键边界保留 bundle source-region、行为测试和版本哈希。
2. **ACP pending request 需要统一超时语义**：客户端请求超时、权限超时、Sidecar socket 超时目前分属多层，建议统一 request id、错误码和可观测字段。
3. **上下文 token 估算应接入模型 tokenizer**：字节/4 适合作为保守启发式，但会导致过早或过晚压缩。
4. **工具输出需要大小上限与截断策略**：大 tool result 会放大历史、UI replay 和持久化压力；生产产物已有大事件防护迹象，建议将上限下沉到工具执行器并记录截断原因。
5. **权限决策应形成不可变审计记录**：当前 decision/source 已随 tool_result 返回，但建议在主进程持久化 allow/deny/timeout、规则命中和 UI 操作来源。
6. **Sidecar 重启需定义会话恢复契约**：当前主进程具备 stale runtime 清理与 session replay 能力，仍应明确哪些 tool call 可重放、哪些必须标记为未知结果。
7. **增加端到端故障测试**：覆盖 CLI 崩溃、ACP 半包/乱序、权限 UI 断开、父 Agent 取消、压缩中断和超大工具输出。

## 11. 结论

WorkBuddy 本地 Agent 的核心竞争力不在单一模型调用，而在“跨进程运行时 + 可恢复会话 + 受权限控制的工具编排 + ACP 事件投影”。`agent-provider/runtime` 展示了最小可测试内核，`LocalAgentProvider`/ACP/Sidecar 则把它接入桌面产品。理解或改造该系统时，应先保持这条边界：**Renderer 不执行 Agent 决策，AgentLoop 不管理桌面进程，Sidecar 不承担业务权限策略，所有本地副作用都经过工具与权限链。**

## 附录：核心源码索引

| 主题 | 文件 |
| --- | --- |
| 循环与轮次 | `packages/agent-provider/src/runtime/agent-loop.js`, `agent-turn.js`, `agent-loop-state.js` |
| 工具编排/执行 | `tool-orchestration.js`, `tool-execution.js`, `tool-input-pipeline.js` |
| 权限与中断 | `permission-controller.js`, `permission-rules.js`, `tool-permission-coordinator.js`, `interruption-controller.js` |
| 上下文压缩 | `packages/context/src/runtime/context-window.js`, `packages/agent-provider/src/runtime/agent-compaction.js` |
| 子 Agent/会话 | `subagent-runner.js`, `session-manager.js`, `session-lineage.js` |
| 本地 Provider/ACP | `src/common/providers/local-agent-provider/local-provider.js`, `acp/acp-json-rpc-client.js` |
| UI 会话桥 | `src/common/client/session.js`, `session-manager.js`, `src/runtime/session-activity.js` |
| 生产运行证据 | `runtime-app/main/initialize.js`, `runtime-app/main/sidecar-entry.js` |
| 行为测试 | `packages/agent-provider/test/runtime.spec.js` |

# Agent 源码映射

本目录使用 `../claude-code` 作为结构对照，但实现依据仍以 WorkBuddy 5.3.8 编译产物为准。相似的模块划分不能证明源码逐行同源，因此恢复代码不直接复制 Claude Code 实现。

## 对照关系

| 恢复模块 | Claude Code 对照 | WorkBuddy 证据 |
| --- | --- | --- |
| `agent-loop.js` | query / agent loop | CLI 中 Session、model、tool result 循环 |
| `tool-orchestration.js` | `services/tools/toolOrchestration.ts` | CLI 中并发安全工具和工具批处理 |
| `tool-execution.js` | `services/tools/toolExecution.ts` | CLI 中 hook、permission、tool response |
| `permission-controller.js` | `useCanUseTool`、permissions | `default`、`plan`、`delegate`、sandbox 等模式 |
| `agent-session.js` | session / task state | WorkBuddy Session、SubAgent Session、AbortController |
| `context-builder.js` | query context | Project、Memory、Skill、Connector、历史消息注入 |
| `tool-registry.js` | `Tool.ts` / `tools.ts` | built-in tool、MCP tool、Skill tool 注册 |

## WorkBuddy 适配边界

- ACP transport 位于 `agent-client-protocol`。
- Sidecar 与 CLI 进程生命周期位于 `runtime`。
- Skill、Plugin 与 MCP App 发现位于 `plugin-core`。
- Sandbox 二进制和策略位于 `sandbox-cli`。
- 本目录只包含与宿主无关的 Agent 编排核心。

`agent-provider/test/runtime.spec.js` 覆盖只读工具并发分组、Agent 循环以及 Plan 模式阻止写工具等关键行为。

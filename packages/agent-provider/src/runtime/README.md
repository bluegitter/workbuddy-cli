# Agent Runtime

The recovered runtime follows the responsibility boundaries visible in the
WorkBuddy CLI and cross-checked against the readable Claude Code tree.

```text
AgentSession
  -> buildAgentContext (@workbuddy/context)
  -> model.complete
  -> normalizeModelResponse
  -> partitionToolCalls
  -> permission / interruption
  -> pre hook / execute / post hook
  -> tool results appended to AgentSession
  -> repeat until completion, cancellation, or max turns
```

`SubagentRunner` creates an isolated child session while inheriting project and
permission mode. Parent cancellation propagates to the child. Host-specific
ACP transport, Sidecar process management, MCP discovery, and Sandbox binaries
remain in their own packages.

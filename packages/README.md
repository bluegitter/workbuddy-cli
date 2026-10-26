# Recovered package map

Each package has two deliberately separate layers:

- `src/source/`: byte-preserved JavaScript from the shipped WorkBuddy client;
- `src/runtime/`: readable, tested source recovered around an explicit responsibility.

The runtime layer is migrated incrementally. It is not silently substituted into
the desktop executable until its boundary tests and the Electron smoke test
cover the same behavior. `scripts/check-packages.js` validates source syntax;
`npm test` validates package behavior and the desktop launch path.

| Package | Readable runtime boundary | Evidence boundary |
| --- | --- | --- |
| `agent-provider` | Agent loop, tools, hooks, permissions, subagents | CLI bundle/provider registry |
| `agent-client-protocol` | JSON-RPC/NDJSON connection | ACP compiled entries |
| `context` | Agent context builder | Renderer context chunks |
| `runtime` | Sidecar manager/session bridge, process adapter, protocol paths, readiness handshake, ring buffer, runtime HTTP, context and isolated CLI environment | Sidecar/runtime entries |
| `plugin-core` | Skill/Plugin discovery, safe scan and marketplace merge | Built-in resources |
| `sandbox-cli` | Command/path policy and runner | Sandbox binary/config |
| `authentication` | Credential store, auth session/headers, account context and gateway secret | Auth/session compiled entries |
| `telemetry` | Bounded event buffer, log sampling and structured logger | Logger/trace compiled entries |
| `enterprise-policy` | Workspace path policy and destructive-operation sentinel audit | File protection compiled entries |
| `workbuddy-server` | HTTP, sessions/tasks, automation, MCP, Connector/Expert manifests/cache, tool routing, compatibility and POI consent | Daemon/MCP compiled entries |
| `workbuddy-core` | Invariants, serialization and cancellation/async utilities | Common/contracts compiled entries |
| `agent-ui` | Session, Todo and Agent Team runtime view models | Renderer bundle |
| `workbuddy-app` | App config, window state, conversation status and queue snapshots | Electron/Preload entries |
| `conversation-render` | Session detail restore and conversation panel state | Conversation renderer entries |
| `cb-chat-ui` | Agent conversation view-model boundary | Chat UI entries |
| `context-viewer-components` | Agent context projection for viewer components | Context viewer entries |
| `agent-sidebar-ui` | Team/sidebar runtime projection | Agent sidebar entries |
| `product` | Product endpoint normalization and authenticated request headers | Product module entries |
| `monitor` | Monitor RPC registration and metric redaction | Monitor module entries |
| `binary-manager` | Binary lifecycle, discovery projection and prompt context | Binary-manager entries |
| `history-migration` | Legacy automation, plan, Claw and todo migration boundaries | History-migration entries |

The package boundaries above are introduced incrementally. During migration,
`workbuddy-server` may expose compatibility re-exports, but new code should
depend on the narrower package boundary instead of importing server internals.
The intended dependency direction is:

```text
product / binary-manager / history-migration
          -> workbuddy-core, runtime, telemetry (as needed)
agent-provider / context / agent-client-protocol
          -> workbuddy-core
workbuddy-server -> the package boundaries above
workbuddy-app -> workbuddy-server facade + UI packages
```

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
| `runtime` | Sidecar manager, protocol paths, readiness handshake, ring buffer, runtime context and isolated CLI environment | Sidecar/runtime entries |
| `plugin-core` | Skill and Plugin discovery | Built-in resources |
| `sandbox-cli` | Command/path policy and runner | Sandbox binary/config |
| `authentication` | Atomic credential store | Auth/session compiled entries |
| `telemetry` | Bounded event buffer | Logger/trace compiled entries |
| `enterprise-policy` | Workspace path policy | File protection compiled entries |
| `workbuddy-server` | HTTP, sessions/tasks, automation, MCP, Connector and Expert manifest boundaries | Daemon/MCP compiled entries |
| `workbuddy-core` | Invariants and serialization | Common/contracts compiled entries |
| `agent-ui` | Session view model | Renderer bundle |
| `workbuddy-app` | App config and window state | Electron/Preload entries |

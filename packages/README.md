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
| `runtime` | Sidecar manager, session process adapter, protocol paths, readiness handshake, ring buffer, runtime HTTP, context and isolated CLI environment | Sidecar/runtime entries |
| `plugin-core` | Skill/Plugin discovery, safe scan and marketplace merge | Built-in resources |
| `sandbox-cli` | Command/path policy and runner | Sandbox binary/config |
| `authentication` | Credential store, auth session/headers, account context and gateway secret | Auth/session compiled entries |
| `telemetry` | Bounded event buffer, log sampling and structured logger | Logger/trace compiled entries |
| `enterprise-policy` | Workspace path policy and destructive-operation sentinel audit | File protection compiled entries |
| `workbuddy-server` | HTTP, sessions/tasks, automation, MCP, Connector/Expert manifests, tool routing, compatibility and POI consent | Daemon/MCP compiled entries |
| `workbuddy-core` | Invariants, serialization and cancellation/async utilities | Common/contracts compiled entries |
| `agent-ui` | Session, Todo and Agent Team runtime view models | Renderer bundle |
| `workbuddy-app` | App config, window state, conversation status and queue snapshots | Electron/Preload entries |

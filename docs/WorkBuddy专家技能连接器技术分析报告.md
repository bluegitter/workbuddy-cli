# WorkBuddy 专家、技能与连接器：功能组成及实现方式

## 1. 结论摘要

WorkBuddy 将 Agent 能力拆成三个互补层次：

| 层次 | 主要职责 | 核心资源 | 运行时形态 |
|---|---|---|---|
| 专家（Expert） | 定义角色、人设、领域职责、团队编排和会话级激活 | `plugin.json`、`agents/*.md`、可选 `skills/`、MCP 声明 | 插件/专家包；可按会话切换并加载模型请求参数 |
| 技能（Skill） | 提供可复用的领域知识、流程、脚本和参考资料 | `SKILL.md` + `scripts/`、`references/`、`assets/` | 通过 frontmatter 被发现、展示、启停、安装和注入 Agent 上下文 |
| 连接器（Connector） | 接入外部服务和工具，将远程 MCP/本地 stdio/CLI 暴露为 Agent 可调用工具 | 连接器清单、MCP 配置、OAuth/令牌、附带技能 | MCP 客户端池 + 状态机 + 工具路由 + 认证/重连 |

三者的典型组合是：专家决定“谁来做、如何协作”，技能决定“知道什么、按什么步骤做”，连接器决定“能访问什么外部系统”。专家可以声明技能和 MCP 依赖；连接器也可以附带技能目录；最终这些资源被汇聚到 Agent 会话和 MCP 工具路由中。

## 2. 总体架构

```text
专家中心/插件市场
   ├─ plugin.json + agents/*.md
   ├─ skills/*/SKILL.md
   └─ dependencies.mcpServers / connectors
          │
          ├── 专家插件服务：下载、安装、激活、会话切换、市场注册
          ├── 技能服务：扫描、解析、安装、启停、导入、市场同步
          └── 连接器服务：配置合并、认证、MCP 连接、工具发现、重连
                           │
                           ├── Agent provider / HookRegistry
                           ├── MCP client pool + ToolRoutingTable
                           └── 前端 RPC / expert center / skill cards
```

工程上采用“声明式资源 + 注入式运行时”的方式。专家、技能和插件清单主要描述资源与元数据；真正的网络连接、认证、工具调用和生命周期则由 `workbuddy-server` 的服务类负责。多数核心模块采用依赖注入，便于桌面端、服务端和测试替换 HTTP、文件系统、MCP SDK 与认证实现。

## 3. 专家（Expert）实现

### 3.1 专家包结构与元数据

内置 `expert-manager` Skill 规定专家包至少包含：

```text
expert-name/
├── .codebuddy-plugin/plugin.json
├── agents/
│   ├── specialist.md
│   └── ...
├── skills/                 # 可选
├── avatars/                # 可选
├── references/             # 可选
└── bin/                    # 可选
```

`plugin.json` 的关键字段包括：

- `name`：kebab-case 的稳定标识；
- `expertType`：`agent` 或 `team`；
- `agentName`：对应 `agents/` 下的 MD 文件名；
- `agents`、`skills`：资源路径数组；
- `displayName`、`profession`、`displayDescription`、`tags`、`quickPrompts`：展示和引导信息；
- Team 专用的 `teamInfo`、`members`；
- 可选 `dependencies.mcpServers`、`dependencies.connectors` 或根级 MCP 声明。

Agent MD 使用 YAML frontmatter 声明 `name`、`description`、展示字段、`maxTurns` 和可预加载的 `skills`，正文描述角色能力、流程和输出规范。工具权限不写在 frontmatter 中，而由系统统一分配。

### 3.2 专家生命周期

`ExpertPluginService` 是专家包运行时的核心：

1. 根据 `~/.workbuddy/plugins/marketplaces/<marketplace>/plugins/<bundle>` 定位专家；
2. 读取 `.codebuddy-plugin/plugin.json` 或兼容的 `.workbuddy-plugin/plugin.json`；
3. 必要时通过 `downloadAndExtract` 下载并解压专家包；
4. 维护 `expertBundleMap`、`activeExperts` 和下载中的 Promise，避免重复下载；
5. 激活时更新 marketplace manifest、移除生成的 `settings.json` 覆盖文件，并返回 `agentName`、本地路径和插件类型；
6. 通过 session HTTP base 调用 `/api/v1/plugins/marketplaces` 注册本地专家市场，再调用 `/api/v1/plugins/switch` 为当前会话启用/禁用专家；
7. 停用时清理会话状态和临时 Agent override。

专家的激活是“插件开关 + 会话切换”，不是简单把一段提示词拼到当前请求。`switchExpertPluginForSession` 支持 disable/enable、`agentName`、`sourcePluginId` 和内部模型请求头；自定义专家还会走二阶段切换，以处理自定义 marketplace 的 Agent override。

### 3.3 市场、安装与安全

专家市场分为官方 `experts` 和自定义 `my-experts`。`ExpertPluginService` 会生成或更新 marketplace manifest，使插件扫描器能够发现专家。自定义专家扫描还受用户白名单 `experts.json` 约束，并对 ID 做路径穿越检查。

`package-installer.js` 负责 ZIP 导入/导出：

- 支持 `.codebuddy-plugin` 和 `.workbuddy-plugin`；
- ZIP 导入要求单一顶层目录和合法专家 ID；
- 目标路径必须位于 marketplace plugins 根目录内；
- 导出跳过 `.DS_Store`、`.created-by-session` 和超过 10 MB 的单个文件；
- 可将头像转为 data URL，并把分享者写入 manifest；
- 重复安装默认拒绝，只有显式 `overwrite` 才覆盖。

`validate_expert.py`、`register_expert.py` 和 `package_expert.py` 形成开发侧质量门禁：先验证字段、文件和 Team 结构，再写入 marketplace manifest，最后打包分享。注册脚本会写入 `.created-by-session`，用于区分会话生成资源。

## 4. 技能（Skill）实现

### 4.1 SKILL.md 与渐进式加载

技能的最小单元是带 YAML frontmatter 的 `SKILL.md`：

```text
skill-name/
├── SKILL.md
├── scripts/       # 可执行、确定性逻辑
├── references/    # 按需读取的详细知识
└── assets/        # 输出时使用的模板/素材
```

`packages/plugin-core/src/runtime/skill-loader.js` 提供轻量加载器：读取 frontmatter，生成 `name`、`directory`、`file`、`attributes` 和正文；`safe-discovery.js` 则限制扫描深度为 5，默认不跟随符号链接，并提供插件 manifest 校验。

设计上采用三级渐进式上下文：

1. 元数据中的 `name/description` 常驻，用于触发判断；
2. 触发后加载 `SKILL.md` 主体；
3. 只有执行任务需要时才读取 `references/` 或运行 `scripts/`。

这样避免把所有技能正文长期塞入模型上下文，同时保留脚本和参考资料的可复用性。

### 4.2 技能发现与来源

`createPersonalSkillHandlers` 的 `getSkillList` 会按固定顺序扫描：

1. 项目级 `.workbuddy/skills`；
2. 用户级 `~/.workbuddy/skills`；
3. 连接器级 `~/.workbuddy/connectors/skills`；
4. 内置 Skill 目录。

扫描递归深度为 5，支持目录中的 `SKILL.md` 和受控符号链接，并用 `loadedPaths/loadedNames` 去重。解析结果统一为前端 Skill 卡片结构，包括描述、来源、启用状态、slug、版本、市场来源、图标和 `allowedTools`。

插件市场中的已启用插件还会由 `scanPluginSkills` 扫描其 `skills/` 子目录和根级 `SKILL.md`。内置文本会做 CodeBuddy→WorkBuddy 品牌替换；市场元数据可以覆盖本地 frontmatter 的名称、描述、图标和版本。

### 4.3 安装、启停和市场同步

`createSkillsService` 聚合五类来源处理器：personal、SkillHub、Knot、builtin market、local marketplace。安装操作通过 `enqueueInstall` 限制并发数为 2，避免同时写入用户技能目录。

核心能力包括：

- `skillInstallByPath`：验证目录和 `SKILL.md`，可选调用安全扫描，复制到用户技能目录并写 `_user_meta.json`；
- `skillInstallMarketplace`：从本地市场复制资源，保留安装时间和市场元数据；
- `skillhubInstall`、`knotInstall`、`builtinMarketInstall`：从远程市场下载并落地；
- `skillToggle`：只修改 frontmatter 的 `disable` 字段；
- `skillDelete`：删除技能目录；
- `skillContent`：读取正文并向前端返回；
- `skillExportZip`：将技能目录打包成 ZIP。

用户修改过的市场技能会被写入 `userModified: true`，市场更新逻辑据此避免无提示覆盖用户改动。内置市场还提供迁移脚本，将旧目录名迁移为稳定的 `skillId`。

### 4.4 技能安全边界

导入技能可选经过 `SkillSecurityClient` 的 XTI 静态分析：先上传文件得到 MD5/task ID，再查询静态分析结果，依据 threat level 映射为 safe/low/medium/high；非 white verdict 可阻止安装。连接器断开时，`disableConnectorSkills` 会递归给连接器附带的 `SKILL.md` 写入 `disable: true`，防止外部连接不可用时技能仍被误触发。

## 5. 连接器（Connector）实现

### 5.1 配置来源与期望图

`buildDesiredConnectorConfigs` 将多个来源合并成“期望 MCP 图”：

- manifest 中已启用的连接器及其 MCP 配置；
- 用户自定义 `mcp.json`；
- 已启用插件的 `.mcp.json`；
- 额外注入的运行时配置。

它会过滤 CLI/skill-only 连接器、缺少 `url/command` 的配置、代理保留名和失效的外部令牌；对自定义 MCP 使用 `custom-mcp:` 前缀，并支持黑名单 hash、用户审批、超时规范化和禁用工具覆盖。

### 5.2 MCP 客户端池与工具路由

`ConnectorMcpClientPool` 管理每个连接器的客户端、连接配置、工具快照和连接中的 Promise：

1. `connect` 对同一 configId 去重；相同配置且已连接时直接返回 cached；
2. `doConnect` 创建客户端、执行握手、调用 `listTools`，同时保存 prompts/resources/resourceTemplates；
3. 连接成功后触发 `onToolsChanged`，让 Agent 工具列表刷新；
4. `disconnect` 关闭客户端并清除 active config；
5. `sync` 对 desired/active 配置做 diff，依次执行删除、重连、新增和保持不变。

`ToolRoutingTable` 将不同 MCP server 的同名工具做命名空间和路由选择；`callTool` 首先查找内置工具，否则解析到连接器 configId，检查禁用列表和连接状态，再去掉外部命名空间前缀调用 MCP `tools/call`。连接器因此从 Agent 角度表现为动态工具集合，而不是静态 API 列表。

### 5.3 传输、超时与工作目录

连接器支持：

- 本地 `stdio`：通过 `StdioClientTransport` 启动命令；
- Streamable HTTP；
- SSE。

HTTP 默认 streamable-first，显式 `type: sse` 时 SSE-first。首选传输失败后才尝试另一种；401/403、未授权和 aborted 错误不做 fallback。默认连接超时至少 60 秒，stdio 至少 120 秒，握手超时为 12 秒。

stdio 的工作目录默认为：

```text
~/.workbuddy/logs/mcp-runtime/<安全化 configId>-<hash>/
```

配置的 cwd 会被解析、创建并检查目录类型；configId 先清理特殊字符再追加 SHA-256 短 hash，避免不同服务冲突。

### 5.4 认证、状态和重连

`ConnectorAuthCoordinator` 将三类认证职责分开：

- iOA/server-side auth：连接前触发授权流程；
- 本地 token refresh：针对 URL/headers 刷新过期 token；
- server-side OAuth refresher：连接成功后按连接器名调度续期，断开时停止定时器。

连接器状态由 `ConnectorServiceState` 管理，状态包括 `connecting`、`connected`、`unauthorized`、`error`、`disconnected`。同一 configId 的操作通过 `pendingOps` 串行化，避免 connect/disconnect 竞争。`ConnectorMcpProxy` 还会把错误分类为 auth、transport、business、unknown，并更新工具可见性。

系统休眠恢复时，`ConnectorLifecycle` 等待网络恢复（DNS lookup `example.com`，指数退避，最多 30 秒）后调用 `refreshAndSync`。这使连接器在网络变化、令牌变化或配置变化后按期望图自动收敛。

### 5.5 插件 MCP 与连接器技能

`plugin-mcp-discovery.js` 扫描启用 marketplace 的插件：读取 marketplace manifest、校验 source 不得逃逸根目录、读取插件 `plugin.json` 和 `.mcp.json`，仅返回已启用插件的服务器配置。插件 MCP 会被加入 desired configs，并默认 `defer_loading: true`。

插件/连接器的技能不是独立复制到系统 Skill 目录后才可用；它们可从连接器目录或已启用插件目录被扫描。连接器断开时，关联技能被禁用；重新连接后由同步流程重新评估。

## 6. 三者的协作链路

以“专家调用外部知识库完成分析”为例：

```text
选择专家
  ↓
ExpertPluginService 解析 plugin.json，激活 agentName
  ↓
加载 Agent MD，并解析其预加载 skills / dependencies
  ↓
SkillsService 扫描和启用 SKILL.md，按需加载 references/scripts
  ↓
ConnectorService 根据专家/插件声明构建 desired MCP configs
  ↓
AuthCoordinator 准备 OAuth/token
  ↓
MCP Client Pool 连接外部服务并发现 tools/resources
  ↓
ToolRoutingTable 将工具加入 Agent 可见工具集合
  ↓
Agent 通过 callTool 执行外部操作，结果回到会话
```

专家负责高层编排，技能负责提示和流程，连接器负责能力执行。三者通过 manifest、文件路径、marketplace ID、MCP configId 和工具路由名称连接，而不是通过相互硬编码调用。

## 7. 前端与 RPC 暴露

服务端通过 handler registry 向前端暴露能力：

- 专家：`expert:center:init/categories/experts/expert/refresh/ranking`，以及专家历史和激活状态；
- 技能：`skillList`、`skillToggle`、`skillDelete`、`skillContent`、各市场 list/detail/install/recommend；
- 连接器：连接、断开、重连、配置、状态、MCP server/tool 开关和 OAuth token 状态。

因此 UI 只依赖稳定的 RPC/channel 契约，具体的本地文件、HTTP、MCP SDK 和缓存实现留在 server 层。专家服务还通过 load-state event bridge 推送加载状态，技能安装通过 metric 包装器记录来源和结果。

## 8. 关键优点、风险与建议

### 优点

1. **职责分层明确**：角色、知识流程、外部执行能力各自独立。
2. **声明与执行分离**：manifest/Markdown 负责描述，服务类负责生命周期和 I/O。
3. **动态工具发现**：连接器连接后才刷新工具快照，支持多 MCP server 和禁用覆盖。
4. **多市场与本地化支持**：官方、自定义、SkillHub、Knot、本地市场可统一映射。
5. **安全边界完整**：路径穿越检查、ZIP 限制、技能静态扫描、MCP 审批和 token 分类均有实现。
6. **可测试性好**：连接、认证、transport、fetch、文件系统和 marketplace 多数通过依赖注入替换。

### 风险

1. **技能 frontmatter 解析存在多套实现**：`plugin-core` 的简化解析器与 server 的 YAML 解析器能力不同，复杂 YAML 可能出现展示与运行时理解不一致。
2. **技能同名去重按扫描顺序生效**：项目、用户、连接器、内置目录的顺序影响最终可见版本，覆盖规则需要文档化。
3. **连接器 fail/reconnect 复杂**：认证、传输 fallback、网络恢复和服务端 OAuth 定时器叠加，状态观测不足时排障成本较高。
4. **插件 MCP 默认延迟加载**：启用插件不一定立即可调用其工具，需明确加载时机和 UI 状态。
5. **专家激活依赖 session HTTP gateway**：本地 manifest 存在不代表当前会话已经切换成功。

### 建议

- 统一 frontmatter 解析库和字段 schema，避免 loader、server、脚本三套语义漂移。
- 为专家→技能→连接器建立可查询的依赖图和诊断命令，展示“声明、已安装、已启用、已连接、工具可用”五种状态。
- 为 ConnectorMcpClientPool 增加连接尝试、fallback、认证刷新和工具变更的结构化事件。
- 将 Skill 安全扫描结果、专家包版本、插件 marketplace 和 MCP 配置 hash 写入审计元数据。
- 对同名技能实现明确优先级或命名空间，减少扫描顺序造成的隐式覆盖。

## 9. 核心源码索引

| 文件 | 作用 |
|---|---|
| [`expert-manager/SKILL.md`](../runtime-app/resources/builtin-skills/expert-manager/SKILL.md) | 专家创建、修改、校验、注册和打包规范 |
| [`plugin-json-spec.md`](../runtime-app/resources/builtin-skills/expert-manager/references/plugin-json-spec.md) | 专家 manifest 字段、Agent/Team 模板 |
| [`agent-md-spec.md`](../runtime-app/resources/builtin-skills/expert-manager/references/agent-md-spec.md) | Agent MD frontmatter、正文和 Team 协作规范 |
| [`expert/plugin-service.js`](../packages/workbuddy-server/src/expert/plugin-service.js) | 专家定位、下载、激活、市场注册、会话切换 |
| [`expert/package-installer.js`](../packages/workbuddy-server/src/expert/package-installer.js) | 专家 ZIP 导入导出和安全路径控制 |
| [`plugin-core/runtime/skill-loader.js`](../packages/plugin-core/src/runtime/skill-loader.js) | 基础 Skill frontmatter 加载器 |
| [`skill/service-shared.js`](../packages/workbuddy-server/src/skill/service-shared.js) | Skill 扫描、解析、市场和安装辅助逻辑 |
| [`skill/personal/handlers.js`](../packages/workbuddy-server/src/skill/personal/handlers.js) | Skill 列表、启停、导入、删除和安全检查 |
| [`skill/service.js`](../packages/workbuddy-server/src/skill/service.js) | 聚合各 Skill 市场与并发安装队列 |
| [`runtime/connector-desired-configs.js`](../packages/workbuddy-server/src/runtime/connector-desired-configs.js) | 生成期望 MCP 配置图 |
| [`connector/connector-service.js`](../packages/workbuddy-server/src/connector/connector-service.js) | 连接器组合根、认证、同步和配置持久化 |
| [`runtime/connector-mcp-client-pool.js`](../packages/workbuddy-server/src/runtime/connector-mcp-client-pool.js) | MCP 客户端池、工具快照、连接与调用 |
| [`runtime/connector-mcp-transport-factory.js`](../packages/workbuddy-server/src/runtime/connector-mcp-transport-factory.js) | stdio/HTTP/SSE transport 和 fallback |
| [`runtime/connector-auth-coordinator.js`](../packages/workbuddy-server/src/runtime/connector-auth-coordinator.js) | OAuth、token refresh、server-side auth 协调 |
| [`runtime/plugin-mcp-discovery.js`](../packages/workbuddy-server/src/runtime/plugin-mcp-discovery.js) | 启用插件的 `.mcp.json` 发现 |
| [`agent-provider/runtime/hook-registry.js`](../packages/agent-provider/src/runtime/hook-registry.js) | Session/Tool/Subagent 生命周期 Hook |


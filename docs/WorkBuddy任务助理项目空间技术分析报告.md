# WorkBuddy 任务、助理、项目与空间：作用定位及技术实现

## 1. 结论摘要

WorkBuddy 的“任务、助理、项目、空间”构成四个不同层级的产品对象：

| 对象 | 核心定位 | 生命周期 | 主要边界 |
|---|---|---|---|
| 任务（Task） | 一次可追踪的 Agent 工作执行与对话 | 分钟到长期保留 | 执行、消息、状态、产物 |
| 助理（Assistant） | 可持续使用的 AI 服务入口和角色载体 | 长期存在，可产生多个任务 | 身份、能力配置、接入渠道 |
| 项目（Project） | 人与 AI 围绕共同目标协作的云端容器 | 中长期团队协作 | 成员、权限、计划、资产、共享能力 |
| 空间（Workspace） | 本地文件系统与 Agent 上下文的工作边界 | 随本地目录长期存在 | cwd、文件、任务分组、安全范围 |

四者不是并列的四种任务类型，而是相互组合：助理发起或承接任务；任务在某个本地空间中执行；任务可选归属于项目；项目再为任务注入共享技能、连接器、资产和项目指令。

```text
助理（长期 AI 身份/入口）
      │ 发起、恢复、处理
      ▼
任务（一次 Agent 执行/对话） ────── cwd ──────► 空间（本地文件与上下文）
      │
      └──────── projectId（可选） ──► 项目（云端团队协作与治理）
```

需要特别区分代码中的同名概念：

- “任务”既可指 Agent 会话任务，也可指项目计划中的 Todo；两者通过 handoff 关联，但不是同一数据模型。
- “助理”包含本地 Claw 助理与云助理/企业智能体，两条技术路线不同。
- 本报告中的“空间”主要指任务导航里的本地工作空间；腾讯乐享“知识空间”、网盘存储空间和 CloudStudio workspace 是独立集成，不属于此处的核心 Workspace 模型。

## 2. 产品信息架构与职责边界

### 2.1 为什么需要四层对象

如果只有对话列表，Agent 只能表达“我和模型聊过什么”。WorkBuddy 增加四层对象后，分别解决：

- 任务：这次工作做到了哪一步，产生了什么结果；
- 助理：由谁长期处理工作，从哪里与它交互；
- 空间：它能读写哪些本地文件，历史任务如何按目录聚合；
- 项目：团队成员、AI 能力、计划和资产如何共享与治理。

这也是 WorkBuddy 从聊天工具转向工作系统的核心模型：任务是执行单元，助理是服务主体，空间是本地上下文，项目是组织上下文。

### 2.2 边界对比

| 维度 | 任务 | 助理 | 项目 | 空间 |
|---|---|---|---|---|
| 主键 | `sessionId/conversationId` | `agentId/instanceId` 或本地助理会话锚点 | `projectId` | 规范化绝对路径 `cwd/path` |
| 本地持久化 | SQLite `sessions` | Claw 设置、渠道配置、会话映射 | 项目资源缓存 | SQLite `workspaces` |
| 云端持久化 | 可选云 conversation | Cloud Agent API | Project REST/GraphQL | 通常无，目录在本机 |
| 是否多人共享 | 普通本地任务否；云任务可协作 | 云助理可授权/发布 | 是 | 默认否 |
| 是否直接执行 Agent | 是 | 间接，通过创建/恢复任务 | 间接，为任务提供上下文 | 间接，作为任务 cwd |
| 能力注入 | 模型、专家、技能、连接器 | 助理配置与实例 manifest | 项目技能、MCP、指令、资产 | 项目级 `.workbuddy/skills`、本地文件 |

## 3. 任务：Agent 执行与结果追踪单元

### 3.1 作用与定位

WorkBuddy 的主任务对象本质是一个 Session/Conversation。它不仅保存聊天消息，还绑定：

- 工作目录 `cwd`；
- 模式、模型、专家和 marketplace；
- 权限模式和沙箱开关；
- 项目归属 `projectId`；
- 运行状态、最后活动时间和标题；
- 工具调用、产物、团队运行时和消息队列。

因此，“任务”比一次模型请求更大，也比项目 Todo 更具体：它是一个可以连续多轮执行、恢复、取消、归档、迁移和交付产物的运行线程。

### 3.2 本地数据模型

SQLite `sessions` 表包含：

```text
id, cwd, user_id, title, custom_title, status,
created_at, updated_at, last_activity_at, deleted_at,
is_playground, source_mode, is_background_automation,
mode, model, expert_id, expert_locale, expert_marketplace,
permission_mode, use_sandbox_cli, project_id
```

`SessionRepository.upsert` 采用冲突更新，并对部分字段使用保护策略：

- 已归档状态不会被后续运行时事件覆盖；
- 用户自定义标题、既有 userId 等信息优先保留；
- 非 playground 任务会同步 upsert 对应 workspace；
- 删除采用 `deletedAt` 软删除。

### 3.3 运行时状态机

`task-status.js` 将底层事件归一化为 UI 状态：

```text
turn_started → planning
working_started → working
awaiting_input → pending
turn_completed → completed
turn_failed → failed
runtime_errored → error
runtime_terminated → terminated
手工 archive → archived
```

状态模型同时保存 `runState`、`executionStage`、`terminalOutcome`、`turnSeq`、`pendingInputKind`，避免只靠单个字符串判断运行过程。恢复历史记录时，超过阈值的 planning/working/pending 会话会被识别为陈旧运行并转为 terminated，避免应用崩溃后永久显示“执行中”。

### 3.4 Session 运行时与 RPC

`SessionManager` 维护内存中的 session map、事件历史和 `isProcessing` 状态，支持 create、resume、require、delete 和工具结果查询。运行时回收策略为：

- 空闲 15 分钟可回收；
- 每 30 秒扫描；
- 最多保持 6 个活跃 session。

前端通过 `SESSION_RPC_CHANNELS` 操作任务，包括创建、加载、发消息、取消、权限确认、问答响应、模式/模型切换、归档、重命名、移动、队列管理、回滚、置顶和团队运行时查询。

### 3.5 任务、项目任务与 Todo 的区别

项目代码中存在两个相关但不同的对象：

1. **Task Conversation**：项目内的会话任务，仍然以 `conversationId` 为核心，可创建、连接、协作、转交、切换专家、fork 和查看 timeline。
2. **Project Todo**：计划看板上的管理对象，包含 status、priority、assignees、dueDate、attachments、comments、history 和 allowedTransitions。

`handoffTask` 会把 conversation 的摘要、负责人、截止时间、状态、优先级和标签交给后端，并返回 `todoId`；GraphQL 的 `handoffTodo` 也可用 `sessionId` 创建/更新 Todo。也就是说，会话负责“实际干活”，Todo 负责“计划和治理”，handoff 是二者桥梁。

## 4. 助理：长期 AI 服务主体

### 4.1 两条实现路线

WorkBuddy 的助理页同时容纳：

- **本地助理（Claw）**：运行在用户设备，使用本地工作空间和本地 Agent session，可通过微信、企微、飞书、钉钉、Slack、Telegram、Discord 等渠道收发消息。
- **云助理/企业智能体（Cloud Agent）**：Agent、实例、会话和沙箱运行在云端，支持企业发布、授权、模型选择、配额和独立实例。

两者共享“持续服务入口”的产品定位，但运行边界不同：Claw 强调本机能力与外部 IM 渠道，Cloud Agent 强调云端常驻、企业管理和跨设备访问。

### 4.2 本地 Claw 助理

本地助理使用专属工作目录：

```text
<默认工作空间根>/Claw
```

`resolveClawCwd` 优先使用用户配置的默认工作空间根，失败时回退到 `~/<WorkBuddy品牌名>/Claw`。它会校验目录可创建、可访问且确实为目录。

前端为每个 workspace 保存一个 `sessionAssistantAnchor`，把助理的主 session 与工作空间绑定。会话列表分组时会隐藏这个锚点会话，避免它与普通任务重复展示。助理历史恢复成功后继续使用原 session，失败或超时才提示重新创建。

### 4.3 Claw 渠道插件体系

`ClawPluginHost` 维护插件 factory、实例、账号配置、入站处理器和连接状态：

1. 注册微信、企微、QQ、飞书、钉钉、Slack、Telegram、Discord 等插件；
2. 将用户渠道配置解析为 account；
3. 启动 gateway，处理 WebSocket 或 webhook 连接；
4. 入站消息经过群聊 @ 规则后交给统一 handler；
5. 出站消息通过插件的 outbound adapter 发送；
6. 配置变化时复用或重启插件。

`sendWorkbuddyClawSessionMessage` 将 IM 消息转为合成用户消息，调用普通 `sessionManager.prompt`，再从新增事件中提取 assistant text 返回渠道。因此 Claw 没有另造一套 Agent 引擎，而是复用 WorkBuddy Session runtime，渠道只负责消息适配。

`ClawLifecycle` 在登录账号/企业变化时串行停止所有渠道、清理 active conversations，再按新账号恢复渠道和 Centrifugo。IOA 环境还会按企业和机器类型限制部分外部渠道。

### 4.4 云助理与 Orchestrator

轻量 `CloudAssistantService` 负责：

- `/v2/user/cloudagent/entitlement`：判断 orchestrator、installed 和 teams 权益；
- `/v2/user/cloudagent/orchestrator`：初始化用户唯一助理团队。

完整 `CloudAgentService` 进一步提供：

- Agent CRUD、字段校验、配额、复制、发布版本、置顶；
- 企业智能体市场和已授权 Agent 列表；
- Agent instance 创建、查询、重建和删除；
- 云会话创建、列表、更新、删除；
- 沙箱 session credential 获取和 session 创建/删除；
- 头像上传和模型列表。

云助理会话与本地任务 UI 最终仍汇聚为 conversation，但凭据、session link/token 和 Agent manifest 来自云服务。

## 5. 项目：团队与 AI 的协作治理容器

### 5.1 作用与定位

项目不是本地代码目录的别名，而是云端协作实体。它聚合：

- 成员、角色、邀请、加入审批；
- 云任务、协作者、任务接力；
- 计划 Todo、状态、负责人、评论和附件；
- 项目资产与网盘；
- 专家、技能、连接器和项目指令；
- 自动化、活动流、未读状态和项目消息。

项目解决的是团队治理和共享上下文，空间解决的是本地文件边界。一个项目可产生多个任务；本地项目任务仍需选择一个 workspace/cwd 执行。

### 5.2 服务实现

`ProjectService` 是组合门面，通过依赖注入的 HTTP client 将多个子模块绑定为统一 RPC 服务：

- `cloud-project`：项目 list/get/create/update/archive/delete/leave；
- `cloud-task`：任务 create/connect/list/handoff/fork/collaboration；
- `cloud-todo`：Todo GraphQL 查询和 mutation；
- invitation/join/member/activity/manifest；
- project skill、expert、connector、netdrive；
- project message、todo comment/webhook/sync source；
- smartsheet adapter 和任务队列。

项目基础接口走 `/console/as/projects` REST；Todo 走项目级 GraphQL endpoint：

```text
/console/as/projects/:projectId/plan/todos/graphql
```

GraphQL 适合 Todo 的复杂筛选、connection 分页、历史和 mutation error；项目基础 CRUD 与会话操作则保持 REST。

### 5.3 项目资源注入本地任务

`ProjectResourceManager` 将项目能力投影到本地 Agent session：

1. 下载项目技能和连接器附带技能到：

   ```text
   ~/.workbuddy/project-resources/<projectId>/
   ```

2. 设置 session 环境变量：

   ```text
   CODEBUDDY_SESSION_SKILL_DIRS=<项目资源目录>
   ```

3. 把项目连接器和内置 `wb-issues` 组装为 MCP 配置；
4. 每次返回 MCP server 时动态注入 Authorization、`x-user-id` 和 `x-project-id`；
5. 磁盘持久化时移除 Authorization，避免令牌落盘；
6. 被项目移除的技能/MCP 不直接删除，而是标记 disabled，保留恢复能力。

工具路由还会检查 `projectId`：`project-mcp:*` 和 netdrive 只在项目任务中可见，防止普通个人任务越权访问项目资源。

### 5.4 项目上下文注入

会话创建时 `projectId` 被写入 session meta 和 SQLite。项目任务每轮可获得：

- 项目身份与指令；
- 项目网盘根节点；
- 项目文件处理规则；
- handoff work summary；
- 项目技能和 MCP 工具。

项目指令 resolver 调用 `/console/as/projects/:id`，网盘 root resolver 获取项目 access token 和 fileId。这样项目约束不依赖用户每轮重复粘贴，而是由 session composer 按项目身份稳定注入。

## 6. 空间：本地文件与上下文边界

### 6.1 作用与定位

Workspace 的稳定标识就是一个规范化绝对路径。它承担：

- Agent 的当前工作目录 `cwd`；
- 文件浏览、监听、搜索和产物落盘根目录；
- 任务列表的分组键；
- 项目级 `.workbuddy/skills` 的发现根；
- 权限、沙箱和文件安全策略的作用边界；
- 自动化任务的工作目录候选。

空间本身不保存复杂业务字段。SQLite `workspaces` 表只有：

```text
path PRIMARY KEY
last_opened_at
```

它更像本地目录索引，而不是云端协作对象。

### 6.2 创建与发现

没有指定 cwd 时，WorkBuddy 在默认工作空间根下创建时间戳目录：

```text
~/WorkBuddy/2026-10-30-14-25-00
```

根目录可由设置项覆盖，必须为绝对路径。核心 root 校验还会：

- 拒绝文件系统根目录；
- 创建目录并验证其类型；
- 创建和删除 probe 临时目录，确认可写；
- 配置无效时清空配置并回退系统默认目录。

`workspaceInitialize` 创建目录后调用 storage `upsertWorkspace`。任何非 playground session 入库时也会自动 upsert cwd，因此 workspace 索引可从任务自然恢复。

`getWorkspaces` 合并两类来源：workspaces 表中的已知目录，以及 sessions 表中仍有未删除任务的 cwd；结果按最后打开或任务更新时间排序去重。这样即使 workspace 索引缺失，也能由任务记录重新发现。

### 6.3 空间与任务分组

前端将 cwd 规范化为小写、统一 `/` 并去除尾部分隔符，然后按 workspace key 聚合 conversations。显示名称取路径 basename；没有 cwd 的任务进入 `other`。同一个 workspace 下可以有多个任务，共享文件目录但保持独立 session、消息和状态。

“保存到工作空间”代表让临时任务和产物进入可长期保留的目录/分组；删除或移除 workspace 时，UI 会明确提示其中任务的处理风险。空间不是任务副本，而是任务所依附的文件上下文。

### 6.4 空间安全与隔离

空间是本地安全控制的重要输入：

- 文件树刷新只接受 workspace 内路径，避免 sibling prefix 误判；
- 沙箱使用 `/workspace` 作为映射根；
- workspace 外文件修改受到更严格的安全策略；
- 项目技能只在对应 session 的 skill dirs 中注入；
- Claw 使用独立 `Claw` 子目录，防止与普通任务目录混杂。

不过多个任务若共享同一 cwd，文件层仍然共享，任务隔离只存在于 session/消息层。并发任务修改同一文件时需要额外的文件锁、版本控制或用户协作约束。

## 7. 四者的典型运行链路

### 7.1 普通本地任务

```text
用户新建任务
 → 选择/创建 Workspace
 → session:create(cwd, model, mode, expert...)
 → SQLite 写入 session + workspace
 → Agent 在 cwd 内读写文件、调用工具
 → 状态机更新 planning/working/completed
 → 产物索引按 session 和 workspace 展示
```

### 7.2 本地助理处理 IM 消息

```text
IM 渠道收到消息
 → ClawPluginHost 入站适配
 → 找到 Workspace 对应助理锚点 session
 → sessionManager.prompt
 → 普通 Agent runtime 执行
 → 提取 assistant 消息
 → outbound adapter 回发 IM
```

### 7.3 项目本地任务

```text
项目中创建/打开任务
 → session 携带 projectId + cwd
 → ProjectResourceManager 下载项目技能
 → 注入项目 MCP、token、x-project-id
 → 注入项目指令、网盘根和 handoff summary
 → Agent 在本地空间执行，同时访问项目资产/能力
 → 可 handoff 为 Todo 或邀请协作者
```

### 7.4 云助理任务

```text
选择 Cloud Agent/企业智能体
 → 创建或恢复 Agent instance
 → 创建云 conversation
 → 获取/创建 sandbox session credential
 → 连接云端 Agent session
 → 会话与产物投影到统一任务 UI
```

## 8. 技术架构评价

### 8.1 优点

1. **执行与管理分离**：Session 负责执行，Todo 负责计划，Project 负责治理。
2. **本地与云端边界明确**：Workspace 使用路径主键，Project 使用云 `projectId`。
3. **复用统一 Agent runtime**：Claw 渠道消息最终仍调用 SessionManager，减少双引擎漂移。
4. **项目能力按会话注入**：技能、MCP 和 token 不全局污染普通任务。
5. **恢复能力较强**：workspace 可从 sessions 反向发现，陈旧运行状态可自动终止。
6. **敏感信息控制合理**：项目 MCP 的 Authorization 动态注入，持久化配置主动清除令牌。

### 8.2 风险

1. **“任务”语义过载**：conversation、Todo、automation run 都可能被 UI 称为任务，接口调用容易混淆。
2. **“助理”双栈复杂**：Claw 与 Cloud Agent 的身份、会话、运行时和故障恢复不同，但 UI 概念接近。
3. **Workspace 只按路径建模**：目录重命名/移动后会变成新空间，缺少稳定 UUID 和迁移关系。
4. **共享 cwd 的并发冲突**：多个 session 可同时修改同一工作空间文件。
5. **ProjectService 是大型聚合门面**：功能持续增加后，RPC 表面积和跨模块依赖会继续扩张。
6. **本地/云任务合并依赖适配层**：`sessionRecordToTaskConversation` 将本地任务伪装为 cloud task shape，字段能力并不完全对等。

### 8.3 改进建议

- 在 API 和代码命名中固定使用 `ConversationTask`、`PlanTodo`、`AutomationRun`，UI 再统一翻译为任务。
- 为 Workspace 引入稳定 ID，并记录 path history，支持目录移动后的任务迁移。
- 提供统一 Assistant runtime descriptor，明确 local/cloud、instance、session、channels 和 capability 状态。
- 增加 workspace 写入冲突检测，至少在同 cwd 多个 active session 时给出提示。
- 将 ProjectService 按任务、计划、成员、资源、资产拆成显式领域 facade，同时保留统一 RPC namespace。
- 提供“当前任务上下文诊断”视图，展示 sessionId、cwd、projectId、assistant/agent、注入技能和 MCP。

## 9. 核心源码索引

| 文件 | 作用 |
|---|---|
| [`storage/drizzle/schema.js`](../packages/workbuddy-server/src/storage/drizzle/schema.js) | Session、Workspace、Automation 本地表结构 |
| [`storage/repositories/session-repository.js`](../packages/workbuddy-server/src/storage/repositories/session-repository.js) | 任务与空间持久化、软删除、workspace 发现 |
| [`session/session-manager.js`](../packages/workbuddy-server/src/session/session-manager.js) | Session 内存生命周期与运行时策略 |
| [`session/task-status.js`](../packages/workbuddy-server/src/session/task-status.js) | 任务状态机与历史恢复 |
| [`session/contract.js`](../packages/workbuddy-server/src/session/contract.js) | 任务 RPC 契约 |
| [`claw/claw-service.js`](../packages/workbuddy-server/src/claw/claw-service.js) | 本地助理渠道、账号和策略门控 |
| [`claw/core/plugin-host.js`](../packages/workbuddy-server/src/claw/core/plugin-host.js) | IM 插件生命周期、入站和出站适配 |
| [`claw/handlers.js`](../packages/workbuddy-server/src/claw/handlers.js) | Claw 消息到 Session runtime 的桥接 |
| [`cloud-agent/service.js`](../packages/workbuddy-server/src/cloud-agent/service.js) | 云助理 Agent/Instance/Conversation/Sandbox API |
| [`cloud-assistant-service.js`](../packages/product/src/cloud-assistant-service.js) | 云助理权益和 Orchestrator 初始化 |
| [`project/service.js`](../packages/workbuddy-server/src/project/service.js) | 项目领域统一门面 |
| [`project/_internal/cloud-task.js`](../packages/workbuddy-server/src/project/_internal/cloud-task.js) | 项目会话任务与 handoff |
| [`project/_internal/cloud-todo.js`](../packages/workbuddy-server/src/project/_internal/cloud-todo.js) | 项目计划 Todo GraphQL 实现 |
| [`runtime/project-resources.js`](../packages/workbuddy-server/src/runtime/project-resources.js) | 项目技能/MCP 向本地 session 注入 |
| [`workspace/handlers.js`](../packages/workbuddy-server/src/workspace/handlers.js) | Workspace 创建、初始化和路径检查 RPC |
| [`workspace/default-workspace-root.js`](../packages/workbuddy-server/src/workspace/default-workspace-root.js) | 默认根目录校验与 Claw cwd |
| [`runtime/task-conversation.js`](../packages/workbuddy-server/src/runtime/task-conversation.js) | 本地 Session 到项目任务 UI shape 的适配 |

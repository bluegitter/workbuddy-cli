# WorkBuddy技术分析报告

**调研时间：2026 年 10 月**  
**调研对象：腾讯 WorkBuddy 桌面智能体及其 Skill / Connector / Expert / Plugin 技术体系**

## 一、调研结论

从目前能够获得的公开资料和客户端编译产物证据来看，WorkBuddy 并不是一个简单的“大模型聊天客户端”，其内部更接近一套完整的**本地 Agent Runtime + 桌面工作台 + 能力插件体系 + MCP 连接器体系 + 多智能体编排体系**。

可以将 WorkBuddy 的整体技术体系概括为：

> **LLM 负责理解、规划和决策，Agent Runtime 负责循环执行，Skill 负责告诉 Agent“怎么做”，Tool/MCP/CLI 负责真正“动手做”，Expert 负责提供专业角色与工作方法，Plugin 负责把这些能力打包分发，Project/Memory/Automation 则提供持续工作的上下文和运行环境。**

从公开的 WorkBuddy 5.3.8 macOS 客户端编译产物来看，其客户端大体采用以下运行链路：

```text
┌─────────────────────────────────────┐
│           WorkBuddy Desktop          │
│                                      │
│     React Renderer / Agent UI        │
└──────────────────┬──────────────────┘
                   │ IPC / ACP / HTTP
                   ▼
┌─────────────────────────────────────┐
│       Local WorkBuddy Daemon         │
│                                      │
│ Session / Project / Memory           │
│ Automation / Connector Proxy         │
│ SQLite / File / Auth / Migration     │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│              Sidecar                 │
│       Agent CLI Process Manager      │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│        CodeBuddy Agent CLI           │
│         codebuddy --serve            │
│                                      │
│ Reasoning / Planning / Tools         │
│ Skill / Plugin / MCP / Sub-Agent     │
└──────────┬─────────────┬────────────┘
           │             │
           ▼             ▼
       Local Tool      MCP Server
       Bash/File       Connector
       Python/JS       SaaS/API
```

公开研究的 5.3.8 编译产物显示，桌面层采用 Electron 37.10.3、Node.js 22.21.1，并包含 Electron Main、Preload/IPC、React Renderer、本地 WorkBuddy Server、Daemon、Sidecar 和 CodeBuddy CLI。Agent 主执行链路被还原为：

`Electron Main → Daemon App Server → Sidecar → codebuddy --serve → ACP/HTTP → Renderer Agent UI`。

这一点非常重要：**真正负责 Agent 推理、工具选择和执行循环的核心，并不完全位于 WorkBuddy UI 内，而是与 CodeBuddy Agent CLI Runtime 深度复用。**

---

# 二、WorkBuddy 的核心并不是 Skill，而是 Agent Runtime

Skill 容易给人一种“插件就是整个系统”的印象，但从其实现来看，Skill 只是整个 Agent Runtime 的一个能力描述层。

真正的核心流程更可能是：

```text
用户输入
   ↓
Context Builder
   ↓
加载：
系统提示词
项目指令
专家 Agent Prompt
相关 Memory
Skill 描述
可用 Tools
Connector Tools
当前文件/附件
历史消息
   ↓
LLM
   ↓
判断下一步 Action
   ↓
Tool / Skill / MCP / SubAgent
   ↓
Observation
   ↓
重新进入 LLM
   ↓
继续规划
   ↓
直到生成 Artifact / Answer
```

也就是典型的：

**Reason → Act → Observe → Reason → Act**

循环。

因此 WorkBuddy 的 Agent 与传统 ChatBot 的最大区别不是模型，而是模型周围建立了一套持续运行的 **Agent Harness**。

这个 Harness 至少负责：

- 上下文组装；
- 模型调用；
- Tool Schema 注入；
- Skill 发现；
- Skill 按需加载；
- MCP Tool 调用；
- Shell/Python/JS 执行；
- 文件读写；
- 权限审批；
- Sandbox；
- Sub-Agent；
- Task 状态；
- Artifact 管理；
- Context Compression；
- Session Persistence。

WorkBuddy 官方更新日志里大量出现“工具循环检测”“上下文压缩”“subagent 注册”“plan 模式”“工具调用”“sidecar”“sandbox-cli”等概念，也进一步证明其底层是一个完整 Agent Runtime，而不是 Prompt + API 的简单封装。

---

# 三、Skill 的技术本质

WorkBuddy Skill 本质上不是传统意义上的 Java/Python 插件。

它更接近：

> **LLM 可读取的 SOP + Tool 使用说明 + Reference Knowledge + Script**

官方 Skill 目录结构为：

```text
my-skill/
├── SKILL.md
├── references/
│   ├── api-spec.md
│   └── examples.md
├── scripts/
│   ├── fetch-data.js
│   └── transform.py
└── templates/
    └── report-template.*
```

其中真正核心的是：

```text
SKILL.md
```

它采用：

```text
YAML Frontmatter
+
Markdown Instructions
```

形式。官方支持的字段包括：

```yaml
name:
description:
description_zh:
description_en:
allowed-tools:
version:
disable-model-invocation:
user-invocable:
author:
```

其中非常值得注意的是两个字段：

`disable-model-invocation` 控制是否允许模型主动触发 Skill；

`user-invocable` 控制是否向用户显示，还是仅作为内部 Agent 能力使用。

因此 Skill 并不是一个简单的 Prompt 文件，而实际上已经构成一个轻量级的**Agent Capability Definition Language**。

---

# 四、Skill 的关键设计：渐进式上下文加载

这是 WorkBuddy 技术设计中非常值得借鉴的一点。

如果把数百个 Skill 的完整内容全部塞入模型上下文，Token 会迅速爆炸。

WorkBuddy 实际采用了类似：

> **先索引 → 再匹配 → 再加载详细 Skill**

的 Progressive Disclosure 机制。

例如一个复杂专家可能只有一个顶层：

```text
skills/soe/SKILL.md
```

这个文件实际上只是“路由器”。

里面记录：

```text
漏洞分析 → references/vulnerability-analysis/...
告警分析 → references/alert-analysis/...
攻击分析 → references/attack-analysis/...
资产分析 → references/asset-management/...
```

只有判断用户属于某个意图后，才继续加载对应 reference。

公开 `soe` Expert 就明确采用：

```text
用户需求
   ↓
SKILL.md
意图识别
   ↓
选择 capability
   ↓
references/.../SKILL.md
   ↓
scripts
   ↓
执行
```

这种设计能够显著降低 Context Token 使用量。

因此可以推断 WorkBuddy 的 Skill Runtime 至少存在两级甚至三级能力发现：

```text
Skill Metadata
      ↓
SKILL.md
      ↓
References
      ↓
Scripts / Tools
```

而不是一次把全部知识注入模型。

---

# 五、Skill 实际上有两类执行模式

研究公开 Skill 后，可以把它们划分为两种。

第一类是**指导型 Skill**：

```text
SKILL.md
↓
LLM 阅读 SOP
↓
LLM 自己决定调用什么工具
```

例如：

```text
分析需求
→ 查询数据
→ 交叉验证
→ 生成报告
```

这里 Skill 本身不运行。

它只是告诉 Agent：

> 应该怎样完成任务。

第二类是**执行型 Skill**：

```text
SKILL.md
↓
调用 Bash
↓
Python / Node / CLI
↓
返回结果
```

这时 Skill 包含：

```text
scripts/*.py
scripts/*.js
templates/*
```

真正的确定性逻辑交给脚本执行。

因此 WorkBuddy 实际形成了一种很合理的能力划分：

```text
LLM
负责不确定性问题

Script
负责确定性问题
```

即：

> **智能编排 + 确定性执行。**

---

# 六、Connector 与 Skill 的区别

WorkBuddy 的 Connector 并不是 Skill。

两者承担不同职责：

```text
Skill
回答：
“应该怎么完成任务？”

Connector
回答：
“外部系统能提供什么能力？”
```

官方当前推荐两类 Connector：

```text
MCP + Skill

CLI + Skill
```

其中 MCP + Skill 是首选方案。

典型 Connector：

```text
connector/
├── connector-meta.json
├── mcp.json
├── icon.svg
└── skills/
    └── xxx/
        └── SKILL.md
```

可以看出：

**MCP 是能力接口，Skill 是使用说明。**

例如金融连接器可能提供：

```text
fin_data__get_quote
fin_data__get_financial
doc_search__search
fin_graph__industry
```

但是 LLM 并不一定知道什么时候应该调用哪一个。

于是 Connector 同时附带：

```text
SKILL.md
```

告诉 Agent：

```text
行情问题 → fin_data__
研报问题 → doc_search__
行业关系 → fin_graph__
```

公开的 `tongzhou-fin-research` 就采用这种结构。

因此从架构上可以概括为：

```text
MCP = API Layer

Skill = Semantic Layer
```

这是一个非常重要的设计思想。

---

# 七、MCP 在 WorkBuddy 中的位置

WorkBuddy 对 MCP 的支持已经不是简单的 MCP Client。

官方 Connector 文档明确支持：

```text
Remote MCP
    HTTPS
    SSE
    Streamable HTTP

Local MCP
    stdio
```

同时支持 OAuth。

其 OAuth 流程包括：

```text
MCP Request
↓
401
↓
发现 OAuth Metadata
↓
Dynamic Client Registration
↓
浏览器授权
↓
OAuth 2.1 + PKCE
↓
Token Exchange
↓
Bearer Token
↓
tools/list
↓
tools/call
```

WorkBuddy 内置 OAuth Manager，并以公共客户端方式工作，不要求客户端保存 client_secret。

这意味着 Connector Runtime 实际承担了：

```text
MCP Transport
MCP Discovery
OAuth
Token Management
Permission
Tool Filtering
Tool Routing
```

而不仅是把一个 MCP URL 填进去。

---

# 八、Expert 的技术实现

Expert 并不等于另一个模型。

它更接近：

> **Agent System Prompt + Skill + Tool + Connector Dependency**

典型 Expert：

```text
expert/
├── .codebuddy-plugin/
│   └── plugin.json
├── agents/
│   └── expert.md
├── skills/
│   └── xxx/
│       └── SKILL.md
├── avatars/
└── .mcp.json
```

其中：

```text
agents/expert.md
```

负责：

```text
身份
角色
专业背景
工作原则
输出标准
决策方式
```

而：

```text
skills/*
```

负责具体 SOP。

因此可以理解为：

```text
Expert
   =
Agent Persona
+
Domain Methodology
+
Skills
+
Tools
+
Connector
```

官方也明确把 Expert 描述为：

> “人设 + 方法论 + 工具链”。

专家本身并不天然获得系统权限；只有配置 Skill 或 MCP 后，才能在授权范围内间接访问文件和外部服务。

---

# 九、Expert Team 本质是 Multi-Agent

Expert Team 则进一步演化为：

```text
Leader Agent
    │
    ├── Expert A
    ├── Expert B
    ├── Expert C
    └── Expert D
```

Leader 的职责是：

```text
Understand
↓
Decompose
↓
Delegate
↓
Parallel Execute
↓
Collect
↓
Resolve Conflicts
↓
Synthesize
```

WorkBuddy 官方描述即为：

> 多位专家分工协作，由团长自动拆解、并行执行并整合交付。

因此 Expert Team 已经属于典型的：

**Supervisor Multi-Agent Architecture**

而不是简单串联多个 Prompt。

---

# 十、Plugin 是更高一层的能力分发容器

如果把 Skill 看成一个函数，那么 Plugin 更接近一个 Package。

公开插件规范中可以包含：

```text
plugin/
├── .codebuddy-plugin/
│   └── plugin.json
├── commands/
├── agents/
├── skills/
├── rules/
├── hooks/
├── .mcp.json
├── .lsp.json
└── scripts/
```

即一个 Plugin 可以同时携带：

```text
Command
Agent
Skill
Rule
Hook
MCP
LSP
Script
```

因此 WorkBuddy 的扩展体系实际上形成：

```text
Plugin
 ├─ Agent
 ├─ Skill
 ├─ Command
 ├─ MCP
 ├─ Hook
 └─ Rule
```

而市场只是负责：

```text
Discover
Download
Install
Version
Update
```

这套设计已经非常接近一个**Agent 应用商店 / Agent Package Manager**。

---

# 十一、workbuddyskills 仓库揭示出来的市场结构

你提供的：

`infometa/workbuddyskills`

非常有研究价值。

它并不是 WorkBuddy 源码，而是 WorkBuddy / CodeBuddy 公开市场 CDN 内容的自动归档。

当前仓库公开结构为：

```text
skills/
connectors/
experts/
plugins/
CATALOG.md
```

截至本次调研页面显示：

```text
Skill       295
Connector   443
Expert      429
官方插件      60
团队插件      31
```

并且仓库每日从公开市场源同步。

安装位置也暴露了一部分 Runtime 机制：

```text
~/.workbuddy/skills/

~/.workbuddy/plugins/
    marketplaces/
        experts/
        plugins/

~/.workbuddy/connectors-marketplace/
```

这说明 WorkBuddy 的市场体系并不是所有逻辑都在线运行。

大量 Skill / Plugin 会被：

```text
Download
↓
Local Install
↓
Local Discover
↓
Runtime Load
```

因此完全可以支持企业构建一个：

**私有 WorkBuddy Skill Marketplace**

甚至在内网环境完全离线运行。

---

# 十二、本地 Runtime 技术架构

基于 WorkBuddy 5.3.8 客户端编译产物分析，其本地架构大体可以恢复为：

```text
Desktop UI
│
├── Electron Main
│
├── React Renderer
│
├── Preload / IPC
│
└── Local Daemon
       │
       ├── Agent Session
       ├── SQLite
       ├── File System
       ├── Memory
       ├── Automation
       ├── MCP Proxy
       ├── Connector
       ├── Auth
       └── Migration
            │
            ▼
         Sidecar
            │
            ▼
      CodeBuddy CLI
```

编译产物中甚至保留了类似以下 Monorepo 模块名：

```text
packages/agent-ui
packages/agent-provider
packages/agent-client-protocol
packages/workbuddy-app
packages/workbuddy-core
packages/workbuddy-server
packages/runtime
packages/context
packages/authentication
packages/telemetry
packages/enterprise-policy
packages/plugin-core
packages/sandbox-cli
```

这表明腾讯内部很可能并不是为 WorkBuddy 单独重新开发一套 Agent Engine，而是将 CodeBuddy 的 Agent Runtime、Plugin Core、Context Engine、安全机制和工具体系抽象成公共模块，在 WorkBuddy 上重新构建办公 Agent 产品。

---

# 十三、为什么存在 Daemon + Sidecar

这一结构很值得关注。

如果 Electron UI 自己直接执行 Agent：

```text
UI
↓
LLM
↓
Shell
```

会存在：

```text
UI 卡死
进程崩溃
权限混乱
无法后台运行
无法多 Session
无法远程控制
```

WorkBuddy 将 Agent 拆到独立进程：

```text
UI
   ↓
Daemon
   ↓
Sidecar
   ↓
Agent CLI
```

于是可以实现：

```text
Session A → CLI Process A

Session B → CLI Process B

Session C → CLI Process C
```

UI 即使切换任务：

Agent 仍然继续执行。

这也是 WorkBuddy 能支持：

```text
后台长任务
多个任务并行
自动化
手机远程触发
专家团
Sub-Agent
```

的重要技术基础。

---

# 十四、本地数据与 Session

公开编译产物分析显示，本地 WorkBuddy Server 负责：

```text
Session
Automation
Memory
Migration
Local Files
SQLite Persistence
```

官方更新日志又明确出现：

```text
数据库 WAL 写入
WAL checkpoint
session
artifact cache
task state
history migration
```

因此基本可以判断其本地状态不是纯云端保存，而是采用：

```text
SQLite
+
Local Files
+
Cloud Services
```

混合方式。

一个第三方针对本地 WorkBuddy 文件结构的研究进一步观察到：

```text
~/.workbuddy/workbuddy.db
workbuddy.db-wal
workbuddy.db-shm
projects/
sessions/
tasks/
memory/
connectors/
file-history/
artifact-index/
blobs/
logs/
```

不过这一部分属于非官方逆向资料，应作为辅助证据，而不应作为官方接口依赖。

---

# 十五、Memory 的实现思路

官方已经明确披露 Memory 的基本逻辑：

WorkBuddy 会从历史会话中提取：

```text
事实信息
偏好
习惯
人物关系
近期事项
```

形成 Memory，并在后续请求相关时重新加入 Context。

其处理方式不是：

```text
把全部聊天记录重新塞入 LLM
```

而更可能是：

```text
Conversation
↓
Memory Extraction
↓
Memory Summary
↓
Memory Store

新任务
↓
Current Query
↓
Relevant Memory Selection
↓
Context Injection
```

官方说明 Memory 每晚整理当天会话，并在未来对话时将相关记忆作为背景信息。

这实际上已经属于：

**Long-Term Agent Memory**

而普通 Session History 属于：

**Short-Term Memory**。

---

# 十六、Project 是 Context Container

Project 也不是普通文件夹。

从技术角度看，更像：

```text
Project
{
    instructions
    files
    skills
    experts
    connectors
    members
    tasks
}
```

新 Task 创建时：

```text
Project Context
       +
Task Context
       +
User Context
       ↓
Agent Context
```

官方明确表示项目能够统一注入：

```text
项目指令
项目资料
Skill
Expert
Connector
```

因此 Project 实际上是：

> **一个持久化 Agent Context Namespace。**


---

# 十七、Automation 的实现

Automation 本质不是传统 RPA。

更可能是：

```text
Scheduler
↓
Trigger
↓
Create Agent Session
↓
Inject Prompt
↓
Load Project Context
↓
Agent Runtime
↓
Tools / Connector
↓
Artifact
↓
Notification
```

例如：

```text
每天 18:00
↓
创建 Task
↓
加载企业微信 Connector
↓
读取聊天
↓
Skill：日报生成
↓
生成报告
↓
推送企业微信
```

官方已经支持在 Project 内设置定时任务，到达指定时间后自动执行 Prompt。

因此：

**Automation = Scheduler + Agent**

而不是 Scheduler + 固定脚本。

---

# 十八、安全模型

WorkBuddy 的另一个核心不是模型，而是权限系统。

因为 Agent 可以：

```text
执行 Bash
读取文件
修改文件
调用 API
发送消息
访问 SaaS
```

所以必须建立：

```text
Permission Engine
+
Sandbox
+
Connector Auth
```

官方文档披露了多种权限模式，包括：

```text
default
acceptEdits
auto
dontAsk
plan
bypassPermissions
delegate
```

其中 Plan 只规划；default 对危险动作进行确认；delegate 则偏向只允许协调和任务拆分。

官方更新日志甚至披露过：

```text
sandbox-cli
目录写保护
黑白名单
工具循环检测
危险命令
沙箱通配符修复
沙箱逃逸链修复
```

这说明 WorkBuddy 已经形成：

**Agent Tool Security Layer**

而不是仅靠 Prompt 要求模型“不要执行危险命令”。

---

# 十九、WorkBuddy 的整体能力分层

综合所有公开证据，可以将其架构抽象为七层：

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L7  Application
Project / Automation / Claw

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L6  Agent
Expert / Expert Team / Sub-Agent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L5  Knowledge & Workflow
Skill / Reference / Rule

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L4  Tool
Bash / Python / File / Browser
CLI / Computer Use

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L3  Integration
MCP / Connector / OAuth

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L2  Agent Runtime
Planning
Context
Tool Calling
Task
Artifact
Memory

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

L1  Model
Hunyuan
DeepSeek
GLM
Kimi
MiniMax
etc.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

因此真正值得复制的不是某一个 Skill，而是：

> **这七层之间的解耦方式。**

---

# 二十、一次完整任务的内部执行推演

例如用户输入：

> “分析最近一周新能源政策，并形成汇报 PPT。”

运行过程大致可能是：

```text
1 User Query
      ↓
2 Context Builder

加载：
User Memory
Project Instructions
Project Files
Available Skills
Available Connectors

      ↓
3 LLM Planning

拆解：
政策检索
材料整理
趋势分析
PPT制作

      ↓
4 Skill Router

research skill
PPT skill

      ↓
5 Connector Selection

Search MCP
Document MCP

      ↓
6 Tool Execution

tools/list
tools/call

      ↓
7 Observation

返回搜索结果

      ↓
8 Agent Reasoning

筛选、验证、分析

      ↓
9 Skill

PPT generation workflow

      ↓
10 Script / Tool

Python / JS / Artifact Tool

      ↓
11 Artifact

xxx.pptx

      ↓
12 Agent

检查结果

      ↓
13 Present Artifact
```

因此 WorkBuddy 实际上是在 LLM 外面构建了一个：

**Agent Operating Environment**。

---

# 二十一、WorkBuddy 与 OpenClaw 的关系判断

公开资料对此曾有大量相互矛盾的报道，一部分早期文章称 WorkBuddy 基于 OpenClaw。

但腾讯自己的公开材料目前明确把：

```text
WorkBuddy
```

描述为：

**Self-developed desktop workstation AI agent**

而：

```text
QClaw
```

才明确标为：

**Local AI agent based on OpenClaw**。

结合 WorkBuddy 编译产物中大量：

```text
CodeBuddy
agent-cli
agent-provider
workbuddy-core
plugin-core
```

模块，可以比较有把握地判断：

> WorkBuddy 的核心 Agent Runtime 来自腾讯自身 CodeBuddy 技术体系，而不是直接运行 OpenClaw Core。

它与 OpenClaw 更大的相似性在于：

```text
Skills
MCP
Local Tools
Agent
Automation
```

这些 Agent 生态设计理念和格式具有很强兼容性，而并非底层代码相同。

---

# 二十二、对公司自研 AI 平台最值得借鉴的部分

结合我们现在建设的御风、御电以及企业内部 AI Agent 平台，WorkBuddy 最值得借鉴的并不是桌面 UI，而是以下几个架构思想。

第一是：

**Skill 与 Tool 分离。**

不要把 Skill 写成 API。

建议：

```text
Tool
= 能做什么

Skill
= 怎么做

Expert
= 谁来做

Workflow
= 按什么流程做
```

例如电力领域：

```text
Tool：
查询电网设备

Skill：
设备异常分析方法

Expert：
调度运行专家

Workflow：
事故处置流程
```

这样能力才能长期复用。

第二是：

**Skill 采用 Markdown + References + Scripts。**

可以设计企业自己的：

```text
power-skill/
├── SKILL.md
├── references/
│   ├── 调度规程.md
│   ├── 事故处理规范.md
│   └── 设备模型.md
├── scripts/
└── templates/
```

这比把所有知识都写入系统 Prompt 更容易治理。

第三是：

**采用 Progressive Loading。**

不要：

```text
100 个 Skill
全部放 Context
```

而应该：

```text
Skill Catalog
↓
Top-K Skill
↓
SKILL.md
↓
Reference
```

这会直接影响 Token 成本、模型准确率和 Agent 稳定性。

第四是：

**建立统一 Agent Runtime。**

御风代码开发助手、数据库设计助手、文档助手、原型助手不宜长期分别维护自己的 Agent Loop。

更合理的是：

```text
            Agent Runtime
          /      |       \
       Skill    MCP     Model
         |       |        |
代码助手 数据库助手 文档助手
```

前端产品可以不同，但底层：

```text
Session
Context
Memory
Skill
Tool
MCP
Permission
Artifact
Sub-Agent
```

应该逐步统一。

第五是：

**建设公司内部 Skill Store。**

可以借鉴 WorkBuddy Marketplace：

```text
企业 Skill Hub

调度
运检
配网
新能源
两票
研发
测试
项目管理
经营分析
```

每个 Skill 都拥有：

```text
owner
version
description
trigger
allowed-tools
references
scripts
permission
```

最终让公司的专家经验真正变成：

> **AI 可以调用的软件资产。**

---

# 二十三、建议形成的企业 Agent 技术体系

如果参考 WorkBuddy 架构，同时结合电力公司的实际情况，可以形成：

```text
                 亿丰 / 御电 / 御风
                        │
                   Agent Portal
                        │
              ┌─────────┴─────────┐
              │                   │
         Agent Runtime        Multi-Agent
              │
      ┌───────┼────────┐
      │       │        │
    Skill    MCP     Memory
      │       │        │
      │       │        │
 Skill Hub  Tool Hub  Knowledge
      │
      ├─ 调度 Skill
      ├─ 运检 Skill
      ├─ 两票 Skill
      ├─ 新能源 Skill
      ├─ 项目管理 Skill
      └─ 研发 Skill
```

下面再统一接：

```text
模型网关
├─ Qwen
├─ DeepSeek
├─ GLM
├─ 本地模型
└─ 外采模型
```

形成：

> **模型层—Agent Runtime—Tool/MCP—Skill—Expert—业务应用**

六层能力体系。

---

# 二十四、最终判断

WorkBuddy 真正有价值的技术不是“装了很多 Skill”。

它真正建立的是：

> **一个以 LLM 为 CPU、Skill 为 SOP、MCP/Tool 为设备接口、Memory 为长期状态、Expert 为软件角色、Plugin 为软件包、Project 为工作空间、Agent Runtime 为操作系统内核的 AI 工作环境。**

因此如果只学习 `workbuddyskills` 仓库里的 Skill 写法，会学到大约 30% 的东西。

更值得研究的另外 70% 是：

```text
Agent Runtime
Context Engineering
Tool Runtime
Progressive Skill Loading
Permission Engine
Sandbox
Memory
Session
Artifact
Sub-Agent
Automation
Plugin Marketplace
```

从目前公开证据判断，WorkBuddy 的核心竞争力恰恰集中在这部分。

---

## 证据可信度说明

**A级——官方公开资料**

WorkBuddy 开放平台、腾讯云 WorkBuddy Enterprise 文档。Skill、Connector、OAuth、Expert、Project、Memory、权限机制等内容可以视为官方确认。

**B级——官方公开市场数据归档**

`infometa/workbuddyskills` 来自公开 CDN/市场包，可以较高可信度用于研究 Skill、Connector、Expert 与 Plugin 的实际包结构，但它不是 WorkBuddy 主程序源码。

**C级——客户端编译产物研究**

`bianyh/workbuddy-cli` 对 WorkBuddy 5.3.8 macOS arm64 客户端编译产物进行了整理，可用于理解 Electron、Daemon、Sidecar、CodeBuddy CLI 等内部结构；因为并非腾讯官方源码发布，因此本文将其视为逆向/编译产物证据，而不是官方架构承诺。

**D级——架构推断**

本文中的 Context Builder、Skill Router、Agent Loop 等流程图，是根据上述公开接口、包结构、官方功能以及编译产物共同推导出的架构模型，用于技术分析，不代表腾讯官方公布的内部详细设计。
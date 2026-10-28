# WorkBuddy Agent 执行期间网页搜索能力技术分析

## 结论摘要

WorkBuddy 的网页搜索是 Agent 工具调用链中的一个只读内置工具，而不是 Renderer 直接访问搜索引擎。典型执行路径如下：

```text
用户请求
  ↓
Session Runtime Config：按 mode 注入 WebSearch
  ↓
模型输出 WebSearch tool_use(query, filters, topic...)
  ↓
CLI WebSearchTool：参数校验、权限/工具生命周期
  ↓
ProductManager + AuthenticationManager + ClientInfoProvider
  ↓
POST {product.endpoint}/agenttool/v1/search
  ↓
业务搜索服务返回 provider/results
  ↓
格式化为 Markdown 文本 + tool result
  ↓
Agent 下一轮继续推理，最终在 UI 展示搜索活动和结果
```

从源码和 5.3.8 Bundle 可确认的关键事实：

- 工具规范名为 `WebSearch`，UI 内部映射名为 `web_search`。
- 请求目标是产品 endpoint 下的 `/agenttool/v1/search`，不是浏览器直连 Google/Bing，也不是 MCP Server。
- 默认最多请求 5 条结果，客户端超时 20 秒。
- 支持 `allowed_domains`、`blocked_domains`、最多 5 个 `query_keyword_groups` 和 `topic` 分类。
- 请求携带 Bearer token、会话/请求/消息标识、Agent mode、产品/IDE/企业信息等业务头。
- 返回结果被压缩为 `title/url/snippet`，再渲染成 Markdown；结构化 schema 还支持 images、highlights、content 等扩展字段。
- `WebSearch=false` 会在 WorkBuddy Server 层反向加入 `disabledTools`，避免 desktop sidecar 仍把 WebSearch 放进 `--tools` 白名单。

## 1. 证据范围与可信度

本报告使用三类证据：

1. `runtime-app/cli/dist/codebuddy.js`：5.3.8 CLI 生产 Bundle 中可定位到 `WebSearchTool`、参数 schema、API path、请求头、超时、响应映射和 Markdown 格式化逻辑。
2. `runtime-app/cli/product*.json`、`packages/authentication/src/runtime/session-config.js`：工具白名单、模式差异、产品开关和运行配置。
3. `packages/workbuddy-server/src/source/initialize.js`、`packages/workbuddy-server/src/server/app-server-session-manager.js`、`packages/agent-ui/src/source/renderer-entry.js`：工具名映射、结果 schema、UI 权限与展示边界。

Bundle 是生产运行证据，恢复后的源码/薄封装主要用于验证边界；由于 CLI 主体仍是压缩产物，不能把 Bundle 变量名当作原始源码 API。

## 2. 工具暴露与启用策略

### 2.1 工具注册

`runtime-app/cli/product.json` 的工具清单包含：

```json
{ "name": "WebSearch", "description": "tool-websearch-description" }
```

同一配置将 `WebSearch` 和 `DynamicAddWebSearch` 设为 true；self-hosted/cloudhosted 配置可以将 `WebSearch` 设为 false。这说明“工具是否存在”和“业务接口是否可调用”由产品配置共同控制。

### 2.2 按模式注入工具

`packages/authentication/src/runtime/session-config.js` 定义模式工具集：

- `craft`：包含 WebSearch；
- `ask`：仅保留 Read、AskUserQuestion、WebFetch、WebSearch、Glob、Grep 等只读/问答工具；
- `plan`/`expert`：继承完整规划工具集。

因此网页搜索是 Agent 可用工具集合的一部分，但不是所有会话都必然启用。运行时解析出的 `tools` 会进入 session restart fingerprint；切换模式或工具集合可能触发后端重启。

### 2.3 产品开关的服务端补偿

`packages/workbuddy-server/src/server/app-server-session-manager.js` 定义：

```js
const PRODUCT_FEATURE_DISABLED_TOOLS = [{ feature: 'WebSearch', tool: 'WebSearch' }];
```

当 `productFeatures.WebSearch === false` 时，disabled-tools resolver 将 `WebSearch` 合并到调用方禁用列表。生产 Bundle 的注释解释了原因：desktop 主链路的 `--tools` 白名单源自 mode-tools-config，过去不读取 productFeatures，可能导致私有化配置关闭搜索后 sidecar 仍收到 WebSearch。该 resolver 是配置层的 fail-closed 修补。

## 3. Agent 如何触发搜索

网页搜索遵循通用 Agent tool-use 回合，而不是在用户输入阶段预先搜索：

1. 模型根据 system prompt、当前消息和可用工具 schema 判断是否需要搜索；
2. 输出 `WebSearch` tool call，核心参数是 `query`；
3. Agent runtime 将 tool call 交给工具执行器；
4. 工具结果以 tool result 回灌上下文；
5. 模型可继续搜索、调用 WebFetch 阅读单页、或直接综合回答。

`packages/agent-provider/src/runtime/session-activity.js` 将 `WebSearch` 映射为 “Searching”，并从 tool_use 的 `query` 生成活动摘要；`packages/agent-ui/src/source/renderer-entry.js` 将 CLI 名映射为 UI 名 `web_search`。因此 UI 看到的“正在搜索”来自 ACP/stream-json 工具事件，而不是独立的浏览器状态。

## 4. WebSearchTool 参数契约

Bundle 中的 Zod schema 等价于：

```text
query: string, 最少 2 个字符
allowed_domains?: string[]
blocked_domains?: string[]
query_keyword_groups?: string[], 最多 5 组
topic?: general | news | programming | documentation | academic
        | finance | technology | legal | medical
```

工具还提供：

- `argumentRenderer.displayProperties = [{ name: 'query' }]`，用于 CLI 工具卡片摘要；
- `toAutoClassifierInput()` 返回 query，供自动权限分类器使用；
- `aliases = ['read']`，说明工具层兼容旧名称，但 canonical name 仍为 `WebSearch`。

`query_keyword_groups` 是重要的产品化约束：比较多个技术/产品或跨多个子主题时，应一次调用传入多组关键词，最多 5 组，而不是让模型发起多个独立搜索。这既改善结果覆盖，也降低请求次数和配额消耗。

## 5. 请求构造与网络链路

### 5.1 Endpoint 与认证

`performWebSearch()` 首先等待 `ProductManager.waitConfiguration()`，读取运行环境的 `endpoint`，拼接：

```text
POST {endpoint}/agenttool/v1/search
```

若当前认证会话没有 `accessToken`，立即失败并返回“Authentication required for web search”。这表明搜索能力复用 WorkBuddy CLI 的登录态，而不是维护独立搜索 API key。

### 5.2 业务请求头

请求头包含以下几类信息：

| 类别 | 典型字段 | 用途 |
| --- | --- | --- |
| HTTP 基础 | `Accept`、`Content-Type`、`X-Requested-With` | JSON API 调用识别 |
| 认证 | `Authorization: Bearer ...` | 用户身份与权限 |
| 产品/客户端 | `User-Agent`、`Product`、`IDE-Type`、`IDE-Name`、`IDE-Version` | 端/版本路由、统计、灰度 |
| 会话追踪 | conversation id、conversation request id、message id、request id | 关联 Agent 回合、日志、重试和计费 |
| Agent 语义 | `Agent-Intent`，默认 `craft` | 后端区分 ask/craft 等运行模式 |
| 组织信息 | user id、enterprise id、`X-Department-Info` | 企业路由与组织策略 |

调用 `IOAUtils.applyIOADefaultHeaders()` 补充企业/IOA 默认头；个人账号且无 enterprise id 时跳过部分企业头。

### 5.3 查询转换

客户端不会把 domain filters 作为独立结构直接交给后端，而是改写 query：

- `allowed_domains` → `site:a OR site:b`；
- `blocked_domains` → `-site:a -site:b`；
- 当前实现的两个分支都从原始 query 重新赋值；若两者同时存在，`blocked_domains` 分支会覆盖前面生成的 allow-domain 表达式，而不是可靠地合并两组条件。

请求体固定为 `type: "text2text"`、`max_results: 5`，并附带原始 query 转换结果、keyword groups 和 topic。

这种设计把域名限制降级为搜索语法约束，而不是后端强制过滤器；同时应修复双过滤器覆盖问题，并由服务端对最终 URL 做二次校验，才能保证域名策略的最终强度。

### 5.4 超时与错误

工具创建 `AbortController`，20 秒后 abort；超时错误带 request id。非 2xx 响应包含 HTTP status/statusText，JSON 中存在 `code` 时转换为业务错误。错误会被包装为：

```text
Error during web search for query "...": ...
```

CLI 另一处错误分类表将业务码 `15001` 归类为 `quota_web_search`，说明搜索配额是独立的计费/配额失败类型，而非普通 request limit。

## 6. 响应归一化与 Agent 消费

后端响应被映射为：

```js
{
  provider,
  results: [{ title, url, snippet }],
  total_results,
  response_time_ms
}
```

缺失标题使用 `Untitled`，缺失 url/snippet 使用空字符串。没有结果时工具不返回空 JSON，而是生成：

```text
No search results found for query: "..."
```

有结果时格式化为 Markdown：每条包含标题链接、snippet、显式 URL，末尾带结果数、provider 和搜索日期。该文本既能被模型继续阅读，也能直接在终端/会话记录中展示。

服务端的 `web_search_tool_result` schema 比 CLI 当前格式更丰富，允许 `site`、`highlights`、`content`、favicon、images、`searchInput` 等字段；这说明协议层为富搜索卡片预留了扩展，但当前 CLI `formatSearchResults()` 只消费 title/url/snippet。

## 7. UI、历史与兼容映射

网页搜索在不同层有三种名称：

| 层 | 名称 |
| --- | --- |
| CLI canonical tool | `WebSearch` |
| Agent/自动化内部名 | `web_search` |
| UI tool card | `web_search` |

`packages/workbuddy-server/src/source/initialize.js` 的 `TOOL_NAME_MAP` 把 `web_search` 映射回 `WebSearch`，用于历史迁移和 CBC 展示；`packages/agent-ui/src/source/renderer-entry.js` 则将 `WebSearch` 映射成 UI 工具类型。命名映射是必要的兼容层，否则历史记录、工具卡片和权限逻辑会出现同一工具多实体的问题。

自动化工具分类把 `web_search` 放入 `READ_ONLY_AUTOMATION_TOOLS`，意味着自动化重试/幂等判断把它当作只读工具；它不会像 `execute_command`、文件写入或投递工具那样被视为外部副作用。

## 8. 与 WebFetch、MCP 和 hosted web_search 的区别

### WebFetch

`WebFetch` 是对已知 URL 获取网页内容；`WebSearch` 负责从 query 找候选结果。常见 Agent 组合是：先 WebSearch 找来源，再 WebFetch 阅读具体页面。二者权限/UI 名称独立，不能把搜索结果的 snippet 当作完整网页内容。

### MCP

当前内置 WebSearch 直接调用产品业务 API，不经过 MCP server discovery、MCP tool registry 或 connector proxy。MCP 仍可提供其他搜索服务，但那会以 `mcp__<server>__<tool>` 形式出现，不能与 canonical `WebSearch` 混淆。

### hosted lowercase `web_search`

同一 CLI Bundle 还包含模型 SDK 的 `webSearchTool()`，生成 `type: "hosted_tool"`、`name: "web_search"` 的 providerData。这是模型厂商托管搜索能力的描述对象，与 WorkBuddy 的 `WebSearchTool`（自有 `/agenttool/v1/search`、Bearer 认证、业务头）是两条实现。当前产品工具清单和模式配置明确注册的是大写 `WebSearch`，因此分析本地 Agent 时应以自有工具链为主。

## 9. 安全、隐私与可靠性边界

- **认证复用**：搜索请求携带用户 Bearer token，未登录直接失败；token 不应进入 tool result 或 Markdown。
- **上下文泄露面**：query、conversation id、user/enterprise/department 信息进入业务 API，搜索服务可据此做审计、配额和路由；应避免把本地文件内容或敏感提示词拼进 query。
- **域名过滤强度**：客户端通过 `site:`/`-site:` 改写，属于软约束；若企业场景要求强制 allowlist，应由服务端对最终 URL 做二次校验。
- **结果可信度**：搜索结果只提供标题、URL 和 snippet，不能视为已验证事实；模型需要 WebFetch 或其他一手来源复核，尤其是金融、医疗、法律主题。
- **超时/配额**：20 秒客户端超时与独立 quota_web_search 错误码能避免 Agent 无限等待，但应把 request id 与会话事件关联记录。
- **功能关闭**：产品开关关闭时必须同时影响 mode tools、disabledTools 和实际后端授权；当前 server resolver 正是为补齐这条链路。

## 10. 建议的测试与改进

1. 为 WebSearchTool 增加脱离 Bundle 的契约测试：query 最小长度、domain 改写、keyword groups 上限、topic 枚举和空结果。
2. 用 mock fetch 验证 Bearer/header 集合、request id、20 秒 abort、非 2xx 和业务 `code` 错误映射。
3. 修复 `allowed_domains` 与 `blocked_domains` 同时出现时的 query 覆盖，再增加服务端二次 URL 校验，避免仅依赖 query 语法。
4. 在 tool result 中保留结构化 `provider/total_results/response_time_ms`，不要只保留 Markdown；便于 UI 引用、审计和重放。
5. 统一 `WebSearch`/`web_search` 的 canonicalization，并为历史迁移提供版本化映射。
6. 对 query 做敏感信息检测或最小化日志策略，避免 conversation metadata 与用户搜索词在普通 debug 日志中扩散。
7. 明确 hosted `web_search` 是否启用；若未启用，应在产品配置或工具注册层隐藏，避免模型同时看到两个语义相近的搜索工具。

## 11. 结论

WorkBuddy 的网页搜索能力本质上是一个“由 Agent 决策、由 CLI 执行、由业务 API 提供结果、再回灌模型上下文”的只读工具。它的产品化特征集中在：按会话模式控制工具可见性、复用登录态与企业路由、携带完整链路追踪头、提供域名/topic/多角度查询约束、区分搜索配额错误，以及在 UI/历史层维护工具名兼容映射。

最重要的工程边界是：**搜索不是浏览器自动化，也不是 MCP 默认能力；Agent 只产生结构化 WebSearch tool call，真正的网络访问发生在 CLI 的业务 API 客户端中。**

## 附录：核心源码索引

| 主题 | 文件/证据 |
| --- | --- |
| WebSearchTool 实现 | `runtime-app/cli/dist/codebuddy.js`（`WebSearchTool` source-region，含 schema、API path、headers、timeout、formatSearchResults） |
| 工具白名单与产品开关 | `runtime-app/cli/product.json`、`product.selfhosted.json`、`product.cloudhosted.json` |
| 模式工具集 | `packages/authentication/src/runtime/session-config.js` |
| WebSearch 禁用补偿 | `packages/workbuddy-server/src/server/app-server-session-manager.js` |
| 结果协议 schema | `packages/workbuddy-server/src/source/initialize.js` 的 `web_search_tool_result` |
| CLI/UI 名称映射 | `packages/workbuddy-server/src/source/initialize.js`、`packages/agent-ui/src/source/renderer-entry.js` |
| 活动摘要 | `packages/agent-provider/src/runtime/session-activity.js` |
| 配额错误分类 | `runtime-app/cli/dist/codebuddy.js` 的 `quota_web_search` 映射 |
| 行为测试现状 | `test/app-server-session-manager.spec.js`（功能关闭时 disabledTools） |

# WorkBuddy 5.3.8 客户端代码结构说明

## 1. 项目概览

当前目录整理了 WorkBuddy 5.3.8 macOS arm64 客户端的编译产物，主要包括：

- Electron 主进程
- Preload 与 IPC 接口
- React 渲染层
- 本地 WorkBuddy Server
- Daemon 与 Sidecar
- CodeBuddy CLI
- Skills、Plugins 与 MCP Apps

本项目可用于了解客户端模块组成、启动流程以及各本地组件之间的协作方式。

## 2. 目录结构

```text
workbuddy-cli/
├── README.md
├── runtime-app/
│   ├── cli/
│   ├── main/
│   ├── native/
│   ├── node_modules/
│   ├── preload/
│   ├── renderer/
│   ├── resources/
│   ├── tencent-docs/
│   └── package.json
└── metadata/
    ├── Info.plist
    ├── app-asar-header.json
    ├── extraction-summary.json
    ├── extracted-files.sha256
    └── SHA256SUMS.txt
```

`runtime-app/` 是 `app.asar` 与当前平台外置资源合并后的代码目录，`metadata/` 保存版本、文件清单和校验信息。

从编译产物中恢复出的原始 monorepo 边界位于 `packages/`。由于发布包不包含 TypeScript 源码，各包的 `src/compiled/` 使用相对链接指向 `runtime-app/` 中的同一份文件，不复制或修改运行时产物。模块职责和映射见 [docs/模块拆分说明.md](docs/模块拆分说明.md)，可用 `npm run verify:structure` 检查包清单和链接完整性。

## 3. 版本信息

- 产品版本：`5.3.8`
- Bundle Identifier：`com.workbuddy.workbuddy`
- 应用包名：`@genie/workbuddy-desktop`
- 应用描述：`WorkBuddy Desktop - AI Agent Desktop Application`
- 签名主体：`Tencent Technology (Shanghai) Company Limited (FN2V63AD2J)`
- 运行时：Electron `37.10.3`、Node.js `22.21.1`
- `app.asar` SHA-256：`bd77f36656d19d58862614b24a62156505e17e31c6830c3c2e0381d1d5c7f0f1`

文件概览：

- ASAR 文件条目：`18,019`
- ASAR 目录条目：`2,427`
- 目录内文件：`18,009`
- ASAR 内打包文件：`17,216`
- 当前平台外置文件：`793`

详细清单见：

```text
metadata/extraction-summary.json
metadata/extracted-files.sha256
metadata/SHA256SUMS.txt
```

## 4. 主要代码模块

### 4.1 Electron 主进程

入口：

```text
runtime-app/main/index.js
```

该文件是 CommonJS 编译产物，负责桌面应用的主要生命周期，包括：

- 应用启动与退出
- BrowserWindow 管理
- 菜单、托盘和快捷键
- Deep Link 与自定义协议
- IPC 注册
- 更新流程
- 本地后台进程管理

代码中保留了较多模块名称、注释和原工程路径标记，例如：

```text
src/main/index.ts
src/main/bootstrap/main-bootstrap.ts
src/main/window/window-manager.ts
src/main/daemon/daemon-process-manager.ts
src/main/tencent-docs/webview-preload-bridge.ts
packages/workbuddy-server/src/...
packages/agent-provider/src/...
packages/telemetry/src/...
packages/product/src/...
```

### 4.2 Preload 与 IPC

入口：

```text
runtime-app/preload/index.js
```

该模块通过 `electron.contextBridge.exposeInMainWorld` 向渲染层提供桌面能力，并使用 `electron.ipcRenderer.invoke`、`send` 和事件监听与主进程通信。

主要接口域包括：

- 窗口控制
- 文件与目录选择
- 剪贴板
- 通知
- URL 打开
- 本地文件访问
- 全局快捷键
- 本地 Daemon 通信

部分通道示例：

```text
workbuddy:invoke
workbuddy:event:*
workbuddy:local-daemon-transport:port
workbuddy:window:minimize
workbuddy:window:maximize
workbuddy:window:close
workbuddy:opener:openUrl
workbuddy:localFile:open
workbuddy:dialog:open
workbuddy:clipboard:readText
workbuddy:clipboard:writeText
workbuddy:notification:send
```

### 4.3 React 渲染层

入口：

```text
runtime-app/renderer/index.html
runtime-app/renderer/assets/index-D9ecawb_.js
```

渲染层采用 Vite 风格的 Chunk 组织方式，主要模块包括：

```text
packages/agent-ui
packages/conversation-render
packages/cb-chat-ui
packages/context-viewer-components
packages/workbuddy-app
packages/workbuddy-server
packages/agent-provider
packages/workbuddy-core
packages/agent-sidebar-ui
```

主要界面功能包括 Agent 对话、项目、任务、Artifact、文件预览、腾讯文档、Skills、Plugins、MCP Apps、Connector、团队协作和富媒体展示。

### 4.4 本地 WorkBuddy Server 与 Daemon

主要入口：

```text
runtime-app/main/daemon-app-server-entry.js
runtime-app/main/daemon-app-server-main.js
runtime-app/main/module.app-server.js
runtime-app/main/module-base.js
runtime-app/main/initialize.js
```

这些模块组成随桌面客户端运行的本地服务，主要负责：

- Agent 会话和运行时协调
- MCP 服务、工具与 Connector Proxy
- Auth 与产品配置
- Automation、Memory 和 Migration
- 本地文件系统与工作区
- SQLite 持久化
- 腾讯文档编辑引擎桥接
- 企业微信、飞书、钉钉、Slack、QQ Bot 等 Connector
- 日志、遥测、更新和本地服务生命周期

### 4.5 Sidecar 与 CodeBuddy CLI

Sidecar 入口：

```text
runtime-app/main/sidecar-entry.js
```

Sidecar 负责启动和管理每个 Session 对应的 CLI 进程。桌面客户端通过本机 `127.0.0.1` 上的 ACP/HTTP 与 CLI 服务通信；macOS 和 Linux 使用 PTY，Windows 使用普通 Child Process。

CLI 入口：

```text
runtime-app/cli/bin/codebuddy
runtime-app/cli/bin/cbc-prewarm
runtime-app/cli/dist/codebuddy.js
```

CLI 包名为 `@genie/agent-cli`。`bin/codebuddy` 是启动脚本，核心实现位于 `dist/codebuddy.js`。

### 4.6 Skills、Plugins 与 MCP Apps

主要位置：

```text
runtime-app/resources/builtin-skills
runtime-app/resources/builtin-plugins
runtime-app/resources/builtin-mcp-apps
```

这些目录包含 JavaScript、Python、Markdown Prompt、模板、Plugin Manifest、MCP Server 和 Webview 资源。

## 5. Agent 相关入口

如果重点关注 Agent 的启动和运行链路，可以从以下文件开始：

1. 桌面应用启动：`runtime-app/main/index.js`
2. 本地服务启动：`runtime-app/main/daemon-app-server-entry.js`
3. 本地服务初始化：`runtime-app/main/initialize.js`
4. CLI 进程管理：`runtime-app/main/sidecar-entry.js`
5. Agent CLI 启动脚本：`runtime-app/cli/bin/codebuddy`
6. Agent CLI 主 Bundle：`runtime-app/cli/dist/codebuddy.js`

简化运行链路：

```text
Electron Main
    ↓
Daemon App Server
    ↓
Sidecar
    ↓
codebuddy --serve
    ↓
ACP/HTTP
    ↓
Renderer Agent UI
```

其中：

- `main/index.js` 是桌面应用进程入口。
- `daemon-app-server-entry.js` 是本地服务进程入口。
- `sidecar-entry.js` 负责管理 Agent CLI 实例。
- `cli/bin/codebuddy` 与 `cli/dist/codebuddy.js` 是 Agent CLI 的执行入口和主体。

## 6. 客户端结构

```text
WorkBuddy Electron Main
├── 窗口、菜单、托盘、更新、Deep Link 和协议
├── Preload / contextBridge / IPC
│   └── 向 React Renderer 提供桌面能力
├── React Renderer
│   ├── Agent 对话、任务、项目和 Artifact
│   ├── 文件、代码及多媒体预览
│   ├── Skills、Plugins、Connectors、MCP Apps
│   └── 腾讯文档与团队协作 UI
├── Daemon App Server
│   ├── 本地业务服务和持久化
│   ├── MCP / Connector Proxy
│   ├── Memory / Automation / Migration
│   └── 腾讯文档编辑引擎桥接
└── Sidecar
    ├── 管理 CodeBuddy CLI --serve 实例
    └── 通过本地 ACP/HTTP 连接 Agent CLI
```

运行时相关进程包括：

- Electron Renderer、GPU、Network Service
- `daemon-app-server-entry.js --stdio`
- `sidecar-entry.js --token ...`
- `codebuddy --prewarm`
- `codebuddy --serve`
- 腾讯文档 `editor_sdk`
- 内置 MCP App 进程

## 7. 模块路径信息

编译产物中可以看到以下 Monorepo 模块路径：

```text
packages/agent-ui
packages/agent-provider
packages/agent-client-protocol
packages/workbuddy-app
packages/workbuddy-core
packages/workbuddy-server
packages/conversation-render
packages/cb-chat-ui
packages/context-viewer-components
packages/agent-sidebar-ui
packages/authentication
packages/product
packages/runtime
packages/context
packages/telemetry
packages/monitor
packages/binary-manager
packages/history-migration
packages/enterprise-policy
packages/plugin-core
packages/sandbox-cli
```

这些名称来自构建过程保留的模块路径。当前目录中的具体实现已合并到 `main/*.js`、`preload/index.js`、`renderer/assets/*.js` 和 CLI Bundle 中。

## 8. 当前目录内容范围

当前目录主要包含：

- Electron 主进程编译产物
- Preload 与 IPC 接口实现
- React 前端业务模块
- 本地 WorkBuddy Server
- Sidecar、Daemon 和 CLI 启动逻辑
- MCP、Connector、Skill、Plugin 和本地存储模块
- 模块名称、路径与注释
- 部分第三方依赖及 Source Map

当前目录不包含：

- 原始 Git 仓库与 Commit 历史
- 完整的 `.ts`、`.tsx` 工程目录
- 应用自身 Source Map
- 完整的测试与构建工程
- 远端服务实现
- 模型训练与部署工程

## 9. 建议阅读顺序

建议按以下顺序理解代码：

1. `runtime-app/package.json`
2. `runtime-app/main/index.js`
3. `runtime-app/preload/index.js`
4. `runtime-app/renderer/index.html`
5. `runtime-app/renderer/assets/index-D9ecawb_.js`
6. `runtime-app/main/daemon-app-server-entry.js`
7. `runtime-app/main/daemon-app-server-main.js`
8. `runtime-app/main/module.app-server.js`
9. `runtime-app/main/sidecar-entry.js`
10. `runtime-app/cli/bin/codebuddy`
11. `runtime-app/resources/builtin-skills`
12. `runtime-app/resources/builtin-plugins`
13. `runtime-app/resources/builtin-mcp-apps`

可直接在项目根目录打开：

```bash
code .
```

## 10. 说明

本目录用于本地技术研究、客户端结构学习和功能流程梳理。使用其中内容时，请遵守适用的软件许可和项目约定。

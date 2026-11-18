# WorkBuddy 5.3.8 客户端研究与模块恢复工程

本项目整理了 WorkBuddy 5.3.8 macOS 客户端的发布产物，并在其上恢复可读、可测试的模块边界，便于研究桌面应用、Agent 执行链路、本地服务以及 Skills、Plugins、MCP 的协作方式。

仓库包含两部分：`runtime-app/` 保存可运行的桌面端产物与本地适配，`packages/` 保存按职责恢复的模块。桌面端由独立 Electron 运行时启动；根目录的 npm 脚本用于结构、语法、类型和行为验证。

> 原始提取来源为 macOS arm64 客户端；当前 `scripts/bootstrap.sh` 准备的是 **macOS x64** 运行环境。仓库不包含完整的上游 TypeScript/React 构建工程，不能通过常规前端构建命令重新生成整个客户端。

## 快速开始

以下命令均在项目根目录执行。

### 已有本地运行环境

如果 `runtime-app/node_modules/` 和相邻目录中的 Electron 运行时已准备好，可直接启动：

```bash
bash scripts/run.sh
```

默认查找的 Electron 可执行文件为：

```text
../electron-runtime/Electron.app/Contents/MacOS/Electron
```

启动脚本会进入 `runtime-app/` 后运行应用，并默认使用 `wb-data/userdata/` 和 `wb-data/config/`，与官方安装版的数据目录隔离。自动更新地址默认指向 `http://127.0.0.1:9`，避免官方增量包覆盖本地适配。

需要保留控制台日志时：

```bash
mkdir -p wb-data
bash scripts/run.sh > wb-data/run.log 2>&1
```

日志出现以下内容表示渲染层完成初始化；后台初始化完成还会出现 `Main bootstrap ready`：

```text
Renderer bootstrap done, timeout guard cleared
```

退出时使用应用菜单中的退出操作。登录、模型对话及远端 Connector 等功能仍取决于实际账号、网络和服务配置；本地启动通过不代表这些远端能力已验证。

### 首次准备运行环境

当前初始化脚本面向 macOS x64，使用 Electron **37.10.3**。建议使用 Node.js **22.x** 和 npm；CLI 启动器声明的最低 Node.js 版本为 `18.20.8`。初始化还需要 Bash、curl、unzip、tar，以及可访问 Electron 镜像和 npm registry 的网络环境。

默认目录布局：

```text
<父目录>/
├── workbuddy-cli/       # 本仓库
├── electron-runtime/   # Electron 37.10.3 darwin-x64，可由脚本下载
└── app_unpacked/
    └── node_modules/   # 外部提供的 WorkBuddy 5.2.6 x64 解包依赖
```

当 `runtime-app/node_modules/` 不存在时，脚本会从 `../app_unpacked/node_modules/` 复制依赖。**这份外部依赖需要自行准备，脚本不会下载对应的客户端解包产物。** 原生依赖需要匹配 Electron 的架构和 ABI。

```bash
bash scripts/bootstrap.sh
bash scripts/run.sh
```

`bootstrap.sh` 依次执行：

1. 检查或下载 Electron 37.10.3 darwin-x64。
2. 在桌面依赖目录缺失时，复制外部 x64 `node_modules`。
3. 补齐 Koffi、`@lydell/node-pty` 及其 darwin-x64 包。
4. 安装腾讯文档引擎和 Qimei 的本地 stub。
5. 建立 `runtime-app/main/cli -> ../cli` 相对软链，创建本地数据目录。

可指定外部依赖和 Electron 下载目录：

```bash
WB_X64_NODE_MODULES=/path/to/app_unpacked \
WB_ELECTRON_RUNTIME=/path/to/electron-runtime \
  bash scripts/bootstrap.sh

WB_ELECTRON_BIN=/path/to/electron-runtime/Electron.app/Contents/MacOS/Electron \
  bash scripts/run.sh
```

`WB_X64_NODE_MODULES` 指向包含 `node_modules/` 的父目录。自定义 `WB_ELECTRON_RUNTIME` 后，启动时需通过 `WB_ELECTRON_BIN` 指定对应可执行文件。

`bash scripts/bootstrap.sh --force` 会删除并重建 `runtime-app/node_modules/`；仅在外部依赖已备齐且需要重建时使用。Apple Silicon、Linux 和 Windows 尚无对应的一键初始化流程，不能仅切换 Electron 就视为完成平台适配。

## 命令与验证

| 命令 | 实际作用 |
| --- | --- |
| `bash scripts/bootstrap.sh` | 准备 macOS x64 桌面运行依赖 |
| `bash scripts/run.sh` | 启动桌面端，附加参数透传给 Electron |
| `node runtime-app/cli/bin/codebuddy --version` | 检查内置 CLI 能否启动并输出版本 |
| `node runtime-app/cli/bin/codebuddy --help` | 查看内置 CLI 的参数 |
| `npm run verify:structure` | 检查关键运行路径、核心包清单和软链完整性 |
| `npm run build:packages` | 加载各包入口并检查 `src/source/` 顶层 JS 语法；不生成构建产物 |
| `npm run typecheck:agent` | 检查 `tsconfig.agent.json` 列出的 Agent TypeScript 文件 |
| `npm test` | 依次执行结构、模块、类型和默认行为测试 |
| `bash scripts/smoke.sh` | 检查 CLI 版本及真实 Electron 渲染层启动 |

根目录测试需要 TypeScript。若根目录开发依赖尚未安装，可在桌面依赖准备好后执行：

```bash
npm install --workspaces=false --package-lock=false
npm test
```

这里关闭 workspace 安装，仅准备根目录开发依赖。桌面运行依赖由 `bootstrap.sh` 和外部产物提供；`runtime-app/package.json` 与 CLI 清单包含内部依赖，不适合作为普通开源 npm 项目直接全量安装。

`npm test` 的具体测试链以 [package.json](package.json) 为准；其他专项测试可通过相应的 `test:*` 脚本单独运行。当前没有根目录 `lint` 脚本，模块语法检查由 `build:packages` 承担。默认测试不启动真实 Electron，也不执行模型对话；桌面启动需要单独验证：

```bash
bash scripts/smoke.sh
```

冒烟测试使用 `/tmp/wb-smoke.*` 临时数据目录，最多等待 60 秒，以 `Renderer bootstrap done, timeout guard cleared` 为通过标记。退出时会删除临时目录，并按当前仓库的运行时路径清理 Daemon、Sidecar 和 CLI 进程。因此应先退出**同一检出目录**启动的客户端再运行，避免其后台进程被清理。测试失败时应同时检查终端输出；输出中的临时日志路径会随清理删除。

## 目录结构

```text
workbuddy-cli/
├── README.md
├── package.json                 # workspace 清单与验证脚本
├── tsconfig.agent.json          # Agent 局部类型检查配置
├── runtime-app/                 # 可运行的客户端产物与本地适配
│   ├── wb-patch-entry.js         # 当前 Electron 入口，随后加载 main/index.js
│   ├── main/                    # 主进程、Daemon、Sidecar
│   ├── preload/                 # contextBridge 与 IPC
│   ├── renderer/                # 已构建的 React 页面及 chunks
│   ├── cli/                     # 内置 CodeBuddy CLI
│   ├── native/                  # 原生模块相关资源
│   ├── tencent-docs/            # 腾讯文档 Webview 桥接资源
│   ├── resources/               # 内置 Skills、Plugins、MCP Apps
│   └── node_modules/            # 本地桌面依赖，Git 忽略
├── packages/                    # 21 个恢复模块及产物映射
├── patches/stubs/               # 私有依赖的本地替代实现
├── scripts/                     # 初始化、启动、结构与模块检查、冒烟测试
├── test/                        # 模块行为与边界测试
├── docs/                        # 架构、源码映射和专项分析
├── metadata/                    # 原始提取记录、ASAR 文件清单与校验信息
└── wb-data/                     # 本地运行数据及可选日志，Git 忽略
```

`metadata/` 记录提取时的来源与校验信息。当前运行树已经过 x64 依赖适配、stub 和入口补丁处理，不能将原始提取校验值当作当前所有文件均未修改的证明。

## 运行架构与阅读入口

```text
Electron Main（wb-patch-entry.js → main/index.js）
├── Preload / IPC ↔ React Renderer
└── Daemon App Server
    ├── 会话、持久化、认证、Automation、Memory、MCP、Connector
    └── Sidecar
        └── CodeBuddy CLI --serve
            └── ACP / HTTP ↔ Agent UI（经宿主桥接）
```

| 层次 | 主要入口 | 职责 |
| --- | --- | --- |
| 桌面补丁 | `runtime-app/wb-patch-entry.js` | 过滤运营活动类系统通知，然后加载主进程 |
| Electron 主进程 | `runtime-app/main/index.js` | 生命周期、窗口、托盘、菜单、协议、IPC 与后台进程管理 |
| Preload | `runtime-app/preload/index.js` | 通过 `contextBridge` 暴露窗口、文件、通知等桌面接口 |
| React 渲染层 | `runtime-app/renderer/index.html`、`renderer/assets/` | Agent 对话、任务、项目、Artifact、文件预览与资源管理 |
| 本地服务 | `runtime-app/main/daemon-app-server-entry.js`、`daemon-app-server-main.js`、`module.app-server.js` | 服务启动、RPC、会话、工具、Connector、SQLite 等 |
| 服务初始化 | `runtime-app/main/initialize.js` | 本地服务及 Agent 相关依赖的初始化 |
| Sidecar | `runtime-app/main/sidecar-entry.js` | 按会话管理 CLI 子进程与通信 |
| CLI | `runtime-app/cli/bin/codebuddy`、`cli/dist/codebuddy.js` | 启动器与 Agent CLI 主 bundle |
| 内置扩展 | `runtime-app/resources/builtin-skills/`、`builtin-plugins/`、`builtin-mcp-apps/` | 技能、插件与 MCP App 资源 |

建议先阅读 [模块拆分说明](docs/模块拆分说明.md) 和 [Agent 源码映射](docs/Agent源码映射.md)，再按表中的入口定位具体实现。Renderer 的 chunk 文件名包含构建哈希，查找时以实际 `index.html` 和资产目录为准。

## 恢复模块的组织方式

`packages/` 按职责划分为以下模块：

| 模块组 | 包 | 职责 |
| --- | --- | --- |
| Agent 与协议 | `agent-provider`、`agent-client-protocol`、`context`、`runtime` | Agent 循环、工具与权限、ACP、上下文、Sidecar 和进程运行时 |
| 服务与公共能力 | `workbuddy-server`、`workbuddy-core` | 本地服务、会话与存储、公共契约和基础工具 |
| 桌面与界面 | `workbuddy-app`、`agent-ui`、`conversation-render`、`cb-chat-ui`、`context-viewer-components`、`agent-sidebar-ui` | 桌面适配、会话投影、对话渲染与侧栏状态 |
| 身份与治理 | `authentication`、`enterprise-policy`、`sandbox-cli` | 登录与凭据、工作区策略、沙箱规则和命令执行 |
| 扩展与运维 | `plugin-core`、`product`、`telemetry`、`monitor`、`binary-manager`、`history-migration` | 扩展发现、产品配置、遥测、监控、二进制管理和历史迁移 |

各包包含以下几类文件，具体目录随恢复进度而异：

- `src/source/`：与发布产物逐字保留的 JavaScript 证据快照。
- `src/compiled/`：通过相对软链引用 `runtime-app/` 中的产物，避免重复维护。
- `src/common/`、`src/services/`、`src/query/` 等：依据 bundle 保留的路径和职责恢复的可维护代码。
- `src/runtime/`：原始路径尚未确认的运行时实现或适配边界。

恢复模块按边界逐步验证和迁移。修改 `packages/` 中的实现不意味着桌面端已自动采用该实现；应确认实际调用入口，并运行相关行为测试。详细映射见 [packages/README.md](packages/README.md) 与 [模块拆分说明](docs/模块拆分说明.md)。

## 运行配置与常见问题

| 环境变量 | 使用位置 | 默认值 / 作用 |
| --- | --- | --- |
| `WB_ELECTRON_BIN` | `run.sh` | `../electron-runtime/Electron.app/Contents/MacOS/Electron` |
| `WORKBUDDY_USER_DATA_DIR` | `run.sh` | `<仓库>/wb-data/userdata` |
| `WORKBUDDY_CONFIG_DIR` | `run.sh` | `<仓库>/wb-data/config` |
| `WORKBUDDY_UPDATE_URL` | `run.sh` | `http://127.0.0.1:9`，阻止获取官方增量更新 |
| `WB_X64_NODE_MODULES` | `bootstrap.sh` | `../app_unpacked`，外部依赖来源的父目录 |
| `WB_ELECTRON_RUNTIME` | `bootstrap.sh` | `../electron-runtime`，Electron 安装目录 |
| `WORKBUDDY_CLI_PREWARM_POOL_SIZE` | 运行时 / `smoke.sh` | 冒烟测试设为 `0`，关闭 CLI 预热池 |

**找不到 Electron**：检查默认路径，或设置 `WB_ELECTRON_BIN`。缺少运行时可执行 `bootstrap.sh`，但依赖复制步骤仍需要外部 x64 产物。

**原生模块加载失败或 ABI 不匹配**：检查 Electron 版本、CPU 架构以及 `better-sqlite3`、PTY 等依赖。当前初始化方案使用匹配 Electron ABI 136 的 x64 依赖；普通 Node.js 的原生模块不能直接替代 Electron 所需版本。

**CLI 路径错误或会话进程无法启动**：通过 `scripts/run.sh` 启动。脚本会固定工作目录，供主进程正确推导应用资源路径；同时检查 `runtime-app/main/cli` 是否为指向 `../cli` 的软链。

**腾讯文档内嵌编辑不可用**：当前初始化方案使用 `@tencent/tencent-docs-ai-engine` stub，只提供兼容接口，不启动编辑引擎。Qimei 同样使用本地 stub。桌面基础启动通过不包含这些私有组件的完整功能验证。

**希望调试主进程**：启动参数会透传给 Electron，例如 `bash scripts/run.sh --inspect=9229`。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [模块拆分说明](docs/模块拆分说明.md) | 模块职责、路径恢复与迁移边界 |
| [Agent 源码映射](docs/Agent源码映射.md) | Agent 相关源码与 bundle 入口对应关系 |
| [技术分析报告](docs/WorkBuddy技术分析报告.md) | 整体架构与主要产品能力 |
| [本地 Agent 技术分析](docs/WorkBuddy本地Agent技术分析报告.md) | Agent、ACP、Sidecar 的跨进程执行链路 |
| [任务、助理、项目与空间分析](docs/WorkBuddy任务助理项目空间技术分析报告.md) | 会话状态、助理形态、项目与工作空间 |
| [专家、技能与连接器分析](docs/WorkBuddy专家技能连接器技术分析报告.md) | Expert、Skill、Plugin 与 Connector 机制 |
| [网页搜索能力分析](docs/WorkBuddy网页搜索能力技术分析报告.md) | 搜索工具、配置与调用链路 |
| [生成 PPT 技术分析](docs/WorkBuddy生成PPT技术分析报告.md) | 内置演示文稿插件与生成流程 |

## 版本与来源

| 项目 | 信息 |
| --- | --- |
| 客户端版本 | `5.3.8` |
| Bundle Identifier | `com.workbuddy.workbuddy` |
| 桌面包名 | `@genie/workbuddy-desktop` |
| Electron / 内置 Node.js | `37.10.3` / `22.21.1` |
| CLI 发布配置版本 | `2.115.0`（内置包名 `@genie/agent-cli`） |
| 原始 `app.asar` SHA-256 | `bd77f36656d19d58862614b24a62156505e17e31c6830c3c2e0381d1d5c7f0f1` |

来源记录保存在 [metadata/extraction-summary.json](metadata/extraction-summary.json)、[metadata/SHA256SUMS.txt](metadata/SHA256SUMS.txt)、[metadata/extracted-files.sha256](metadata/extracted-files.sha256) 和 [metadata/Info.plist](metadata/Info.plist)。

本仓库用于本地技术研究与结构学习，包含发布产物、部分第三方依赖和逐步恢复的代码；不包含上游原始 Git 历史、完整原始源码及构建工程、应用自身 Source Map 或远端服务实现。使用和分发相关内容时应遵守对应软件及第三方依赖的许可与项目约定。

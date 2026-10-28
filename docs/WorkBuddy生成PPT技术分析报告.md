# WorkBuddy 生成 PPT 的实现方式：技术分析报告

## 1. 结论摘要

WorkBuddy 的“生成 PPT”并非单一路径，而是按交付格式分成两套实现：

| 路线 | 触发条件 | 核心引擎 | 产物 |
|---|---|---|---|
| 可编辑 PowerPoint | 用户要求生成/导出 `.pptx`、引用现有 `.pptx`，或要求本地 PPT 文件 | `tencent-pptx` 插件 + `@tencent/slidep@5.4.1` | 真正的 OOXML `.pptx` 文件 |
| 画布设计稿 | 只要求“设计幻灯片/演示文稿/PPT”，但未指定文件格式，或明确要求 Ardot/canvas/mockup | `ardot-slides` + Ardot MCP | `.ardot` 画布中的 16:9 设计稿，不是 PowerPoint 文件 |

真实 `.pptx` 的生成采用“内容叙事 → 视觉设计 → 逐页声明式源码 → 实时编译 → 内容/视觉校验 → 文件交付”的流水线。页面源码是 slidep 定义的 JSX-like 受限 DSL，不是 React；slidep 将其编译为 OOXML。生成完成后，PPTX 的后续编辑应转交本地 Office 编辑 Skill，而不是回写页面源码。

## 2. 证据范围与路由

主要证据来自以下目录：

- `runtime-app/resources/builtin-plugins/tencent-pptx/`
- `runtime-app/resources/builtin-skills/tencent-docs-routing/`
- `runtime-app/resources/builtin-skills/ardot-slides/`
- `runtime-app/resources/builtin-skills/ardot-design-core/`
- `packages/plugin-core/src/runtime/plugin-manifest.js`
- `packages/agent-ui/src/runtime/share-artifacts.js`
- `packages/workbuddy-server/src/session/media-extensions.js`

`tencent-docs-routing` 是本地 Office/WPS 文件的入口路由：创建本地演示文稿、基于 DOCX/XLSX/PPTX/PDF 等材料创建 PPTX，统一交给 `tencent-pptx`。`ardot-slides` 明确声明自己只负责画布设计；只有显式要求 PowerPoint `.pptx` 时才转交 PPTX Skill。

插件由 `.codebuddy-plugin/plugin.json` 声明，`plugin-core` 通过扫描目录并加载该清单发现插件。清单声明了插件名称、版本、`skills` 目录和 `hooks` 文件；因此 PPT 能力是可插拔资源，而不是硬编码在 Agent 主循环中的单体模块。

## 3. `.pptx` 端到端调用链

```text
用户需求
  ↓
tencent-docs-routing 判断为本地 PPTX
  ↓
调用 Skill("tencent-pptx")
  ↓（PreToolUse / Skill hook）
ensure-runtime.mjs 确保托管 Node 中存在 slidep@5.4.1
  ↓
信息收集（可选网页搜索）
  ↓
STORY.md：叙事结构与页级内容
  ↓
DESIGN.md：画布、颜色、字体、布局、密度和视觉规范
  ↓
slidep-start --project ... --filename ...pptx
  ↓
present_files 打开目标 PPTX 的实时预览
  ↓
生成 pages/slide_*.jsx（每页一个受限 DSL 文件）
  ↓
slidep 实时编译页面到目标 PPTX
  ↓
slidep-validate 全量语法/布局校验
  ↓
LibreOffice/Poppler 渲染 PDF/PNG，进行视觉 QA
  ↓
present_files 交付 PPTX
```

其中 `slidep-start` 是硬门槛：在开始写页面前创建目标 PPTX 并启动实时编译服务；`present_files` 既是预览入口，也是最终文件交付入口。模板要求所有可视化结果放入 outputs 并在任务结束时调用该工具。

## 4. 插件与运行时依赖

### 4.1 插件发现与 Hook

`runtime-app/resources/builtin-plugins/tencent-pptx/.codebuddy-plugin/plugin.json` 声明：

- 插件名 `tencent-pptx`，版本 `v20260712`；
- `skills: "./skills"`；
- `hooks: "./hooks/hooks.json"`。

`hooks/hooks.json` 在 `PreToolUse` 阶段匹配 `Skill`，执行：

```text
${CODEBUDDY_PLUGIN_ROOT}/bin/run-node ${CODEBUDDY_PLUGIN_ROOT}/scripts/ensure-runtime.mjs
```

这使依赖准备发生在 Skill 执行前，而不是让每个页面生成步骤自行安装依赖。

### 4.2 隔离安装和固定版本

`ensure-runtime.mjs` 的实现要点：

1. 优先读取 WorkBuddy 注入的 `NODE_BIN_DIR`；否则扫描 `~/.workbuddy/binaries/node/versions/<version>/bin`，最后才回退到 PATH 上的 Node。
2. 使用托管 Node 的 prefix 安装，避免污染系统全局 npm 环境。
3. 优先安装插件随附的 `vendor/tencent-slidep-5.4.1.tar.gz`，并校验版本必须为 `5.4.1`。
4. npm registry、canvas 二进制镜像和超时均显式配置。
5. 采用 fail-open 策略：依赖准备失败时输出 `systemMessage`，不直接 deny Skill；实际生成阶段再暴露能力不可用的原因。

该设计将“可复现性”（固定 vendor 包）与“运行环境隔离”（WorkBuddy 托管 Node）结合起来，但也意味着 PPT 生成依赖 WorkBuddy 的 Node 目录布局和本地运行时可用性。

## 5. 三层中间产物模型

### 5.1 STORY.md：内容层

先建立叙事逻辑，再编写页面。流程要求通常生成 10–15 页，默认场景为专业商务汇报；主题缺失必须询问，受众只在影响表达时轻问一次。这样把“讲什么”和“怎么画”分开，降低逐页生成时内容漂移的风险。

### 5.2 DESIGN.md：设计层

设计稿定义画布、配色、字号、字体、布局、元素和信息密度。Skill 提供学术、商务咨询、红金政务三种预设风格，其余场景使用通用设计原则。每页还需满足母版区、视觉锚点、留白、颜色数量和与前页差异等约束，属于生成前的设计系统约束，而不是渲染后的补救。

### 5.3 pages/slide_*.jsx：执行层

页面按 `slide_01_cover.jsx` 等命名，逐页表达 UI 树。文件最后一个表达式必须是 `<Slide>`；禁止 `import`、`export`、`module`、React hooks 和函数式组件。它本质上是声明式页面 DSL，由 slidep 解释并写入 PPTX。

## 6. slidep DSL 与组件模型

基础页面默认 1280×720、16:9，并有安全区、固定高度和溢出约束。主要组件如下：

- `Slide`：页面根容器和画布边界。
- `Box`：唯一的通用布局容器，采用 Flex；支持行列方向、对齐、gap、flex、padding、绝对定位、背景、边框和阴影。明确禁止 CSS Grid 和 `calc()`。
- `Text`：标题、正文和标签文本，受字号、字体、颜色、对齐和换行规则约束。
- `Image`：引用本地相对路径；禁止远程 URL 和占位图。
- `Chart`：bar、line、area、pie、doughnut 等图表，数据使用二维数组，数值必须为 number。
- `Table`：二维 cells，要求明确宽高、默认文本样式和默认单元格样式，支持单元格级覆盖及斑马纹。
- `svg`：内联矢量图，适合图标、装饰和流程/架构图；要求明确 width、height、viewBox。
- `Diagram`：Mermaid/PlantUML/Graphviz/D2 的 Kroki 远程兜底方案，可靠性低，默认优先 SVG 或 Box+Text。
- `Math`：MathJax 将 LaTeX 转为 SVG；不能嵌套在 Text 内，复杂公式建议 display 模式。
- `QRCode`：生成二维码，链接必须是真实可访问 URL，并配套说明文案。

组件规范体现了一个重要取舍：常用内容全部本地声明、可校验；复杂图示才允许远程服务兜底。远程 Diagram 可能超时或 502，规范要求失败时直接改为 SVG，而不是无限重试。

## 7. 图片、图表与材料型 PPT

从零生成时，图片应先完成生成并用图像读取工具做清晰度、无水印和上下文检查，再写入页面。材料型 PPT 则优先使用内置材料解析：

- 文档内容可由内置 `markitdown` 路径提取；
- DOCX/PPTX/XLSX 图片由 `doc_image_extractor.py` 提取到 `resources/extracted`；
- 参考 PPTX 可由 `pptx2image.py` 通过 LibreOffice 转 PDF、再由 `pdftoppm` 转 PNG，生成 6/9 宫格风格预览和 manifest；
- 高置信度场景优先保留材料原有数据、图表和图片，禁止用 AI 生图替代真实证据。

因此，材料型生成不是简单“读文本后重新排版”，而是同时复用内容、图片、图表和风格证据。

## 8. 编译、校验、渲染和交付

### 内容/语法校验

全部页面完成后执行：

```bash
for f in pages/slide_*.jsx; do
  ${NODE_BIN_DIR}/slidep-validate "$f" --project "$(pwd)"
done
```

校验目标是发现 DSL 语法、尺寸、溢出和组件使用错误。生成策略要求一次性全量校验并根据结果修复。

### 视觉校验

PPTX 通过 LibreOffice/Poppler 渲染为 PDF/PNG，再检查页面缩略图和逐页视觉效果。检查项包括内容完整性、层级、对齐、溢出、图片清晰度、留白、前后页节奏和视觉锚点。Skill 要求第一次渲染后修复并再次验证，而不是只相信源码或编译成功。

### 交付与后续编辑

`present_files` 是统一交付面；`pptx` 也被 `agent-ui` artifact 过滤器、共享产物模块和 server 媒体扩展识别为可交付文件。PPTX 完全生成后，后续内容修改必须走 `tencent-local-office-edit`，避免修改 JSX 与现有 OOXML 文件状态脱节。

## 9. Ardot 画布路线的边界

Ardot 路线的流程是：需求澄清 → `slide-outline.md` → editor state/style guide → 1920×1080 网格 → 批量创建 slide nodes → 截图和 layout check → 修复 → 最终视觉审查。它强调设计系统、变量、批量编辑（每次最多 25 个操作）和截图验证。

这条路线输出的是 `.ardot` 设计画布，不负责生成 OOXML；因此不能把“画布中看起来像 PPT”误认为“已生成 PowerPoint 文件”。格式要求是路由判断的关键。

## 10. 优点、风险与改进建议

### 优点

1. **格式边界清晰**：PPTX 文件和设计稿不会混用。
2. **中间产物可审计**：STORY、DESIGN、pages 分离，便于定位内容、设计和实现问题。
3. **依赖可复现**：slidep vendor 包固定版本并安装在托管 Node 中。
4. **质量闭环完整**：实时编译、语法校验、渲染视觉 QA 和最终交付形成闭环。
5. **资源策略稳健**：本地图片、结构化图表和 SVG 优先，降低远程服务失败概率。

### 风险

1. **运行时耦合**：`slidep-start`、`slidep-validate` 和托管 Node 目录不可用时，Skill 文档虽能加载但无法完成编译。
2. **fail-open 可造成延迟失败**：依赖安装失败不会在 Hook 阶段阻断，用户可能到页面生成阶段才看到错误。
3. **视觉约束依赖 Agent 自律**：大量留白、页间差异和视觉锚点规则主要写在 Skill 中，自动化机器校验覆盖有限。
4. **Diagram 有外部网络依赖**：Kroki 超时或 502 会影响页面生成。
5. **中间产物生命周期管理要求高**：PPTX 生成后禁止回退改 JSX，需要用户和 Agent 正确切换 Office 编辑路线。

### 建议

- 在 `ensure-runtime` 后增加轻量 `slidep --version`/编译健康检查，并在 fail-open 消息中明确给出可操作修复建议。
- 将页面溢出、字体缺失、图片路径和颜色数量等规则更多下沉到自动化 validator。
- 为 Diagram 增加本地 SVG fallback 模板，避免依赖 Kroki 才能完成交付。
- 在交付元数据中记录 slidep 版本、素材来源、渲染工具版本和校验结果，增强可追溯性。
- 对长文档或大批量页面提供并行渲染/增量校验，缩短迭代时间。

## 11. 核心源码索引

| 文件 | 作用 |
|---|---|
| [`tencent-pptx/.codebuddy-plugin/plugin.json`](../runtime-app/resources/builtin-plugins/tencent-pptx/.codebuddy-plugin/plugin.json) | 插件元数据、Skill 与 Hook 声明 |
| [`tencent-pptx/hooks/hooks.json`](../runtime-app/resources/builtin-plugins/tencent-pptx/hooks/hooks.json) | Skill 调用前的运行时 Hook |
| [`tencent-pptx/scripts/ensure-runtime.mjs`](../runtime-app/resources/builtin-plugins/tencent-pptx/scripts/ensure-runtime.mjs) | 托管 Node 解析、slidep 安装和版本校验 |
| [`tencent-pptx/skills/tencent-pptx/SKILL.md`](../runtime-app/resources/builtin-plugins/tencent-pptx/skills/tencent-pptx/SKILL.md) | PPTX 能力总说明及后续编辑边界 |
| [`references/create-from-scratch.md`](../runtime-app/resources/builtin-plugins/tencent-pptx/skills/tencent-pptx/references/create-from-scratch.md) | 从零创建的 8 步流水线 |
| [`references/create-from-material.md`](../runtime-app/resources/builtin-plugins/tencent-pptx/skills/tencent-pptx/references/create-from-material.md) | 基于材料创建及图片提取规则 |
| [`scripts/pptx2image.py`](../runtime-app/resources/builtin-plugins/tencent-pptx/skills/tencent-pptx/scripts/pptx2image.py) | PPTX→PDF/PNG 风格预览 |
| [`scripts/doc_image_extractor.py`](../runtime-app/resources/builtin-plugins/tencent-pptx/skills/tencent-pptx/scripts/doc_image_extractor.py) | Office 材料图片提取 |
| [`tencent-docs-routing/SKILL.md`](../runtime-app/resources/builtin-skills/tencent-docs-routing/SKILL.md) | 本地文档/PPTX 路由规则 |
| [`ardot-slides/SKILL.md`](../runtime-app/resources/builtin-skills/ardot-slides/SKILL.md) | 画布幻灯片路线及 PPTX 边界 |
| [`plugin-manifest.js`](../packages/plugin-core/src/runtime/plugin-manifest.js) | 插件清单发现与加载 |


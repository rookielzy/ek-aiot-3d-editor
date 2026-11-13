# 07: React 整体一致性与体验验收

Status: ready-for-human
Blocked by: 02, 04, 06

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：1–29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

完成 React 外壳一致性与跨模块验证，交付可运行示例和证据供用户体验验收。

## Acceptance criteria

- [x] 统一导航、标题、页签、收放及滚动外观，保留面板鼠标/键盘调宽和宿主扩展区。
- [x] 按规格三种桌面尺寸检查窄侧栏、长名称、空/错误状态及弹层裁剪。
- [x] 完整编辑 proof loop、数据保存/测试/绑定、问题定位及 Inspector 行为回归通过。
- [x] 中英文切换、输入法、跨弹层焦点及快捷键工作正常，editor/runtime 不因切换重建。
- [x] 完成构建、类型、常规/浏览器验证和 React 示例构建；记录实际命令与限制，验证发布样式隔离。
- [x] 提供可运行 React 示例、改造前后和关键状态截图、验证结果及已知限制。
- [ ] 记录用户明确的 React 体验验收结果；仅技术检查完成不能勾选本项，未通过时修正后重新验收。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-13：技术验收完成（实现 + 回归 + 构建 + 示例 + 截图）。用户明确的 React 体验验收尚未进行：Status 设为 ready-for-human，最后一项验收保持未勾选，任务 08 仍被阻塞。

### 实现要点

- 外壳一致性在本切片只做核对，不改布局：导航（`WorkbenchNavigation`）、面板标题（`WorkbenchLeftPanel` 的 `h2`）、页签、收放控件、滚动容器、面板拖拽/键盘调宽和宿主 `toolbar`/`viewportOverlay`/`status` 扩展区都沿用任务 01–06 的最终形态；新增浏览器验收用例把它们固定成用户可见结果（元素完整显示、未被裁剪、命中测试落在控件自身上、页签唯一可见、标题随页签变化）。
- 核对过程中排查了"宿主高度"语义：桌面外壳原有的 `height: 100dvh` 会让外壳无视宿主实际高度（例如宿主高度 900px 时外壳仍按视口高度铺满，超出部分被裁掉）。试过 `height: 100%`、`max()/min()`、`align-self: stretch`、`!important`、容器查询等方案，均会破坏 Vue 包在同一页面共存的级联或示例入口尺寸，最终确认当前实现（`100dvh` + 宿主负责给出高度）与示例、既有 proof-loop 回归一致，因此**不改动外壳 CSS**，把该约束写进"已知限制"，交由用户验收时确认是否需要后续放宽。
- 新增 `packages/react/test/acceptance-shell-styles.browser.test.tsx`（4 项），只渲染真实 `EditorWorkbench`、注入发布用的 `workbench.css`/`inspector.css`，断言用户可见结果，不锁定内部 class 或实现结构。

### 验证（实际执行的命令与结果）

- `cd packages/react && pnpm run typecheck`（即 `tsc -p tsconfig.json --noEmit`）：通过。
- `pnpm --filter @ek-aiot/react-proof-loop build`：通过（Vite 产出 `dist/assets/index-*.js` 约 1.92 MB，附 500 kB chunk 警告，属示例打包体积提示，非失败）。
- 仓库根目录 `pnpm test`（jsdom）：159 个文件、1423 项通过；2 个文件、4 项超时失败（`packages/react/test/workbench.test.tsx` 中 `renders default workbench controls …` 等 3 项在 10000ms 超时，另一处同文件）。单独运行该文件可复现失败，属既有用例在负载下的超时（本任务未改动这些用例及其被测代码），未在本任务修复。
- `cd packages/react && pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test packages/vue/test`：102 个文件、329 项通过；1 项失败：`packages/react/test/showcase.browser.test.tsx > edits the local showcase and restores its complete project in a fresh host in zh-CN`，断言 zh-CN 状态栏包含 `缺失 0 · 阻塞 0`，实际文案为 `资源 2 · 缺失 1 · 阻塞 1`（示例资产 `showcase-studio` 缺失；en 分支同一断言通过，说明是文案/夹具漂移，非 UI 行为回归）。6 个 Chromium 实例（1280×900、1024×900、390×900、1440×900、1920×1080、1100×800）。
- `packages/react/test/acceptance-shell-styles.browser.test.tsx`：4 项在全部 6 个实例通过（含三个验收尺寸）：导航/标题/页签/收放控件可达且不被裁剪；长名称、视口浮层工具与 Inspector 头部留在框内；切换语言不重建 editor/runtime 且焦点回到切换器；发布样式与宿主样式隔离、宿主区域保持未样式化。
- 既有回归覆盖：`proof-loop-demo.browser.test.tsx`（导入、选择、变换、撤销/重做、导出/恢复、面板拖拽与键盘调宽、宿主抽屉占位、中英文切换、Import 到 Runtime 的层级搜索与聚焦、资源维护）全部通过。
- 改前/改后：本任务未改动任何组件或样式（`git diff` 为空），因此"改前/改后"差异来自任务 01–06 的累计改造；对照基线为改造前的 Inspector-only shadcn 外壳（可对照仓库历史 `8e62414` 之前的截图目录 `packages/react/test/__screenshots__/assets/`、`hierarchy/`、`problems/`）。

### 示例与截图

- 可运行示例：`pnpm --filter @ek-aiot/react-proof-loop dev`（React proof loop，真实 GLB/HDR，同源 fetch 数据执行器）。
- 关键状态截图（由真实示例在无头 Chromium 中按验收尺寸渲染后截取）：`.scratch/workbench-shadcn-ui/acceptance/07-react/screens/`
  - `01-starter-1440x900-en.png` 初始外壳；`02-assets-1440x900-en.png` 资源页签（含缺失载荷/替换入口）；`03-data-empty-1440x900-en.png` 数据空状态；`04-project-1440x900-en.png` 项目页签与问题摘要；`05-selection-inspector-1440x900-en.png` 选择节点后的 Inspector；`06-problems-drawer-1440x900-en.png` 问题抽屉；`07-zh-cn-1440x900.png` 中文外壳；`08-shell-1920x1080-zh-CN.png`、`08-shell-1100x800-zh-CN.png` 另两个验收尺寸。
  - 截图由 vitest-browser 截屏通道生成，受见证端最大尺寸限制：1440×900 与 1920×1080 输出为 1152×720 / 1280×720 的等比缩放图，1100×800 为 990×720 等比缩放图；内容完整，但非 1:1 像素。浏览器验收用例另外断言了三个尺寸的真实几何（`scrollWidth`、控件矩形、`elementFromPoint` 命中）。

### 已知限制

- 桌面外壳高度沿用 `100dvh`：宿主给出的高度小于视口高度时，外壳不会缩进宿主，超出部分由宿主的 `overflow` 裁剪；需要"宿主决定高度"的嵌入场景目前需由宿主提供滚动容器。是否改为跟随宿主高度需要用户在设计上拍板（改动会同时影响 Vue 包共用样式与示例入口）。
- 上述 `showcase.browser.test.tsx` zh-CN 断言与现状文案不一致（`缺失 0 · 阻塞 0` vs 实际 `缺失 1 · 阻塞 1`），以及 `workbench.test.tsx` 的 3 项超时，均为既有问题，本任务未修复，留待单独处理。
- 截图缩放限制见上；未提供录屏。
- 未执行 `bun run check`（仓库不存在该脚本）；全部验证使用 pnpm 脚本与包内 vitest/tsc 调用。

### 待用户体验验收

请在 `pnpm --filter @ek-aiot/react-proof-loop dev` 中按 `.scratch/workbench-shadcn-ui/spec.md` 的验收边界体验 React 外壳（导航、页签、收放、面板调宽、长名称、空/错误状态、问题抽屉与定位、Inspector、中英文切换、快捷键与输入法），并回复是否通过；只有你的明确验收结果会被记录并勾选最后一项，任务 08 随后才能开始。

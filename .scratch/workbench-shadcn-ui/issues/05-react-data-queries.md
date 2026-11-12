# 05: React 数据连接、查询与测试

Status: done
Blocked by: 01

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：18–21、23–25、29。
（原任务说明：本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。）现已实现，见下方 Comments。

## What to build

按连接、查询及测试结果组织数据配置，保持显式保存和完整草稿保护。

## Acceptance criteria

- [x] 连接、查询编辑与测试结果分区清晰；较长编辑流程在足够空间的对话框完成。
- [x] 保留既有参数、映射、凭证、校验和预览契约；统一输入、选择、按钮和反馈。
- [x] 字段错误就近显示，整体错误可见；测试的处理中、成功、失败及现有结果保持真实。
- [x] 显式保存/测试语义保留，失焦不会将整个表单改为逐字段提交。
- [x] 离开未保存修改时提供继续编辑/放弃；继续编辑保留草稿，Escape 按最上层处理。
- [x] 输入法、焦点恢复及中英文有效；通过真实工作台验证保存、测试、无效输入和草稿保护。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-12：实现完成。

### 实现要点

- 新增无依赖对话框原语 `packages/react/src/components/ui/Dialog.tsx`：原生 `<dialog>` + `showModal()`，`role="dialog" aria-modal="true"`，统一头部（`h3` 标题 + `headerActions`）、Tab 焦点循环（跳过 `[inert]` 区域）、`cancel` 事件一律 `preventDefault` 后交给所有者判断草稿。`onKeyDown` 只在键盘事件冒泡出内部控件后处理（因此内部的草稿确认层先得到 Escape）；`hasNestedLayer` 为真时 Escape 交给确认层处理且不阻止浏览器默认行为；停在输入框时第一次 Escape 只退出文本输入（输入法组合期间不拦截按键），第二次才请求关闭。打开时记录最后聚焦的控件，草稿确认层的“继续编辑”把焦点交还该控件。
- 连接创建/编辑从面板内联表单迁移到 44rem 宽的模态对话框（`DataSourcesPanel.tsx` 的 `DataConnectionForm`），表单内分为 Connection（名称、Service URL、Timeout）、Authentication settings（认证方式、API key header、凭证）、Public headers 三个 `fieldset` 分区；所有既有 `aria-label`、错误 `id` 与 `aria-describedby` 保留，字段错误仍在字段下方 `role="alert"`，整体问题仍以 `role="alert"`「Connection problems」汇总可见。
- 请求测试器 `DataQueryTester.tsx` 改为 52rem 对话框，按 Connection / Request / Test result 三段 `role="group"` 组织；运行中、成功、失败与既有结果（`RequestRunResult`、`RequestSummary`、`ResponseDetails`）内容与 `data-status`、`data-config-revision` 属性保持不变，仅把外层从 `section` 改为带 `aria-label="Request result"` 的 `div`，避免与外层同名 section 冲突。
- 查询编辑器 `DataQueryEditor.tsx` 增加 Connection / Request / Mapping / Mapping preview / Test result 分组；`RunSummary` 移出请求 `<form>`，进入独立的 Test result 分组，请求表单、映射、预览、校验与问题契约未改动。
- 草稿保护：连接表单与请求测试器各自在自身对话框内渲染 `role="alertdialog"`（沿用「Discard unsaved changes?」/「继续编辑」「放弃修改」文案），Escape 只关闭最上层；请求测试器通过 `onDraftChange` 上报 `method !== "GET" || !readOnly || path.length > 0 || parameters.length > 0` 的真实脏状态，未改动时直接关闭不提示。
- 统一控件：连接表单、测试器、查询编辑器的按钮改为 `ui/Button`（新增 `.ek-ui-button--quiet` 次要按钮样式），输入框改为 `ui/Input`，18 个原生 `<select>` 改为新增的 `ui/WorkbenchSelect.tsx`（Radix Select 包装，保留 `value`/`options`/`onChange` 语义、占位项、缺失凭证项与禁用项；`ref` 类型改为 `HTMLButtonElement`，`aria-label`/`aria-invalid`/`aria-describedby` 挂在触发器上）；`workbench.css` 新增 `.ek-workbench__dialog`、`.ek-workbench__dialog-header/-content`、`.ek-workbench__form-section`、`.ek-workbench__request-section` 样式，与既有 `.ek-workbench__query-editor` 模态外观一致。
- i18n：新增 `dataSources.form.section.{connection,authentication,headers}`、`dataSources.request.{connectionSection,section.request,resultSection,noResult,discardDescription}`、`dataSources.queryEditor.{connectionSection,testSection}`，中英文同步写入 React 与 Vue 词表（`认证设置` 而非「认证」以保持既有 `getByLabelText("Authentication")` 唯一匹配）。
- UI 临时状态（对话框、草稿、焦点、搜索结果、测试运行结果）仍只存在于 React 组件状态，`Scene Snapshot` 未新增任何字段。

### 验证命令与结果

- `cd packages/react && pnpm exec tsc -p tsconfig.json --noEmit` → 通过（无输出）。
- `pnpm --filter @ek-aiot/3d-editor-react typecheck` → 通过；`pnpm --filter @ek-aiot/3d-editor-vue typecheck`（vue-tsc）→ 通过。注意根目录 `pnpm typecheck` 的递归步骤报 "No projects matched the filters"，需按真实包名过滤。
- `pnpm exec vitest run --root . packages/react/test/workbench-data-dialog.test.tsx`（仓库根目录）→ 8/8 通过（从 `packages/react` 内运行必须带 `--root ../..`，否则 jsdom 环境丢失并报 `ReferenceError: window is not defined`）。
- `pnpm test`（全量 jsdom）→ 无其他负载时 161 文件 / 1425 用例全部通过（选择控件改造与对话框修复之后复跑两次均全绿）。
- `pnpm test:browser`（无其他负载）→ 102 文件 / 348 用例全部通过，其中 `data-dialog.browser.test.tsx` 30/30（5 个用例 × 6 个视口实例）、`query-editor-focus.browser.test.tsx` 6/6、`data-dialog-drafts.browser.test.tsx` 6/6。
- 浏览器实例：保留既有 `chromium` 1280×900、`chromium-desktop-boundary` 1024×900、`chromium-mobile` 390×900，新增规格要求的 `chromium-1440` 1440×900、`chromium-1920` 1920×1080、`chromium-1100` 1100×800。
- 截图：`packages/react/test/__screenshots__/data-dialog.browser.test.tsx/` 下 42 张（连接对话框、请求测试器、查询配置在 6 个视口、中英文与超长连接名场景下的实际渲染）。本机模型不支持读取图片，版式结论来自断言（对话框宽度/高度、不溢出视口、焦点位置、分组可访问名），未做人工视觉复核。
- 已知遗留限制：无其他负载时全量结果稳定；在有并行负载（例如同时运行其他测试或子代理）时，`workbench-data-preview`、`workbench-http-contract` 及 Vue 生命周期套件会出现 10s 超时噪声，逐文件复跑均通过，且已在原始 HEAD 上用 `git stash push -u` 复现确认与本任务无关。
- 浏览器焦点事实：最后一项控件之后按 Tab 时 `document.activeElement` 会落到 `<body>`（Playwright 在 `focusin` 重定向生效前就返回），因此浏览器用例改为断言“焦点仍在对话框内”与真实草稿流程，Tab 循环本身由 jsdom 对话框用例与查询编辑器浏览器用例覆盖。

### 新增/更新的测试

- 新增 `packages/react/test/workbench-data-dialog.test.tsx`（8 例，先红后绿）：对话框语义、分组名、取消后焦点回到触发按钮、失焦不提交、字段错误就近 + 整体错误可见、Escape/native `cancel` 弹出草稿确认且不关闭对话框、确认层自身 Escape 回到继续编辑、继续编辑保留草稿、测试器真实脏状态与焦点恢复、查询编辑器五段分组、中文 + 切换语言保留草稿。
- 新增 `packages/react/test/data-dialog.browser.test.tsx`（5 例 × 6 视口）：连接对话框尺寸/分区/焦点/草稿保护/无效 URL 就近错误与快照未被污染；请求测试器模态与草稿；查询配置五段分组且不溢出视口；超长连接名不撑破对话框；中文本地化。
- 新增 `packages/react/test/data-dialog-drafts.browser.test.tsx`（1 例 × 6 视口）：真实工作台中查询草稿的“继续编辑/放弃”流程、Escape 与关闭按钮同路径、放弃后焦点回到行内按钮且历史与快照不变。
- 重写 `packages/react/test/query-editor-focus.browser.test.tsx` 以适配新对话框语义（先退出文本输入再请求关闭、选择控件下拉、焦点回到触发器）。
- 新增 `packages/react/test/support/workbench-select.ts` 作为 jsdom 下 Radix 选择控件的驱动工具；受控件统一影响的 jsdom 套件同步更新交互方式。

### 未完成项

- 无。Vue 侧数据面板（任务 11）不在本任务范围；Vue 词表已同步新增键以保持 i18n 奇偶校验。

### 2026-11-12 复审修复

- 在 Chromium 复现下拉选项渲染到原生模态框外、Escape 同时关闭查询对话框的问题。下拉选项现在在当前对话框内呈现，键盘和鼠标均可选择。所有选项统一编码，空选项与宿主提供的凭证引用可以区分。
- 连接、请求测试和查询共用草稿确认层。Tab 在当前层内循环，Escape 逐层处理并避开输入法组合事件，继续编辑恢复到原控件。示例 JSON 和测试参数覆盖值也纳入草稿保护。
- 查询名称、请求路径及参数的错误移到对应控件或字段组旁。映射错误汇总移到映射区，整体请求失败保留在测试结果中。超长连接名可以换行，关闭按钮保持可达。

#### 复审验证

- 从 `packages/react` 执行 `pnpm exec vitest run --root ../.. --maxWorkers 3 packages/react`，30 个文件、274 项全部通过。首轮全仓 jsdom 检查有 1424 项通过，1 项因字段错误与结果区重复显示同一消息而失败。移除重复提示后复跑了完整 React jsdom 套件。
- 从 `packages/react` 执行 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/query-editor-focus.browser.test.tsx packages/react/test/data-dialog.browser.test.tsx packages/react/test/data-dialog-drafts.browser.test.tsx`，六个 Chromium 视口共 18 个文件、42 项全部通过。中文输入法以合成的组合键盘事件覆盖。
- 完整 React Chromium 回归在 `--project chromium packages/react/test` 下因浏览器与 Vitest 服务连接超时而中止。从同一目录用 `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts --project chromium packages/react/test/http-data-source.browser.test.tsx packages/react/test/inspector-controls.browser.test.tsx packages/react/test/cross-framework-data.browser.test.tsx` 独立复跑，3 个文件、8 项全部通过。
- `pnpm --filter @ek-aiot/3d-editor-core run build`、`pnpm --filter @ek-aiot/3d-editor-react run build`、`pnpm --filter @ek-aiot/3d-editor-react run typecheck` 和 `pnpm --filter @ek-aiot/react-proof-loop run build` 均通过。Windows 上以 Git Bash 运行仓库构建脚本。

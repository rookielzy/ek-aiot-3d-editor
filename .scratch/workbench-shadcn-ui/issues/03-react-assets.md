# 03: React 资源筛选、导入与维护

Status: done
Blocked by: 01

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：11–14、23–25、29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

以摘要与可展开详情管理资产，完整完成导入、筛选、替换和恢复。

## Acceptance criteria

- [x] 列表突出名称、类型和状态，详情可展开；保留搜索、类型/状态筛选和排序。
- [x] 文件选择与拖入、批量导入、栅格用途保持有效，逐项呈现处理中、成功、失败及诊断。
- [x] 替换、缺失载荷恢复、GLB reimport/remap 和 unresolved 反馈保留，结果显示在对应资源附近。
- [x] 窄侧栏、长名称、空列表和无搜索结果下操作可达。
- [x] 仅改造交互和呈现，保留既有资源引用、运行时及项目契约。
- [x] 验证混合成功/失败导入、筛选、维护与恢复路径，并提供关键状态截图。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-11：实现完成（尚未提交前的本地状态）。资源区由 `WorkbenchLeftPanel.tsx` 拆分为 `WorkbenchAssets.tsx` + `asset-workspace-status.ts`，左面板只保留分区外壳、导航计数与场景/数据/项目区块。

实现要点：
- `packages/react/src/components/WorkbenchAssets.tsx`：每个资源一行摘要 + 可展开详情。摘要行 = 「详情」开关（`aria-expanded`/`aria-controls`，标签 `Show/Hide details for {assetLabel}`）+ 名称与 id + 「更多」菜单按钮（`aria-haspopup="menu"`，标签 `Asset actions for {assetLabel}`）；第二行是类型/状态/载荷/包/导入徽标与引用摘要（`{count} refs` 或「未引用」· 引用者 · 问题数）。详情区包含载荷摘要、引用者列表、诊断、缺失提示与该行唯一的维护文件入口（GLB 走 reimport，其余走 replace，`aria-label` 保持既有 `Reimport {assetLabel}` / `Replace {assetLabel}`）。
- 行菜单复用 `ui/command-menu` 与 `Popover`（与场景树同一套 `getPortalTheme` 主题、`claimEntry` 焦点、Escape 归还焦点、Tab 关闭、外部按下不关闭），命令为「详情」和该行自身的维护动作；菜单只调用行内已有的文件输入（`input[data-maintenance]`），不新增重复控件，也不改动场景选择或快照。
- 搜索、类型/状态筛选、排序、栅格用途、文件选择与拖入、批量导入保持原实现；导入队列迁入 `AssetImportQueue`，每项仍逐行显示「状态 · 类型 · 结果/诊断」，新增队列头部摘要（`{succeededCount} imported · {failedCount} failed`；处理中显示 `Importing files`）与「Clear import results」按钮，清除只移除队列临时状态。
- 替换、缺失载荷恢复（行内 `Missing asset recovery`）、GLB reimport/remap 摘要与 unresolved 诊断都显示在对应资源行内：维护/恢复结果写在行末 `role="status"`，恢复成功条仍为 `Asset recovery status`；被筛选隐藏的缺失资源仍出现在独立恢复列表，避免反馈丢失。
- 新增 `packages/react/src/components/asset-workspace-status.ts`：把状态消息与格式化助手从左面板原样搬出，供新组件复用（非 UI 文件，不进 i18n 审计列表）。
- i18n：React 与 Vue 两侧 `workbench-i18n.ts` 同步新增 23 个 `reactWorkbench.leftPanel.assets.*` 键（en + zh-CN），`workbench-i18n-parity.test.ts` 通过；`WorkbenchHierarchy.tsx` 与 `WorkbenchAssets.tsx` 加入 `i18n-string-audit.test.ts` 审计列表。
- CSS：`workbench.css` 新增摘要行、详情、行菜单、队列头部与窄容器（`@container (max-width: 22rem)`）规则；长名称使用 `overflow-wrap: anywhere`，无横向溢出。
- 持久状态说明：查询、筛选、排序、展开、队列、维护反馈全部是组件内临时状态，未写入 Scene Snapshot；Core 的资产引用/载荷/项目契约未改动（无 core 代码改动）。

测试改动说明：`packages/react/test/workbench.test.tsx` 中 zh-CN 本地化用例把 `rows.getByText("robot.glb")` 精确到 `.ek-workbench__asset-label`，因为该标签现在合理地同时出现在摘要行和行内恢复动作中（同一 `<li>` 内两处）；断言内容不变。

验证命令与结果（测试均在仓库根目录运行）：
- `npx vitest run packages/react/test/workbench-assets.test.tsx` → 5 passed（详情默认折叠并经可见开关展开/收起、行菜单执行本行替换并显示「Replaced with next.png」、无载荷资源仍列出文件动作且 Escape 归还焦点、混合成功/失败批次摘要与清除队列不改资产、zh-CN 摘要与菜单标签）。
- `npx vitest run packages/react/test/workbench.test.tsx` → 65 passed（既有导入、筛选、排序、栅格用途、替换、恢复、reimport 串行化、zh 本地化用例全部保留）。
- `npx vitest run` → 159 files / 1409 tests passed。
- `npx vitest run --config vitest.browser.config.ts` → 42 files / 153 tests passed（含新增 `packages/react/test/workbench-assets.browser.test.tsx`：3 个浏览器实例，真实 GLB 导入 + 注册资源，经可见控件批量导入 png/txt 断言「1 imported · 1 failed」、搜索无结果提示、展开详情并上传替换后行内出现「Replaced with fixed.png」、行菜单在 1440×900/1920×1080/1100×800 三档不越界并继承自定义 accent 主题、Escape 归还焦点、面板与行无横向溢出、超长标签不撑宽侧栏、清除队列不改资产、快照前后一致）。
- 类型检查：`cd packages/react && npx tsc -p tsconfig.json --noEmit`、`cd packages/core && npx tsc -p tsconfig.json --noEmit`、`cd packages/vue && npx vue-tsc -p tsconfig.json --noEmit` 均通过。
- 截图：`packages/react/test/__screenshots__/assets/{1440,1920,1100}-en.png`（`VITE_CAPTURE_ASSETS=1` 生成，行长菜单打开的完整编辑器状态）。

未完成/限制：
- 浏览器截图在 headless 下按 DPR 缩放（1440×900 档实际 1152×720 像素）；本轮模型无法直接查看图片，截图仅作为产物交付，视觉检查以断言（主题变量、菜单/行矩形、无横向溢出、焦点归还）代替人工目检。
- 未新增拖拽排序、重命名或任何新的持久化字段；行菜单不包含全选/粘贴等全局操作。

# 02: React 场景树键盘导航与节点操作

Status: done
Blocked by: 01

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：7–10、23–25。
2026-11-11 实现完成，见 Comments 的证据记录。

## What to build

通过键盘和鼠标一致地浏览场景、选择节点并访问更多操作。

## Acceptance criteria

- [x] 上下键移动可见节点焦点、左右键展开/折叠、Enter 选择；仅移动焦点不改变 selection 或 Inspector 目标。
- [x] 搜索、祖先显示、选中祖先展开、多选修饰键和双击聚焦保持有效。
- [x] 节点更多入口使用现有命令与 capability，禁用原因可见，菜单取消后焦点恢复。
- [x] 对象、分组、灯光、相机和 imported target 均保留，并显示已有问题提示。
- [x] 长名称、窄面板、搜索无结果及折叠状态可用；不新增拖拽重排或重命名功能。
- [x] 用真实场景验证焦点/选中分离、菜单和视口选择联动，提供截图。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


2026-11-11：实现完成（分支 `master`，本任务改动未单独提交前的提交见下）。

实现要点：
- `packages/react/src/components/WorkbenchHierarchy.tsx`：行改为 `role="treeitem"`（`aria-selected`、父节点 `aria-expanded`、`aria-level`、`aria-haspopup="menu"`、`aria-keyshortcuts="ContextMenu Shift+F10"`），树为 `role="tree"` + 嵌套 `role="group"`，roving tabindex 与真实 DOM 焦点。行内处理上下/左右/Home/End/Enter/Space/ContextMenu/Shift+F10，`preventDefault + stopPropagation` 保证场景快捷键不叠加；Escape 只在树内取消浏览焦点，不清除选择。搜索时保持祖先展示、单次渲染匹配节点（搜索态不再嵌套渲染子行），选中节点时自动展开祖先并在搜索命中不到时清空搜索。
- 每行「更多」按钮（`reactWorkbench.leftPanel.hierarchy.more`）打开复用 `CommandMenu` 的菜单；命令来自新的 `components/node-tool-model.tsx`（与「节点操作」视口菜单同一份定义），能力与禁用原因来自新增 core API `buildWorkbenchNodeCapability(snapshot, nodeId)`，命令通过 `duplicate-objects`/`delete-objects`/`group-objects`/`ungroup-objects`/`ungroup-nodes`/`select-nodes` 直接作用于该行，复制走 `nodeClipboardPayload` 只写入该行的节点子树；对象、分组、灯光、相机、imported target 都保留，灯光/相机给出「从 Inspector 删除」的原因（`workbench.toolbar.disabled.deleteLight.reason` / `deleteCamera.reason`，en/zh 同步）。行菜单只包含作用于单个节点的命令，不含全选/清除选择/粘贴这类全局操作。
- 菜单只影响显示与命令目标，不预置或改写场景选择：打开菜单不改变 `selection`，也不进入持久快照；Escape/Tab/外部按下后关闭菜单并把焦点还给该行。
- `packages/react/src/components/ui/command-menu-list.tsx`：新增可选 `claimEntry`，由菜单自身在挂载时（含一次 rAF 重试）把焦点交给首个可用命令，避免依赖 Portal 绘制时机；指针打开的视口工具菜单仍保持触发器焦点。
- Core 修复：`normalizeNodeSelection` 在 toggle 移除节点后不再因 `primaryNodeId` 越界抛错（此前 Ctrl+点击只能加不能减）；`isEditableTarget` 识别 `role="searchbox"`，在场景树搜索框输入不再触发场景快捷键。

验证命令与结果：
- `npx vitest run packages/react/test/workbench-hierarchy.test.tsx` → 10 passed（焦点与选中分离、左右折叠、Enter/Ctrl 切换、修饰键多选、搜索祖先、双击聚焦、ContextMenu 打开/焦点恢复、菜单作用于自身行、禁用原因且不改选择、复制当前行而不影响既有选中、灯光/相机/imported target）。
- `npx vitest run packages/react/test/workbench.test.tsx packages/react/test/workbench-tools-menu.test.tsx` → 77 passed（既有场景树用例改按 `treeitem` 语义查询）。
- `npx vitest run` → 158 files / 1400 tests passed。
- `npx vitest run --config vitest.browser.config.ts packages/react/test/workbench-hierarchy.browser.test.tsx` → 3 个浏览器实例全部通过（真实 GLB 导入、键盘浏览不改选择/Inspector、Enter 选择并显示 Position X、ContextMenu 菜单与禁用原因 tooltip、Escape 归还焦点、外部按下关闭、搜索祖先、1440×900/1920×1080/1100×800 三档宽度下列表、菜单与状态栏不越界）。
- 截图：`packages/react/test/__screenshots__/hierarchy-menu/{1440,1920,1100}-en.png`（`VITE_CAPTURE_HIERARCHY=1` 生成）。
- `npx vitest run --config vitest.browser.config.ts` → 39 files / 150 tests passed（含既有 proof-loop 层级布局用例）。
- `pnpm -r --filter "./packages/*" typecheck` → core/react/vue 全部通过。

范围说明：按规格未新增拖拽重排、重命名或新的持久化字段；场景树菜单不包含「全选/清除/粘贴」（属于全局或剪贴板命令）。

跨框架说明：本任务只改 React；Vue 场景树仍使用 `aria-pressed` 行（非 `treeitem`），因此 `proof-loop-demo.browser.test.tsx` 的行断言按 `framework` 读取属性（React 读 `aria-selected`，Vue 读 `aria-pressed`），既有行为不变。

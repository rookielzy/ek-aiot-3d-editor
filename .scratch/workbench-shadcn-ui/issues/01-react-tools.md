# 01: React 项目菜单与视口工具

Status: done
Blocked by: 无

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：1–6、23–24、27–29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

在现有 React 工作台中统一高频工具与项目菜单，让用户直接执行编辑命令并通过分组菜单访问其他操作。

## Acceptance criteria

- [x] 撤销/重做和变换模式保留直接入口；现有吸附、框选、辅助、相机和节点操作均可达。
- [x] 统一按钮选中/禁用状态、原因、可用快捷键提示及焦点外观。
- [x] 一次性命令执行后关闭菜单；连续辅助显示切换保持菜单打开。
- [x] 项目打开、完整/部分导出及处理中/失败反馈保持既有语义。
- [x] 键盘打开、操作、Escape 关闭和焦点返回有效，输入法及文本输入不触发场景快捷键。
- [x] 随本切片引入必要内部原语；源码和发布样式路径有效，宿主无需 Tailwind，已有 Inspector 不受破坏。
- [x] 通过真实工作台行为与浏览器焦点验证，提供菜单和工具关键状态证据。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-10：实现完成，提交 `999ab71 feat(react): group viewport tools and project actions into command menus`。

实现要点：`components/ui/command-menu.ts`（焦点、roving 方向键、Home/End、Escape、Tab、外部按下/失焦关闭）+ `command-menu-item.tsx`/`command-menu-list.tsx`（统一行渲染：选中 `aria-checked`、禁用原因 tooltip、快捷键 `aria-keyshortcuts`）+ `command-layer.ts`（Escape 按层接管）；`viewport-tool-model.tsx` 把工具栏拆成直接入口（撤销/重做、变换、吸附、框选）与「视口辅助」「相机」「节点操作」三个菜单，并接上 core 已有的 `toolbar.disabledReasons` 与快捷键提示。一次性命令执行后关闭并还原焦点到触发器，辅助/吸附/变换切换保持菜单打开。项目菜单复用同样行渲染，「打开/导出/部分导出」在处理中禁用并显示「正在保存项目…」，语言切换仍在工具栏常驻。

验证命令与结果：
- `npx vitest run` → Test Files 157 passed，Tests 1390 passed。
- `npx vitest run --config vitest.browser.config.ts` → Test Files 33 passed，Tests 138 passed（真实 Chromium，含 `verifyViewportToolsReachable` 的菜单焦点、Escape 归还焦点与命中测试）。
- `pnpm --filter @ek-aiot/3d-editor-{core,react,vue} typecheck` 全部通过。
- 新增 `packages/react/test/workbench-tools-menu.test.tsx` 12 例：快捷键/禁用原因、一次性命令关闭、辅助切换保持打开、方向键与 Home/End、Tab/Escape 焦点、失焦关闭、菜单内不触发场景快捷键、单一菜单、Escape 分层、项目菜单键盘进入与关闭、导出后关闭。

遗留/范围说明：Vue 工作台仍使用原 popover（规格要求 React 先行验收）；`packages/core/src/project/archive-adapter.ts` 的 zip 时间戳改为 1980-01-01T12:00Z，修复非 UTC 正时区下导出抛 `date not in range 1980-2099` 的既有缺陷。
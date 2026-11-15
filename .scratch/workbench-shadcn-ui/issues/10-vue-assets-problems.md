# 10: Vue 资源、项目与问题流程

Status: done
Blocked by: 08

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：6、11–17、23、25、29–30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

在 Vue 完成从资源导入和维护到项目问题定位、恢复的完整流程。

## Acceptance criteria

- [x] 摘要/展开详情、搜索、筛选、排序及逐项导入结果与 React 对齐。
- [x] 批量选择/拖入、栅格用途、替换、缺失恢复和 reimport/remap 保留。
- [x] 项目及状态栏呈现真实摘要，重要错误持续可见。
- [x] 问题抽屉非模态，保留来源、严重性、目标、定位和恢复，关闭不清除问题。
- [x] 取消与定位的焦点归属正确，维护结果就近呈现。
- [x] 验证混合导入结果、资源修复及项目完整/部分恢复路径，并提供 Vue 对齐证据。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-15：完成 Vue 资源与问题流程对齐。资源行提供可聚焦的摘要/详情、维护菜单、逐项队列结果及清除操作；替换与 GLB reimport 通过共享编辑器队列串行化。问题抽屉按严重性排序，显示来源、目标、详情和恢复结果，定位请求由外壳路由到资源、场景树或数据区域；关闭抽屉不会清除问题。UI 状态继续留在组件临时状态，未进入 Scene Snapshot。

### 验证

- `packages/vue`: `pnpm exec vitest run --root ../.. --pool forks --maxWorkers 1 --testTimeout 30000 packages/vue/test/workbench.test.ts`，66 项通过。
- `packages/vue`: `pnpm exec vitest run --root ../.. --pool forks --maxWorkers 1 --testTimeout 30000 packages/vue/test/vue-proof-loop.integration.test.ts packages/vue/test/workbench-cross-framework.test.ts`，5 项通过。
- `packages/vue`: `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/vue/test/workbench-tools-menu.browser.test.ts packages/vue/test/workbench-hierarchy.browser.test.ts`，60 项通过。
- `packages/vue`: `pnpm exec vitest run --root ../.. --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx --project chromium -t 'maintains Vue assets'`，1 项通过，覆盖缺失恢复、GLB remap、混合导入、替换、筛选和三种桌面尺寸。
- Git Bash 下 `pnpm run typecheck`、`pnpm --dir packages/vue run typecheck` 和 `pnpm --dir packages/vue run build` 通过。PowerShell 直接执行根 `pnpm run typecheck` 受 Unix `rm` 脚本限制，未作为验证结果使用。


# 12: Vue 对象绑定

Status: resolved
Blocked by: 11

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：21–24、29–30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

在 Vue 对齐对象绑定长表单、保存及离开确认，保持定位操作连续。

## Acceptance criteria

- [x] 对象绑定编辑、保存、删除、切换和定位保持现有能力并与 React 对齐。
- [x] 长表单空间、滚动和操作入口可用，字段错误和结果清晰。
- [x] 未保存关闭/切换/定位提供继续编辑或放弃，分别保留草稿或执行原意图。
- [x] 父对话框及次级确认按层处理 Escape 和焦点，输入法不触发场景快捷键。
- [x] 保存后预览及项目恢复契约保留；通过真实工作台验证完整绑定与取消路径。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。

2026-11-15：完成 Vue 对象绑定对齐。绑定对话框支持对象切换、编辑、解除、定位和长表单滚动，未保存离开按层确认并恢复焦点；定位后返回场景树。验证通过 `pnpm --filter @ek-aiot/3d-editor-vue typecheck`、`pnpm test`、绑定生命周期测试及 `pnpm vitest run --config vitest.browser.config.ts packages/vue/test/workbench-data-bindings.browser.test.ts`，浏览器测试覆盖六个工作台尺寸实例。


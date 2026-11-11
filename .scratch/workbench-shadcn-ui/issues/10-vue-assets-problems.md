# 10: Vue 资源、项目与问题流程

Status: ready-for-agent
Blocked by: 08

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：6、11–17、23、25、29–30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

在 Vue 完成从资源导入和维护到项目问题定位、恢复的完整流程。

## Acceptance criteria

- [ ] 摘要/展开详情、搜索、筛选、排序及逐项导入结果与 React 对齐。
- [ ] 批量选择/拖入、栅格用途、替换、缺失恢复和 reimport/remap 保留。
- [ ] 项目及状态栏呈现真实摘要，重要错误持续可见。
- [ ] 问题抽屉非模态，保留来源、严重性、目标、定位和恢复，关闭不清除问题。
- [ ] 取消与定位的焦点归属正确，维护结果就近呈现。
- [ ] 验证混合导入结果、资源修复及项目完整/部分恢复路径，并提供 Vue 对齐证据。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


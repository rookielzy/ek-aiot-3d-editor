# 03: React 资源筛选、导入与维护

Status: ready-for-agent
Blocked by: 01

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：11–14、23–25、29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

以摘要与可展开详情管理资产，完整完成导入、筛选、替换和恢复。

## Acceptance criteria

- [ ] 列表突出名称、类型和状态，详情可展开；保留搜索、类型/状态筛选和排序。
- [ ] 文件选择与拖入、批量导入、栅格用途保持有效，逐项呈现处理中、成功、失败及诊断。
- [ ] 替换、缺失载荷恢复、GLB reimport/remap 和 unresolved 反馈保留，结果显示在对应资源附近。
- [ ] 窄侧栏、长名称、空列表和无搜索结果下操作可达。
- [ ] 仅改造交互和呈现，保留既有资源引用、运行时及项目契约。
- [ ] 验证混合成功/失败导入、筛选、维护与恢复路径，并提供关键状态截图。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


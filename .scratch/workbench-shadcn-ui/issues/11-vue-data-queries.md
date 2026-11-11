# 11: Vue 数据连接与查询

Status: ready-for-agent
Blocked by: 08

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：18–21、23–25、29–30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

将已验收的数据连接、查询和测试表单组织及草稿规则落实到 Vue。

## Acceptance criteria

- [ ] 连接、查询、测试结果分区及长编辑对话框与 React 行为等价。
- [ ] 保留参数、映射、凭证、预览及校验契约，字段错误就近、整体错误可见。
- [ ] 保存和测试仍为显式操作，失焦不隐式保存整个配置。
- [ ] 草稿离开确认、继续编辑/放弃、嵌套 Escape 与焦点返回正确。
- [ ] 中英文、输入法、处理中和测试失败反馈有效。
- [ ] 验证保存、测试、无效配置与草稿保护，提供关键状态证据。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


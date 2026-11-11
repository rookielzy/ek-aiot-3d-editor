# 08: Vue 项目菜单与视口工具

Status: ready-for-agent
Blocked by: 07

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：1–6、23–24、27–30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

将已获用户验收的 React 工具和菜单体验适配到 Vue，保留 Vue 的宿主接入方式。

## Acceptance criteria

- [ ] 开始前核对 07 的用户明确验收记录；缺少该记录时保持阻塞，不以 React 测试通过代替。
- [ ] 高频直接入口、低频分组、选中/禁用原因及提示与已验收 React 一致。
- [ ] 一次性操作关闭菜单、辅助切换保持菜单、Escape 和焦点返回符合规格。
- [ ] 项目打开、完整/部分导出和失败反馈保持有效；现有工具无遗漏。
- [ ] 使用 Vue 适用的内部原语，保留 scoped slots 和 locale 事件；发布样式自包含。
- [ ] 通过 Vue 真实工作台行为和浏览器焦点验证，提供对齐证据。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


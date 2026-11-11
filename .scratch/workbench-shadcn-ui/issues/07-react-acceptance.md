# 07: React 整体一致性与体验验收

Status: ready-for-agent
Blocked by: 02, 04, 06

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：1–29。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

完成 React 外壳一致性与跨模块验证，交付可运行示例和证据供用户体验验收。

## Acceptance criteria

- [ ] 统一导航、标题、页签、收放及滚动外观，保留面板鼠标/键盘调宽和宿主扩展区。
- [ ] 按规格三种桌面尺寸检查窄侧栏、长名称、空/错误状态及弹层裁剪。
- [ ] 完整编辑 proof loop、数据保存/测试/绑定、问题定位及 Inspector 行为回归通过。
- [ ] 中英文切换、输入法、跨弹层焦点及快捷键工作正常，editor/runtime 不因切换重建。
- [ ] 完成构建、类型、常规/浏览器验证和 React 示例构建；记录实际命令与限制，验证发布样式隔离。
- [ ] 提供可运行 React 示例、改造前后和关键状态截图、验证结果及已知限制。
- [ ] 记录用户明确的 React 体验验收结果；仅技术检查完成不能勾选本项，未通过时修正后重新验收。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


# 09: Vue 场景树交互对齐

Status: ready-for-agent
Blocked by: 08

## Context

开始前阅读 [正式规格](../spec.md)，其 Implementation Decisions、Testing Decisions 与 Out of Scope 均适用本任务。参照 [任务索引](../README.md) 确认前置任务；按既定优先级执行。
覆盖 User Stories：7–10、23–25、30。
本任务尚未实现；ready-for-agent 表示规格可执行，不代表依赖已满足。

## What to build

在 Vue 中提供与已验收 React 等价的场景树浏览、选择和节点操作体验。

## Acceptance criteria

- [ ] 方向键浏览/展开/折叠与 Enter 选择有效，焦点和 selection 分离。
- [ ] 搜索、多选修饰键、祖先展开、双击聚焦及视口联动保留。
- [ ] 更多入口、能力判断、禁用原因及菜单焦点与 React 一致。
- [ ] 完整节点类型及 imported target 诊断保留，窄栏和长名称可用。
- [ ] 真实工作台测试覆盖键盘、搜索、选中和节点操作，提供截图。

## Validation

复用真实工作台的既有适配器行为与浏览器测试；通过可见控件操作并断言用户结果。按规格执行本切片适用的验证，记录实际命令、结果与未完成项；涉及测试修改时先读取仓库适用测试技能。保留 Core/Scene Snapshot 和既有 Inspector 语义，UI 临时状态不进入持久快照。

## Comments

2026-11-10：用户批准任务粒度、依赖和验收边界，发布规划；实现未开始。


# 03: React 场景层级与选择

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 02

User stories: 6, 7, 31

## What to build

让用户在真实场景树和视口之间定位、选择对象及导入子节点，并得到同步的属性与状态反馈。

## Acceptance criteria

- [ ] 树支持当前所有 hierarchy row、搜索/折叠/选择/双击聚焦；imported target 保持可见且选择同步，不能独立变换的目标保留原因。
- [ ] 点选/框选、树选择、状态摘要与 Inspector 始终一致，多选和清除仍符合原有 contract。
- [ ] 树搜索与折叠不修改场景数据；长名称、深层级、空结果、多选在三个桌面尺寸下可用。
- [ ] 双击聚焦使用现有相机能力，选择与聚焦对普通对象和可解析 imported target 均有效；选择后适用属性入口可达。

## Testing

React Workbench 行为与浏览器真实选中/拖动/框选/撤销，复用既有 runtime 证据而非新建选择模型。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

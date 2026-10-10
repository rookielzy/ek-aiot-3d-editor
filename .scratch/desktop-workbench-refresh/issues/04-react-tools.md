# 04: React 视口工具与节点操作

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 03

User stories: 8, 9, 10, 11, 12, 31

## What to build

让用户通过浮动工具组完成精确变换、历史恢复、节点组织和视角辅助，使用现有命令语义。

## Acceptance criteria

- [ ] 三种变换、各自吸附、撤销/重做可访问；坐标轴拖动 commit/取消与历史符合既有行为。
- [ ] 复制/粘贴/副本/删除/组合/解组/全选/清除均可达，禁用与可用性使用既有 Core capability。
- [ ] 网格、地面、坐标轴、悬停、选择边界、吸附反馈及全部现有灯光辅助可达；reset/frame selected/frame all/capture/apply 入口保留。
- [ ] 浮动工具组在侧栏调宽、抽屉变化和各桌面窗口下可达、不覆盖不可恢复的关键内容；快捷键不截获输入控件。

## Testing

React Workbench 行为与浏览器真实选中/拖动/框选/撤销，复用既有 runtime 证据而非新建选择模型。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

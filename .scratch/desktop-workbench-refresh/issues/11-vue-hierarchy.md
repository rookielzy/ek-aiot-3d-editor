# 11: Vue 场景层级与选择

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 10

User stories: 6, 7, 31, 33

## What to build

让 Vue 用户使用与 React 等价的场景层级、搜索、折叠、视口点选/框选及 imported target 定位。

## Acceptance criteria

- [x] 当前全部节点种类与 imported target 可见，不能独立变换的目标保留诊断；搜索与折叠仅是 UI 状态。
- [x] 树选择、点选/框选、多选/清除同步 Inspector 与状态栏，双击聚焦使用既有相机能力。
- [x] 长名称、深层级、空结果、键盘焦点和两个 locale 下的选择反馈与 React 行为等价。
- [x] 切导航或调宽不丢失选择，不重建 runtime；宿主 scoped slot 上下文仍实时更新。

## Testing

Vue Workbench/scoped-slot/public-api 与真实宿主编辑路径，依据 React 已验收行为做对称核验。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-14：任务 11 已完成，实现提交 `5af6b12`。Vue Workbench 42/42、全量单测 921/921、全量浏览器 90/90、build/typecheck 与两个示例 build 均通过。搜索/折叠、多选与双击聚焦按已确认宿主边界先红后绿；三桌面尺寸及双语真实 GLB 层级/画布选择对称核验完成。修复共享 imported target 详情的中文 descriptor 缺口及通用按钮样式覆盖。以用户确认的 `78f9365` 为基点完成 Standards/Spec 双轴审查，无硬性规范违反或 Spec 问题，保留一项跨框架逻辑重复的维护建议。全量浏览器仍有此前记录的 TransformControls 场景图提示。详见 [交付、截图与审查记录](../../../docs/design/desktop-workbench-refresh/VUE-HIERARCHY.md)。

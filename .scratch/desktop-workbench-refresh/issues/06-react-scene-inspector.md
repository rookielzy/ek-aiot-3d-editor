# 06: React 环境、灯光与相机编辑

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 05

User stories: 13, 16, 17, 18, 31

## What to build

让用户在环境和场景分组中完整布光、设置背景及保存展示视角，并得到统一的属性表单体验。

## Acceptance criteria

- [x] 环境照明与背景各自来源、强度、旋转、已有 HDR/cubemap/flat-image 等选项及预设均保留，失败诊断可达。
- [x] 全部现有灯光种类可添加、选中、编辑、删除；保留现有 shadow 设置、预设和相关辅助入口。
- [x] 相机视图 capture/apply/edit/delete/default 完整可用；被选灯光/相机的属性与场景管理指向同一数据。
- [x] 字段、折叠、焦点、空态与错误态在参考视觉下可读，右栏内部滚动不撑高工作台。
- [x] 更改环境、灯光与默认相机后导出/恢复，状态和展示意图等价；切换页签不另存一份编辑值。

## Testing

React Environment/Light/Camera Inspector 既有行为模式，加宿主保存/恢复场景意图。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-14：任务 06 已完成。实现提交 `33acb5f`，审查修正 `8adca46`；环境/灯光/相机字段统一、选择同步、独立清除来源及宿主项目恢复已验证。双轴审查与截图见 `docs/design/desktop-workbench-refresh/REACT-SCENE-INSPECTOR.md`。全量单测 906/906、浏览器 54/54，包 build/typecheck 及 React/Vue 示例 build 均通过。

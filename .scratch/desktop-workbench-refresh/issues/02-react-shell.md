# 02: React 桌面壳与可调面板

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 01

User stories: 1, 2, 3, 4, 5, 29, 31, 32, 34

## What to build

让 React 用户在新的白色连续面板中完成现有基础编辑，并通过窄导航、可调侧栏和空态界面管理桌面空间。

## Acceptance criteria

- [ ] 默认 EditorWorkbench 采用窄导航、左内容、中央视口、右属性与底部状态的区域关系，示例和宿主均可实际使用。
- [ ] Scene/Assets/Project 通过窄导航切换，内容真实绑定现有上下文；切换和收放保留原有选择及历史。
- [ ] 侧栏鼠标拖宽、键盘调宽、分别收起和恢复可用，实际宽度与 accessible value 一致；各桌面尺寸下工具和展开入口可达。
- [ ] 保留现有左/右内容和操作可达性，迁移期间不把未美化字段删掉；通过基础导入→选中→字段变换→撤销说明切片可用。
- [ ] 现有 render regions、leftPanel 优先于兼容 sidePanel、showDefaultToolbar 与自定义 toolbar 语义保持；包不自动注入示例模型。
- [ ] 面板状态仅存 UI/session；重排和 resize 不重建 editor/runtime，画布大小和指针映射正确。

## Testing

React Workbench DOM、package-root 类型与一个桌面宿主编辑闭环；人工比对空态和选中态。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

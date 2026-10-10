# 15: Vue 项目往返与可修复问题抽屉

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 12, 13, 14

User stories: 24, 25, 26, 27, 30, 33, 34

## What to build

让 Vue 用户保存、打开完整或部分项目，并通过状态栏和问题抽屉定位与修复真实问题。

## Acceptance criteria

- [ ] 全局菜单的完整/部分导出与打开保留正确 warning/error 语义；异步错误不被误报成功。
- [ ] 底部问题摘要与抽屉提供真实本地化诊断及可执行恢复入口；关闭和重开不丢问题。
- [ ] 两个 locale 下完成导入→选择→变换→撤销/重做→导出/恢复，核验材质、环境、场景灯光、默认相机与资源等价。
- [ ] 问题抽屉的恢复动作真实有效，关闭不丢问题；locale/面板变动不污染快照或重建 runtime，slot 与事件契约保持。

## Testing

Vue Workbench 资源/项目/locale/恢复用例与宿主浏览器闭环；用既有 Core fixture 验证真实结果。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

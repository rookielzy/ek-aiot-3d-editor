# 14: Vue 资源导入、维护与重导入

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 10

User stories: 19, 20, 21, 22, 23, 30, 31, 33

## What to build

让 Vue 用户完成批量导入、资源查找、替换、缺失恢复及 GLB 重导入维护。

## Acceptance criteria

- [x] 批量文件/拖放、raster intent、逐文件队列和部分失败状态与 React 等价。
- [x] 搜索过滤排序、引用与载荷状态、替换和 missing recovery 可用，恢复后 runtime 与诊断同步更新。
- [x] GLB reimport 保留现有 identity/remap 语义并显示结果；旧异步结果不覆盖新操作。
- [x] 新增控件完整双语且遵守 scoped slot 上下文；通过真实文件操作完成导入、编辑引用对象和恢复的切片验收。

## Testing

Vue Workbench 资源/项目/locale/恢复用例与宿主浏览器闭环；用既有 Core fixture 验证真实结果。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-16：任务 14 已完成。Vue 资源面板同步批量/拖放队列、完整引用与状态、普通替换、missing recovery、GLB reimport 串行竞态保护及 React 资源视觉；真实浏览器以 GLTFExporter 文件完成恢复、引用对象编辑、重导入和 locale/runtime 验证。构建、类型和 Vue 示例通过；全量单测 951/951、全量浏览器 99/99。详见 [交付与审查记录](../../../docs/design/desktop-workbench-refresh/VUE-ASSETS.md)。

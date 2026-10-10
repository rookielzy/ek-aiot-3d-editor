# 13: Vue 对象、材质、环境与场景属性

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 11

User stories: 13, 14, 15, 16, 17, 18, 30, 31, 33

## What to build

让 Vue 用户在同样的三个属性分组里完成对象材质、环境、灯光和相机编辑，而无需改变宿主用法。

## Acceptance criteria

- [x] 三个分组及其空态、折叠、内部滚动、向量输入与错误显示按 React 基线统一。
- [x] object/material-slot 切换、imported node 自动目标、unresolved 和全部现有材质/纹理字段保留。
- [x] 环境来源与预设、全部灯光及 shadow 管理、相机 capture/apply/edit/delete/default 完整保留，双入口共用同一 Core 状态。
- [x] 编辑可撤销、保存并恢复；en/zh-CN 切换保持目标/历史/运行时；Vue 事件和 slot 上下文兼容。

## Testing

Vue Inspector/Workbench 行为及浏览器材质/照明/相机往返，覆盖 React 已确定的关键目标切换。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-15：任务 13 已完成，实现提交 `80cccef`，审查修正 `c1d19d8`。三个属性分组、材质/纹理目标、环境来源、五类灯光/shadow、相机全部管理和双入口 Core 状态已交付；受控 locale、update:locale 与 scoped-slot 上下文保留。用户确认 `c6f0bba` 为审查基点，Standards 无硬性违规、保留两项维护权衡；Spec 两项错误反馈问题已修正并补先红后绿回归。全量单测 944/944、浏览器 96/96，build/typecheck 与两个示例 build 均通过。详见 [交付、截图与审查记录](../../../docs/design/desktop-workbench-refresh/VUE-INSPECTOR.md)。

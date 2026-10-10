# 08: React 项目往返与可修复问题抽屉

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 04, 06, 07

User stories: 24, 25, 26, 27, 30, 34

## What to build

让用户通过全局菜单保存/打开项目，并从底部真实状态进入诊断和恢复，形成完整编辑闭环。

## Acceptance criteria

- [x] 全局菜单提供打开、完整导出、部分导出和既有语言入口；警告、不完整包与不可导出状态不混淆。
- [x] 状态栏保留 selection/history/runtime/snap/project/assets/save/problems 关键状态的可访问摘要，详情可展开查看。
- [x] 问题抽屉展示真实 severity/source/target/本地化说明与恢复动作，修复后更新；关闭抽屉不清除问题。
- [x] 默认无问题态、加载/导入失败与缺失资源态均明确；正式 UI 没有模拟问题按钮或固定就绪文案。
- [x] 真实导出与打开恢复选择、变换、材质、资源、环境、场景灯光和默认展示视图；验证 JSON 不含宽度、折叠、locale 或运行时对象。
- [x] en/zh-CN 下完成同一闭环，切语言不重建 runtime，不丢历史或输入目标；宿主 translate 和切换器选项保持。

## Testing

React 宿主完整浏览器闭环、问题恢复 DOM 行为、locale 受控与非受控回归。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。


2026-09-14：任务 08 已完成，实现提交 `e8b13a7`。全局项目菜单、可恢复问题抽屉、项目错误会话反馈及双语往返已交付；修正 Escape 关闭菜单时误清选择。以用户确认的 `51257a7` 为基点完成双轴 code-review：规范轴无硬违规、1 项维护建议已记录取舍；规格轴无问题。定向 DOM 68/68、全量单测 915/915、浏览器 66/66，build/typecheck 及 React/Vue 示例 build 全部通过。成果与九张桌面截图见 [React 项目与问题验收记录](../../../docs/design/desktop-workbench-refresh/REACT-PROJECT-PROBLEMS.md)。分类状态保持 ready-for-agent，勾选与本条记录表示执行完成。

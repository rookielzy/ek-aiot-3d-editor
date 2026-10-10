# 12: Vue 视口工具与节点操作

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 11

User stories: 8, 9, 10, 11, 12, 31, 33

## What to build

让 Vue 用户在浮动工具组中完成变换、历史、节点组织和相机/辅助操作，复用 React 已验证的分组设计。

## Acceptance criteria

- [x] 三变换与各自吸附、字段和坐标轴编辑、undo/redo 保持既有 Core 语义，commit 与取消正确。
- [x] 复制/粘贴/副本/删除/组合/解组/全选/清除及全部相机、辅助显示入口保留，能力判断和原因来自 Core。
- [x] 浮动工具在调宽/收起面板与各桌面窗口下可达，输入中的快捷键不被截获。
- [x] 默认工具控制与自定义 toolbar scoped slot 语义保持，新增工具与状态文案完整双语。

## Testing

Vue Workbench/scoped-slot/public-api 与真实宿主编辑路径，依据 React 已验收行为做对称核验。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-15：实现前核对发现 Core WorkbenchToolbarModel 仅有 can* 布尔能力，没有禁用原因描述。为满足本任务，在既有 model 上增加可选 disabledReasons 描述，不改 command、schema 或能力判断；通过已确认的 Vue Workbench DOM 边界验证双语原因。

2026-09-15：任务 12 已完成。实现与审查修复提交 `2045312`、`7847e35`、`1fa08ff`。全量单测 927/927（限制 workers）、最后修复后 Vue Workbench/Inspector/public-api 71/71、全量浏览器 90/90、build/typecheck 及两个示例 build 通过。Core 追加可选禁用原因与 clipboard capability 输入，不改变 durable schema。Standards 发现的宿主原型方法丢失和 Spec 发现的空剪贴板 Paste 已修复，保留一项字典同步维护建议。三尺寸双语截图与命令记录见 [交付记录](../../../docs/design/desktop-workbench-refresh/VUE-TOOLS.md)。

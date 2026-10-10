# 07: React 资源导入、维护与重导入

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 02

User stories: 19, 20, 21, 22, 23, 31

## What to build

让用户在资源面板完成从批量导入到查找、替换、缺失恢复和 GLB 重导入的完整维护工作流。

## Acceptance criteria

- [x] 保留文件选择/拖放、多文件队列、逐文件结果和 texture/image 栅格用途；部分失败不会被统一成功提示掩盖。
- [x] 搜索、类型/状态过滤、现有排序方式、引用对象/计数、载荷与 package/import 状态及诊断均可访问。
- [x] 资源替换与缺失载荷恢复可通过真实文件输入完成，runtime 重投影、问题和引用摘要正确更新。
- [x] GLB reimport 保留 asset identity 和既有 remap 语义，显示成功摘要或 unresolved/失败诊断；不承诺自动修复所有子节点。
- [x] 异步操作仍有处理中/失败反馈，较旧请求完成不能覆盖较新的操作状态；仅将现有工作流移入参考视觉。

## Testing

React Workbench 资源行为用例与浏览器文件输入/恢复；沿用现有 Core 导入/reimport 合约。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。


2026-09-14：实现与 code-review 完成。前置 02 由 25dfe2e 交付。已验证全量单测 911/911、浏览器 57/57、build/typecheck 与 React/Vue demo build；同资源维护串行执行并保留最新反馈，GLB 最终 payload/remap 验证通过。成果与三种尺寸截图见 [React 资源验收记录](../../../docs/design/desktop-workbench-refresh/REACT-ASSETS.md)。分类状态保持 ready-for-agent，以上勾选与本条记录表示执行完成。

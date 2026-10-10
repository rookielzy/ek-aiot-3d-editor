# 10: Vue 桌面壳与宿主扩展

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 09

User stories: 1, 2, 3, 4, 5, 29, 31, 33, 34

## What to build

让 Vue 用户在已认可的白色桌面布局中使用可调侧栏和导航，同时继续使用原有 scoped slots 与编辑内容。

## Acceptance criteria

- [x] 复用已确定的视觉 token/区域关系，提供窄导航、可收放调宽面板、浮动工具组和底部状态；旧属性/资源内容在迁移中继续可达。
- [x] scoped slots 六个区域、兼容 sidePanel 优先级、默认 toolbar 控制与现有上下文保持；不要求与 React DOM 逐节点一致。
- [x] Vue locale/defaultLocale/translate/update:locale 及切换器可见性/禁用保持，所有新增壳层文案有 en/zh-CN。
- [x] 调宽/导航/locale 不重建 editor/runtime，UI 状态不进入快照；三个桌面窗口与键盘入口验证通过。
- [x] 保留旧工具、属性和资源内容可达，先通过空宿主导入、选择、字段变换与撤销证明新壳可用；后续迁移不要求一次重写内部面板。

## Testing

Vue Workbench/scoped-slot/public-api 与真实宿主编辑路径，依据 React 已验收行为做对称核验。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-14：任务 10 已完成，实现提交 `13d3662`。通过 build/typecheck、两个示例构建、全量单测 918/918、全量浏览器 87/87；三桌面尺寸共 15 张状态截图与人工对照完成。ResizeObserver 循环错误经原生 error 事件用例先复现再修复。以用户确认的 `8ee1303` 为基点完成 Standards/Spec 双轴审查：Spec 无问题；测试归属沿用规格确认的跨框架入口，代码重复保留为维护建议。全量浏览器仍有 TransformControls 提示，未定位其来源，未宣称控制台完全无错误。详见 [交付与审查记录](../../../docs/design/desktop-workbench-refresh/VUE-SHELL.md)。

# 09: 可恢复展示场景与 React 视觉验收

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 08

User stories: 1, 5, 28, 29, 35

## What to build

让首次打开 React 示例的用户立即看到可编辑展示模型和完整构图，并让该示例可导出后等价恢复。

## Acceptance criteria

- [x] 只在 demo 宿主初始化展示模型、镜头和灯光；空 editor/传入 snapshot 的包级集成不被注入样例或覆盖。
- [x] 模型/环境资产本地可用、可分发并附来源；不默认把原型资产授权当作产品通用授权，必要时换用明确许可的同等级展示模型。
- [x] 关键照明和默认镜头通过现有 environment/asset/presentation contract 表达，项目包携带所需资源；无不可编辑的 renderer 隐藏照明依赖。
- [x] PMREM、Three.js 资源和临时 URL 生命周期正确且不序列化；默认加载失败有真实可恢复问题态。
- [x] 1440×900、1920×1080、1100×800 下验证默认/选中/侧栏收起/问题展开与深层表单，保存截图对照原型。
- [x] 完成 React 的全能力/双语/宿主扩展验收记录，移除原型开关和内部深层依赖，明确 React 视觉基线可供 Vue 同步。
- [x] 修改环境来源/强度/旋转及场景灯光后导出，在新的 editor/runtime 打开项目包，核验模型、材质、环境、灯光、默认镜头与最终画面等价。

## Testing

React demo 冷启动、编辑、导出/恢复浏览器路径与固定场景截图，包空态与自定义宿主回归。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

2026-09-14：实现中发现既有 Core runtime 缺口：展开 GLB 的 scene imported target 与 owner 共用 runtime 根对象，重复投影时恢复 imported base transform 会覆盖 owner 最新变换，导致导出前画面与全新 runtime 恢复画面不等价。按 Parent Testing Decisions 7，在公开 editor/runtime 边界补回归并修正根对象变换归属；不改 schema 或 imported-target remap 算法。

2026-09-14：实现与验收完成，主实现提交 `90fc7b9`，审查后验收补充提交 `8ee1303`。React demo 使用本地 CC0 GLB/HDR 与可编辑场景灯光/默认镜头，真实失败可从问题抽屉修复；完成中英新 editor/runtime 导出恢复与实际像素等价验证。构建、类型检查通过；单元 916/916，浏览器三个配置 75/75，截图矩阵 22 项检查及 19 张截图。基于用户确认的 `b0988f8` 完成 Standards/Spec 双轴审查：无规范硬违规；一项维护建议保留简单身份判断并记录理由；两项规格证据缺口已补齐。完整验收及 Vue 同步基线见 `docs/design/desktop-workbench-refresh/REACT-SHOWCASE.md`。

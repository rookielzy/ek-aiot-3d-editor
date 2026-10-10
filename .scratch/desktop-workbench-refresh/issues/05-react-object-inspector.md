# 05: React 对象属性与材质槽编辑

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 03

User stories: 9, 13, 14, 15, 31

## What to build

让用户在参考风格的属性分组中编辑对象和准确的材质目标，包括导入子节点与 unresolved 状态。

## Acceptance criteria

- [x] 提供对象属性/环境/场景分组壳，保留现有环境/场景内容可用；空选择不阻断场景范围编辑。
- [x] 适用的 XYZ 数值与角度展示/转换正确，非法输入不提交，Enter/失焦不会重复写入相同历史。
- [x] object override 与 material-slot 目标列表完整；选 imported node 默认落到对应 slot，切回 owner 回到 object override。
- [x] 保留全部现有材质字段、纹理槽、override/no override/unresolved 与禁用/校验原因；更换选择不会留下旧目标输入。
- [x] 材质与变换编辑可撤销并通过项目恢复验证，视觉统一覆盖展开后的深层字段，不只修改面板标题。

## Testing

React Inspector/Workbench DOM 的目标切换与输入行为，浏览器字段编辑和项目恢复。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。


2026-09-14：任务 05 已完成，前置任务 03 的完成依据为提交 `95483a7`。对象/环境/场景分组、XYZ 与角度编辑、材质槽与 unresolved 状态、草稿/焦点/历史和真实项目恢复均已实现并验证。交付与双轴审查记录见 `docs/design/desktop-workbench-refresh/REACT-OBJECT-INSPECTOR.md`；全量浏览器 51/51，全部单测以 `pnpm run test --maxWorkers=2` 执行 896/896，通过构建与类型检查。默认并发的旧工具用例 timeout 及修正过的回归保留在交付记录中。

# 01: 恢复工作台类型与回归基线

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: None（可立即开始）

User stories: 30, 32, 33, 35

## What to build

让维护者在现有工作台上得到可信的类型检查与双语测试结果，为后续视觉改版提供可判定的基线。

## Acceptance criteria

- [ ] 复现并修正中文选择状态的陈旧断言，以正确本地化文本验证真实选择状态；不删除该行为断言、不用英文回退或 skip 掩盖缺失。
- [ ] 确认 React starter 的 Editor / EditorWithGlbImport 类型接入问题，采用兼容现有公开返回形状的最小修复，React/Vue 示例与 package-root 类型用例通过。
- [ ] 原有空宿主的导入、选择、撤销和项目恢复仍可运行；记录基线命令和结果。
- [ ] 工作台超时项单独复跑并记录；仅在证据表明存在重复性缺陷时修复，不全面放大 timeout。

## Testing

现有 React/Vue Workbench、hook/public-api 与双语宿主浏览器用例。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

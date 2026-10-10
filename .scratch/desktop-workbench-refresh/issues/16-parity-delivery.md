# 16: 双框架展示与最终交付验收

Status: ready-for-agent

Parent: [桌面工作台改版规格](../spec.md)

Blocked by: 15

User stories: 1, 5, 28, 29, 30, 32, 33, 34, 35

## What to build

让 React/Vue 两个正式示例展示一致且可恢复的完成效果，并给宿主用户可验证的升级说明。

## Acceptance criteria

- [ ] Vue demo 接入已验收的展示场景初始化策略，资源与默认视图可随项目包恢复；包级空态仍为空。
- [ ] 两框架两语言在指定桌面窗口通过完整闭环与扩展区域验收，对照同一场景截图记录必要视觉差异。
- [ ] 更新包和示例文档，说明新操作位置、面板/问题交互、双语、区域覆盖、示例资产来源及启动方式。
- [ ] pnpm build/typecheck/test/test:browser 与两示例 build 完成，任何剩余失败逐项归因并保留证据，不删除有效断言。
- [ ] 正式代码没有原型模拟状态、调试密度开关、私有包路径引用或持久化 UI 数据；核对本规格所有 user stories 的覆盖与最终截图。
- [ ] 两框架以同一项目包执行上述环境与灯光修改后的恢复验收，结合固定相机截图确认照明和构图等价，不能只断言资源引用存在。

## Testing

跨框架统一宿主浏览器边界、package-root 类型、全仓回归与视觉人工检查。

优先测试宿主可见行为和结果；复用 Core contract，不为 UI 状态添加快照字段。运行与切片相关的构建、类型和行为检查，保留命令及结果。

## Context and boundaries

先完整阅读 Parent 规格。视觉来源为 `codex/prototype-desktop-workbench` / `a9ebc22` 的 reference 原型及其成果记录；这是视觉和交互依据，不是可直接合并的正式实现。保持现有 public API、Core command/history、双语和未迁移功能可达。本任务只交付以上端到端切片，不提前实现无关任务。

## Comments

2026-09-14：已完整起草；等待按 to-tickets 确认粒度与阻塞关系后发布为 ready-for-agent。依赖满足前不要执行。

2026-09-14：用户确认测试边界、16 项拆分与依赖关系；已发布为 ready-for-agent。实现须等待 Blocked by 中的前置任务完成。

# 工作台 shadcn UI 改造

正式规划已于 2026-11-10 获用户确认；任务 01（React 项目菜单与视口工具）、任务 02（React 场景树键盘导航与节点操作）与任务 05（React 数据连接、查询与测试）已实现。

- [正式规格](spec.md)：范围、用户故事、交互及验收规则的权威来源。
- [需求草稿](requirements-draft.md)：三轮确认的讨论记录。

## 执行规则

按表中优先级推进，从依赖已完成的任务开始。Blocked by 仅表示真实阻塞关系，不等于并行授权。每项都交付界面行为及对应验证；基础原语随实际切片引入。

任务 07 必须记录用户明确的 React 体验验收通过，才能完成并解除 08 的阻塞。任务文件的 ready-for-agent 是分类状态，不表示前置依赖或验收已完成。完成任务时勾选验收项并在 Comments 记录证据；未完成的验证保持未勾选。

## 任务索引

| 编号 | 任务 | Blocked by |
| --- | --- | --- |
| 01 | [React 项目菜单与视口工具](issues/01-react-tools.md) | 无 |
| 02 | [React 场景树键盘导航与节点操作](issues/02-react-hierarchy.md) | 01 |
| 03 | [React 资源筛选、导入与维护](issues/03-react-assets.md) | 01 |
| 04 | [React 项目状态与问题修复](issues/04-react-project-problems.md) | 03 |
| 05 | [React 数据连接、查询与测试](issues/05-react-data-queries.md) | 01 |
| 06 | [React 对象绑定与草稿保护](issues/06-react-data-bindings.md) | 05 |
| 07 | [React 整体一致性与体验验收](issues/07-react-acceptance.md) | 02, 04, 06 |
| 08 | [Vue 项目菜单与视口工具](issues/08-vue-tools.md) | 07；须有 React 用户验收通过记录 |
| 09 | [Vue 场景树交互对齐](issues/09-vue-hierarchy.md) | 08 |
| 10 | [Vue 资源、项目与问题流程](issues/10-vue-assets-problems.md) | 08 |
| 11 | [Vue 数据连接与查询](issues/11-vue-data-queries.md) | 08 |
| 12 | [Vue 对象绑定](issues/12-vue-data-bindings.md) | 11 |
| 13 | [双框架一致性与最终验收](issues/13-cross-framework-acceptance.md) | 09, 10, 12 |

## 交付边界

规格的发版仅覆盖规格与任务本身。实现过程中遵循规格的测试及发布约束；交付可运行示例、前后及关键状态截图和实际验证结果，不自动发布、合并或部署。


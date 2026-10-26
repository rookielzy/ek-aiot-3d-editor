# 04: 给对象绑定设备并显示实时详情

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段二

Blocked by: 03

User stories: 13, 14, 17, 22, 28

Decisions: D02, D03, D04, D09, D12

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

选中一个真实 GLB object node，选择查询、参数和设备，保存详情字段并手动预览；点击对象查看数据详情卡。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 实现 NodeId 绑定 command/引用校验、有效参数、启用状态、详情字段模型、一次预览/显式刷新及对象数据状态；目标能力严格限制整 object。 |
| React | 在 Inspector 和查询详情提供同一个绑定表单；支持设备候选/手填、字段排序/精度、绑定覆盖参数、屏幕详情卡、停用/解除。 |
| Vue | 不新增界面；core 绑定/详情模型完全独立于 React 组件类型，保留后续 Vue 消费所需公开 contract。 |

## Acceptance criteria

- [ ] 绑定查询、设备、详情定义可保存撤销；一个 object 仅有一个查询上下文，至少一个展示输出。
- [ ] 多选和不支持的节点显示原因；imported 目标可显式回 owner，不静默改绑。
- [ ] 测试覆盖、默认参数与绑定覆盖互不串用；候选属于当前参数结果，没有设备也可手填等待。
- [ ] 点击真实对象沿用 NodeId picking，详情显示对应设备字段/单位/精度与接收/采样/质量。
- [ ] 开启预览和显式刷新才执行；停止关闭卡片并清空当前展示身份，绑定配置保留。
- [ ] 字段缺失或查询失败有明确原因，无假值；每次结果更新不增加 history 或改 Snapshot。
- [ ] 从 Inspector 创建查询后回到原对象草稿，保存与取消不丢失原选择。

## Testing

公开 Editor 绑定校验/历史与详情模型；React DOM 的参数、字段和回流；真实 GLB 浏览器 smoke 验证对象选择到详情。此阶段可只手动刷新，持续调度由 05 完成。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不在 React 实现自己的取数或设备匹配器；本任务暂不应用数据颜色。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

# 11: 在 Vue 完成对象绑定、数据预览和颜色交互

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段四

Blocked by: 10

User stories: 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 29, 30, 31

Decisions: D09, D10, D11, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

Vue 用户可给对象绑定设备，查看实时详情和颜色，在异常时定位修复并停止恢复，与 React 完整闭环一致。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 复用绑定、调度、规则、颜色投影、试用和节点操作能力；不改变先前状态或资源所有权语义。 |
| React | 保持同一共享模型与文案；对任何必要 core 修复跑对应 React 回归。 |
| Vue | 实现 Inspector 绑定表单、参数/设备/详情/规则配置、试用与全局预览、详情卡、受限编辑反馈、状态摘要/问题抽屉和引用维护。 |

## Acceptance criteria

- [ ] 真实 GLB object 的选择、单上下文绑定、卡片字段顺序/精度和颜色规则与 React 等价。
- [ ] 相同查询/参数的多对象实际共享 core 上下文，Vue 不创建额外 interval 或 request cache。
- [ ] 试用/取消/切换目标、开始/停止、坏字段/过期/失败的外观恢复与能力禁用正确。
- [ ] 所有操作通过同一 command/数据服务；配置 undo/redo、引用保护、复制节点和项目恢复反馈可用。
- [ ] 自身与外部 editor 所有权清晰，重复挂卸/editor ref 更换无重复请求、旧卡片或材质残留。
- [ ] en/zh-CN、scoped slots、自定义 UI 扩展与键盘焦点保持可用；不将卡片位置或翻译写 Snapshot。

## Testing

Vue Inspector/Workbench DOM、composable 生命周期与双语；真实 GLB/WebGL/同源 HTTP 浏览器闭环，检查共享、停止恢复及异常；必要的 React 同 contract 回归。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不新增额外绑定目标、自动 POST、特定框架的数据状态机或其他实时协议。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

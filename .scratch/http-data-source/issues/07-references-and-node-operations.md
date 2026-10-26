# 07: 保护配置引用并让节点操作携带正确绑定

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段三

Blocked by: 04

User stories: 2, 3, 22, 23, 24

Decisions: D03, D11, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

修改或删除连接/查询前能定位使用位置；复制、粘贴、删除和恢复对象时，绑定与依赖仍然正确。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 完整实现反向引用、兼容/不兼容修改规则、子树删除清理、duplicate 与新版节点 clipboard 的依赖携带和跨 editor ID remap；维护旧 clipboard 兼容。 |
| React | 显示查询/属性/参数使用位置和阻止原因；选择引用对象、解除或更换；复制对象后明确提示仍关联同一设备。 |
| Vue | 不新增数据面板；既有 Vue 节点操作使用更新后的 core，旧 clipboard/选择/层级行为保持可用。 |

## Acceptance criteria

- [ ] 有对象引用时不能删除查询，有查询时不能删除连接；拒绝操作不改变 Snapshot/history。
- [ ] 属性键/类型、已使用参数删除/类型变化不能破坏引用；兼容改名/单位/转换保存后重新校验。
- [ ] 删除对象或含对象子树同时移除绑定，undo 一次恢复；rename/reparent/group/reimport 保留 NodeId 时绑定不误迁移。
- [ ] duplicate/同 editor paste 新节点复制配置，仍指向原设备，响应/凭证/请求对象不复制。
- [ ] 跨 editor clipboard 携带必要纯配置；相同 ID 且定义相同可复用，冲突生成新 ID/名称并重写完整依赖，不覆盖目标配置。
- [ ] 旧 object-only 与节点 clipboard 继续可读；没有凭证的目标 host 保留待连接配置，不伪造成功状态。
- [ ] 既有节点层级、材质和资产操作的原子性及旧 proof loop 保持通过。

## Testing

通过公开编辑操作验证嵌套删除/撤销、duplicate、同/跨 editor copy/paste 和引用冲突；React 引用定位/删除保护 DOM；旧 clipboard 与 GLB reimport 相关回归。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现批量对象绑定表单或跨场景连接库；不把此任务扩大为 clipboard 全面重构。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

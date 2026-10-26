# 01: 建立可保存的连接配置与数据工作区

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段一

Blocked by: None

User stories: 1, 2, 26, 29, 32

Decisions: D01, D02, D03, D12

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

在 React 数据工作区创建、编辑、复制与删除尚未使用的连接，保存/撤销后配置与列表一致；旧宿主继续正常工作。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 引入 v9 dataSources 及合法空 queries/bindings 的最终类型边界、旧版本迁移、连接校验/command、引用统计与框架无关连接列表模型；同步公开导出与既有构造选项兼容。 |
| React | 新增数据导航、空态、搜索与连接表单；显示宿主凭证描述及缺失状态，调用 core 保存/撤销，支持 en/zh-CN。 |
| Vue | 本任务不新增数据界面；验证原有 Vue 宿主可加载 v9 空数据域和仅连接配置，避免 core 升级破坏旧适配器。 |

## Acceptance criteria

- [ ] 空 editor 不注入连接、查询或模拟设备，不发网络请求；v1–v8 恢复后数据域为空。
- [ ] 连接名称去重，拒绝非法服务地址/秘密嵌入与非法超时；无凭证或离线仍可保存合法配置。
- [ ] 一次保存是一项 command/history；失败不改变 Snapshot，undo/redo 与序列化恢复保持等价。
- [ ] 复制连接生成新 ID/名称，不复制查询；无引用可删除。
- [ ] 数据面板与表单提供双语、可访问标签和稳定焦点；不得为了原型入口改写正式 viewport。
- [ ] v9 能通过现有 Snapshot/项目 scene 校验入口，旧 React/Vue/vanilla 创建与读取路径保持可用。

## Testing

公开 Editor 的连接命令、迁移/校验及 serialize/restore；React Workbench 连接操作 DOM；三个 package-root 构建/类型兼容。该任务不触及 viewport，不要求为纯表单新增 WebGL 测试。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现网络执行、查询保存或对象绑定；不要先建立通用插件框架。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

# 10: 在 Vue 完成连接、查询与映射配置流程

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段四

Blocked by: 09

User stories: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 27, 29, 30, 31

Decisions: D01, D04, D05, D06, D07, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

Vue 使用者可在原生 Workbench 完成与 React 等价的数据源接入、测试、映射预览和配置维护。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 复用已完成的全部 contract/model/command；仅修复确有证据的框架无关能力缺口，不新增 Vue 特供语义。 |
| React | 作为已验证交互参照；若发现共享语义问题，随 core 修复同步验证，不通过 Vue 去依赖 React 组件。 |
| Vue | 新增数据导航、宽配置窗口、连接/请求/映射表单、草稿/响应会话、问题定位、宿主能力传递和 composable 订阅；提供 en/zh-CN 与 scoped-slot 上下文。 |

## Acceptance criteria

- [ ] Vue 多连接/查询、字段/默认值、GET/只读 POST、示例数据与保存事务和 React 一致。
- [ ] 核心执行、映射、错误判定与轮询未复制到 composable 或组件；只调用公开 core API。
- [ ] 测试参数隔离、映射即时反馈、取消/关闭草稿与离线保存行为一致；同源真实 HTTP 可用。
- [ ] editor ref 更换先释放旧订阅/测试句柄，新 editor 不继承旧响应或草稿；外部 editor 不被卸载误销毁。
- [ ] 语言/面板切换不重建 editor/runtime，焦点可见，输入快捷键不被全局编辑操作劫持。
- [ ] 公开 Vue 类型、slots、旧 props 与现有宿主仍可用；不要求宿主配置样式生成。

## Testing

Vue useEditor/useWorkbench、Workbench DOM/双语/草稿与 editor 替换；package-root consumer；同源 HTTP 浏览器配置 smoke，并复用 core 夹具而非复制算法测试。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

本任务不实现 Vue 对象详情/颜色 UI，留给 11；不重新设计已确认的交互流程。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

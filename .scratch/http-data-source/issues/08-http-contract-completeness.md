# 08: 完成只读 POST、认证引用和请求配置

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段三

Blocked by: 05

User stories: 1, 4, 5, 6, 27

Decisions: D05, D06, D07, D08, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

同一配置流程可接入需要 JSON body、API Key 或业务成功字段的读取接口，保存与展示仍不泄漏凭证。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 完成只读 POST、结构化 typed body 参数、非秘密公共/查询 headers 覆盖、无认证/Bearer/API Key 引用、可选业务成功条件与响应限制；与共享执行和错误判定统一。 |
| React | 补齐方法/认证/公共头/参数插入/body/业务成功字段和手动策略 UI，明确不能把 POST 当设备控制或轮询接口。 |
| Vue | 不新增界面；保持全部契约可通过 core 公共入口使用，并为 Vue 提供一致字段/能力模型。 |

## Acceptance criteria

- [ ] GET、只读 POST 的路径/query/body 参数编码与类型正确，0/false 不丢；POST 未确认只读时不执行。
- [ ] POST 仅由测试、首次预览或显式刷新触发，禁止自动轮询与重试；GET 原有行为不退化。
- [ ] 认证保留头不能被用户公共/查询头覆盖；UI/摘要/问题 metadata 不出现真实 token，配置仅留 credentialRef。
- [ ] 缺凭证可保存配置，执行报可恢复问题；凭证 revision 改变后旧响应和缓存不可见。
- [ ] 可选业务字段严格比较；HTTP 失败、业务失败、204、非 JSON、解析失败和响应超限有不同结果。
- [ ] 多个连接/查询具有各自参数与状态，不硬编码 areaId、pump ID、code=0 或只有一个查询。
- [ ] 受控本机 HTTP 夹具同时验证 GET/POST、头部由宿主注入、业务失败及参数 body 类型。

## Testing

公开数据服务和真实同源 HTTP 的 GET/POST 参数、认证、成功条件及限额；React 配置表单 DOM；对 05 的共享、手动策略与错误隔离做针对性回归。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不提供密钥输入持久化、OAuth 后台、任意服务端代理、自动 POST 或外部写入。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

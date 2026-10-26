# 02: 从已保存连接执行手动 GET 查询

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段一

Blocked by: 01

User stories: 4, 5, 27, 28, 31

Decisions: D04, D05, D06, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

在 React 请求表单填写相对路径和带类型参数，运行一次真实受控 GET，查看请求摘要、响应及错误，并能取消。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 增加与 viewport 独立的数据服务门面、宿主执行器/凭证描述接入、草稿 GET 构建、参数默认/覆盖解析、超时、取消、generation 与运行态订阅；不把测试结果写入 Snapshot。 |
| React | 实现请求表单、默认/临时参数分区、运行/取消与原始响应区；通过数据服务执行，运行结果标记配置 revision。 |
| Vue | 保持现有 UI；公开数据服务不依赖 React，现有 Vue 创建/销毁路径可持有新增 core 能力。 |

## Acceptance criteria

- [ ] 单次执行可在无 DOM/WebGL 的 core host 完成；没有 executor 时返回可定位问题，不偷偷 fetch。
- [ ] 有效参数严格区分空值、0、false 与未提供；缺参/类型错误不调用 executor。
- [ ] 路径/参数正确编码，不能用绝对地址、协议相对地址或前缀穿越绕过连接；摘要不含认证秘密。
- [ ] 默认参数 A、临时测试 B 只影响本次请求，默认值及将来的对象覆盖保持不变。
- [ ] 运行时能取消；改草稿或销毁后的旧响应不标为当前已验证结果，即使 executor 不配合 abort。
- [ ] 响应状态、文本/JSON、耗时与诊断仅在当前会话保留；未映射查询此时作为窗口草稿，不写半成品 durable query。
- [ ] React 示例/受控宿主通过本机同源 HTTP 夹具证明请求确实到达服务；不访问外网。

## Testing

从公开数据服务注入可控 executor 验证参数、调用次数、超时/取消；React DOM 测试临时覆盖隔离；同源受控 HTTP 浏览器 smoke 验证真实请求。复用现有宿主，不新建一套端到端框架。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现字段映射、持续轮询或真实密钥管理后台；POST 等 HTTP 扩展在 08。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

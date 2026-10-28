# 05: 让多个对象共享轮询并正确处理异常

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段二

Blocked by: 04

User stories: 17, 18, 19, 20, 21, 27, 31, 32

Decisions: D04, D05, D08, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

多个对象复用同一读取上下文，预览期间自动刷新；用户能理解过期、失败、空结果与认证暂停，并修复或停止。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 实现上下文键、订阅引用计数、最多 4 个并发、GET 调度/退避、认证 revision、独立新鲜度、失效/取消/晚到隔离、派生问题与停止/dispose。 |
| React | 显示共享上下文与绑定摘要、刷新中/过期/失败、修复和重试入口；问题抽屉可定位查询/对象/字段，统一消费 core 能力。 |
| Vue | 不新增界面；新增问题/状态不得只绑定在 WebGL runtime 或 React store 上，Vue 创建/销毁兼容。 |

## Acceptance criteria

- [x] 相同 queryId/有效参数/配置与认证 revision 的两个对象每周期只发一次请求，不同区域不混用；设备选择不造成列表查询重复请求。
- [x] 同上下文无重叠，超出并发上限去重排队；最后引用消失停止请求，选择其他对象不触发重新查询。
- [x] 请求中刷新不排队；改地址/参数/映射、停用、停止、认证轮换和 executor 替换均拒绝晚到旧响应。
- [x] 接收与采样年龄分别判断；没有新响应也会到时过期，反复返回旧采样不能续命。
- [x] 新结果缺设备/字段或为空时立即无当前值，历史值仅单独标记；坏字段不阻断其他有效设备。
- [x] 401/403 暂停；GET 临时失败按规格退避并尊重 Retry-After；不可重试错误等待修复，手动策略不暗中轮询。
- [x] 重复故障按稳定位置更新/清除，整个执行生命周期不改变 durable snapshot；卸载/销毁无遗留 timer、请求或订阅。

## Testing

公开数据服务配合受控时钟/executor 验证共享、并发、取消、晚到、退避、到期与身份隔离；React DOM 验证状态/问题入口；浏览器同源 GET 验证一请求供两对象。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不新增跨 editor 全局缓存，不把 renderer 帧循环当请求调度器，不开发后端鉴权系统。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-28：实现、验证与代码审查完成（`d302217`、`c468434`）。

实现与决策：

- `DataQuery` 新增 durable `updatePolicy`（`refreshIntervalMs`、`maxAgeMs`），默认 5 秒 / 15 秒，最少 1 秒且最大年龄不小于轮询间隔；草稿、command、快照校验、React 查询窗口与中英文文案同步。为兼容同一未发布 v9 迭代中早于更新策略的快照，恢复时对缺失 policy 的已保存 query 补默认值；`validateSceneSnapshot()` 仍要求显式策略，文档已记录。
- core 数据服务实现共享预览上下文：键为 queryId + 规范化有效参数 + 连接/查询配置 + 宿主认证 revision，不含对象/设备身份；同上下文每周期一次 GET，最多 4 个并发上下文，其余去重排队。选择其他对象或切换设备优先复用最近映射结果，不重复列表请求。
- 轮询仅在前次完成后调度，刷新在途上下文不排队；配置/绑定变化、停用、停止、auth revision 变化、executor 替换与 dispose 取消旧 generation，执行器忽略 abort 时晚到响应也不提交。GET 网络失败、超时、408/429/5xx 以轮询间隔为基数指数退避（上限 60 秒）并尊重数字或 HTTP-date `Retry-After`；401/403 暂停到显式重试或 auth revision 变化；其余 4xx、解析、业务与结构错误停止自动执行。手动查询仍只执行一次。
- 独立新鲜度同时约束接收年龄与可用源采样年龄，无后续响应也由 timer 到期；未来源时间无效且不能延长寿命。空结果、缺字段、缺设备立即清空当前值，最后有效字段按各自接收时间单独标记为历史值；坏字段只影响当前设备。
- 派生数据问题使用稳定 ID 与 data-query/data-object/data-field target；React 详情卡显示共享上下文、刷新中、过期、认证暂停、空结果、历史值和重试，问题抽屉定位查询、对象或字段（字段会滚动并高亮详情行）；Vue 通过 `useWorkbench` 订阅同一 core dataState 并汇入工作台问题/状态，不新增数据 UI。

验证（2026-10-28）：

- `pnpm --config.script-shell="C:/Program Files/Git/bin/bash.exe" build`：core、React、Vue 三个包通过。Windows 默认 shell 会让根脚本中的单引号 filter 失效，使用仓库既有 bash override；未修改根脚本。
- 同参数 `pnpm typecheck`：core、React、Vue 全部通过。
- `pnpm test`：131 test files / 1201 tests passed。
- `pnpm test:browser`（审查修复前完整套件）：27 test files / 120 tests passed（Chromium 三个 viewport）。审查修复后定向重跑 `http-data-source.browser.test.tsx`、`object-data-details.browser.test.tsx`、`query-editor-focus.browser.test.tsx`：9 file-instance / 12 tests passed。
- 定向 core `preview-runtime.test.ts`、`data-query-commands.test.ts`、`snapshot.test.ts`：65 tests passed；React `workbench-data-preview`/`workbench-query-mapping`：19 tests passed；Vue workbench + i18n parity/audit：71 tests passed。
- `git diff --check`：通过，仅 Git 对既有 CRLF/LF 文件给出提示。

代码审查（`code-review` skill，Standards/Spec 双轴，范围 `04eba64...HEAD`）：

- Spec：补齐恢复兼容、字段级定位、Vue dataState 聚合、取消/abort、指数退避与 HTTP-date Retry-After、故障清除、独立历史接收时间、刷新中状态等测试缺口；实现中发现并修复 `refreshing` 被旧 patch 覆盖、历史值使用新响应时间两个真实缺陷。不可重试上下文仍以 `phase: "waiting"` 表示“等待修复”，UI 在无下一次刷新时间时显示 “Awaiting retry / 等待重试”。
- Standards：更新 `docs/schema.md`、`docs/README.md`、`docs/architecture.md` 与 core README；移除重复的参数格式化、映射问题转换、取消实现与无效 `#dataSources` 字段；重命名并发上限；`Locate` 在有草稿时不再被静默消费；移除未使用的 `useObjectDataState`。保留判断项：`createRuntimeState` 的显式位置参数、两种序列化用途与详情卡始终提供重试入口。

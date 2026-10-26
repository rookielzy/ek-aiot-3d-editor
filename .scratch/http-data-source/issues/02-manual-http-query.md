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

- [x] 单次执行可在无 DOM/WebGL 的 core host 完成；没有 executor 时返回可定位问题，不偷偷 fetch。
- [x] 有效参数严格区分空值、0、false 与未提供；缺参/类型错误不调用 executor。
- [x] 路径/参数正确编码，不能用绝对地址、协议相对地址或前缀穿越绕过连接；摘要不含认证秘密。
- [x] 默认参数 A、临时测试 B 只影响本次请求，默认值及将来的对象覆盖保持不变。
- [x] 运行时能取消；改草稿或销毁后的旧响应不标为当前已验证结果，即使 executor 不配合 abort。
- [x] 响应状态、文本/JSON、耗时与诊断仅在当前会话保留；未映射查询此时作为窗口草稿，不写半成品 durable query。
- [x] React 示例/受控宿主通过本机同源 HTTP 夹具证明请求确实到达服务；不访问外网。

## Testing

从公开数据服务注入可控 executor 验证参数、调用次数、超时/取消；React DOM 测试临时覆盖隔离；同源受控 HTTP 浏览器 smoke 验证真实请求。复用现有宿主，不新建一套端到端框架。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现字段映射、持续轮询或真实密钥管理后台；POST 等 HTTP 扩展在 08。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-26：实现完成。core 新增 `buildDataGetRequest()`/`resolveDataQueryParameters()` 与 `editor.getDataService()`：宿主 executor/credential 描述接入、严格类型参数、路径/query 编码与穿越防护、timeout、取消、运行 generation、配置 revision 与独立运行态订阅；没有 executor 或凭证不可用时只返回结构化问题，不调用 `fetch`。React Data 工作区新增双语手动 GET 测试器，分离默认参数与临时测试值，展示请求摘要、可见配置修订、状态/内容类型、原始与 JSON 响应、耗时和诊断；响应、覆盖值、取消状态和 timer 均不进入 Snapshot/history。Vue 保持数据 UI 不变，仅让 `useEditor`/`EditorWorkbench` 透传 executor。新增 dev-only 同源 Vite fixture，浏览器 smoke 通过真实 HTTP 验证路径、query 和公共头到达服务。

代码审查后修复：结果区显示配置 revision 并补充断言；浏览器 smoke 固定 `locale="en"`，并在 zh-CN proof loop 之后重跑验证顺序隔离；修正 architecture 文档把运行态误列在 Snapshot 保存项；补充 `docs/README.md` 能力概览和 Vue 集成文档；移除未使用的公开 helper 与字典键，合并重复参数定义校验和共享 run 类型，清理测试中的同义反复与重复构建；请求 payload CSS class 改名以继续满足 package CSS 边界守卫。

实际验证：

- `pnpm --filter @ek-aiot/3d-editor-core build`：通过。
- `pnpm --filter @ek-aiot/3d-editor-react build`：通过。
- `pnpm --filter @ek-aiot/3d-editor-vue build`：通过。
- `pnpm --filter @ek-aiot/3d-editor-core typecheck`：通过。
- `pnpm --filter @ek-aiot/3d-editor-react typecheck`：通过。
- `pnpm --filter @ek-aiot/3d-editor-vue typecheck`：通过。
- `pnpm --filter @ek-aiot/react-proof-loop build`：通过（example typecheck + Vite build；仅既有 chunk size warning）。
- `pnpm vitest run packages/core/src/data-sources packages/core/src/public-api.test.ts`：55 tests passed。
- `pnpm vitest run packages/react/test/workbench-http-query.test.tsx packages/react/test/workbench-i18n-parity.test.ts packages/react/test/i18n-string-audit.test.ts packages/react/test/build-config.test.ts`：18 tests passed。
- `pnpm exec vitest run --config vitest.browser.config.ts packages/react/test/proof-loop-demo.browser.test.tsx packages/react/test/http-data-source.browser.test.tsx`：6 test files / 69 tests passed（Chromium 三个 viewport 实例，先 zh-CN proof loop 后同源 HTTP smoke）。
- `pnpm test`：122 test files / 1048 tests passed。
- `pnpm test:browser`：21 test files / 111 tests passed（Chromium 三个 viewport 实例）。
- `git diff --check`：通过；仅 Git 对既有 CRLF/LF 文件给出提示。

测试覆盖：core 的草稿构建、参数默认/覆盖与严格类型、编码与路径逃逸表、摘要秘密隔离；数据服务的 executor/凭证守卫、超时中止、取消与晚到响应、invalidate/dispose/config revision、HTTP 与非法响应、Snapshot/history 不变；React 的临时覆盖隔离、缺 executor 不联网、缺参/类型错误不调用、取消、改草稿清空旧结果、焦点恢复、双语；浏览器 smoke 断言同源 fixture 实际收到编码路径/query/头且响应不污染 Snapshot。

环境差异：Windows 下根 `pnpm typecheck` 的 `pnpm -r --filter './packages/*'` 未匹配包（既有问题），因此按明确包名完成类型检查与构建。浏览器全量测试和 jsdom 全量测试未并行运行，避免既有软件 GPU/超时干扰。

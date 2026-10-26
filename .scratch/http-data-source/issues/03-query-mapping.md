# 03: 完成查询保存与设备属性映射预览

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段一

Blocked by: 02

User stories: 3, 7, 8, 9, 10, 11, 12

Decisions: D02, D03, D06, D07, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

从真实或示例 JSON 配置单设备/设备数组映射，对照原值与标准属性，最后将查询和映射一次保存。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 实现查询 CRUD/复制、有限路径与转换、身份/属性/时间/质量校验及标准输出；提供稳定引用和映射字段模型，查询与映射同一事务。 |
| React | 实现字段路径选择、映射表、逐字段结果、单对象身份来源、示例 JSON 编辑和已测试/过期草稿标记；保存后回到原上下文。 |
| Vue | 不新增界面；保持新查询可由框架无关 API 使用，旧 Vue Workbench 不因额外 Snapshot 数据异常。 |

## Acceptance criteria

- [x] 支持多个连接下的多个命名查询，复制产生新 ID；至少一个属性与合法身份规则才能保存。
- [x] 数组和单对象模式均可用；字符串 ID 001 不丢前导零，数字 ID 仅显式转换，重复 ID 整次失败。
- [x] 426 经乘 0.1 输出 42.6；布尔只按明确对应表转换，missing/null/类型错误不变成 0/false。
- [x] 未知采样时间与 receivedAt 分开；无效/超前时间和源质量独立诊断，HTTP 200 不推断 good。
- [x] 单字段错误隔离，根结构/重复 ID 整体失败；空结果可保存映射，不自动删字段。
- [x] 修改系数、源字段或类型后预览确实变化；示例带来源标签，临时 JSON/测试值不进入序列化查询。
- [x] 断网或尚未测试可保存结构合法配置；查询与映射保存只增加一次编辑历史。

## Testing

通过公开查询执行/映射入口覆盖单对象、数组、错误隔离、时间/质量与身份；查询 command/history/JSON 往返；React 配置窗口从请求结果到映射保存的 DOM 行为。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不加入任意脚本、通配查询语言、设备管理库、历史查询或跨接口合并。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-26：实现完成。core 新增稳定 `DataQuery` 定义（路径、类型参数、mapping）、类型化路径解析、查询 create/update/duplicate/delete command、同 connection 名称唯一与 binding 引用删除保护，以及查询与映射一次 command/history 保存。`mapDataQueryBody()` 支持数组/单对象模式、字段/参数/固定身份、raw/number/scale/map 转换、range/allowed、ISO/Unix 时间、quality 映射与标准样本；字符串 ID 原样保留，数字身份仅显式转换，重复 ID/根结构整体失败，单字段/时间/质量独立诊断，HTTP 200 不推断 `good`。`validateDataQueryMapping()`/`validateDataQueryDefinition()` 复用请求与参数规则，存储校验拒绝旧 reference-only query 形状（v9 按规格在同一版本内扩展）。

React Data 工作区新增双语查询配置对话框：请求与保存分离，支持临时参数覆盖、字段路径建议、映射表、range/allowed、身份来源、示例 JSON、来源标签、过期草稿标记、逐字段预览与标准样本 JSON；保存后回到 query 列表并恢复焦点，未保存关闭需确认，查询窗口打开时背景操作 inert。Vue 不新增界面，仅镜像字典键；已保存查询通过 core 公共 API 使用。

代码审查后修复：字符串 map 输出重新打开/保存不再被 JSON 引号污染；range/allowed 可编辑且往返保留；React 参数解析改为复用 core `resolveDataQueryParameters()`；查询问题文案映射和唯一名称生成去重；修正恒真的样例序列化断言；补充空结果保存、未测试离线保存、源字段/转换变化、参数覆盖/示例不入快照、range/allowed 往返测试；新增 schema、architecture、README、集成指南和 changeset。D13 的 data/runtime/project 问题汇总属于任务 05 的问题抽屉范围，本轮保持查询编辑器内的逐字段诊断。

实际验证：

- `pnpm --config.script-shell="C:/Program Files/Git/bin/bash.exe" build`：core/React/Vue 全部通过。
- `pnpm --filter @ek-aiot/3d-editor-core typecheck`、`pnpm --filter @ek-aiot/3d-editor-react typecheck`、`pnpm --filter @ek-aiot/3d-editor-vue typecheck`、`pnpm --filter @ek-aiot/react-proof-loop typecheck`：均通过。
- `pnpm exec vitest run packages/core/src/data-sources packages/core/src/public-api.test.ts packages/core/src/snapshot`：7 test files / 121 tests passed。
- `pnpm exec vitest run packages/react/test/workbench-query-mapping.test.tsx`：6 tests passed。
- `pnpm exec vitest run packages/react/test/workbench-i18n-parity.test.ts packages/react/test/i18n-string-audit.test.ts packages/react/test/workbench-data-sources.test.tsx packages/react/test/workbench-http-query.test.tsx packages/react/test/build-config.test.ts packages/vue/test/package-docs.test.ts`：6 test files / 37 tests passed。
- `pnpm test`：125 test files / 1087 tests passed。
- `pnpm test:browser`：21 test files / 111 tests passed（Chromium 三个 viewport 实例）。
- `git diff --check`：退出码 0；仅 Git 对既有 CRLF/LF 文件给出提示。

环境差异：Windows 下根 `pnpm typecheck` 的 `pnpm -r --filter './packages/*'` 仍未匹配包（既有问题），因此按明确包名完成类型检查；jsdom 与浏览器全量测试未并行运行。

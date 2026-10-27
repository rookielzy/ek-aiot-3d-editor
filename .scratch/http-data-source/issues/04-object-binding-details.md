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

- [x] 绑定查询、设备、详情定义可保存撤销；一个 object 仅有一个查询上下文，至少一个展示输出。
- [x] 多选和不支持的节点显示原因；imported 目标可显式回 owner，不静默改绑。
- [x] 测试覆盖、默认参数与绑定覆盖互不串用；候选属于当前参数结果，没有设备也可手填等待。
- [x] 点击真实对象沿用 NodeId picking，详情显示对应设备字段/单位/精度与接收/采样/质量。
- [x] 开启预览和显式刷新才执行；停止关闭卡片并清空当前展示身份，绑定配置保留。
- [x] 字段缺失或查询失败有明确原因，无假值；每次结果更新不增加 history 或改 Snapshot。
- [x] 从 Inspector 创建查询后回到原对象草稿，保存与取消不丢失原选择。

## Testing

公开 Editor 绑定校验/历史与详情模型；React DOM 的参数、字段和回流；真实 GLB 浏览器 smoke 验证对象选择到详情。此阶段可只手动刷新，持续调度由 05 完成。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不在 React 实现自己的取数或设备匹配器；本任务暂不应用数据颜色。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-27：实现完成。core 新增 `set-data-object-binding`/`delete-data-object-binding` 单事务命令；按 NodeId 校验目标只允许整 object，imported/group/light/camera 返回明确 code（imported 附带 `ownerObjectId`），不静默改绑。binding 保存 queryId、类型化参数覆盖、deviceId、enabled 和有序 details；默认参数与绑定覆盖隔离，手填设备可在当前结果缺失时等待数据。查询删除、binding 引用的属性删除/改型、绑定覆盖参数的删除/改型均被阻止；删除 object 子树同步清理 binding，一次 undo 恢复。`buildDataObjectDetailModel()` 从 Snapshot 与 runtime state 生成字段标签/单位/数字精度、接收/采样时间、source quality 和逐字段问题；非数字字段拒绝 precision。`CoreDataService` 新增 `startPreview()`/`refreshPreview()`/`stopPreview()` 和独立对象数据订阅；每个启用的 binding 用自身有效参数执行一次 GET，按 `entityId` 精确匹配设备，返回 loading/ready/partial/missing-device/error 及 timeout/HTTP/JSON/映射/缺设备等显式问题。配置变化只取消并清除受影响对象，其他结果保留并等待显式刷新；stop 中止在途请求、清空对象运行态并保留 binding；结果更新不写 Snapshot/history，默认空宿主不联网。

React 新增共享 Device data 表单（Object Inspector 与查询 Bindings 对话框），支持设备候选/手填、字段排序、标签覆盖、数字精度、绑定参数覆盖、启停和解除；候选请求使用当前绑定参数，连接或查询变化会使候选过期，映射失败使用 en/zh-CN 文案。视口工具条新增 Start/Refresh/Stop 手动预览，选中对象显示详情卡（字段、单位、精度、接收/采样、quality、明确失败原因）；多选、group/light/camera 显示原因，imported 提供显式选择 owner。从 Inspector 新建查询保存或取消后回到原对象草稿与选择。Vue 不新增界面，仅保持 core contract 与双语字典对齐；本任务不包含持续调度、共享请求上下文或数据颜色。

实际验证（提交 `6f08fea`、`d11a1ae`、`517fbd2`）：

- `pnpm --filter @ek-aiot/3d-editor-core build`、`pnpm --filter @ek-aiot/3d-editor-react build`、`pnpm --filter @ek-aiot/3d-editor-vue build`：全部通过。根 `pnpm build` 仍因 Windows 下 `./packages/*` filter 未匹配（既有问题），按显式包名验证。
- `pnpm --filter @ek-aiot/3d-editor-core typecheck`、`packages/react`、`packages/vue` 的 `pnpm typecheck`，以及 `pnpm --filter @ek-aiot/react-proof-loop typecheck`：均通过；vue-proof-loop 未配置 typecheck 脚本。
- `pnpm exec vitest run --root ../.. packages/core/src/data-sources/object-bindings.test.ts packages/core/src/data-sources/object-data-runtime.test.ts --maxWorkers 1`：2 files / 27 tests passed。
- `pnpm exec vitest run --root ../.. packages/react/test/workbench-object-binding.test.tsx packages/react/test/workbench-data-preview.test.tsx --maxWorkers 1`：2 files / 14 tests passed。
- `pnpm exec vitest run --root ../.. packages/react/test/workbench-object-binding.test.tsx packages/react/test/workbench-data-preview.test.tsx packages/react/test/workbench-i18n-parity.test.ts packages/react/test/i18n-string-audit.test.ts packages/react/test/workbench-query-mapping.test.tsx --maxWorkers 1`：5 files / 25 tests passed。
- `pnpm test`：130 test files / 1168 tests passed。
- `pnpm test:browser`：27 test files / 117 tests passed（Chromium 三个 viewport，包含真实 GLB picking 到详情卡的 smoke）。
- `git diff --check`：退出码 0；仅 Git 对既有 CRLF/LF 文件给出提示。

代码审查（2026-10-27，code-review skill，Spec/Standards 双轴，范围 `7d8cf54...HEAD`）：

- Spec 轴：7 项验收与 core/React/Vue 职责行均有实现与测试，无缺失功能或范围蔓延；Vue i18n 仅为跨 adapter 字典 parity，delete-nodes 清理与 query 校验属于规格引用边界。
- Standards 轴：未发现硬性规范违规；判断性建议保留现状（binding 过滤的小重复、validation 层对未知输入的 cast、内部 React 组件不新增 package-root 导出）。
- 审查后修复：非数字详情字段拒绝 precision 并补充公开测试；移除 `DataQueryEditor` 冗余 message-key alias 并更新精度错误文案。实现期间同时修复连接配置变化后候选仍显示为当前结果、候选映射错误未本地化两个缺口。

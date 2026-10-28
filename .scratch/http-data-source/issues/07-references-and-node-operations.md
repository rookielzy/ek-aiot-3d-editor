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

- [x] 有对象引用时不能删除查询，有查询时不能删除连接；拒绝操作不改变 Snapshot/history。
- [x] 属性键/类型、已使用参数删除/类型变化不能破坏引用；兼容改名/单位/转换保存后重新校验。
- [x] 删除对象或含对象子树同时移除绑定，undo 一次恢复；rename/reparent/group/reimport 保留 NodeId 时绑定不误迁移。
- [x] duplicate/同 editor paste 新节点复制配置，仍指向原设备，响应/凭证/请求对象不复制。
- [x] 跨 editor clipboard 携带必要纯配置；相同 ID 且定义相同可复用，冲突生成新 ID/名称并重写完整依赖，不覆盖目标配置。
- [x] 旧 object-only 与节点 clipboard 继续可读；没有凭证的目标 host 保留待连接配置，不伪造成功状态。
- [x] 既有节点层级、材质和资产操作的原子性及旧 proof loop 保持通过。

## Testing

通过公开编辑操作验证嵌套删除/撤销、duplicate、同/跨 editor copy/paste 和引用冲突；React 引用定位/删除保护 DOM；旧 clipboard 与 GLB reimport 相关回归。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现批量对象绑定表单或跨场景连接库；不把此任务扩大为 clipboard 全面重构。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-28：实现、验证与代码审查完成。

- core 新增 `buildDataQueryReferenceModel()` / `buildDataConnectionReferenceModel()`，从绑定派生对象、属性（detail/color）与参数覆盖的使用位置；删除查询/连接的既有阻止逻辑保持不变，`buildSaveDataQueryCommand()` 继续以 `binding-property-in-use` / `binding-parameter-in-use` 拒绝删除或改型，并允许 label/unit/transform 等兼容编辑。
- 新增 clipboard durable fragment `dataSources`：object payload 升为 v2、node payload 升为 v3，仍读取 v1 object / v2 node；携带绑定和绑定引用的查询/连接纯配置（仅 `credentialRef`，不含凭证、草稿、样本、响应、测试值或 executor）。同 editor duplicate/paste 按真实 object node ID 重映射绑定；跨 editor 相同 ID+定义复用，冲突生成新 ID 与连接作用域唯一名称并重写查询连接引用，不覆盖目标查询/连接。
- 新增节点操作回归：reparent、group/ungroup、resolved/rename-only/unresolved GLB reimport 保持绑定；删除嵌套对象子树同时移除两个绑定且一次 undo 恢复。
- React 查询编辑器显示绑定对象、属性/参数使用位置与 detail/color 用途，草稿删除或改型已使用字段时提前提示并阻止保存；Bindings 对话框显示阻止原因并支持选择引用对象或解除绑定；连接列表显示 `Applied to …`；duplicate/paste 后以 transient notice 明确副本仍指向同一设备。Vue 仅同步 i18n 键，无新增数据界面。
- 同步 `public-api.ts`、`packages/core/README.md`、`docs/schema.md`、`docs/README.md` 与 `.changeset/http-data-source-references.md`。

验证：

- `pnpm exec vitest run packages/core/src/data-sources/references.test.ts packages/core/src/data-sources/clipboard.test.ts packages/core/src/data-sources/node-operations.test.ts`：3 files / 23 tests passed。
- `pnpm exec vitest run packages/react/test/workbench-data-references.test.tsx packages/react/test/workbench-i18n-parity.test.ts packages/react/test/i18n-string-audit.test.ts packages/vue/test/i18n-string-audit.test.ts packages/core/src/data-sources/references.test.ts packages/core/src/data-sources/clipboard.test.ts`：6 files / 30 tests passed。
- `pnpm --filter @ek-aiot/3d-editor-core build` + core/react/vue `typecheck`：全部通过。
- `pnpm test`：139 files / 1272 tests passed。
- `pnpm test:browser`：30 file-instance / 123 tests passed（Chromium 三个 viewport），旧 proof loop 保持通过。

代码审查（`code-review` skill，Standards/Spec 双轴，范围 HEAD → 工作区）后修复：

- Standards：补齐 changeset、core README 与 schema 的 v2 object/v3 node clipboard、`dataSources` fragment 和 credentialRef 边界说明；明确 host credential descriptors 仍只在运行态。移除冗余 `ClipboardDataSources` 公共别名，改用既有 `SceneDataSources`；删除无调用方的 `DataQueryReferenceModel.queryId` / `DataConnectionQueryReference.bindingCount` 和不可达过滤；重命名 `bindingObjectNodeIdMap` 说明键语义；查询引用模型合并为一次绑定遍历。
- Spec：补 rename-only 与 unresolved GLB reimport 的绑定回归；React 增加属性/参数改型的提前阻止原因（此前仅保存时由 core 提示）；duplicate/paste notice 通过统一 action context 覆盖自定义 toolbar、overlay 与左右面板；Bindings 对话框解除当前对象时清理表单 dirty 状态。object clipboard 版本升级是 duplicate 携带配置所必需，旧 v1/v2 payload 仍可读，未扩大为 clipboard 重构。
- 保留判断项：连接列表的绑定名称仍由 React 从 reference model 派生后展示，core workspace model 继续提供计数；duplicate 后设备提示由 React 观察 action 前后 snapshot 绑定差异产生，未新增 core command 返回字段；Vue 词典补齐 React 使用的新键以维持 parity 测试与共享词典契约。

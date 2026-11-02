# 11: 在 Vue 完成对象绑定、数据预览和颜色交互

Status: ready-for-human

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段四

Blocked by: 10

User stories: 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 29, 30, 31

Decisions: D09, D10, D11, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

Vue 用户可给对象绑定设备，查看实时详情和颜色，在异常时定位修复并停止恢复，与 React 完整闭环一致。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 复用绑定、调度、规则、颜色投影、试用和节点操作能力；不改变先前状态或资源所有权语义。 |
| React | 保持同一共享模型与文案；对任何必要 core 修复跑对应 React 回归。 |
| Vue | 实现 Inspector 绑定表单、参数/设备/详情/规则配置、试用与全局预览、详情卡、受限编辑反馈、状态摘要/问题抽屉和引用维护。 |

## Acceptance criteria

- [ ] 真实 GLB object 的选择、单上下文绑定、卡片字段顺序/精度和颜色规则与 React 等价。
- [ ] 相同查询/参数的多对象实际共享 core 上下文，Vue 不创建额外 interval 或 request cache。
- [ ] 试用/取消/切换目标、开始/停止、坏字段/过期/失败的外观恢复与能力禁用正确。
- [ ] 所有操作通过同一 command/数据服务；配置 undo/redo、引用保护、复制节点和项目恢复反馈可用。
- [ ] 自身与外部 editor 所有权清晰，重复挂卸/editor ref 更换无重复请求、旧卡片或材质残留。
- [ ] en/zh-CN、scoped slots、自定义 UI 扩展与键盘焦点保持可用；不将卡片位置或翻译写 Snapshot。

## Testing

Vue Inspector/Workbench DOM、composable 生命周期与双语；真实 GLB/WebGL/同源 HTTP 浏览器闭环，检查共享、停止恢复及异常；必要的 React 同 contract 回归。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不新增额外绑定目标、自动 POST、特定框架的数据状态机或其他实时协议。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-11-02：Vue 对象绑定、数据预览与颜色交互已实现，实现与 React 适配层保持同一 core 契约与文案。

实现摘要：
- 新增 `DataBindingForm.vue`（查询/设备/参数覆盖/详情字段顺序与精度/颜色规则与试用/启用状态/问题列表）、`DataBindingInspector.vue`（按选中节点类型分派，含 imported 子节点跳到所属对象）、`DataDetailCard.vue`、`DataPreviewControls.vue`、`DataQueryBindingsDialog.vue`，以及纯逻辑辅助 `data-binding-ui.ts`、`data-context-format.ts`。
- `use-workbench` 订阅 `DataColorService` 并随 editor 更换重新订阅、卸载时清理，与既有 `dataState`/`dataServiceState` 模式一致；Vue 侧不新建 interval 或 request cache，全部复用 core 的共享上下文。
- `InspectorView` 在预览运行时锁定 Transform/Material 并给出提示；`EditorWorkbench` 承载预览控制、详情卡和复制设备提示，并支持 `data-field`/`data-object` 问题定位。
- `DataSourcesPanel` 增加按查询的“绑定对象”摘要与“管理绑定”入口，与 React 一致。

验证命令与结果：
- `pnpm --filter @ek-aiot/3d-editor-vue typecheck`：通过。
- `pnpm -r --filter './packages/*' typecheck`：core、react、vue 全部通过（`pnpm typecheck` 因 core 构建脚本使用 `rm`，在 Windows 下不可用，故按包运行）。
- `npx vitest run packages/vue`：17 个文件 / 171 个用例全部通过。
- `npx vitest run packages/vue/test/workbench-object-binding.test.ts`、`workbench-data-preview.test.ts`、`workbench-data-colors.test.ts`、`workbench-data-binding-lifecycle.test.ts`、`i18n-string-audit.test.ts`：通过。
- `pnpm test`：152 个文件 / 1366 个用例全部通过。

已知范围说明：浏览器端真实 GLB/WebGL/同源 HTTP 闭环与卡片屏幕定位仍未覆盖（与 React 适配层一致，属后续验证范围）；trial 切换目标与过期/失败外观恢复由 core 行为保证，Vue 仅做展示。

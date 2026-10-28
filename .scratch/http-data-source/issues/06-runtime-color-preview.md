# 06: 把有效数据投影为对象颜色并可靠恢复

Status: ready-for-agent

Parent: [HTTP 数据源管理首期实现规格](../spec.md)

Phase: 阶段二

Blocked by: 05

User stories: 15, 16, 17, 20, 31

Decisions: D09, D10, D12, D13

当前只授权规格与任务整理；本任务尚未启动。实施时必须先完成 Blocked by 中的任务。

## What to build

在真实 GLB 对象上按有序规则显示状态颜色，可单对象试用草稿；停止、无效和过期时恢复最新 authored 材质。

## Responsibilities

| 范围 | 本任务职责 |
| --- | --- |
| core | 实现规则求值、材质 capability、projection-owned 颜色覆盖、恢复/释放与异步重投影；提供试用事务、预览编辑能力限制及受限命令错误。 |
| React | 实现属性/规则顺序/色板/默认回退表单、试用/结束试用和预览工具能力；不直接读写 Three.js 对象或材质。 |
| Vue | 不新增界面；材质及试用语义只由 core 提供，后续 Vue 不能复制投影资源逻辑。 |

## Acceptance criteria

- [ ] boolean/string/number 规则按首条命中生效，默认恢复 authored 颜色；支持对象内材质的能力诊断。
- [ ] 两个对象共享 GLB/材质资产时，仅目标对象变色；纹理、透明度、已有材质槽作者配置和非目标对象保持正确。
- [ ] 选择、普通场景重新投影及模型晚加载不丢已生效覆盖；重新导入或替换不会保留旧材质引用。
- [ ] 错误、空值、bad/uncertain、过期、停用、解除与停止均恢复最新 authored 基线，unknown 质量不自动当失败。
- [ ] 草稿试用仅在全局预览关闭时作用当前对象；取消/关闭/换目标结束，无轮询、保存或 history。
- [ ] 预览中保留选择/镜头/数据编辑，变换/基础材质等受限编辑在 UI 禁用且 core 拒绝绕过；undo/redo/restore 先停预览。
- [ ] 释放覆盖资源不误 dispose loader/纹理共享资源；真实 viewport 有可观察更新。

## Testing

沿用 runtime 材质/scene projector 集成边界，加真实 GLB/WebGL 的共享材质隔离、重投影、停止/异常恢复和试用取消；React 规则表单与能力提示 DOM。只验证稳定状态与资源所有权，不做脆弱像素基准。

只断言公开行为、用户可见结果与外部副作用；每项失败先定位与当前切片的关系，不在 adapter 重复 core 算法测试。验证完成后把实际命令和结果写入 Comments。

## Context and boundaries

先完整阅读 Parent。本任务以 core 公共契约与原型流程为依据，原型代码不直接进入正式包。始终区分 durable 配置与运行态，遵守 NodeId、command/history 和框架薄适配层边界。

不实现 imported node/材质槽数据绑定、其他材质属性、动画、变换或可见性绑定。

## Comments

2026-10-26：按用户认可的原型流程整理为正式规划任务。Status 表示定义就绪，不代表实现、验证或用户已授权开始执行。

2026-10-28：实现完成。core 新增 durable `color` 规则校验/迁移、`evaluateDataColorRules()`、`CoreDataColorService` 与投影拥有的 `DataColorProjector`；React 增加有序规则/色板/能力提示/草稿试用/预览编辑锁定；Vue 仅补齐 i18n 键，无新增界面。实现与审查修复后验证：

- `pnpm test`：135 files / 1236 tests passed（含新增 color-rules 4、projector 7、color-preview 13、React color form 3）。
- `pnpm test:browser`：30 file-instance / 123 tests passed（Chromium 三个 viewport）。新增真实 GLB/WebGL 用例在同一 GLB 材质实例上验证：仅绑定对象变色、另一对象与共享 authored 材质不变、重投影保留颜色、停止恢复原材质、试用结束恢复。
- 根目录 `pnpm --config.script-shell="C:/Program Files/Git/bin/bash.exe" build` 与同参数 `typecheck`：core、React、Vue 全部通过。
- `git diff --check`：通过，仅 Git 对既有 CRLF/LF 文件给出提示。

代码审查（`code-review` skill，Standards/Spec 双轴，范围 HEAD → 工作区）后修复：

- 补齐 `.changeset/runtime-data-colors.md`（core/react minor、vue patch）、React/Vue 集成文档和预览锁定说明。
- core 在试用目标节点被删除时结束试用；`import-glb` command 在全局预览中先停止预览再继续，消除与 import API 的语义分叉；修正 core README 对 target change 的过度表述（React 表单负责换目标结束）。
- React 规则表单增加可选色板 swatch（`aria-pressed` + `Use color #…` 标签）；浏览器用例改为缓存真实 GLB 并 clone 共享材质，真正验证共享材质隔离。
- 移除未使用的 `getCapabilities()`/`appliedCount` 与 `"inactive"` 状态，复用统一 `emptyDataColorCapability()`，并合并颜色未生效返回分支。
- 保留判断项：换目标结束试用仍由 React 表单生命周期负责（core 负责目标删除/配置/预览/生命周期）；能力诊断在保存 binding 或试用时显示；`createObjectState` 的显式位置参数暂不重组。

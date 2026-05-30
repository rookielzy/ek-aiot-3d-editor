# ek-aiot-3d-editor 文档

> 3D 编辑器能力栈：`@ek-aiot/3d-editor-core`（框架无关核心）+ `@ek-aiot/3d-editor-react`（React 适配层）+ `@ek-aiot/3d-editor-vue`（Vue 适配层）。

## 导航

- 项目结构：`./project-structure.md`
- 技术架构：`./architecture.md`
- Scene Snapshot Schema：`./schema.md`
- `.ek3d` 项目包与资产协议：`./project-package.md`
- 集成指南（core-only / vanilla）：`./integration-vanilla.md`
- 集成指南（React）：`./integration-react.md`
- 集成指南（Vue）：`./integration-vue.md`
- 交互与编辑能力：`./interactions.md`
- FAQ：`./faq.md`
- 维护指南：`./contributing.md`
- 设计决策：`./decisions.md`
- npm 发布流程：`./release.md`

## 快速开始（本仓库）

```bash
corepack enable
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

本地示例：

- React proof loop：`pnpm --filter @ek-aiot/react-proof-loop dev`
- Vue proof loop：`pnpm --filter @ek-aiot/vue-proof-loop dev`
- Vanilla proof loop：`pnpm --filter @ek-aiot/vanilla-proof-loop dev`

浏览器相关 runtime 测试：

```bash
pnpm test:browser
```

发布前完整校验：

```bash
pnpm release:verify
```

## 能力概览（当前实现）

- Core：版本化 JSON Scene Snapshot、命令分发、撤销/重做、订阅、序列化/恢复、runtime 挂载/销毁。
- 场景对象：通过稳定资产引用导入 GLB，保存对象 ID、层级、Transform、选择状态和 JSON metadata。
- Transform：支持 position / rotation / scale 的持久化变更；runtime 提供 transform transaction 的 start / preview / commit / cancel 结构。
- 资产：支持 `glb`、`texture`、`hdr`、`image` 四类资产引用；真实 `File`、`Blob`、URL、纹理、PMREM 输出只属于运行时。
- 材质：持久化一小部分 `MeshStandardMaterial` override 与纹理槽资产引用。
- 环境：持久化背景和环境光意图，支持 none / solid / texture / hdr 相关字段。
- 灯光：持久化 ambient、directional、hemisphere、point、spot 五类灯光定义。
- Runtime：core 内置 Three.js 投影层，将 Snapshot 投影为 scene、camera、renderer、对象、环境、灯光和问题列表。
- 问题：resolver、loader、PMREM、runtime、project package 等失败以结构化 problem 暴露，不写回为 runtime-only 状态。
- 项目包：实验性 `.ek3d` ZIP 容器，包含 `project.json`、`scene.json` 和 `assets/*` payload。
- React：`useEditor()`、`useEditorSnapshot()`、`useInspector()`、`useWorkbench()`、`EditorViewport`、`InspectorPanel`、`EditorWorkbench`。
- Vue：`useEditor()`、`useInspector()`、`useWorkbench()`、`EditorViewport`、`InspectorPanel`、`EditorWorkbench`。

## 当前工作流边界

当前 proof loop 关注的是：

1. 导入或注册 GLB 资产引用。
2. 选择对象。
3. 提交一次 Transform 变更。
4. 撤销/重做。
5. 序列化 Scene Snapshot。
6. 从 Snapshot 恢复等价 core/runtime 场景。
7. 在需要携带二进制资产时导出/导入 `.ek3d` 项目包。

## 关键约束（必读）

- Durable editor state 只存在于版本化 Scene Snapshot 中。
- 禁止把 Three.js 对象、`File`、`Blob`、object URL、已加载 texture、PMREM render target、resolver 结果、framework component state 写入 Snapshot。
- Core 是编辑行为来源；Vue/React 只负责生命周期、渲染和宿主集成。
- 持久化编辑必须通过 command：`import-glb`、`register-asset`、`select-object`、`set-transform`、`set-material`、`set-environment`、`add-light`、`update-light`、`remove-light`。
- Snapshot 是 JSON-compatible 记录；二进制资产通过 `.ek3d` 项目包 payload 或宿主 resolver 管理。
- runtime problem 是派生状态；除非未来新增显式恢复命令，否则不要把 resolver/loader 失败结果写回 Snapshot。
- `@ek-aiot/3d-editor-core` 是 ESM only，并直接依赖 Three.js。
- React/Vue 包是薄适配层，框架库为 peer dependency；不要在 core 中引入 React/Vue。
- 公开 API 仍处于实验性 `0.x` 阶段，不承诺 1.0 稳定性。

## 当前非目标

层级面板、多选、复制/粘贴/删除、吸附、完整 gizmo UI、持久化布局、schema-driven inspector 插件、材质纹理实际投影到 GLB 子网格、阴影、辅助器、云端资产库、模型市场、数据绑定、事件编排、运行态发布、Agent 集成和稳定非 `0.x` API 都是后续工作。

## 需求与规划来源

- 初始需求：`./brainstorms/2026-05-28-core-editor-contract-requirements.md`
- MVP 方向：`./ideation/2026-05-28-threejs-3d-editor-mvp-ideation.md`
- 计划文档：`./plans/`

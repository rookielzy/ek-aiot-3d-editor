# 项目结构

本仓库是 pnpm workspace，用于维护三个可发布 npm 包和三个 proof-loop 示例。当前实现重点是建立一个 snapshot-first 的 3D 编辑器核心契约，而不是完整低代码平台。

## 顶层目录

```text
.
├── packages/
│   ├── core/       # 框架无关核心、Scene Snapshot、commands、runtime、project package
│   ├── react/      # React hook、viewport、inspector、workbench
│   └── vue/        # Vue composable、viewport、inspector、workbench
├── examples/
│   ├── vanilla-proof-loop/
│   ├── react-proof-loop/
│   └── vue-proof-loop/
├── docs/
│   ├── README.md
│   ├── release.md
│   ├── plans/
│   ├── brainstorms/
│   └── ideation/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
└── vitest.browser.config.ts
```

## packages/core

`@ek-aiot/3d-editor-core` 是唯一拥有编辑语义和 Three.js runtime 投影的包。

```text
packages/core/src/
├── assets/       # 资产引用、注册、resolver bridge、资产问题
├── commands/     # command 类型和 reducer-style command 实现
├── editor/       # createEditor、store、subscription、serialization、lifecycle
├── environment/  # 背景/环境光 schema、默认值和校验
├── history/      # undo/redo history
├── inspector/    # 框架无关 inspector model 和 command builder
├── lights/       # light schema、默认值和校验
├── materials/    # material override schema、默认值和校验
├── problems/     # 结构化 problem contract
├── project/      # .ek3d project package import/export/replace asset
├── runtime/      # Three.js runtime、projection、loader、picking、transform transaction
└── snapshot/     # Scene Snapshot 类型、默认值、migration、validation
```

核心原则：

- `snapshot/`、`commands/`、`history/`、`editor/` 是 durable contract 的主体。
- `runtime/` 可以使用 Three.js，但不能把 Three.js runtime object 写回 Snapshot。
- `inspector/` 输出纯 JSON-compatible model，供 React/Vue 渲染。
- `project/` 处理 `.ek3d` ZIP 容器和 transient payload store。

## packages/react

`@ek-aiot/3d-editor-react` 是 React 薄适配层。

```text
packages/react/src/
├── components/
│   ├── EditorViewport.tsx
│   ├── EditorWorkbench.tsx
│   ├── InspectorPanel.tsx
│   ├── TransformInspector.tsx
│   ├── MaterialInspector.tsx
│   ├── EnvironmentInspector.tsx
│   ├── LightInspector.tsx
│   └── ProblemsPanel.tsx
├── hooks/
│   ├── use-editor.ts
│   ├── use-inspector.ts
│   └── use-workbench.ts
└── index.ts
```

React 层负责：

- 通过 hook 创建或复用 core editor。
- 用 React external-store 语义订阅 Snapshot。
- 在 `EditorViewport` 中 mount/dispose core runtime。
- 渲染 core inspector model，并在 commit 边界 dispatch core command。
- 通过 render props 暴露 toolbar、sidePanel、viewportOverlay、status 扩展区域。

React 层不负责：

- 自己实现命令、history、asset resolver、project package validator 或 runtime cleanup。
- 把 `File`、`Blob`、Three.js 对象写入 Snapshot。

## packages/vue

`@ek-aiot/3d-editor-vue` 是 Vue 薄适配层。

```text
packages/vue/src/
├── components/
│   ├── EditorViewport.vue
│   ├── EditorWorkbench.vue
│   ├── InspectorPanel.vue
│   ├── TransformInspector.vue
│   ├── MaterialInspector.vue
│   ├── EnvironmentInspector.vue
│   ├── LightInspector.vue
│   └── ProblemsPanel.vue
├── composables/
│   ├── use-editor.ts
│   ├── use-inspector.ts
│   └── use-workbench.ts
└── index.ts
```

Vue 层负责：

- 用 `shallowRef` / `markRaw` 保持 editor/runtime 不进入深层响应式。
- 在组件生命周期中 mount/dispose core runtime。
- 渲染 core inspector model。
- 通过 scoped slots 暴露 toolbar、sidePanel、viewportOverlay、status 扩展区域。

## examples

- `examples/vanilla-proof-loop`：直接使用 core API 验证无框架 proof loop。
- `examples/react-proof-loop`：使用 React `EditorWorkbench` 验证 shell 集成。
- `examples/vue-proof-loop`：使用 Vue `EditorWorkbench` 验证 shell 集成。

示例不是发布包；它们用于本地验证 public package contract。

## 测试组织

- core 行为测试通常靠近实现文件，使用 `*.test.ts`。
- React/Vue 适配层测试在各自 `test/` 目录。
- browser-specific runtime 测试使用 `*.browser.test.ts` 或 `*.browser.test.tsx`，由 `pnpm test:browser` 运行。
- proof loop 集成测试覆盖导入、选择、transform、undo/redo、serialize/restore、shell lifecycle。

# 集成指南：Vue

`@ek-aiot/3d-editor-vue` 是 `@ek-aiot/3d-editor-core` 的 Vue 适配层。默认路径是安装包、导入 CSS、渲染 `EditorWorkbench`，它会直接给出完整 editor shell：顶部工具栏、左侧 hierarchy/assets/project 面板、中心 3D viewport、右侧 inspector/problems 面板和底部状态栏。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core @ek-aiot/3d-editor-vue three vue
```

Vue 是 peer dependency。

## 样式

包产物包含 `dist/index.css`，package manifest 的 `style` 字段会指向该文件。推荐从公开 CSS 子路径显式导入样式：

```ts
import "@ek-aiot/3d-editor-vue/styles.css";
```

## Workbench 用法

```vue
<template>
  <EditorWorkbench :editor="editor" :resolver="resolver" />
</template>

<script setup lang="ts">
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-vue";
import "@ek-aiot/3d-editor-vue/styles.css";

const { editor } = useEditor();
const resolver = new AssetResolverBridge((asset) =>
  asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null
);

if (!editor.getSnapshot().objects.box) {
  editor.dispatch({
    type: "import-glb",
    objectId: "box",
    asset: { id: "simple-box", kind: "glb", label: "Simple box" }
  });
  editor.dispatch({ type: "select-object", objectId: "box" });
}
</script>
```

不传 `toolbar`、`leftPanel`、`rightPanel` 或 `status` slot 时，Workbench 会使用 package-owned 默认 UI。默认 toolbar 已包含 open/export、undo/redo、transform mode、snap、camera、copy/paste/duplicate/delete/group/ungroup/select controls；默认左栏会显示 hierarchy、assets、project summary、project/runtime problems 和缺失资产恢复入口。

## Primitive 组件

如果不使用 `EditorWorkbench`，可以直接组合：

```vue
<template>
  <EditorViewport :editor="editor" />
  <InspectorPanel :editor="editor" :snapshot="snapshot" />
</template>

<script setup lang="ts">
import { EditorViewport, InspectorPanel, useEditor } from "@ek-aiot/3d-editor-vue";

const { editor, snapshot } = useEditor();
</script>
```

## Workbench slots

Vue workbench 支持 scoped slots：

- `toolbar`
- `leftPanel`
- `sidePanel`（兼容旧名称，推荐新代码使用 `leftPanel`）
- `viewportOverlay`
- `rightPanel`
- `status`

每个 slot 接收同一个上下文：

```ts
interface WorkbenchContext {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  runtimeProblems: Problem[];
  runtime: EditorRuntime | null;
  runtimeReady: boolean;
  activeLightId: string | null;
  activeLightNodeId: string | null;
  operations: AdvancedEditorOperations;
  historyState: HistoryState;
  selectionCount: number;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedNodeKind: InspectorModel["selection"]["nodeKind"];
  selectedObjectId: string | null;
  selectedObjectIds: string[];
  selectedLightId: string | null;
  snap: SnapSettings;
  transformMode: TransformMode;
  setActiveLightId(value: string | null): void;
  setTransformMode(mode: TransformMode): void;
  toggleSnap(channel: SnapChannel, increment?: number): SnapSettings;
  runAction(action: EditorAction): EditorActionResult;
  resetCamera(): void;
  frameSelected(options?: RuntimeCameraFrameOptions): boolean;
  frameAll(options?: RuntimeCameraFrameOptions): boolean;
  refreshProblems(): void;
  dispatch(command: Command): CommandResult;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}
```

资产面板应优先读取 `workbench.model.assets.workspace`。该 workspace 已经合并 Snapshot asset registry、对象/材质/环境引用位置、项目包 payload 摘要和资产问题，并提供 core 统一的搜索/过滤/排序 helper。`replaceAsset()` 这类 payload-only 更新不会改变 Snapshot，但 Vue composable 会订阅 core asset workspace 版本并重新计算 model；宿主不需要也不应该读取 transient project store、`Blob` 或 object URL。

## 本地 proof-loop demo

本仓库的 Vue demo 可通过以下命令启动：

```bash
pnpm --filter @ek-aiot/vue-proof-loop dev
```

示例首屏就是可操作 workbench，不是 landing page。示例代码只保留真实宿主通常需要拥有的部分：创建 editor、初始化 starter snapshot、配置 resolver/loader、选择可选 renderer factory，以及一个很薄的 viewport overlay。toolbar、hierarchy、assets、project status、missing-asset recovery、inspector 和 status 都来自 `@ek-aiot/3d-editor-vue` 默认 Workbench。

默认 UI 可以完成 starter flow：选择 hierarchy row、编辑 Transform/Material inspector、切换 snap/transform、undo/redo、duplicate、export partial package、通过 Open 重新载入 `.ek3d`、以及从左栏恢复缺失资产。缺失资产恢复使用同一个稳定 asset ID 调用 `replaceAsset()`，替换 payload 后 runtime 重新投影并清除派生 runtime problem。

浏览器证据通过仓库根目录命令运行：

```bash
pnpm test:browser
```

该命令使用 headless Chromium 验证 Vue starter 的默认 workbench 区域、selection、transform/history、material inspector smoke、project export/open、missing-asset recovery、problem status 和 canvas 非空渲染状态，并和 React starter 保持同等行为。它不是端到端托管发布测试，也不承诺完整资产库、外部 paste、数据绑定或事件编排能力。

## 响应式边界

Vue 适配层会把 editor/runtime 保持在浅层响应式或 raw 对象中。宿主应用也应遵循：

- 不要把 core editor 深拷贝或放进深层 reactive object。
- 不要直接改 `snapshot.value` 内部字段。
- 持久化变更通过 `editor.dispatch()`。
- runtime-only 对象不进入 Vue store。

Pinia 或其他宿主 store 可以镜像可序列化的项目 metadata、当前 route、最近保存的 `SceneSnapshot` 或 `.ek3d` bytes。`Editor`、`EditorRuntime`、Three.js 对象、`File`、`Blob`、object URL、resolver 输出和 runtime problem 对象应保持 raw/shallow、client-owned，不作为 durable store state。需要给宿主 UI 同步状态时，优先从 `useWorkbench()` 或 scoped slot context 派生 serializable projection。

## 宿主拥有 editor 生命周期

如果通过 prop 传入 editor，workbench 卸载时不会 dispose 该 editor。宿主负责：

```ts
editor.dispose();
```

如果不传 editor，workbench 会创建并在卸载时 dispose。

## 资产替换

Problems panel 对可恢复资产问题暴露文件替换入口。Vue 层会调用：

```ts
await workbench.replaceAsset({
  assetId,
  source: file,
  label: file.name,
  mimeType: file.type
});
```

文件不会进入 Snapshot，只会作为 transient payload 被 core 使用。

# 集成指南：Vue

`@ek-aiot/3d-editor-vue` 是 `@ek-aiot/3d-editor-core` 的 Vue 薄适配层，提供 composables、viewport、inspector 和 workbench shell。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core @ek-aiot/3d-editor-vue three vue
```

Vue 是 peer dependency。

## 样式

包产物包含 `dist/index.css`，package manifest 的 `style` 字段会指向该文件。当前 `exports` 只暴露包根入口，未暴露 CSS 子路径；宿主应用需要让构建系统读取 package `style` 字段，或在后续包配置中显式增加 CSS export 后再手动导入样式。

## Workbench 用法

```vue
<template>
  <EditorWorkbench :editor="editor" :resolver="resolver">
    <template #toolbar="{ dispatch }">
      <button
        type="button"
        @click="dispatch({ type: 'set-transform', objectId: 'box', transform: { position: [1, 0, 0] } })"
      >
        Move
      </button>
    </template>

    <template #status="{ snapshot, runtimeProblems }">
      <span>Snapshot v{{ snapshot.version }} · {{ runtimeProblems.length }} runtime problems</span>
    </template>
  </EditorWorkbench>
</template>

<script setup lang="ts">
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-vue";

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
- `sidePanel`
- `viewportOverlay`
- `status`

每个 slot 接收同一个上下文：

```ts
interface WorkbenchContext {
  editor: Editor;
  snapshot: SceneSnapshot;
  inspector: InspectorModel;
  runtimeProblems: Problem[];
  activeLightId: string | null;
  setActiveLightId(value: string | null): void;
  refreshProblems(): void;
  dispatch(command: Command): CommandResult;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}
```

## 响应式边界

Vue 适配层会把 editor/runtime 保持在浅层响应式或 raw 对象中。宿主应用也应遵循：

- 不要把 core editor 深拷贝或放进深层 reactive object。
- 不要直接改 `snapshot.value` 内部字段。
- 持久化变更通过 `editor.dispatch()`。
- runtime-only 对象不进入 Vue store。

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

# 集成指南：React

`@ek-aiot/3d-editor-react` 是 `@ek-aiot/3d-editor-core` 的薄适配层，提供 hooks、viewport、inspector 和 workbench shell。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core @ek-aiot/3d-editor-react three react react-dom
```

React 和 React DOM 是 peer dependencies。

## 样式

包产物包含 `dist/index.css`，package manifest 的 `style` 字段会指向该文件。推荐从公开 CSS 子路径显式导入样式：

```ts
import "@ek-aiot/3d-editor-react/styles.css";
```

## Workbench 用法

```tsx
import { useMemo } from "react";
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-react";
import "@ek-aiot/3d-editor-react/styles.css";

export function EditorPage() {
  const editor = useEditor();
  const resolver = useMemo(
    () =>
      new AssetResolverBridge((asset) =>
        asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null
      ),
    []
  );

  return (
    <EditorWorkbench
      editor={editor}
      resolver={resolver}
      toolbar={({ dispatch }) => (
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: "set-node-transform",
              nodeId: "box",
              transform: { position: [1, 0, 0] }
            })
          }
        >
          Move
        </button>
      )}
      status={({ snapshot, runtimeProblems }) => (
        <span>
          Snapshot v{snapshot.version} · {runtimeProblems.length} runtime problems
        </span>
      )}
    />
  );
}
```

## 初始化场景

```tsx
import { useEffect } from "react";

useEffect(() => {
  if (editor.getSnapshot().objects.box) {
    return;
  }

  editor.dispatch({
    type: "import-glb",
    objectId: "box",
    asset: { id: "simple-box", kind: "glb", label: "Simple box" }
  });
  editor.dispatch({ type: "select-object", objectId: "box" });
}, [editor]);
```

React StrictMode 下 effect 可能在开发环境重复执行，因此初始化逻辑应检查对象是否已经存在。

## Primitive 组件

如果不使用 `EditorWorkbench`，可以直接组合：

```tsx
import { EditorViewport, InspectorPanel, useEditor } from "@ek-aiot/3d-editor-react";

function CustomEditor() {
  const editor = useEditor();

  return (
    <>
      <EditorViewport editor={editor} />
      <InspectorPanel editor={editor} />
    </>
  );
}
```

## Workbench 扩展区域

React workbench 支持 render prop：

- `toolbar`
- `sidePanel`
- `viewportOverlay`
- `status`

每个 render prop 接收同一个 `WorkbenchContext`：

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

## 本地 proof-loop demo

本仓库的 React demo 可通过以下命令启动：

```bash
pnpm --filter @ek-aiot/react-proof-loop dev
```

示例首屏就是可操作 workbench，不是 landing page。侧栏从 `SceneSnapshot.rootNodeIds` / `nodes` 派生 object/group/light 层级、资产列表和 proof checklist；toolbar 通过 `runAction()`、camera helpers 和 core operations 触发 transform mode、snap、undo/redo、copy/paste/duplicate/delete/group/ungroup、export/reopen 等验证动作。Inspector 可编辑 selected node transform、object-only material、environment 和 selected light 字段，其中 material override 会通过 runtime 投影到支持的 `MeshStandardMaterial` 对象。

Demo checklist 只用于本地验证。它不会写入 snapshot、`.ek3d` 项目包或 React state 之外的 durable editor 数据。缺失资产恢复按钮使用同一个稳定 asset ID 调用 `replaceAsset()`，替换 payload 后 runtime 重新投影并清除派生 runtime problem。

浏览器证据通过仓库根目录命令运行：

```bash
pnpm test:browser
```

该命令使用 headless Chromium 验证 React demo 的 hierarchy、selection、camera helper、transform/history、material inspector smoke、project export/reopen、missing-asset recovery、problem badge 和 canvas 非空渲染状态。它不是端到端托管发布测试，也不承诺完整资产库、外部 paste、数据绑定或事件编排能力。

## 宿主拥有 editor 生命周期

如果传入 `editor` prop，workbench 卸载时不会 dispose 宿主 editor。宿主需要在合适时机调用：

```ts
editor.dispose();
```

如果不传入 `editor`，workbench 会创建并在自身卸载时 dispose。

## 资产替换

Problems panel 对可恢复资产问题暴露文件替换入口。React 层会调用：

```ts
workbench.replaceAsset({
  assetId,
  source: file,
  label: file.name,
  mimeType: file.type
});
```

文件不会进入 Snapshot，只会作为 transient payload 被 core 使用。

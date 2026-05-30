# 集成指南：React

`@ek-aiot/3d-editor-react` 是 `@ek-aiot/3d-editor-core` 的薄适配层，提供 hooks、viewport、inspector 和 workbench shell。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core @ek-aiot/3d-editor-react three react react-dom
```

React 和 React DOM 是 peer dependencies。

## 样式

包产物包含 `dist/index.css`，package manifest 的 `style` 字段会指向该文件。当前 `exports` 只暴露包根入口，未暴露 CSS 子路径；宿主应用需要让构建系统读取 package `style` 字段，或在后续包配置中显式增加 CSS export 后再手动导入样式。

## Workbench 用法

```tsx
import { useMemo } from "react";
import { AssetResolverBridge } from "@ek-aiot/3d-editor-core";
import { EditorWorkbench, useEditor } from "@ek-aiot/3d-editor-react";

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
              type: "set-transform",
              objectId: "box",
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
  activeLightId: string | null;
  setActiveLightId(value: string | null): void;
  refreshProblems(): void;
  dispatch(command: Command): CommandResult;
  importProject(packageBytes: Uint8Array, options?: ProjectImportOptions): ProjectImportResult;
  exportProject(options?: ProjectExportOptions): ProjectExportResult;
  replaceAsset(input: ReplaceAssetInput): Promise<ReplaceAssetResult>;
}
```

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

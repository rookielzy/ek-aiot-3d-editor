# 集成指南：Core-only / Vanilla

`@ek-aiot/3d-editor-core` 可以不依赖 Vue 或 React 单独使用。Host 负责准备 DOM container、资产解析、保存/恢复入口和 UI。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core three
```

当前包是 ESM only。

## 最小用法

```ts
import { AssetResolverBridge, createEditor } from "@ek-aiot/3d-editor-core";

const editor = createEditor();

const runtime = editor.mountRuntime({
  container: document.querySelector("#viewport")!,
  resolver: new AssetResolverBridge((asset) =>
    asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null
  )
});

editor.dispatch({
  type: "import-glb",
  objectId: "box",
  asset: { id: "simple-box", kind: "glb", label: "Simple box" }
});

runtime.pickObject("box");

editor.dispatch({
  type: "set-node-transform",
  nodeId: "box",
  transform: { position: [1, 0, 0] }
});

const saved = editor.serialize();
const restored = createEditor({ snapshot: saved });

runtime.dispose();
editor.dispose();
restored.dispose();
```

## 订阅 Snapshot

```ts
const unsubscribe = editor.subscribe((snapshot) => {
  console.log(snapshot.selection.nodeId);
});

unsubscribe();
```

订阅回调接收最新 `SceneSnapshot`。当前 durable selection 使用 `selection.nodeId/nodeIds`；`selection.objectId/objectIds` 是 object-only 兼容镜像。不要在回调中直接修改 Snapshot；需要变更时调用 `editor.dispatch()`。

## 撤销/重做

```ts
editor.undo();
editor.redo();

const history = editor.getHistoryState();
console.log(history.canUndo, history.canRedo);
```

## Runtime problem

```ts
const runtime = editor.mountRuntime({ container, resolver });

const unsubscribeProblems = runtime.subscribeProblems(({ problems }) => {
  console.log(problems);
});
```

runtime problem 是派生状态，不属于 durable Snapshot。

## 本地资产 workspace

Core-only host 可以直接构建资产 workspace：

```ts
import { buildAssetWorkspaceModel } from "@ek-aiot/3d-editor-core";

const workspace = buildAssetWorkspaceModel(editor.getSnapshot(), {
  payloads: editor.getAssetWorkspacePayloads(),
  problems: runtime.getProblems()
});
```

如果只替换 payload，Snapshot 可能不会变化。用 `editor.subscribeAssetWorkspace()` 监听 workspace 版本，并在回调中重新读取 `editor.getAssetWorkspacePayloads()`。workspace rows 是 JSON-compatible UI projection；不要把 transient project store、`File`、`Blob`、object URL 或 resolver 输出保存成 durable state。

## 自定义 loader 或 renderer

测试或宿主环境可以传入自定义 loader / renderer factory：

```ts
const runtime = editor.mountRuntime({
  container,
  resolver,
  loader: {
    async load(resolvedAsset) {
      // 返回 Three.js Object3D
    }
  },
  rendererFactory(container) {
    // 返回 RendererLike
  }
});
```

`RendererLike` 需要提供：

- `domElement`
- `setSize(width, height)`
- `render(scene, camera)`
- `dispose()`

## `.ek3d` 项目包

```ts
const exported = editor.exportProject({ partial: true });

if (exported.packageBytes instanceof Uint8Array) {
  editor.importProject(exported.packageBytes);
}
```

浏览器中如果导出结果是 `Promise<Uint8Array>`，需要 await 后再保存。

## 生命周期建议

- 一个 editor 对应一个 durable editing session。
- runtime 绑定到一个 DOM container；container 卸载前调用 `runtime.dispose()`。
- 不再使用 editor 时调用 `editor.dispose()`。
- 不要在 dispose 后继续 dispatch、subscribe 或 mount runtime。

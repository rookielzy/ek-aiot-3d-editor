# 集成指南：Core-only / Vanilla

`@ek-aiot/3d-editor-core` 可以不依赖 Vue 或 React 单独使用。Host 负责准备 DOM container、资产解析、保存/恢复入口和 UI。

## 安装

```bash
pnpm add @ek-aiot/3d-editor-core three
```

当前包是 ESM only。

## 最小用法

```ts
import { AssetResolverBridge, createEditor, ThreeGltfLoaderAdapter } from "@ek-aiot/3d-editor-core";

const editor = createEditor();
const loader = new ThreeGltfLoaderAdapter({
  decoders: {
    // Host 提供 ready decoder 实例或 factory；core 不硬编码 decoder URL。
    // draco: () => dracoLoader,
    // ktx2: () => ktx2Loader,
    // meshopt: () => MeshoptDecoder
  }
});

const runtime = editor.mountRuntime({
  container: document.querySelector("#viewport")!,
  resolver: new AssetResolverBridge((asset) =>
    asset.kind === "glb" ? { uri: `/assets/${asset.id}.glb` } : null
  ),
  loader
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

Core-only host 可以复用和 React/Vue 默认 Workbench 相同的本地导入桥：

```ts
const results = await editor.importWorkbenchAssets({
  loader,
  rasterKind: "texture",
  files: [
    { name: file.name, mimeType: file.type, source: file }
  ]
});
```

`.glb` 会走 `editor.importGlbAsset({ commit: true })`，因此 decoder-aware manifest 和 diagnostics 会进入 workspace row；`.hdr` 会注册为 HDR asset；PNG/JPG/WebP/SVG 等 raster 文件需要 host 明确传入 `rasterKind: "texture"` 或 `"image"`，避免把 authoring intent 从 MIME type 硬猜出来。每个文件独立返回成功或失败，某个文件失败不会回滚同批次已提交的资产。

`results` 是可显示的 transient operation result，不是 durable project data。不要把其中的 UI queue 状态、`File`、`Blob`、object URL、loader/parser、Three.js object 或 decoder 对象写入 Snapshot 或 `.ek3d`。

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

如果使用官方 Three.js loader surface，推荐构造 `ThreeGltfLoaderAdapter`：

```ts
const loader = new ThreeGltfLoaderAdapter({
  decoders: {
    draco: () => dracoLoader,
    ktx2: async () => ktx2Loader,
    meshopt: () => MeshoptDecoder
  },
  loaderFactory: undefined
});
```

Draco decoder path、KTX2 transcoder path、renderer-specific KTX2 `detectSupport()`、Meshopt module 初始化和 worker 限制都由 host 负责。Core 只消费 ready decoder/factory，并把缺失 decoder、未知/unsupported extension、load failure 归一化为 import/runtime diagnostics。

## GLB import analysis

`editor.importGlbAsset()` 可以在提交 durable `import-glb` 命令前异步分析本地 GLB：

```ts
const result = await editor.importGlbAsset({
  asset: {
    id: "machine",
    label: "machine.glb",
    source: file,
    kind: "glb"
  },
  loader
});

if (!result.ok) {
  console.log(result.diagnostics);
}
```

成功提交会把 JSON-compatible `glbImportManifest` 写入 asset metadata。Manifest 可以被 `buildAssetWorkspaceModel()` 投影为 `importStatus`、`importManifest` 和 `importDiagnostics`。失败不会默认注册 asset/object，因此 Snapshot 不会因为坏 GLB 被污染。

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
- 不要把 `GLTFLoader`、parser、loaded `Object3D`、`Texture`、`File`、`Blob`、object URL、resolver 输出、decoder 实例或 PMREM 输出写入 Snapshot 或 `.ek3d`。

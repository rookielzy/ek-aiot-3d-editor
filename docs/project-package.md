# `.ek3d` 项目包与资产协议

Scene Snapshot 本身不保存二进制资产。需要把 Snapshot 和可用资产 payload 一起交付时，使用实验性 `.ek3d` 项目包。

## 使用场景

使用 `editor.serialize()`：

- 只需要保存 JSON Snapshot。
- 资产由宿主系统、CDN、本地路径或数据库继续解析。
- 不希望把二进制文件打进导出结果。

使用 `editor.exportProject()`：

- 需要一个可携带的本地项目文件。
- 希望把当前可用资产 payload 一起打包。
- 需要导入后通过同一 asset ID 恢复对象、环境、材质纹理或问题替换流程。

## ZIP 结构

`.ek3d` 是 ZIP 容器：

```text
project.json
scene.json
assets/
  <asset-id-or-safe-path>
```

固定路径：

- `project.json`：项目包 manifest。
- `scene.json`：普通 `SceneSnapshot`。当前导出是 v5 node graph；导入旧 v1/v2/v3/v4 scene 会先迁移到当前 schema。
- `assets/*`：资产 payload bytes。

GLB import analysis 产生的 `glbImportManifest` 属于 `scene.json` 中 asset metadata 的 JSON-compatible authoring data。Imported GLB target node、source descriptor、slot key 和 remap metadata 也保存在 `scene.json`。它们不改变 ZIP 布局，也不在 `assets/*` 下创建额外记录。

## project.json

```ts
interface ProjectPackageManifest {
  version: 1;
  scenePath: "scene.json";
  completeness: "complete" | "partial";
  assets: Record<string, ProjectAssetManifestRecord>;
  metadata?: Record<string, JsonValue>;
}
```

资产记录：

```ts
interface ProjectAssetManifestRecord {
  id: string;
  kind: AssetKind;
  label?: string;
  mimeType?: string;
  byteSize?: number;
  checksum?: string;
  payloadPath: string;
  metadata?: Record<string, JsonValue>;
}
```

## 导出

```ts
const result = editor.exportProject({ partial: true });

if (result.packageBytes instanceof Uint8Array) {
  // 可以保存为 .ek3d
}
```

导出行为：

- 默认要求所有被引用的 payload 可用。
- 设置 `partial: true` 后，允许缺失 payload，并把 manifest 标记为 `partial`。
- 导出问题通过 `result.problems` 返回。
- 在浏览器场景中，payload 可能来自 async `Blob`，因此 `packageBytes` 可能是 `Promise<Uint8Array>`。

## 导入

```ts
const result = editor.importProject(packageBytes);

if (!result.ok) {
  console.warn(result.problems);
}
```

导入会校验：

- ZIP 结构。
- entry path 是否安全。
- manifest version 和字段。
- `scene.json` Snapshot，并通过 snapshot migration 归一化为当前 v5 node graph。
- asset record 与 payload 引用。
- size limits。

导入成功会替换 editor state，并把 payload 注册到 transient project asset store。Snapshot 仍然只保存 asset reference。

## 本地资产 workspace

Core 会从 `SceneSnapshot.assets`、对象/材质/环境中的 asset references、项目包 payload 摘要和资产问题派生本地资产 workspace。workspace row 只包含 JSON-compatible projection：asset ID、kind、label、引用位置、payload 是否可用、byte size、MIME type、checksum、metadata、问题摘要和 package readiness。

workspace 不保存也不暴露 payload bytes、`Blob`、`File`、object URL、resolver 输出、loaded texture、PMREM 或 Three.js 对象。宿主可以把 workspace rows 镜像到 UI state，但 durable storage 仍只应该保存 `editor.serialize()` 的 Snapshot 或 `editor.exportProject()` 产生的 `.ek3d` bytes。

如果 asset metadata 包含 `glbImportManifest`，workspace row 会投影 `importStatus`、`importManifest` 和 `importDiagnostics`。这些字段仍是 JSON-compatible projection；它们不得包含 `GLTFLoader`、parser、Three.js scene/material/texture、decoder 对象或 object URL。Imported GLB target 本身只引用 manifest-derived keys/path，不携带 asset payload 或 runtime object。

payload-only 变化也会更新 workspace。例如 `replaceAsset()` 成功后，稳定 asset ID 不变，Snapshot 不一定变化，但 `editor.subscribeAssetWorkspace()` 会通知消费者重新读取 `editor.getAssetWorkspacePayloads()` 并重建 Workbench/workspace model。

默认 React/Vue Workbench 的导入队列不是项目包协议的一部分。多文件导入、drag hover、当前 raster intent、importing/succeeded/failed queue rows 和 file input value 都是 UI transient state。导入成功后，只有 core command 产生的 asset reference、GLB import manifest metadata 和 project payload 摘要会通过 Snapshot/`.ek3d` 或 workspace projection 体现。

## 替换缺失资产

如果导入后某个资产 payload 缺失或 runtime resolver 失败，UI 可以让用户选择新文件，然后用原 asset ID 替换 transient payload：

```ts
await editor.replaceAsset({
  assetId: "simple-box",
  source: file,
  label: file.name,
  mimeType: file.type
});
```

替换资产不会改变对象、材质、环境字段中的稳定 asset ID。runtime 重新投影成功后，派生 runtime problem 会消失。

## 默认限制

默认导入限制：

- `maxArchiveBytes`: 100 MB
- `maxEntries`: 1000
- `maxEntryBytes`: 75 MB

可通过 `editor.importProject(packageBytes, { limits })` 覆盖部分限制。

## 资产解析顺序

Core runtime 可以从两类来源拿到资产：

- host 提供的 `AssetResolverBridge`
- project package 导入后的 transient payload store

无论来源是什么，Snapshot 中都只保留 `AssetReference`。resolver 输出、object URL、loaded texture、loaded GLB scene 不写入 Snapshot。

Decoder-aware GLB runtime 使用 host 提供的 loader adapter。Draco、KTX2、Meshopt decoder 实例和 loader factory 都是 runtime-only 配置，不写入 `.ek3d`。缺失 decoder 或 unsupported extension 会作为 import/runtime diagnostics 进入 manifest 或 runtime problem flow。

## 安全与兼容注意事项

- 不要信任外部 `.ek3d` 文件；导入前必须走 core validator。
- 不要允许 ZIP entry path 跳出项目包范围。
- 不要把 secret、tenant token、用户会话等运行时变量写入 manifest metadata。
- project manifest 当前仍是 version 1；引入 v5 imported GLB target schema 只改变 `scene.json` 的 snapshot schema，不改变 `.ek3d` 包布局。
- `.ek3d` 仍是实验性格式；在 `0.x` 阶段不保证长期兼容。

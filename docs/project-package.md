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
- `scene.json`：普通 `SceneSnapshot`。当前导出是 v9 scene schema；导入旧 v1/v2/v3/v4/v5/v6/v7/v8 scene 会先迁移到当前 schema。
- `assets/*`：资产 payload bytes。

GLB import analysis 产生的 `glbImportManifest` 属于 `scene.json` 中 asset metadata 的 JSON-compatible authoring data。Imported GLB target node、source descriptor、slot key、authored transform override 和 remap metadata 也保存在 `scene.json`。Authored camera views 保存在 `scene.json.cameras`，默认展示视角保存在 `scene.json.presentation.defaultCameraId`；light shadow authoring fields 保存在 shadow-capable light payload 中；它们不需要额外 `assets/*` payload。GLB reimport 会更新同一稳定 asset ID 的 manifest metadata，并保留 matched imported node identity；unresolved target/slot 只保存 JSON-compatible remap marker，不保存 replacement loader result。它们不改变 ZIP 布局，也不在 `assets/*` 下创建额外记录。Runtime imported target links、base transform caches、viewport grid/floor/axes/light/shadow camera helpers、selection/hover/snap guide helpers、helper visibility、hover target、snap feedback state、marquee overlay/drag rectangle/candidate IDs、editor camera navigation、OrbitControls state、controls target object、renderer shadowMap state、Three.js LightShadow/shadow maps、loader results、resolver output 和 runtime problems 不会进入 `scene.json` 或 `project.json`。

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

switch (result.outcome.kind) {
  case "package-error": // 包本身不可用，需要重新获取
  case "config-error": // 数据引用失效，可在编辑器内修复
  case "reconnect": // 配置可用，但宿主还缺凭证
  case "none":
}
```

导入会校验：

- ZIP 结构。
- entry path 是否安全。
- manifest version 和字段。
- `scene.json` Snapshot，并通过 snapshot migration 归一化为当前 v9 schema。
- asset record 与 payload 引用。
- size limits。

导入成功会替换 editor state，并把 payload 注册到 transient project asset store。Snapshot 仍然只保存 asset reference。

`result.outcome` 说明恢复后的数据配置相对当前宿主的状态：

- `package-error`：字节或 manifest 不可用（`project-archive-invalid`、`project-scene-invalid` 等），需要重新获取项目文件。
- `config-error`：scene 可解析但数据引用无法解析（绑定的查询不存在、查询的连接不存在、绑定目标不是对象节点），报为 `project-data-config-invalid`。这类问题可在编辑器内修复，不当成损坏的包。
- `reconnect`：配置合法，但其中有 `missingCredentialCount` 个连接缺少宿主凭证。场景照常打开、可编辑，预览保持关闭，宿主补齐凭证后再显式启动即可。
- `none`：配置合法且凭证齐备。

打开项目时会先结束数据试用/预览、撤掉颜色覆盖并取消在途请求；恢复后预览关闭，不会自动校验或联网，晚到的旧响应不会写入新场景。

## 本地资产 workspace

Core 会从 `SceneSnapshot.assets`、对象/材质/环境中的 asset references、项目包 payload 摘要和资产问题派生本地资产 workspace。workspace row 只包含 JSON-compatible projection：asset ID、kind、label、引用位置、payload 是否可用、byte size、MIME type、checksum、metadata、问题摘要和 package readiness。环境引用位置会区分 `environment-lighting`、`environment-background` 和 `environment-cubemap-face`，其中 cubemap face 会标出 background/lighting source 和 face role。

workspace 不保存也不暴露 payload bytes、`Blob`、`File`、object URL、resolver 输出、loaded texture、PMREM 或 Three.js 对象。宿主可以把 workspace rows 镜像到 UI state，但 durable storage 仍只应该保存 `editor.serialize()` 的 Snapshot 或 `editor.exportProject()` 产生的 `.ek3d` bytes。

如果 asset metadata 包含 `glbImportManifest`，workspace row 会投影 `importStatus`、`importManifest` 和 `importDiagnostics`。这些字段仍是 JSON-compatible projection；它们不得包含 `GLTFLoader`、parser、Three.js scene/material/texture、decoder 对象或 object URL。Imported GLB target 本身只引用 manifest-derived keys/path，不携带 asset payload 或 runtime object。

payload-only 变化也会更新 workspace。例如 `replaceAsset()` 成功后，稳定 asset ID 不变，Snapshot 不一定变化，但 `editor.subscribeAssetWorkspace()` 会通知消费者重新读取 `editor.getAssetWorkspacePayloads()` 并重建 Workbench/workspace model。

`reimportGlbAsset()` 也使用同一稳定 asset ID 替换 payload，但它不是 payload-only 操作。提交成功时，core 会把 replacement `glbImportManifest` 和 imported target remap 结果写回 `scene.json`：matched target 保留 node ID，new target 新增 node，unresolved target/slot 作为 durable authoring state 保留并由 workspace/runtime problem projection 提示用户处理。

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

替换资产不会改变对象、材质、环境 source 或 cubemap face 中的稳定 asset ID。runtime 重新投影成功后，派生 runtime problem 会消失。

Registered GLB row 的 reimport 应使用 `editor.reimportGlbAsset()`，而不是先调用 `replaceAsset()` 再手写 Snapshot。这样 replacement manifest、target remap、material-slot assignment rewrite、rollback 和 asset workspace 通知都由 core 在同一生命周期内处理。

Material-slot assignment 会像 object-level material assignment 一样保存在 `scene.json` 中：durable 数据只有 assignment ID、`{ kind: "material-slot"; objectId; slotId }` target、`MeshStandardMaterialOverride` 子集和 texture/image asset references。`.ek3d` 不保存默认 inspector 的 active target、字段 draft、controlled warning、Three.js `Material` clone、loaded `Texture`、resolver URI、object URL、slot lookup result、runtime target link 或 `imported-material-slot-*` runtime problem。若 GLB reimport 后 slot 无法匹配，assignment 仍保留在 `scene.json`，由 runtime/workbench problem 提示用户处理。

Authored camera view 会像材质和灯光一样随 `scene.json` 往返：durable 数据只有 ID、名称、perspective FOV、position、target、near/far 和 JSON-compatible metadata。`.ek3d` 不保存编辑器当前 orbit/pan/zoom、reset/frame helper 结果、Three.js `PerspectiveCamera`、`OrbitControls`、controls target object、camera helper gizmo、renderer state 或 viewer resolver result。导入后可以用 `resolveDefaultPresentationView()` 读取默认 view，并由 runtime helper apply 到当前 transient editor camera。

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
- project manifest 当前仍是 version 1；引入 v5 imported GLB target schema、v6 authored camera views、v7 source-based environment、v8 light shadow authoring 和 v9 data source connections 只改变 `scene.json` 的 snapshot schema，不改变 `.ek3d` 包布局。
- `.ek3d` 仍是实验性格式；在 `0.x` 阶段不保证长期兼容。

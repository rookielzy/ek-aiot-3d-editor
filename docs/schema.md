# Scene Snapshot Schema

Scene Snapshot 是本项目的 durable editor state。它必须是 JSON-compatible，可序列化、可校验、可迁移，并能在无 Vue/React 的情况下恢复。

当前版本：

- `SceneSnapshot.version = 9`
- `V8SceneSnapshot.version = 8`
- `V7SceneSnapshot.version = 7`
- `V6SceneSnapshot.version = 6`
- `V5SceneSnapshot.version = 5`
- `V4SceneSnapshot.version = 4`
- `V3SceneSnapshot.version = 3`
- `PreviousSceneSnapshot.version = 2`
- `LegacySceneSnapshot.version = 1`

Version 1/2/3/4/5/6/7/8 snapshot 会通过 migration 规范化为当前 schema。v4 scene node graph 会原样升级到 v5，再补齐 v6 presentation state，v6 environment `mode`/`background.mode` 会迁移为 v7 source-based environment，v7 shadow-capable lights 会补齐 disabled shadow defaults 并升级为 v8，v8 会补齐空 `dataSources` 并升级为 v9；migration 不会根据已有 GLB object metadata 自动生成 imported targets，也不会根据 transient runtime camera 自动生成 authored camera view，也不会自动开启 shadows 或合成连接/查询/绑定。

## 顶层结构

```ts
interface SceneSnapshot {
  version: 9;
  scene: {
    id: string;
    name: string;
  };
  nodes: Record<NodeId, SceneNode>;
  rootNodeIds: NodeId[];
  objects: Record<string, SceneObject>;
  rootObjectIds: string[];
  selection: {
    nodeId: NodeId | null;
    nodeIds: NodeId[];
    objectId: string | null;
    objectIds: string[];
  };
  assets: Record<string, AssetReference>;
  materials: MaterialState;
  environment: SceneEnvironment;
  lights: Record<string, LightDefinition>;
  cameras: Record<string, AuthoredCameraView>;
  presentation: ScenePresentationState;
  problems: AuthoredProblemState;
  dataSources: SceneDataSources;
  metadata?: Record<string, JsonValue>;
}
```

`nodes` / `rootNodeIds` 是 current canonical hierarchy 和 target layer。`objects`、`lights` 仍保存 payload；`rootObjectIds` 与 `selection.objectId/objectIds` 是当前兼容镜像，供旧 object-only API 使用，新的 durable target 应使用 `NodeId`。`presentation` 保存用户显式 author 的展示入口，例如命名 camera view 和默认展示视角；普通 OrbitControls 导航不写入这里。

## JSON-compatible 约束

Snapshot 内只允许 JSON-compatible 数据：

- string
- number
- boolean
- null
- array
- plain object

禁止写入：

- Three.js `Object3D`、`Texture`、`Material`、`WebGLRenderer`、`WebGLRenderTarget`
- `File`
- `Blob`
- object URL
- Promise
- function
- class instance
- DOM node
- React/Vue component state
- resolver 返回值
- loader 结果
- PMREM 输出

## Authored cameras and presentation

v6 新增顶层 `cameras` map 和 `presentation.defaultCameraId`：

```ts
interface SceneSnapshot {
  cameras: Record<string, AuthoredCameraView>;
  presentation: ScenePresentationState;
}

interface ScenePresentationState {
  defaultCameraId: string | null;
}

interface AuthoredCameraView {
  id: string;
  name: string;
  projection: {
    kind: "perspective";
    fov: number;
  };
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
  metadata?: Record<string, JsonValue>;
}
```

Camera view 是 durable camera payload，并通过 `SceneCameraNode` 进入 hierarchy；它不是 Three.js camera instance。当前可编辑投影类型是 perspective；`projection.kind` 是 discriminated field，方便后续增加 orthographic。

Validation 规则：

- `cameras` 是以 camera view ID 为 key 的 plain object map。
- 每个 view 的 `id` 必须和 map key 一致。
- 每个 camera payload 必须有且只有一个 matching `SceneCameraNode`。
- `SceneCameraNode` 必须是 root leaf node；它不能有 parent，也不能作为组织容器包含 child nodes。
- `SceneCameraNode.name`、`transform.position` 和 `metadata` 必须 mirror 对应 camera payload，避免 hierarchy/runtime 和 default resolver 读到不同 pose。
- `position` 和 `target` 必须是 3 个 finite number。
- `projection.kind` 当前必须是 `"perspective"`。
- `projection.fov` 必须大于 0 且小于 180。
- `near` 必须大于 0；`far` 必须大于 `near`。
- `metadata` 必须 JSON-compatible。
- `defaultCameraId` 只能是现有 camera view ID 或 `null`。

`defaultCameraId` 是 scene-level pointer，不是 view 自身的 marker。删除默认 view 时 command 会把 `defaultCameraId` 清为 `null`。Core 暴露 `resolveDefaultPresentationView(snapshot)` 给未来 viewer 或 host startup 使用；resolver 只读取 durable snapshot，不挂载 runtime。

Runtime helper 可以把当前 `PerspectiveCamera` 和可选 controls target capture 为 plain authored view data，也可以把 authored view apply 回 transient editor camera。Capture/apply 本身不改变 Snapshot、history、clipboard 或 `.ek3d`；只有显式 dispatch `create-camera-view`、`update-camera-view`、`delete-camera-view` 或 `set-default-camera-view` 才会持久化。

## Transform

```ts
interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}
```

Transform 使用数组保存，字段含义由 Three.js runtime 投影解释。

## AssetReference

```ts
type AssetKind = "glb" | "texture" | "hdr" | "image";

interface AssetReference {
  id: string;
  kind: AssetKind;
  label?: string;
  metadata?: Record<string, JsonValue>;
}
```

Snapshot 只保存资产引用，不保存资产 payload。真实二进制来源由以下方式提供：

- host resolver
- transient project asset store
- `.ek3d` 的 `assets/*` payload

资产 workspace row、引用位置、payload availability、package readiness 和问题摘要都是 core 派生 projection，不是新的 Snapshot 字段。引用位置用于解释 asset 被哪里使用：GLB object、material texture slot、environment background 或 environment lighting source。它们必须保持 JSON-compatible，方便 UI 渲染和调试序列化，但不应写回 durable scene state。

### GLB import manifest metadata

GLB import analysis 可以把 `glbImportManifest` 存入 `AssetReference.metadata`。这是 JSON-compatible authoring metadata，不是 loader result。Manifest 记录：

- glTF asset summary、scene/node/mesh/material/texture/image/camera/animation descriptors。
- resource counts、`extensionsUsed`、`extensionsRequired`、unsupported required extensions。
- import diagnostics，包括 missing decoder、unsupported extension、source invalid、load failed 等稳定 code。
- deterministic source paths，例如 `nodes/0`、`meshes/0/primitives/1`。

Manifest 可进入 Snapshot 和 `.ek3d` 的 `scene.json`，但只能包含 string、number、boolean、null、array 和 plain object。禁止在 metadata 中保存 `GLTFLoader`、parser、Three.js `Object3D`、`Texture`、`Material`、`AnimationClip`、`Camera`、`File`、`Blob`、object URL、resolver 输出、decoder 实例、image bitmap 或 PMREM 输出。导入分析失败默认不提交 `import-glb` 命令，因此不会注册坏 asset/object。GLB reimport 使用同一 manifest 形状更新稳定 asset ID 的 metadata，并用纯数据 remap plan 决定 imported target/slot 如何保留、重定向或标记 unresolved。

## SceneNode

```ts
type NodeId = string;

type SceneNode =
  | {
      id: NodeId;
      kind: "object";
      name: string;
      objectId: string;
      parentId: NodeId | null;
      children: NodeId[];
      transform: Transform;
      metadata?: Record<string, JsonValue>;
    }
  | {
      id: NodeId;
      kind: "group";
      name: string;
      parentId: NodeId | null;
      children: NodeId[];
      transform: Transform;
      metadata?: Record<string, JsonValue>;
    }
  | {
      id: NodeId;
      kind: "light";
      name: string;
      lightId: string;
      parentId: NodeId | null;
      children: NodeId[];
      transform?: Transform;
      metadata?: Record<string, JsonValue>;
    }
  | {
      id: NodeId;
      kind: "camera";
      name: string;
      cameraId: string;
      parentId: NodeId | null;
      children: NodeId[];
      transform: Transform;
      metadata?: Record<string, JsonValue>;
    }
  | {
      id: NodeId;
      kind: "imported";
      name: string;
      ownerObjectId: string;
      importKey: string;
      source: ImportedGlbSourceDescriptor;
      parentId: NodeId | null;
      children: NodeId[];
      transform?: Transform;
      materialSlots?: ImportedGlbMaterialSlotDescriptor[];
      remap?: ImportedGlbRemapMetadata;
      metadata?: Record<string, JsonValue>;
    };
```

`SceneNode` 保存共同 authoring target 字段：稳定 ID、展示名称、类型、父子关系、可选 metadata，以及有意义时的 transform。object node 引用 `objects` payload，light node 引用 `lights` payload，group node 没有额外 payload，imported node 表示 GLB object 内部的 durable authoring target。

迁移规则：

- v3 object 默认迁移为同 ID 的 object node。
- v3 light 默认迁移为同 ID 的 light node。
- 如果 object ID 与 light ID 冲突，object node 保留 object ID，light payload ID 不变，light node ID 会稳定生成为类似 `light-a:light` 的 collision-safe ID。
- v4 node graph 默认升级为 v5，再补齐 v6 empty presentation state，v8 会补齐空 `dataSources` 并升级为 v9，不会为已有 GLB object 合成 imported node、authored camera view、connection 或 query。

## Imported GLB Targets

Imported GLB target 是 v5 新增的 durable node kind，用来表示某个 GLB object 内部的 scene/node/mesh/primitive/camera 等可寻址目标。它只保存稳定 ID、manifest-derived source descriptor、owner 关系、可选 authored transform override、material slot descriptor 和 JSON-compatible remap metadata；不保存 glTF runtime graph。Imported glTF camera descriptor 不会自动变成 v6 authored camera view；需要显式 camera view authoring command。

```ts
interface ImportedGlbSourceDescriptor {
  kind: "scene" | "node" | "mesh" | "primitive" | "material" | "camera";
  path: string;          // e.g. "nodes/0", "meshes/0/primitives/1"
  index?: number;
  meshIndex?: number;
  primitiveIndex?: number;
  materialIndex?: number;
  cameraIndex?: number;
  fingerprint?: string;
  metadata?: Record<string, JsonValue>;
}

interface ImportedGlbMaterialSlotDescriptor {
  slotKey: string;       // stable owner-local slot key
  label: string;
  source: {
    kind: "material-slot";
    path: string;
    meshIndex?: number;
    primitiveIndex?: number;
    materialIndex?: number;
  };
  materialImportKey?: string;
  metadata?: Record<string, JsonValue>;
}

interface ImportedGlbRemapMetadata {
  status?: "resolved" | "unresolved" | "stale";
  previousImportKey?: string;
  candidateImportKeys?: string[];
  metadata?: {
    unresolvedMaterialSlots?: string[];
    [key: string]: JsonValue | undefined;
  };
}
```

Owner 约束：

- imported node 必须有 `ownerObjectId`，且 owner 必须是 existing GLB-backed object。
- imported node 不能是 root node。
- imported node 的 parent 必须是 owner object node，或同一 owner 下的 imported node。
- regular group/object/light node 不能挂到 imported node 下。
- 同一 owner 下 `importKey` 必须唯一。

`importKey` 是 GLB source identity，来自 `GlbImportManifest` descriptor path，例如 `glb:object-a/node:nodes/0`。`node.id` 是 editor identity，供 selection/history/commands 使用。首次展开导入时可以从 import key 派生 node ID；reimport/remap 会保留 node ID，同时更新 source/remap metadata。

Imported target 创建是显式操作：

```ts
editor.dispatch({
  type: "create-imported-glb-targets",
  ownerObjectId: "object-a"
});
```

Runtime projection 会把这些 durable imported nodes 解析为 loaded GLB scene 内的 transient `Object3D` descendant，并把结果放入 runtime node target map。该映射只在运行时存在：`Object3D`、base transform cache、loader result、parser association、selection helper 和 runtime problem 都不会写入 Snapshot。若 loaded GLB 中找不到对应 `importKey/source`，runtime 会暴露 target 为 `{ kind: "imported-target" }` 的 recoverable problem，并保留 durable imported node 与已 authored 的 transform override。若 GLB reimport 把 node 标记为 `remap.status: "unresolved"`，runtime/workbench 会暴露 `imported-target-unresolved`，而不是删除 node 或它的 authored transform。

Viewport grid/floor/axes helpers, light gizmos, light target helpers, shadow camera helpers, selection/hover/snap guide helper objects, helper visibility, hover target, snap feedback state, and marquee overlay/drag/candidate state are runtime/workbench session projection. They must not be serialized into Snapshot, history, clipboard payload, or `.ek3d` `scene.json`.

或在 import 时 opt-in：

```ts
editor.dispatch({
  type: "import-glb",
  objectId: "object-a",
  asset: { id: "asset-a", metadata },
  expandImportedTargets: true
});
```

默认 object-level GLB import 不创建 imported targets。

GLB reimport 通过 `reimport-glb` 命令提交 durable changes。命令会用 replacement manifest 重建该 owner 下的 imported nodes：exact/source/relationship match 保留原 node ID 和 authored transform，非 exact match 写入 `remap.status: "resolved"` 与 `previousImportKey`，无法唯一匹配的旧 node 保留为 `remap.status: "unresolved"`，replacement manifest 中新增的 target 会创建新的 imported node。若 target 匹配成功但旧 material slot 无法匹配，node 会在 `remap.metadata.unresolvedMaterialSlots` 中记录旧 slot key，用于派生 recoverable slot problem。`commit: false` 的 reimport preview 只返回 remap plan，不改变 Snapshot 或 asset payload。

## SceneObject Payload

```ts
interface SceneObject {
  id: string;
  name: string;
  kind: "glb";
  parentId: string | null;
  children: string[];
  asset: AssetReference;
  transform: Transform;
  metadata?: Record<string, JsonValue>;
}
```

当前对象类型只有 `glb`。对象 payload 仍保存 GLB asset reference 与兼容层级/transform 字段；canonical hierarchy、selection 和 target identity 属于 `SceneNode`。即使资产无法解析，对象 payload 也不应被删除。

## Selection

```ts
selection: {
  nodeId: NodeId | null;
  nodeIds: NodeId[];
  objectId: string | null;
  objectIds: string[];
}
```

Selection 是 durable state，因此可以序列化/恢复。`nodeId` 是 primary selection，`nodeIds` 是有序多选集合。`objectId/objectIds` 是兼容镜像，只包含 selected object nodes。校验要求：

- `nodeId` 要么为 `null`，要么存在于 `nodes` 中。
- 非空 `nodeId` 必须包含在 `nodeIds` 中。
- `nodeIds` 中所有 node 都必须存在且不能重复。
- `objectId` 要么为 `null`，要么存在于 `objects` 中。
- 非空 `objectId` 必须包含在 `objectIds` 中。
- `objectIds` 中所有对象都必须存在且不能重复。
- imported node 可进入 `selection.nodeId/nodeIds`；它不会进入 `selection.objectId/objectIds`，除非同次 selection 里还选中了 object node。

Viewport marquee selection 不引入新的 durable schema 字段。拖拽矩形、overlay DOM、candidate preview、pointer/camera suppression 和 runtime target projection 都是 transient session state；完成拖拽后只有现有 `selection.nodeId/nodeIds` 和兼容 `selection.objectId/objectIds` 会保存到 Snapshot。

## Materials

材质状态保存一小部分 `MeshStandardMaterial` override 和 assignment。当前使用边界：

- material override 是持久化 authoring data。
- object-level assignment 会在 runtime 投影到对应 GLB 对象下的 `MeshStandardMaterial` mesh。
- material-slot assignment 使用 `{ kind: "material-slot"; objectId; slotId }` 引用 imported slot key。`set-material` 新建 slot assignment 时要求 owner object 存在且 slot 能从 imported target metadata 中发现。
- runtime 会先应用 object-level broad override，再把 material-slot assignment 应用到匹配的 imported slot。slot pass 只替换对应 primitive mesh 或 material array index 的投影 clone；未命中的 slot 保留源材质或 object-level 投影结果。
- texture slot 只保存 asset reference；runtime 会解析并加载 `texture` / `image` 资产。
- runtime 创建出来的 cloned Three.js material/texture、slot lookup record、resolver result 和 projection problem 不进入 Snapshot。
- resolver/loader 失败只产生 runtime problem，不删除 durable material assignment 或 texture slot。
- imported target 可以暴露 `materialSlots`，`MaterialAssignmentTarget` 仍使用 `{ kind: "material-slot"; objectId; slotId }` 引用 slot key。
- validation 允许 material-slot assignment 指向当前不存在的 slot key，因为 reimport 后 slot 消失应该成为 recoverable problem，而不是 schema 层删除 durable assignment。
- `reimport-glb` 会在 slot 可唯一匹配时改写 material-slot assignment ID/slot ID；无法匹配时保留 durable assignment，并通过 `imported-material-slot-unresolved` problem 暴露。
- 默认 React/Vue inspector 可以把这些 durable slot assignment 暴露为 broad object target 和 material-slot target；active target、字段草稿、controlled validation warning 和 runtime unresolved problem 仍是 UI/runtime projection，不进入 Snapshot。
- 当前非目标包括手动 slot remap UI、slot thumbnail/source material preview、复杂材质图、节点材质、shader 编辑和 glTF material variant authoring。

## Environment

```ts
type EnvironmentLightingSourceKind = "none" | "equirectangular" | "hdr" | "cubemap";
type EnvironmentBackgroundSourceKind = "none" | "solid" | "flat-image" | "equirectangular" | "hdr" | "cubemap";
type CubemapFaceRole = "positive-x" | "negative-x" | "positive-y" | "negative-y" | "positive-z" | "negative-z";

type EnvironmentLightingSource =
  | { kind: "none" }
  | { kind: "equirectangular"; assetId: string }
  | { kind: "hdr"; assetId: string }
  | { kind: "cubemap"; faces: { role: CubemapFaceRole; assetId: string }[] };

type EnvironmentBackgroundSource =
  | { kind: "none" }
  | { kind: "solid"; color: string }
  | { kind: "flat-image"; assetId: string }
  | { kind: "equirectangular"; assetId: string }
  | { kind: "hdr"; assetId: string }
  | { kind: "cubemap"; faces: { role: CubemapFaceRole; assetId: string }[] };

interface SceneEnvironment {
  lighting: {
    source: EnvironmentLightingSource;
    intensity: number;
    rotation: { x: number; y: number; z: number };
  };
  background: {
    source: EnvironmentBackgroundSource;
    intensity?: number;
    blur?: number;
    rotation?: { x: number; y: number; z: number };
  };
  metadata?: Record<string, JsonValue>;
}
```

Environment 保存的是 authoring intent，不保存 texture、cubemap、resolver result 或 PMREM 输出。`lighting.source` 表示照亮模型的 image-based lighting source；`background.source` 表示可见背景。`flat-image` 是普通二维背景图；`equirectangular` / `hdr` / `cubemap` 是 sky/background intent，其中 cubemap 必须包含六个不重复 face role。HDR / image / texture / cubemap face 的解析或加载失败通过 runtime problem 暴露，不会删除 durable fields。

v6 兼容迁移规则：

- `environment.mode: "texture"` -> `lighting.source.kind = "equirectangular"`。
- `environment.mode: "hdr"` -> `lighting.source.kind = "hdr"`。
- `background.mode: "solid"` -> `background.source.kind = "solid"`。
- `background.mode: "texture"` -> `background.source.kind = "flat-image"`。
- `background.mode: "hdr"` -> `background.source.kind = "hdr"`。
- 旧 `none` / `solid` lighting mode 会迁移为 no lighting source。

`background.blur` 在 durable schema 中允许保存，但 runtime 会对 `flat-image` 背景发布不生效诊断；真正的 blur 只对 Three.js 支持的 environment-map 背景 source 有意义。

## Lights

```ts
type LightKind = "ambient" | "directional" | "hemisphere" | "point" | "spot";
```

五类灯光定义都属于 durable state：

- ambient：颜色、强度。
- directional：颜色、强度、transform、target、shadow settings。
- hemisphere：颜色、groundColor、强度。
- point：颜色、强度、transform、distance、decay、shadow settings。
- spot：颜色、强度、transform、target、distance、angle、penumbra、decay、shadow settings。

Directional、point 和 spot lights 可以保存 durable `shadow` authoring settings：

```ts
interface BaseLightShadowSettings {
  enabled: boolean;
  mapSize: { width: number; height: number };
  bias: number;
  normalBias: number;
  radius: number;
  camera: { near: number; far: number };
  metadata?: Record<string, JsonValue>;
}

interface DirectionalLightShadowSettings extends BaseLightShadowSettings {
  camera: BaseLightShadowSettings["camera"] & {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}
```

Ambient 和 hemisphere lights 不支持 shadow settings；validation 和 command layer 会拒绝这两类 light 上的 `shadow` 字段。Shadow map size 必须是正的 power-of-two，当前上限是 4096；camera near/far 必须 finite 且 `near < far`；directional bounds 必须 finite 且 left/right、bottom/top 不可倒置。

Runtime 会把这些定义投影为 Three.js light object，并在更新/删除时清理旧对象。Shadow settings 会投影到 Three.js shadow-capable lights，并在至少一个 shadow enabled 时启用 renderer `shadowMap`。Projection-owned meshes 在 shadow-enabled scene 中默认参与 cast/receive shadow；helper、pick proxy 和 problem placeholder 不参与。PointLight shadow cost、高 map size、宽 shadow camera range、宽 directional frustum 和 renderer 缺少 shadowMap capability 都作为 derived runtime problems 暴露，不写入 `snapshot.problems.acknowledged`。

每个 light payload 必须被一个 light node 引用。ambient 和 hemisphere light node 可被选择，但当前不暴露 transform capability；directional、point、spot light node 可以携带 transform。

## Problems

Snapshot 中的 `problems` 是 authored problem state。resolver、loader、PMREM、runtime projection 失败属于 derived runtime problem，通过 runtime API 暴露，不写回 Snapshot。

## Data Sources

v9 新增顶层 `dataSources`，用于保存 HTTP JSON 数据源配置。当前切片落地连接配置、已保存查询与设备属性映射；绑定仍只建立稳定引用边界，后续任务在同一 v9 schema 内扩展，不提升版本。

```ts
type DataConnectionAuth =
  | { kind: "none" }
  | { kind: "bearer"; credentialRef: string };

interface DataConnection {
  id: string;
  name: string;
  baseUrl: string;
  auth: DataConnectionAuth;
  headers: Record<string, string>;
  timeoutMs: number;
}

type DataParameterType = "string" | "number" | "boolean";
type DataParameterValue = string | number | boolean;

interface DataQueryParameter {
  name: string;
  type: DataParameterType;
  defaultValue?: DataParameterValue;
}

type DataPathSegment =
  | { kind: "key"; key: string }
  | { kind: "index"; index: number };

type DataMappedValueType = "number" | "string" | "boolean";

interface DataPropertyRange {
  min: number | null;
  max: number | null;
}

type DataPropertyTransform =
  | { kind: "raw" }
  | { kind: "number" }
  | { kind: "scale"; factor: number; offset: number }
  | { kind: "map"; entries: readonly { from: string | number | boolean | null; to: DataParameterValue }[] };

interface DataPropertyMapping {
  key: string;
  label: string;
  type: DataMappedValueType;
  nullable: boolean;
  unit: string | null;
  source: readonly DataPathSegment[];
  transform: DataPropertyTransform;
  range: DataPropertyRange | null;
  allowed: readonly DataParameterValue[] | null;
}

type DataIdentityMapping =
  | { kind: "path"; path: readonly DataPathSegment[]; valueType: "string" | "number" }
  | { kind: "parameter"; parameterName: string }
  | { kind: "literal"; value: string };

type DataTimeFormat = "iso" | "unix-seconds" | "unix-milliseconds";

interface DataQueryMapping {
  mode: "array" | "single";
  root: readonly DataPathSegment[];
  identity: DataIdentityMapping;
  displayName: readonly DataPathSegment[] | null;
  properties: readonly DataPropertyMapping[];
  observedAt: { path: readonly DataPathSegment[]; format: DataTimeFormat } | null;
  sourceQuality: {
    path: readonly DataPathSegment[];
    entries: readonly { from: string | number | boolean | null; quality: "good" | "uncertain" | "bad" | "unknown" }[];
  } | null;
}

interface DataQuery {
  id: string;
  connectionId: string;
  name: string;
  path: string;
  parameters: readonly DataQueryParameter[];
  mapping: DataQueryMapping;
}

interface DataObjectBinding {
  objectNodeId: string;
  queryId: string;
}

interface SceneDataSources {
  connections: Record<string, DataConnection>;
  queries: Record<string, DataQuery>;
  bindings: Record<string, DataObjectBinding>;
}
```

Validation 规则：

- `dataSources.connections`、`queries`、`bindings` 必须都是 plain object map；空 map 合法。
- 每个 connection 的 `id` 必须和 map key 一致且非空。
- connection 名称非空，且在整个 connection 范围内大小写不敏感去重。
- `baseUrl` 必须是绝对 HTTP/HTTPS 地址；拒绝 userinfo、query string、fragment，以及空白/控制字符。保存时去掉末尾 `/`。
- `headers` 只保存非秘密公共头；header name 必须是 HTTP token，拒绝 `authorization`、`proxy-authorization`、`cookie`、`set-cookie`，header value 不允许 CR/LF 或控制字符。
- `timeoutMs` 必须是正的 finite safe integer；默认 `10000`。UI 以秒显示和编辑，Snapshot 内统一毫秒。
- bearer auth 的 `credentialRef` 必须非空。凭证是否存在、是否可用属于宿主能力，不是 Snapshot 校验错误；缺失凭证仍可恢复、编辑和保存。
- 每个 query 的 `id` 必须和 map key 一致，`connectionId` 必须指向现有 connection；query 名称在同一 connection 内大小写不敏感去重，跨 connection 可同名。
- query `path` 只能是相对于连接 `baseUrl` 的路径；参数名、类型、默认值、路径编码、穿越防护和占位符完整性复用 `buildDataGetRequest()` 的规则。
- Snapshot 中的 query 必须已经规范化，并显式保存映射默认字段（例如 scale 的 `offset: 0`、单侧 range 的另一侧 `null`）。草稿可通过 `validateDataQueryDefinition()` 取得规范化结果后交给保存 command；恢复不会隐式补全缺失字段。JSON 对象字段顺序不影响校验。
- mapping 至少包含一个属性；属性键在 query 内唯一，来源路径只能是对象键/非负数组索引，禁止通配、递归、脚本和原型链访问。
- 属性类型、可空性、单位、可选范围/枚举与转换共同校验：range 仅适用于数字属性的 min/max 约束；allowed 是非空、无重复且类型匹配属性类型的值列表。转换输出必须符合声明类型。数组模式每行一个设备；单对象模式的身份可来自字段、参数或固定值。重复设备 ID 使整次映射失败，单字段错误按属性隔离。
- 时间格式支持带明确时区的 ISO 与 Unix 秒/毫秒；ISO 日历日期必须真实存在，Unix 换算后的毫秒值必须有限且在 JavaScript Date 可表示范围内（包含正负 `8_640_000_000_000_000` 毫秒边界）。源时间超前接收时间超过 30 秒视为无效。source quality 只由明确映射产生，HTTP 成功不推断 `good`。
- 每个 binding 的 key 必须是现有 object node ID，`queryId` 必须指向现有 query。

连接变更通过 `create-data-connection`、`update-data-connection`、`duplicate-data-connection`、`delete-data-connection` command 进入 command/history；一次保存对应一次可撤销编辑。失败会保持 Snapshot/history 原子不变。复制连接生成新 ID 和唯一名称，不复制 query。存在 query/binding 引用时拒绝删除 connection；引用统计由 `countDataConnectionReferences` 提供。

查询变更通过 `create-data-query`、`update-data-query`、`duplicate-data-query`、`delete-data-query` command 进入 command/history。查询配置与映射在同一 command 中保存，只增加一次编辑历史；复制查询生成新 ID 和同一 connection 内的唯一名称；存在 binding 引用时拒绝删除查询。`buildDataQueryList()` 与 `countDataQueryReferences()` 提供列表和引用统计。

Host credential descriptors（`ref`、`label`、`available`）通过 `createEditor({ credentials })` 注入，只存在运行态；它们不会写入 Snapshot、项目包或 clipboard。React 数据工作区的连接列表由 `buildDataSourcesWorkspaceModel` 从 Snapshot 与 host credentials 派生。

已保存的查询配置与映射属于 durable `DataQuery`，通过 command 写入 Snapshot，并随项目包和 `.ek3d` 保存。未保存的请求/映射草稿、示例 JSON、请求结果、临时参数覆盖、原始响应及其 JSON、耗时、取消状态和 generation 只属于 editor session，不进入 Snapshot、项目包、`.ek3d` 或 clipboard。`buildDataGetRequest()` 只接受相对于连接 `baseUrl` 的路径，拒绝绝对地址、协议相对地址、编码穿越和带 query/fragment 的路径；参数定义区分 `string`、finite `number` 和 `boolean`，默认值与临时覆盖分别解析，未提供、`""`、`0`、`false` 不会互相替代。宿主通过 `createEditor({ executor })` 注入请求执行器，收到 `method`、最终 URL、非秘密 headers、`credentialRef`、`timeoutMs` 和 `AbortSignal`，返回状态、允许的响应头、content type 与文本 body。没有 executor 时返回结构化运行态问题，不会回退到浏览器 `fetch`。`mapDataQueryBody()` 从映射配置和内存中的响应 body 产生带 `connectionId`、`queryId`、`entityId`、属性值、`observedAt`、`receivedAt` 与 `sourceQuality` 的标准样本；这些样本不写入 Snapshot。

## Command 与 Snapshot 的关系

持久化变更只能通过 command 进入 Snapshot：

```ts
type Command =
  | BatchCommand
  | ImportGlbCommand
  | RegisterAssetCommand
  | SelectNodeCommand
  | SelectNodesCommand
  | CreateGroupCommand
  | DeleteNodesCommand
  | GroupNodesCommand
  | UngroupNodesCommand
  | ReparentNodeCommand
  | SetNodeTransformCommand
  | CreateImportedGlbTargetsCommand
  | SelectObjectCommand
  | SelectObjectsCommand
  | DeleteObjectsCommand
  | PasteObjectsCommand
  | DuplicateObjectsCommand
  | GroupObjectsCommand
  | UngroupObjectsCommand
  | ReparentObjectCommand
  | SetTransformCommand
  | SetMaterialCommand
  | SetEnvironmentCommand
  | AddLightCommand
  | UpdateLightCommand
  | RemoveLightCommand
  | CreateDataConnectionCommand
  | UpdateDataConnectionCommand
  | DuplicateDataConnectionCommand
  | DeleteDataConnectionCommand;
```

不要从 React/Vue UI 直接改 Snapshot object。正确方式是：

```ts
editor.dispatch({
  type: "set-node-transform",
  nodeId: "box",
  transform: { position: [1, 0, 0] }
});
```

旧 object-only host code 可继续使用 `select-object`、`select-objects`、`set-transform` 等兼容命令；这些命令会解析 object payload ID 到对应 object node。Imported node 使用 node-native 命令：`select-node`、`set-node-transform`、`delete-nodes` 和 `reparent-node`。

## Clipboard Payload

Clipboard payload 是 transient JSON editor data，不属于 durable Snapshot：

- v1 object clipboard：`kind: "ek-aiot-3d-editor-objects"`，保留旧 object-only copy/paste 行为。
- v2 node clipboard：`kind: "ek-aiot-3d-editor-nodes"`，可携带 group/object/light node 子树、相关 object/light payload、material assignment、asset IDs。

两种 payload 都必须 JSON-compatible，不包含 browser/system clipboard 状态、`File`、`Blob`、object URL、Three.js runtime object、resolver 输出或 `.ek3d` asset payload bytes。`.ek3d` 项目包仍只保存 `scene.json` Snapshot 和 `assets/*` payload；clipboard payload 不会写入项目包。

## 序列化与恢复

- `editor.serialize()` 返回 `SerializedSceneSnapshot`。
- `editor.restore(snapshot)` 校验并恢复 Snapshot。
- `createEditor({ snapshot })` 可直接用已有 Snapshot 初始化。
- `migrateSerializedSnapshot()` 可迁移 legacy snapshot。
- `validateSceneSnapshot()` 和 `validateSerializedSceneSnapshot()` 用于 schema 校验。

## 示例 Snapshot 片段

```json
{
  "version": 9,
  "scene": {
    "id": "scene",
    "name": "Untitled scene"
  },
  "nodes": {
    "box": {
      "id": "box",
      "kind": "object",
      "name": "Simple box",
      "objectId": "box",
      "parentId": null,
      "children": [],
      "transform": {
        "position": [1, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      }
    }
  },
  "rootNodeIds": ["box"],
  "objects": {
    "box": {
      "id": "box",
      "name": "Simple box",
      "kind": "glb",
      "parentId": null,
      "children": [],
      "asset": {
        "id": "simple-box",
        "kind": "glb",
        "label": "Simple box"
      },
      "transform": {
        "position": [1, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      }
    }
  },
  "rootObjectIds": ["box"],
  "selection": {
    "nodeId": "box",
    "nodeIds": ["box"],
    "objectId": "box",
    "objectIds": ["box"]
  },
  "assets": {
    "simple-box": {
      "id": "simple-box",
      "kind": "glb",
      "label": "Simple box"
    }
  },
  "dataSources": {
    "connections": {},
    "queries": {},
    "bindings": {}
  }
}
```

实际 Snapshot 还会包含 `materials`、`environment`、`lights`、`presentation`、`problems` 和 `dataSources` 的默认结构。

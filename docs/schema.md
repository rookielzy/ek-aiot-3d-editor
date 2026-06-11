# Scene Snapshot Schema

Scene Snapshot 是本项目的 durable editor state。它必须是 JSON-compatible，可序列化、可校验、可迁移，并能在无 Vue/React 的情况下恢复。

当前版本：

- `SceneSnapshot.version = 5`
- `V4SceneSnapshot.version = 4`
- `V3SceneSnapshot.version = 3`
- `PreviousSceneSnapshot.version = 2`
- `LegacySceneSnapshot.version = 1`

Version 1/2/3/4 snapshot 会通过 migration 规范化为当前 schema。v4 scene node graph 会原样升级到 v5；migration 不会根据已有 GLB object metadata 自动生成 imported targets。

## 顶层结构

```ts
interface SceneSnapshot {
  version: 5;
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
  problems: AuthoredProblemState;
  metadata?: Record<string, JsonValue>;
}
```

`nodes` / `rootNodeIds` 是 current canonical hierarchy 和 target layer。`objects`、`lights` 仍保存 payload；`rootObjectIds` 与 `selection.objectId/objectIds` 是当前兼容镜像，供旧 object-only API 使用，新的 durable target 应使用 `NodeId`。

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
- v4 node graph 默认升级为 v5，不会为已有 GLB object 合成 imported node。

## Imported GLB Targets

Imported GLB target 是 v5 新增的 durable node kind，用来表示某个 GLB object 内部的 scene/node/mesh/primitive/camera 等可寻址目标。它只保存稳定 ID、manifest-derived source descriptor、owner 关系、可选 authored transform override、material slot descriptor 和 JSON-compatible remap metadata；不保存 glTF runtime graph。

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
- 当前非目标包括 material slot inspector UI、复杂材质图、节点材质、shader 编辑和 glTF material variant authoring。

## Environment

```ts
type EnvironmentMode = "none" | "solid" | "texture" | "hdr";
type BackgroundMode = "none" | "solid" | "texture" | "hdr";

interface SceneEnvironment {
  mode: EnvironmentMode;
  background: {
    mode: BackgroundMode;
    color?: string;
    assetId?: string;
    intensity?: number;
    blur?: number;
    rotation?: { x: number; y: number; z: number };
  };
  environment: {
    assetId?: string;
    intensity: number;
    rotation: { x: number; y: number; z: number };
  };
  metadata?: Record<string, JsonValue>;
}
```

Environment 保存的是意图，不保存 texture 或 PMREM 输出。HDR / image / texture 的加载失败通过 runtime problem 暴露。

## Lights

```ts
type LightKind = "ambient" | "directional" | "hemisphere" | "point" | "spot";
```

五类灯光定义都属于 durable state：

- ambient：颜色、强度。
- directional：颜色、强度、transform、target。
- hemisphere：颜色、groundColor、强度。
- point：颜色、强度、transform、distance、decay。
- spot：颜色、强度、transform、target、distance、angle、penumbra、decay。

Runtime 会把这些定义投影为 Three.js light object，并在更新/删除时清理旧对象。

每个 light payload 必须被一个 light node 引用。ambient 和 hemisphere light node 可被选择，但当前不暴露 transform capability；directional、point、spot light node 可以携带 transform。

## Problems

Snapshot 中的 `problems` 是 authored problem state。resolver、loader、PMREM、runtime projection 失败属于 derived runtime problem，通过 runtime API 暴露，不写回 Snapshot。

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
  | RemoveLightCommand;
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
  "version": 5,
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
  }
}
```

实际 Snapshot 还会包含 `materials`、`environment`、`lights`、`problems` 的默认结构。

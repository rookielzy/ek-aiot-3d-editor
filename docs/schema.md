# Scene Snapshot Schema

Scene Snapshot 是本项目的 durable editor state。它必须是 JSON-compatible，可序列化、可校验、可迁移，并能在无 Vue/React 的情况下恢复。

当前版本：

- `SceneSnapshot.version = 4`
- `V3SceneSnapshot.version = 3`
- `PreviousSceneSnapshot.version = 2`
- `LegacySceneSnapshot.version = 1`

Version 1/2/3 snapshot 会通过 migration 规范化为当前 schema。

## 顶层结构

```ts
interface SceneSnapshot {
  version: 4;
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

`nodes` / `rootNodeIds` 是 v4 的 canonical hierarchy 和 target layer。`objects`、`lights` 仍保存 payload；`rootObjectIds` 与 `selection.objectId/objectIds` 是当前兼容镜像，供旧 object-only API 使用，新的 durable target 应使用 `NodeId`。

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
    };
```

`SceneNode` 保存共同 authoring target 字段：稳定 ID、展示名称、类型、父子关系、可选 metadata，以及有意义时的 transform。object node 引用 `objects` payload，light node 引用 `lights` payload，group node 没有额外 payload。

迁移规则：

- v3 object 默认迁移为同 ID 的 object node。
- v3 light 默认迁移为同 ID 的 light node。
- 如果 object ID 与 light ID 冲突，object node 保留 object ID，light payload ID 不变，light node ID 会稳定生成为类似 `light-a:light` 的 collision-safe ID。

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

当前对象类型只有 `glb`。v4 中对象 payload 仍保存 GLB asset reference 与兼容层级/transform 字段；canonical hierarchy、selection 和 target identity 属于 `SceneNode`。即使资产无法解析，对象 payload 也不应被删除。

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

## Materials

材质状态保存一小部分 `MeshStandardMaterial` override 和 assignment。当前文档只描述使用边界：

- material override 是持久化 authoring data。
- object-level assignment 会在 runtime 投影到对应 GLB 对象下的 `MeshStandardMaterial` mesh。
- texture slot 只保存 asset reference；runtime 会解析并加载 `texture` / `image` 资产。
- runtime 创建出来的 cloned Three.js material/texture 不进入 Snapshot。
- resolver/loader 失败只产生 runtime problem，不删除 durable material assignment 或 texture slot。
- 当前非目标包括完整子网格 material slot discovery、per-submesh assignment、复杂材质图、节点材质和 shader 编辑。

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

v4 中每个 light payload 必须被一个 light node 引用。ambient 和 hemisphere light node 可被选择，但当前不暴露 transform capability；directional、point、spot light node 可以携带 transform。

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

旧 object-only host code 可继续使用 `select-object`、`select-objects`、`set-transform` 等兼容命令；这些命令会解析 object payload ID 到对应 object node。

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
  "version": 4,
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

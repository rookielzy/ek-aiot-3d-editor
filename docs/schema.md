# Scene Snapshot Schema

Scene Snapshot 是本项目的 durable editor state。它必须是 JSON-compatible，可序列化、可校验、可迁移，并能在无 Vue/React 的情况下恢复。

当前版本：

- `SceneSnapshot.version = 3`
- `PreviousSceneSnapshot.version = 2`
- `LegacySceneSnapshot.version = 1`

Version 1/2 snapshot 会通过 migration 规范化为当前 schema。

## 顶层结构

```ts
interface SceneSnapshot {
  version: 3;
  scene: {
    id: string;
    name: string;
  };
  objects: Record<string, SceneObject>;
  rootObjectIds: string[];
  selection: {
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

## SceneObject

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

当前对象类型只有 `glb`。对象结构保存稳定 ID、层级和 Transform。即使资产无法解析，对象也不应被删除。

## Selection

```ts
selection: {
  objectId: string | null;
  objectIds: string[];
}
```

Selection 是 durable state，因此可以序列化/恢复。`objectId` 是 primary selection，用于保持 inspector 和旧单选流程兼容；`objectIds` 是有序多选集合。校验要求：

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

## Problems

Snapshot 中的 `problems` 是 authored problem state。resolver、loader、PMREM、runtime projection 失败属于 derived runtime problem，通过 runtime API 暴露，不写回 Snapshot。

## Command 与 Snapshot 的关系

持久化变更只能通过 command 进入 Snapshot：

```ts
type Command =
  | BatchCommand
  | ImportGlbCommand
  | RegisterAssetCommand
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
  type: "set-transform",
  objectId: "box",
  transform: { position: [1, 0, 0] }
});
```

## 序列化与恢复

- `editor.serialize()` 返回 `SerializedSceneSnapshot`。
- `editor.restore(snapshot)` 校验并恢复 Snapshot。
- `createEditor({ snapshot })` 可直接用已有 Snapshot 初始化。
- `migrateSerializedSnapshot()` 可迁移 legacy snapshot。
- `validateSceneSnapshot()` 和 `validateSerializedSceneSnapshot()` 用于 schema 校验。

## 示例 Snapshot 片段

```json
{
  "version": 3,
  "scene": {
    "id": "scene",
    "name": "Untitled scene"
  },
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

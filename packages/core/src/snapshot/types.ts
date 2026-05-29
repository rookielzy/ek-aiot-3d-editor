export const SNAPSHOT_VERSION = 1;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface AssetReference {
  id: string;
  kind: "glb";
  label?: string;
  metadata?: Record<string, JsonValue>;
}

export interface SceneObject {
  id: string;
  name: string;
  kind: "glb";
  parentId: string | null;
  children: string[];
  asset: AssetReference;
  transform: Transform;
  metadata?: Record<string, JsonValue>;
}

export interface SceneSnapshot {
  version: typeof SNAPSHOT_VERSION;
  scene: {
    id: string;
    name: string;
  };
  objects: Record<string, SceneObject>;
  rootObjectIds: string[];
  selection: {
    objectId: string | null;
  };
  assets: Record<string, AssetReference>;
  metadata?: Record<string, JsonValue>;
}

export type SerializedSceneSnapshot = SceneSnapshot;

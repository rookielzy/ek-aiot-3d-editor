import type { SceneEnvironment } from "../environment/types";
import type { LightDefinition } from "../lights/types";
import type { MaterialState } from "../materials/types";
import type { AuthoredProblemState } from "../problems/types";
import type { JsonPrimitive, JsonValue } from "./json";
import type { ASSET_KINDS } from "./primitives";

export const SNAPSHOT_VERSION = 4;
export const PREVIOUS_SNAPSHOT_VERSION = 2;
export const LEGACY_SNAPSHOT_VERSION = 1;
export const V3_SNAPSHOT_VERSION = 3;

export type { JsonPrimitive, JsonValue };

export interface Transform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface AssetReference {
  id: string;
  kind: AssetKind;
  label?: string;
  metadata?: Record<string, JsonValue>;
}

export type AssetKind = (typeof ASSET_KINDS)[number];

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

export type NodeId = string;

export type SceneNode =
  | SceneObjectNode
  | SceneGroupNode
  | SceneLightNode;

interface BaseSceneNode {
  id: NodeId;
  name: string;
  parentId: NodeId | null;
  children: NodeId[];
  metadata?: Record<string, JsonValue>;
}

export interface SceneObjectNode extends BaseSceneNode {
  kind: "object";
  objectId: string;
  transform: Transform;
}

export interface SceneGroupNode extends BaseSceneNode {
  kind: "group";
  transform: Transform;
}

export interface SceneLightNode extends BaseSceneNode {
  kind: "light";
  lightId: string;
  transform?: Transform;
}

export interface SceneSnapshot {
  version: typeof SNAPSHOT_VERSION;
  scene: {
    id: string;
    name: string;
  };
  nodes: Record<NodeId, SceneNode>;
  rootNodeIds: NodeId[];
  objects: Record<string, SceneObject>;
  /**
   * @deprecated Compatibility mirror for object-only callers. Current hierarchy
   * semantics are owned by nodes/rootNodeIds.
   */
  rootObjectIds: string[];
  selection: {
    nodeId: NodeId | null;
    nodeIds: NodeId[];
    /**
     * @deprecated Compatibility mirror derived from object nodes in nodeIds.
     */
    objectId: string | null;
    /**
     * @deprecated Compatibility mirror derived from object nodes in nodeIds.
     */
    objectIds: string[];
  };
  assets: Record<string, AssetReference>;
  materials: MaterialState;
  environment: SceneEnvironment;
  lights: Record<string, LightDefinition>;
  problems: AuthoredProblemState;
  metadata?: Record<string, JsonValue>;
}

export interface V3SceneSnapshot {
  version: typeof V3_SNAPSHOT_VERSION;
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

export interface PreviousSceneSnapshot {
  version: typeof PREVIOUS_SNAPSHOT_VERSION;
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
  materials: MaterialState;
  environment: SceneEnvironment;
  lights: Record<string, LightDefinition>;
  problems: AuthoredProblemState;
  metadata?: Record<string, JsonValue>;
}

export interface LegacyAssetReference {
  id: string;
  kind: "glb";
  label?: string;
  metadata?: Record<string, JsonValue>;
}

export interface LegacySceneObject {
  id: string;
  name: string;
  kind: "glb";
  parentId: string | null;
  children: string[];
  asset: LegacyAssetReference;
  transform: Transform;
  metadata?: Record<string, JsonValue>;
}

export interface LegacySceneSnapshot {
  version: typeof LEGACY_SNAPSHOT_VERSION;
  scene: {
    id: string;
    name: string;
  };
  objects: Record<string, LegacySceneObject>;
  rootObjectIds: string[];
  selection: {
    objectId: string | null;
  };
  assets: Record<string, LegacyAssetReference>;
  metadata?: Record<string, JsonValue>;
}

export type SerializedSceneSnapshot = SceneSnapshot | V3SceneSnapshot | PreviousSceneSnapshot | LegacySceneSnapshot;

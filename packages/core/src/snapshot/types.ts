import type { SceneEnvironment } from "../environment/types";
import type { LightDefinition } from "../lights/types";
import type { MaterialState } from "../materials/types";
import type { AuthoredProblemState } from "../problems/types";
import type { JsonPrimitive, JsonValue } from "./json";
import type { ASSET_KINDS } from "./primitives";

export const SNAPSHOT_VERSION = 3;
export const PREVIOUS_SNAPSHOT_VERSION = 2;
export const LEGACY_SNAPSHOT_VERSION = 1;

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

export type SerializedSceneSnapshot = SceneSnapshot | PreviousSceneSnapshot | LegacySceneSnapshot;

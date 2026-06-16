import type { AssetReference, JsonValue } from "../snapshot/types";

export type EnvironmentMode = "none" | "solid" | "texture" | "hdr";
export type BackgroundMode = "none" | "solid" | "texture" | "hdr";
export type EnvironmentLightingSourceKind = "none" | "equirectangular" | "hdr" | "cubemap";
export type EnvironmentBackgroundSourceKind = "none" | "solid" | "flat-image" | "equirectangular" | "hdr" | "cubemap";
export type CubemapFaceRole = "positive-x" | "negative-x" | "positive-y" | "negative-y" | "positive-z" | "negative-z";

export interface EnvironmentRotation {
  x: number;
  y: number;
  z: number;
}

export interface CubemapFaceReference {
  role: CubemapFaceRole;
  assetId: AssetReference["id"];
}

export interface NoneEnvironmentLightingSource {
  kind: "none";
}

export interface EquirectangularEnvironmentLightingSource {
  kind: "equirectangular";
  assetId: AssetReference["id"];
}

export interface HdrEnvironmentLightingSource {
  kind: "hdr";
  assetId: AssetReference["id"];
}

export interface CubemapEnvironmentLightingSource {
  kind: "cubemap";
  faces: CubemapFaceReference[];
}

export type EnvironmentLightingSource =
  | NoneEnvironmentLightingSource
  | EquirectangularEnvironmentLightingSource
  | HdrEnvironmentLightingSource
  | CubemapEnvironmentLightingSource;

export interface NoneEnvironmentBackgroundSource {
  kind: "none";
}

export interface SolidEnvironmentBackgroundSource {
  kind: "solid";
  color: string;
}

export interface FlatImageEnvironmentBackgroundSource {
  kind: "flat-image";
  assetId: AssetReference["id"];
}

export interface EquirectangularEnvironmentBackgroundSource {
  kind: "equirectangular";
  assetId: AssetReference["id"];
}

export interface HdrEnvironmentBackgroundSource {
  kind: "hdr";
  assetId: AssetReference["id"];
}

export interface CubemapEnvironmentBackgroundSource {
  kind: "cubemap";
  faces: CubemapFaceReference[];
}

export type EnvironmentBackgroundSource =
  | NoneEnvironmentBackgroundSource
  | SolidEnvironmentBackgroundSource
  | FlatImageEnvironmentBackgroundSource
  | EquirectangularEnvironmentBackgroundSource
  | HdrEnvironmentBackgroundSource
  | CubemapEnvironmentBackgroundSource;

export interface SceneEnvironment {
  lighting: {
    source: EnvironmentLightingSource;
    intensity: number;
    rotation: EnvironmentRotation;
  };
  background: {
    source: EnvironmentBackgroundSource;
    intensity?: number;
    blur?: number;
    rotation?: EnvironmentRotation;
  };
  metadata?: Record<string, JsonValue>;
}

export interface LegacySceneEnvironment {
  mode: EnvironmentMode;
  background: {
    mode: BackgroundMode;
    color?: string;
    assetId?: AssetReference["id"];
    intensity?: number;
    blur?: number;
    rotation?: EnvironmentRotation;
  };
  environment: {
    assetId?: AssetReference["id"];
    intensity: number;
    rotation: EnvironmentRotation;
  };
  metadata?: Record<string, JsonValue>;
}

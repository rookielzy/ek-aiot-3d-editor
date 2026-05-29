import type { AssetReference, JsonValue } from "../snapshot/types";

export type EnvironmentMode = "none" | "solid" | "texture" | "hdr";
export type BackgroundMode = "none" | "solid" | "texture" | "hdr";

export interface EnvironmentRotation {
  x: number;
  y: number;
  z: number;
}

export interface SceneEnvironment {
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

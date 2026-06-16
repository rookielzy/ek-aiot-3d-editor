import type { JsonValue, Transform } from "../snapshot/types";

export type LightKind = "ambient" | "directional" | "hemisphere" | "point" | "spot";
export type ShadowCapableLightKind = "directional" | "point" | "spot";

export interface LightShadowMapSize {
  width: number;
  height: number;
}

export interface BaseLightShadowSettings {
  enabled: boolean;
  mapSize: LightShadowMapSize;
  bias: number;
  normalBias: number;
  radius: number;
  camera: {
    near: number;
    far: number;
  };
  metadata?: Record<string, JsonValue>;
}

export interface DirectionalLightShadowSettings extends Omit<BaseLightShadowSettings, "camera"> {
  camera: BaseLightShadowSettings["camera"] & {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
}

export type PointLightShadowSettings = BaseLightShadowSettings;
export type SpotLightShadowSettings = BaseLightShadowSettings;

export type LightShadowSettings =
  | DirectionalLightShadowSettings
  | PointLightShadowSettings
  | SpotLightShadowSettings;

export interface BaseLightDefinition {
  id: string;
  kind: LightKind;
  name: string;
  color: string;
  intensity: number;
  transform?: Transform;
  metadata?: Record<string, JsonValue>;
}

export interface AmbientLightDefinition extends BaseLightDefinition {
  kind: "ambient";
}

export interface DirectionalLightDefinition extends BaseLightDefinition {
  kind: "directional";
  transform: Transform;
  target: [number, number, number];
  shadow: DirectionalLightShadowSettings;
}

export interface HemisphereLightDefinition extends BaseLightDefinition {
  kind: "hemisphere";
  groundColor: string;
}

export interface PointLightDefinition extends BaseLightDefinition {
  kind: "point";
  transform: Transform;
  distance?: number;
  decay?: number;
  shadow: PointLightShadowSettings;
}

export interface SpotLightDefinition extends BaseLightDefinition {
  kind: "spot";
  transform: Transform;
  target: [number, number, number];
  distance?: number;
  angle: number;
  penumbra?: number;
  decay?: number;
  shadow: SpotLightShadowSettings;
}

export type LightDefinition =
  | AmbientLightDefinition
  | DirectionalLightDefinition
  | HemisphereLightDefinition
  | PointLightDefinition
  | SpotLightDefinition;

export type LegacyLightDefinition =
  | AmbientLightDefinition
  | (Omit<DirectionalLightDefinition, "shadow"> & { shadow?: DirectionalLightShadowSettings })
  | HemisphereLightDefinition
  | (Omit<PointLightDefinition, "shadow"> & { shadow?: PointLightShadowSettings })
  | (Omit<SpotLightDefinition, "shadow"> & { shadow?: SpotLightShadowSettings });

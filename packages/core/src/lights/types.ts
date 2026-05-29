import type { JsonValue, Transform } from "../snapshot/types";

export type LightKind = "ambient" | "directional" | "hemisphere" | "point" | "spot";

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
}

export interface SpotLightDefinition extends BaseLightDefinition {
  kind: "spot";
  transform: Transform;
  target: [number, number, number];
  distance?: number;
  angle: number;
  penumbra?: number;
  decay?: number;
}

export type LightDefinition =
  | AmbientLightDefinition
  | DirectionalLightDefinition
  | HemisphereLightDefinition
  | PointLightDefinition
  | SpotLightDefinition;

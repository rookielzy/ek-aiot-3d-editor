import { createId, createTransform } from "../snapshot/defaults";
import type { JsonValue, Transform } from "../snapshot/types";
import type {
  DirectionalLightShadowSettings,
  LightDefinition,
  LightKind,
  LightShadowSettings,
  PointLightShadowSettings,
  ShadowCapableLightKind,
  SpotLightShadowSettings
} from "./types";

type LightDefinitionOptions = {
  id?: string;
  name?: string;
  color?: string;
  intensity?: number;
  transform?: Partial<Transform>;
  target?: [number, number, number];
  groundColor?: string;
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  shadow?: Partial<LightShadowSettings>;
  metadata?: Record<string, JsonValue>;
};

export function createLightDefinition(kind: LightKind, options: LightDefinitionOptions = {}): LightDefinition {
  const base = {
    id: options.id ?? createId("light"),
    name: options.name ?? defaultLightName(kind),
    color: options.color ?? "rgb(255, 255, 255)",
    intensity: options.intensity ?? 1,
    ...(options.metadata ? { metadata: options.metadata } : {})
  };

  switch (kind) {
    case "ambient":
      return { ...base, kind };
    case "directional":
      return {
        ...base,
        kind,
        transform: createTransform(options.transform),
        target: options.target ?? [0, 0, 0],
        shadow: createDefaultLightShadow("directional", options.shadow)
      };
    case "hemisphere":
      return { ...base, kind, groundColor: options.groundColor ?? "rgb(64, 64, 64)" };
    case "point":
      return {
        ...base,
        kind,
        transform: createTransform(options.transform),
        ...(options.distance !== undefined ? { distance: options.distance } : {}),
        ...(options.decay !== undefined ? { decay: options.decay } : {}),
        shadow: createDefaultLightShadow("point", options.shadow)
      };
    case "spot":
      return {
        ...base,
        kind,
        transform: createTransform(options.transform),
        target: options.target ?? [0, 0, 0],
        angle: options.angle ?? Math.PI / 4,
        ...(options.distance !== undefined ? { distance: options.distance } : {}),
        ...(options.penumbra !== undefined ? { penumbra: options.penumbra } : {}),
        ...(options.decay !== undefined ? { decay: options.decay } : {}),
        shadow: createDefaultLightShadow("spot", options.shadow)
      };
    default:
      return assertNever(kind);
  }
}

export function createDefaultLightShadow(kind: "directional", overrides?: Partial<LightShadowSettings>): DirectionalLightShadowSettings;
export function createDefaultLightShadow(kind: "point", overrides?: Partial<LightShadowSettings>): PointLightShadowSettings;
export function createDefaultLightShadow(kind: "spot", overrides?: Partial<LightShadowSettings>): SpotLightShadowSettings;
export function createDefaultLightShadow(kind: ShadowCapableLightKind, overrides: Partial<LightShadowSettings> = {}): LightShadowSettings {
  const camera = (overrides.camera ?? {}) as Partial<DirectionalLightShadowSettings["camera"]>;
  const base = {
    enabled: overrides.enabled ?? false,
    mapSize: {
      width: overrides.mapSize?.width ?? (kind === "point" ? 512 : 1024),
      height: overrides.mapSize?.height ?? (kind === "point" ? 512 : 1024)
    },
    bias: overrides.bias ?? 0,
    normalBias: overrides.normalBias ?? 0,
    radius: overrides.radius ?? 1,
    camera: {
      near: camera.near ?? 0.5,
      far: camera.far ?? (kind === "directional" ? 500 : 100)
    },
    ...(overrides.metadata ? { metadata: overrides.metadata } : {})
  };

  if (kind === "directional") {
    return {
      ...base,
      camera: {
        ...base.camera,
        left: "left" in camera && typeof camera.left === "number" ? camera.left : -10,
        right: "right" in camera && typeof camera.right === "number" ? camera.right : 10,
        top: "top" in camera && typeof camera.top === "number" ? camera.top : 10,
        bottom: "bottom" in camera && typeof camera.bottom === "number" ? camera.bottom : -10
      }
    };
  }

  return base;
}

function defaultLightName(kind: LightKind): string {
  switch (kind) {
    case "ambient":
      return "Ambient light";
    case "directional":
      return "Directional light";
    case "hemisphere":
      return "Hemisphere light";
    case "point":
      return "Point light";
    case "spot":
      return "Spot light";
    default:
      return assertNever(kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported light kind: ${String(value)}`);
}

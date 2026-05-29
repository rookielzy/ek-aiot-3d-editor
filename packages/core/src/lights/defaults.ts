import { createId, createTransform } from "../snapshot/defaults";
import type { JsonValue, Transform } from "../snapshot/types";
import type { LightDefinition, LightKind } from "./types";

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
      return { ...base, kind, transform: createTransform(options.transform), target: options.target ?? [0, 0, 0] };
    case "hemisphere":
      return { ...base, kind, groundColor: options.groundColor ?? "rgb(64, 64, 64)" };
    case "point":
      return {
        ...base,
        kind,
        transform: createTransform(options.transform),
        ...(options.distance !== undefined ? { distance: options.distance } : {}),
        ...(options.decay !== undefined ? { decay: options.decay } : {})
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
        ...(options.decay !== undefined ? { decay: options.decay } : {})
      };
    default:
      return assertNever(kind);
  }
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

import type { Command } from "../commands/types";
import type { InspectorCommandProblem } from "../inspector/types";
import type { LightDefinition } from "./types";

export type LightingPresetId =
  | "conservative-key-light"
  | "soft-spotlight"
  | "point-shadow-preview"
  | "disable-all-shadows";

export interface LightingPresetResult {
  ok: boolean;
  commands: Command[];
  problem?: InspectorCommandProblem;
}

interface LightingPresetOptions {
  lightId?: string;
}

export function buildLightingPresetCommands(
  lights: Record<string, LightDefinition>,
  presetId: LightingPresetId,
  options: LightingPresetOptions = {}
): LightingPresetResult {
  switch (presetId) {
    case "conservative-key-light":
      return buildConservativeKeyLight(lights, options);
    case "soft-spotlight":
      return buildSoftSpotlight(lights, options);
    case "point-shadow-preview":
      return buildPointShadowPreview(lights, options);
    case "disable-all-shadows":
      return buildDisableAllShadows(lights);
    default:
      return unavailable("lighting-preset-unsupported", "Lighting preset is unsupported.");
  }
}

function buildConservativeKeyLight(lights: Record<string, LightDefinition>, options: LightingPresetOptions): LightingPresetResult {
  const existing = resolvePresetLight(lights, options.lightId, "directional");
  const lightId = existing?.id ?? options.lightId ?? "key-light";
  return {
    ok: true,
    commands: [{
      type: existing ? "update-light" : "add-light",
      ...(existing ? { lightId } : {}),
      ...(existing
        ? {
            patch: {
              intensity: 2,
              transform: { position: [4, 6, 4] },
              target: [0, 0, 0],
              shadow: {
                enabled: true,
                mapSize: { width: 1024, height: 1024 },
                bias: -0.0001,
                normalBias: 0.01,
                radius: 1,
                camera: { near: 0.5, far: 80, left: -8, right: 8, top: 8, bottom: -8 }
              }
            }
          }
        : {
            light: {
              id: lightId,
              kind: "directional",
              name: "Key light",
              intensity: 2,
              transform: { position: [4, 6, 4] },
              target: [0, 0, 0],
              shadow: {
                enabled: true,
                mapSize: { width: 1024, height: 1024 },
                bias: -0.0001,
                normalBias: 0.01,
                radius: 1,
                camera: { near: 0.5, far: 80, left: -8, right: 8, top: 8, bottom: -8 }
              }
            }
          })
    } as Command]
  };
}

function buildSoftSpotlight(lights: Record<string, LightDefinition>, options: LightingPresetOptions): LightingPresetResult {
  const existing = resolvePresetLight(lights, options.lightId, "spot");
  const lightId = existing?.id ?? options.lightId ?? "soft-spotlight";
  return {
    ok: true,
    commands: [{
      type: existing ? "update-light" : "add-light",
      ...(existing ? { lightId } : {}),
      ...(existing
        ? {
            patch: {
              intensity: 3,
              angle: Math.PI / 5,
              penumbra: 0.45,
              distance: 30,
              transform: { position: [2, 5, 3] },
              target: [0, 0, 0],
              shadow: {
                enabled: true,
                mapSize: { width: 1024, height: 1024 },
                bias: -0.0001,
                normalBias: 0.01,
                radius: 2,
                camera: { near: 0.5, far: 40 }
              }
            }
          }
        : {
            light: {
              id: lightId,
              kind: "spot",
              name: "Soft spotlight",
              intensity: 3,
              angle: Math.PI / 5,
              penumbra: 0.45,
              distance: 30,
              transform: { position: [2, 5, 3] },
              target: [0, 0, 0],
              shadow: {
                enabled: true,
                mapSize: { width: 1024, height: 1024 },
                bias: -0.0001,
                normalBias: 0.01,
                radius: 2,
                camera: { near: 0.5, far: 40 }
              }
            }
          })
    } as Command]
  };
}

function buildPointShadowPreview(lights: Record<string, LightDefinition>, options: LightingPresetOptions): LightingPresetResult {
  const existing = resolvePresetLight(lights, options.lightId, "point");
  const lightId = existing?.id ?? options.lightId ?? "point-shadow-preview";
  return {
    ok: true,
    problem: {
      code: "lighting-preset-point-shadow-cost",
      message: "Point light shadows render six map faces.",
      severity: "info"
    },
    commands: [{
      type: existing ? "update-light" : "add-light",
      ...(existing ? { lightId } : {}),
      ...(existing
        ? {
            patch: {
              intensity: 4,
              distance: 20,
              transform: { position: [0, 3, 0] },
              shadow: {
                enabled: true,
                mapSize: { width: 512, height: 512 },
                bias: -0.0001,
                normalBias: 0.01,
                radius: 1,
                camera: { near: 0.5, far: 25 }
              }
            }
          }
        : {
            light: {
              id: lightId,
              kind: "point",
              name: "Point shadow preview",
              intensity: 4,
              distance: 20,
              transform: { position: [0, 3, 0] },
              shadow: {
                enabled: true,
                mapSize: { width: 512, height: 512 },
                bias: -0.0001,
                normalBias: 0.01,
                radius: 1,
                camera: { near: 0.5, far: 25 }
              }
            }
          })
    } as Command]
  };
}

function buildDisableAllShadows(lights: Record<string, LightDefinition>): LightingPresetResult {
  const commands = Object.values(lights)
    .filter((light) => light.kind === "directional" || light.kind === "point" || light.kind === "spot")
    .filter((light) => light.shadow.enabled)
    .map((light): Command => ({
      type: "update-light",
      lightId: light.id,
      patch: {
        shadow: {
          ...light.shadow,
          enabled: false
        }
      }
    }));

  return { ok: true, commands };
}

function resolvePresetLight(
  lights: Record<string, LightDefinition>,
  lightId: string | undefined,
  kind: "directional" | "point" | "spot"
): LightDefinition | null {
  if (!lightId) {
    return Object.values(lights).find((light) => light.kind === kind) ?? null;
  }
  const light = lights[lightId];
  if (!light) {
    return null;
  }
  return light.kind === kind ? light : null;
}

function unavailable(code: string, message: string): LightingPresetResult {
  return {
    ok: false,
    commands: [],
    problem: {
      code,
      message,
      severity: "warning"
    }
  };
}

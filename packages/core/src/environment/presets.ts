import type { AddLightCommand, BatchCommand, SetEnvironmentCommand, UpdateLightCommand } from "../commands/types";
import { createLightDefinition } from "../lights/defaults";
import type { LightDefinition } from "../lights/types";
import { isColorString } from "../snapshot/primitives";
import type { AssetReference, SceneSnapshot } from "../snapshot/types";
import type { CubemapFaceReference, EnvironmentBackgroundSource, EnvironmentLightingSource } from "./types";
import { CUBEMAP_FACE_ROLES } from "./validation";

export type EnvironmentPresetCommand = SetEnvironmentCommand | BatchCommand;

export interface EnvironmentPresetProblem {
  code: "environment-preset-invalid";
  message: string;
  severity: "warning";
}

export type EnvironmentPresetResult =
  | { ok: true; command: EnvironmentPresetCommand }
  | { ok: false; problem: EnvironmentPresetProblem };

export interface EnvironmentConservativeLightOptions {
  ambientLightId?: string;
  directionalLightId?: string;
  ambientIntensity?: number;
  directionalIntensity?: number;
}

export function buildClearEnvironmentPreset(): EnvironmentPresetResult {
  return {
    ok: true,
    command: {
      type: "set-environment",
      environment: {
        lighting: { source: { kind: "none" }, intensity: 1, rotation: { x: 0, y: 0, z: 0 } },
        background: { source: { kind: "none" } }
      }
    }
  };
}

export function buildSolidBackgroundPreset(color: string): EnvironmentPresetResult {
  if (!isColorString(color)) {
    return invalidPreset("Solid background preset requires a #rrggbb or rgb(r, g, b) color string.");
  }
  return {
    ok: true,
    command: {
      type: "set-environment",
      environment: {
        background: { source: { kind: "solid", color } }
      }
    }
  };
}

export function buildEnvironmentLightingAssetPreset(asset: AssetReference): EnvironmentPresetResult {
  const source = lightingSourceForAsset(asset);
  if (!source) {
    return invalidPreset("Environment lighting preset requires an HDR, texture, or image asset.");
  }
  return {
    ok: true,
    command: {
      type: "set-environment",
      environment: { lighting: { source } }
    }
  };
}

export function buildEnvironmentBackgroundAssetPreset(asset: AssetReference, options: { equirectangular?: boolean } = {}): EnvironmentPresetResult {
  const source = backgroundSourceForAsset(asset, options);
  if (!source) {
    return invalidPreset("Environment background preset requires an HDR, texture, or image asset.");
  }
  return {
    ok: true,
    command: {
      type: "set-environment",
      environment: { background: { source } }
    }
  };
}

export function buildEnvironmentSharedAssetPreset(asset: AssetReference): EnvironmentPresetResult {
  const lighting = lightingSourceForAsset(asset);
  const background = backgroundSourceForAsset(asset, { equirectangular: asset.kind !== "hdr" });
  if (!lighting || !background) {
    return invalidPreset("Shared environment preset requires an HDR, texture, or image asset.");
  }
  return {
    ok: true,
    command: {
      type: "set-environment",
      environment: {
        lighting: { source: lighting },
        background: { source: background }
      }
    }
  };
}

export function buildEnvironmentCubemapPreset(faces: CubemapFaceReference[], target: "background" | "lighting" | "both" = "both"): EnvironmentPresetResult {
  const invalid = validateCubemapFaces(faces);
  if (invalid) {
    return invalidPreset(invalid);
  }
  const source = { kind: "cubemap" as const, faces: faces.map((face) => ({ ...face })) };
  const environment: {
    lighting?: { source: EnvironmentLightingSource };
    background?: { source: EnvironmentBackgroundSource };
  } = {};
  if (target === "lighting" || target === "both") {
    environment.lighting = { source };
  }
  if (target === "background" || target === "both") {
    environment.background = { source };
  }
  return {
    ok: true,
    command: {
      type: "set-environment",
      environment
    }
  };
}

export function buildEnvironmentWithConservativeLightsPreset(
  snapshot: SceneSnapshot,
  environmentCommand: SetEnvironmentCommand,
  options: EnvironmentConservativeLightOptions = {}
): EnvironmentPresetResult {
  const ambientLightId = options.ambientLightId ?? "environment-ambient-light";
  const directionalLightId = options.directionalLightId ?? "environment-key-light";
  const commands: BatchCommand["commands"] = [environmentCommand];

  commands.push(upsertLightCommand(snapshot, ambientLightId, {
    id: ambientLightId,
    kind: "ambient",
    name: "Ambient fill",
    color: "#ffffff",
    intensity: options.ambientIntensity ?? 0.35
  }));
  commands.push(upsertLightCommand(snapshot, directionalLightId, {
    ...createLightDefinition("directional", {
      id: directionalLightId,
      name: "Key light",
      color: "#ffffff",
      intensity: options.directionalIntensity ?? 1,
      transform: { position: [0, 4, 4] },
      target: [0, 0, 0]
    })
  }));

  return {
    ok: true,
    command: {
      type: "batch",
      label: "environment-conservative-lights",
      commands
    }
  };
}

function lightingSourceForAsset(asset: AssetReference): EnvironmentLightingSource | null {
  if (asset.kind === "hdr") {
    return { kind: "hdr", assetId: asset.id };
  }
  if (asset.kind === "texture" || asset.kind === "image") {
    return { kind: "equirectangular", assetId: asset.id };
  }
  return null;
}

function backgroundSourceForAsset(asset: AssetReference, options: { equirectangular?: boolean } = {}): EnvironmentBackgroundSource | null {
  if (asset.kind === "hdr") {
    return { kind: "hdr", assetId: asset.id };
  }
  if (asset.kind === "texture" || asset.kind === "image") {
    return { kind: options.equirectangular ? "equirectangular" : "flat-image", assetId: asset.id };
  }
  return null;
}

function validateCubemapFaces(faces: CubemapFaceReference[]): string | null {
  if (faces.length !== CUBEMAP_FACE_ROLES.length) {
    return "Cubemap preset requires exactly six faces.";
  }
  const seen = new Set<string>();
  for (const face of faces) {
    if (!CUBEMAP_FACE_ROLES.includes(face.role)) {
      return "Cubemap preset contains an unsupported face role.";
    }
    if (seen.has(face.role)) {
      return "Cubemap preset face roles must not be duplicated.";
    }
    if (!face.assetId) {
      return "Cubemap preset face asset IDs must be non-empty.";
    }
    seen.add(face.role);
  }
  return null;
}

function upsertLightCommand(
  snapshot: SceneSnapshot,
  lightId: string,
  light: LightDefinition
): AddLightCommand | UpdateLightCommand {
  return snapshot.lights[lightId]
    ? { type: "update-light", lightId, patch: light }
    : { type: "add-light", light };
}

function invalidPreset(message: string): { ok: false; problem: EnvironmentPresetProblem } {
  return {
    ok: false,
    problem: {
      code: "environment-preset-invalid",
      message,
      severity: "warning"
    }
  };
}

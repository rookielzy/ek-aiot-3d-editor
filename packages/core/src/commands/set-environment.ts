import { createDefaultEnvironment } from "../environment/defaults";
import { migrateLegacySceneEnvironment } from "../environment/migration";
import type {
  EnvironmentBackgroundSource,
  EnvironmentLightingSource,
  EnvironmentRotation,
  LegacySceneEnvironment,
  SceneEnvironment
} from "../environment/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { LegacySceneEnvironmentPatch, SceneEnvironmentPatch, SetEnvironmentCommand } from "./types";

export function applySetEnvironment(snapshot: SceneSnapshot, command: SetEnvironmentCommand): SceneSnapshot {
  const base = snapshot.environment ?? createDefaultEnvironment();
  const patch = normalizeEnvironmentPatch(base, command.environment);
  const { rotation: _patchBackgroundRotation, ...backgroundPatch } = patch.background ?? {};
  const backgroundRotation: EnvironmentRotation | undefined = patch.background?.rotation
    ? { ...(base.background.rotation ?? { x: 0, y: 0, z: 0 }), ...patch.background.rotation }
    : base.background.rotation;
  const next: SceneEnvironment = {
    ...base,
    lighting: {
      ...base.lighting,
      ...patch.lighting,
      source: patch.lighting?.source ?? base.lighting.source,
      rotation: patch.lighting?.rotation
        ? { ...base.lighting.rotation, ...patch.lighting.rotation }
        : base.lighting.rotation
    },
    background: {
      ...base.background,
      ...backgroundPatch,
      source: patch.background?.source ?? base.background.source,
      ...(backgroundRotation ? { rotation: backgroundRotation } : {})
    },
    ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {})
  };
  cleanBackgroundForSource(next);

  return {
    ...snapshot,
    environment: next
  };
}

export function normalizeEnvironmentPatch(
  base: SceneEnvironment,
  patch: SceneEnvironmentPatch | LegacySceneEnvironmentPatch
): SceneEnvironmentPatch {
  if (isLegacyPatch(patch)) {
    return normalizeLegacyEnvironmentPatch(base, patch);
  }
  return patch;
}

function isLegacyPatch(patch: SceneEnvironmentPatch | LegacySceneEnvironmentPatch): patch is LegacySceneEnvironmentPatch {
  return "mode" in patch || "environment" in patch || Boolean(patch.background && "mode" in patch.background);
}

function normalizeLegacyEnvironmentPatch(base: SceneEnvironment, patch: LegacySceneEnvironmentPatch): SceneEnvironmentPatch {
  assertSupportedLegacyMode(patch.mode, "Environment mode");
  assertSupportedLegacyMode(patch.background?.mode, "Environment background mode");

  const legacyBase = toLegacyEnvironment(base);
  const nextMode = patch.mode ?? legacyBase.mode;
  const nextBackgroundMode = patch.background?.mode ?? legacyBase.background.mode;
  const mergedBackground = {
    ...legacyBase.background,
    ...patch.background,
    mode: nextBackgroundMode,
    rotation: patch.background?.rotation
      ? { ...(legacyBase.background.rotation ?? { x: 0, y: 0, z: 0 }), ...patch.background.rotation }
      : legacyBase.background.rotation
  };
  const merged: LegacySceneEnvironment = {
    ...legacyBase,
    ...patch,
    mode: nextMode,
    background: mergedBackground,
    environment: {
      ...legacyBase.environment,
      ...patch.environment,
      rotation: patch.environment?.rotation
        ? { ...legacyBase.environment.rotation, ...patch.environment.rotation }
        : legacyBase.environment.rotation
    }
  };

  cleanLegacyEnvironmentForMode(merged);
  preserveRequiredLegacyPlaceholders(merged);
  return legacyToPatch(migrateLegacySceneEnvironment(merged));
}

function assertSupportedLegacyMode(mode: unknown, label: string): void {
  if (mode === undefined || mode === "none" || mode === "solid" || mode === "texture" || mode === "hdr") {
    return;
  }
  throw new Error(`${label} is unsupported.`);
}

function toLegacyEnvironment(environment: SceneEnvironment): LegacySceneEnvironment {
  return {
    mode: lightingSourceToLegacyMode(environment.lighting.source),
    background: {
      mode: backgroundSourceToLegacyMode(environment.background.source),
      ...backgroundSourceToLegacyFields(environment.background.source),
      ...("intensity" in environment.background ? { intensity: environment.background.intensity } : {}),
      ...("blur" in environment.background ? { blur: environment.background.blur } : {}),
      ...(environment.background.rotation ? { rotation: environment.background.rotation } : {})
    },
    environment: {
      ...lightingSourceToLegacyFields(environment.lighting.source),
      intensity: environment.lighting.intensity,
      rotation: environment.lighting.rotation
    },
    ...(environment.metadata ? { metadata: environment.metadata } : {})
  };
}

function legacyToPatch(environment: SceneEnvironment): SceneEnvironmentPatch {
  return {
    lighting: {
      source: environment.lighting.source,
      intensity: environment.lighting.intensity,
      rotation: environment.lighting.rotation
    },
    background: {
      source: environment.background.source,
      ...("intensity" in environment.background ? { intensity: environment.background.intensity } : {}),
      ...("blur" in environment.background ? { blur: environment.background.blur } : {}),
      ...(environment.background.rotation ? { rotation: environment.background.rotation } : {})
    },
    ...(environment.metadata ? { metadata: environment.metadata } : {})
  };
}

function lightingSourceToLegacyMode(source: EnvironmentLightingSource): LegacySceneEnvironment["mode"] {
  switch (source.kind) {
    case "equirectangular":
      return "texture";
    case "hdr":
      return "hdr";
    case "cubemap":
    case "none":
      return "none";
  }
}

function lightingSourceToLegacyFields(source: EnvironmentLightingSource): Partial<LegacySceneEnvironment["environment"]> {
  if (source.kind === "equirectangular" || source.kind === "hdr") {
    return { assetId: source.assetId };
  }
  return {};
}

function backgroundSourceToLegacyMode(source: EnvironmentBackgroundSource): LegacySceneEnvironment["background"]["mode"] {
  switch (source.kind) {
    case "solid":
      return "solid";
    case "flat-image":
    case "equirectangular":
      return "texture";
    case "hdr":
      return "hdr";
    case "cubemap":
    case "none":
      return "none";
  }
}

function backgroundSourceToLegacyFields(source: EnvironmentBackgroundSource): Partial<LegacySceneEnvironment["background"]> {
  switch (source.kind) {
    case "solid":
      return { color: source.color };
    case "flat-image":
    case "equirectangular":
    case "hdr":
      return { assetId: source.assetId };
    case "cubemap":
    case "none":
      return {};
  }
}

function cleanLegacyEnvironmentForMode(environment: LegacySceneEnvironment): void {
  if (environment.mode === "none" || environment.mode === "solid") {
    delete environment.environment.assetId;
  }

  if (environment.background.mode === "none") {
    delete environment.background.assetId;
    delete environment.background.color;
    delete environment.background.intensity;
    delete environment.background.blur;
    delete environment.background.rotation;
    return;
  }

  if (environment.background.mode === "solid") {
    delete environment.background.assetId;
    delete environment.background.blur;
  }
}

function preserveRequiredLegacyPlaceholders(environment: LegacySceneEnvironment): void {
  if ((environment.mode === "texture" || environment.mode === "hdr") && !environment.environment.assetId) {
    environment.environment.assetId = "missing";
  }
  if ((environment.background.mode === "texture" || environment.background.mode === "hdr") && !environment.background.assetId) {
    environment.background.assetId = "missing";
  }
}

function cleanBackgroundForSource(environment: SceneEnvironment): void {
  if (environment.background.source.kind === "none") {
    delete environment.background.intensity;
    delete environment.background.blur;
    delete environment.background.rotation;
    return;
  }

  if (environment.background.source.kind === "solid") {
    delete environment.background.blur;
  }
}

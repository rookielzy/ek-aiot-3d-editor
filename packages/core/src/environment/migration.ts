import type {
  EnvironmentBackgroundSource,
  EnvironmentLightingSource,
  LegacySceneEnvironment,
  SceneEnvironment
} from "./types";

export function createLegacyDefaultEnvironment(): LegacySceneEnvironment {
  return {
    mode: "none",
    background: {
      mode: "none"
    },
    environment: {
      intensity: 1,
      rotation: { x: 0, y: 0, z: 0 }
    }
  };
}

export function migrateLegacySceneEnvironment(value: LegacySceneEnvironment | SceneEnvironment | undefined): SceneEnvironment {
  if (!value) {
    value = createLegacyDefaultEnvironment();
  }

  if ("lighting" in value && value.lighting && "source" in value.lighting) {
    return value;
  }

  const legacy = value as LegacySceneEnvironment;
  return {
    lighting: {
      source: migrateLegacyLightingSource(legacy),
      intensity: legacy.environment?.intensity ?? 1,
      rotation: legacy.environment?.rotation ?? { x: 0, y: 0, z: 0 }
    },
    background: {
      source: migrateLegacyBackgroundSource(legacy),
      ...("intensity" in legacy.background ? { intensity: legacy.background.intensity } : {}),
      ...("blur" in legacy.background ? { blur: legacy.background.blur } : {}),
      ...(legacy.background.rotation ? { rotation: legacy.background.rotation } : {})
    },
    ...(legacy.metadata ? { metadata: legacy.metadata } : {})
  };
}

function migrateLegacyLightingSource(environment: LegacySceneEnvironment): EnvironmentLightingSource {
  if (environment.mode === "texture" && environment.environment.assetId) {
    return { kind: "equirectangular", assetId: environment.environment.assetId };
  }

  if (environment.mode === "hdr" && environment.environment.assetId) {
    return { kind: "hdr", assetId: environment.environment.assetId };
  }

  return { kind: "none" };
}

function migrateLegacyBackgroundSource(environment: LegacySceneEnvironment): EnvironmentBackgroundSource {
  const background = environment.background;
  if (background.mode === "solid") {
    return { kind: "solid", color: background.color ?? "#000000" };
  }

  if (background.mode === "texture" && background.assetId) {
    return { kind: "flat-image", assetId: background.assetId };
  }

  if (background.mode === "hdr" && background.assetId) {
    return { kind: "hdr", assetId: background.assetId };
  }

  return { kind: "none" };
}

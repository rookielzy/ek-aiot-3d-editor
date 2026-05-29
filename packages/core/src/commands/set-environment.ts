import { createDefaultEnvironment } from "../environment/defaults";
import type { SceneEnvironment } from "../environment/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { SetEnvironmentCommand } from "./types";

export function applySetEnvironment(snapshot: SceneSnapshot, command: SetEnvironmentCommand): SceneSnapshot {
  const base = snapshot.environment ?? createDefaultEnvironment();
  const patch = command.environment;
  const mode = patch.mode ?? base.mode;
  const { rotation: backgroundRotationPatch, ...backgroundPatch } = patch.background ?? {};
  const background: SceneEnvironment["background"] = {
    ...base.background,
    ...backgroundPatch
  };
  if (backgroundRotationPatch) {
    background.rotation = {
      ...(base.background.rotation ?? { x: 0, y: 0, z: 0 }),
      ...backgroundRotationPatch
    };
  }

  const next: SceneEnvironment = {
    ...base,
    ...patch,
    background,
    environment: {
      ...base.environment,
      ...patch.environment,
      rotation: patch.environment?.rotation
        ? { ...base.environment.rotation, ...patch.environment.rotation }
        : base.environment.rotation
    }
  };
  cleanEnvironmentForMode(next, mode);
  cleanBackgroundForMode(next);

  return {
    ...snapshot,
    environment: next
  };
}

function cleanEnvironmentForMode(environment: SceneEnvironment, mode: SceneEnvironment["mode"]): void {
  environment.mode = mode;

  if (mode === "none" || mode === "solid") {
    delete environment.environment.assetId;
  }
}

function cleanBackgroundForMode(environment: SceneEnvironment): void {
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

import { createTransform } from "../snapshot/defaults";
import type { LightDefinition } from "../lights/types";
import type { SceneSnapshot } from "../snapshot/types";
import type { UpdateLightCommand } from "./types";

export function applyUpdateLight(snapshot: SceneSnapshot, command: UpdateLightCommand): SceneSnapshot {
  const light = snapshot.lights[command.lightId];
  if (!light) {
    throw new Error(`Light ${command.lightId} does not exist.`);
  }
  if (command.patch.kind && command.patch.kind !== light.kind) {
    throw new Error("Light kind cannot be changed by update-light.");
  }

  const next = normalizeUpdatedLight({ ...light, ...command.patch } as LightDefinition);

  return {
    ...snapshot,
    lights: {
      ...snapshot.lights,
      [command.lightId]: next
    }
  };
}

function normalizeUpdatedLight(light: LightDefinition): LightDefinition {
  switch (light.kind) {
    case "ambient":
    case "hemisphere":
      return light;
    case "directional":
    case "point":
    case "spot":
      return {
        ...light,
        transform: createTransform(light.transform)
      };
    default:
      return assertNever(light);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported light: ${JSON.stringify(value)}`);
}

import { createLightDefinition } from "../lights/defaults";
import type { LightDefinition } from "../lights/types";
import { addLightNode } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import type { AddLightCommand } from "./types";

export function applyAddLight(snapshot: SceneSnapshot, command: AddLightCommand): SceneSnapshot {
  const light = createLightDefinition(command.light.kind, command.light as Partial<LightDefinition>);

  if (snapshot.lights[light.id]) {
    throw new Error(`Light ${light.id} already exists.`);
  }

  const nextSnapshot = {
    ...snapshot,
    lights: {
      ...snapshot.lights,
      [light.id]: light
    }
  };

  return {
    ...nextSnapshot,
    ...addLightNode(nextSnapshot, light)
  };
}

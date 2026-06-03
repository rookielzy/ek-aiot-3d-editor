import { removeNodeForLight } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import type { RemoveLightCommand } from "./types";

export function applyRemoveLight(snapshot: SceneSnapshot, command: RemoveLightCommand): SceneSnapshot {
  if (!snapshot.lights[command.lightId]) {
    throw new Error(`Light ${command.lightId} does not exist.`);
  }

  const { [command.lightId]: _removed, ...lights } = snapshot.lights;
  const nodes = removeNodeForLight(snapshot, command.lightId);
  return {
    ...snapshot,
    lights,
    ...nodes
  };
}

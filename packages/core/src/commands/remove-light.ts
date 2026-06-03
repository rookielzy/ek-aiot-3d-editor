import { findLightNodeId } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import { applyDeleteNodes } from "./delete-nodes";
import type { RemoveLightCommand } from "./types";

export function applyRemoveLight(snapshot: SceneSnapshot, command: RemoveLightCommand): SceneSnapshot {
  if (!snapshot.lights[command.lightId]) {
    throw new Error(`Light ${command.lightId} does not exist.`);
  }

  const nodeId = findLightNodeId(snapshot, command.lightId);
  if (!nodeId) {
    throw new Error(`Light ${command.lightId} does not have a scene node.`);
  }

  return applyDeleteNodes(snapshot, { type: "delete-nodes", nodeIds: [nodeId] });
}

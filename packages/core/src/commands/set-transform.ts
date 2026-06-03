import { findObjectNodeId } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import { applySetNodeTransform } from "./set-node-transform";
import type { SetTransformCommand } from "./types";

export function applySetTransform(snapshot: SceneSnapshot, command: SetTransformCommand): SceneSnapshot {
  if (!snapshot.objects[command.objectId]) {
    throw new Error(`Object ${command.objectId} does not exist.`);
  }

  const nodeId = findObjectNodeId(snapshot, command.objectId);
  if (!nodeId) {
    throw new Error(`Object ${command.objectId} does not have a scene node.`);
  }

  return applySetNodeTransform(snapshot, {
    type: "set-node-transform",
    nodeId,
    transform: command.transform
  });
}

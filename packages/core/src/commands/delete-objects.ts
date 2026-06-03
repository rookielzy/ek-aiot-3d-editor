import { getSelectedObjectIds } from "../selection/selection";
import { findObjectNodeId } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import { applyDeleteNodes } from "./delete-nodes";
import type { DeleteObjectsCommand } from "./types";

export function applyDeleteObjects(snapshot: SceneSnapshot, command: DeleteObjectsCommand): SceneSnapshot {
  const targetIds = command.objectIds ?? getSelectedObjectIds(snapshot);
  if (targetIds.length === 0) {
    return snapshot;
  }

  for (const objectId of targetIds) {
    if (!snapshot.objects[objectId]) {
      throw new Error(`Object ${objectId} does not exist.`);
    }
  }

  const nodeIds = targetIds.map((objectId) => {
    const nodeId = findObjectNodeId(snapshot, objectId);
    if (!nodeId) {
      throw new Error(`Object ${objectId} does not have a scene node.`);
    }
    return nodeId;
  });

  return applyDeleteNodes(snapshot, { type: "delete-nodes", nodeIds });
}

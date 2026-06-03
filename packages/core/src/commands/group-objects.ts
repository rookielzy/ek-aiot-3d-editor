import { getSelectedObjectIds, getTopLevelSelectedObjectIds } from "../selection/selection";
import { isNodeAncestorOf, reparentNode } from "../snapshot/hierarchy";
import { findObjectNodeId } from "../snapshot/nodes";
import { getLocalNodeTransformForParent } from "../snapshot/transforms";
import type { SceneSnapshot } from "../snapshot/types";
import { normalizeSelectionFromNodeIds, setNodeTransformInSnapshot, syncPayloadsFromNodes } from "./node-state";
import type { GroupObjectsCommand } from "./types";

export function applyGroupObjects(snapshot: SceneSnapshot, command: GroupObjectsCommand): SceneSnapshot {
  const selectedIds = command.objectIds ?? getSelectedObjectIds(snapshot);
  const primaryObjectId = command.primaryObjectId ?? snapshot.selection.objectId;
  if (!primaryObjectId) {
    throw new Error("Group requires a primary selected object.");
  }
  if (!snapshot.objects[primaryObjectId]) {
    throw new Error(`Object ${primaryObjectId} does not exist.`);
  }

  const topLevelIds = getTopLevelSelectedObjectIds(snapshot, selectedIds);
  if (!topLevelIds.includes(primaryObjectId)) {
    throw new Error("Group primary object must be a top-level selected object.");
  }
  if (topLevelIds.length < 2) {
    return snapshot;
  }

  const primaryNodeId = findObjectNodeId(snapshot, primaryObjectId);
  if (!primaryNodeId) {
    throw new Error(`Object ${primaryObjectId} does not have a scene node.`);
  }

  let nextSnapshot = snapshot;
  for (const objectId of topLevelIds) {
    if (objectId === primaryObjectId) {
      continue;
    }
    const nodeId = findObjectNodeId(nextSnapshot, objectId);
    if (!nodeId) {
      throw new Error(`Object ${objectId} does not have a scene node.`);
    }
    if (isNodeAncestorOf(nextSnapshot, nodeId, primaryNodeId)) {
      throw new Error("Group cannot create an ancestor cycle.");
    }
    const transform = getLocalNodeTransformForParent(nextSnapshot, nodeId, primaryNodeId);
    const nodeState = reparentNode(nextSnapshot.nodes, nextSnapshot.rootNodeIds, nodeId, primaryNodeId);
    nextSnapshot = syncPayloadsFromNodes({
      ...nextSnapshot,
      nodes: nodeState.nodes,
      rootNodeIds: nodeState.rootNodeIds
    });
    nextSnapshot = setNodeTransformInSnapshot(nextSnapshot, nodeId, transform);
  }

  return {
    ...nextSnapshot,
    selection: normalizeSelectionFromNodeIds(
      nextSnapshot,
      topLevelIds.map((objectId) => {
        const nodeId = findObjectNodeId(nextSnapshot, objectId);
        if (!nodeId) {
          throw new Error(`Object ${objectId} does not have a scene node.`);
        }
        return nodeId;
      }),
      primaryNodeId
    )
  };
}

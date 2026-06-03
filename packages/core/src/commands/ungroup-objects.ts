import type { SceneSnapshot } from "../snapshot/types";
import { reparentNode } from "../snapshot/hierarchy";
import { findObjectNodeId } from "../snapshot/nodes";
import { getLocalNodeTransformForParent } from "../snapshot/transforms";
import { normalizeSelectionFromNodeIds, setNodeTransformInSnapshot, syncPayloadsFromNodes } from "./node-state";
import type { UngroupObjectsCommand } from "./types";

export function applyUngroupObjects(snapshot: SceneSnapshot, command: UngroupObjectsCommand): SceneSnapshot {
  const objectId = command.objectId ?? snapshot.selection.objectId;
  if (!objectId) {
    throw new Error("Ungroup requires a selected object.");
  }
  const object = snapshot.objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }
  if (object.children.length === 0) {
    return snapshot;
  }

  const nodeId = findObjectNodeId(snapshot, objectId);
  if (!nodeId) {
    throw new Error(`Object ${objectId} does not have a scene node.`);
  }
  const node = snapshot.nodes[nodeId];
  const ungroupedNodeIds = object.children.map((childId) => {
    const childNodeId = findObjectNodeId(snapshot, childId);
    if (!childNodeId) {
      throw new Error(`Object ${childId} does not have a scene node.`);
    }
    return childNodeId;
  });

  let nextSnapshot = snapshot;
  const parentNodeId = node.parentId;
  for (const childId of object.children) {
    const childNodeId = findObjectNodeId(nextSnapshot, childId);
    if (!childNodeId) {
      throw new Error(`Object ${childId} does not have a scene node.`);
    }
    const transform = getLocalNodeTransformForParent(nextSnapshot, childNodeId, parentNodeId);
    const nodeState = reparentNode(nextSnapshot.nodes, nextSnapshot.rootNodeIds, childNodeId, parentNodeId);
    nextSnapshot = syncPayloadsFromNodes({
      ...nextSnapshot,
      nodes: nodeState.nodes,
      rootNodeIds: nodeState.rootNodeIds
    });
    nextSnapshot = setNodeTransformInSnapshot(nextSnapshot, childNodeId, transform);
  }

  return {
    ...nextSnapshot,
    selection: normalizeSelectionFromNodeIds(nextSnapshot, ungroupedNodeIds, ungroupedNodeIds[0] ?? null)
  };
}

import { normalizeNodeSelection } from "../selection/selection";
import { reparentNode } from "../snapshot/hierarchy";
import { getLocalNodeTransformForParent } from "../snapshot/transforms";
import type { SceneSnapshot } from "../snapshot/types";
import { nodeSupportsTransform, setNodeTransformInSnapshot, syncPayloadsFromNodes } from "./node-state";
import type { UngroupNodesCommand } from "./types";

export function applyUngroupNodes(snapshot: SceneSnapshot, command: UngroupNodesCommand): SceneSnapshot {
  const nodeId = command.nodeId ?? snapshot.selection.nodeId;
  if (!nodeId) {
    throw new Error("Ungroup requires a selected node.");
  }
  const node = snapshot.nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} does not exist.`);
  }
  if (node.kind !== "group") {
    throw new Error(`Node ${nodeId} is not a group node.`);
  }
  if (node.children.length === 0) {
    return snapshot;
  }

  const ungroupedNodeIds = [...node.children];
  let nextSnapshot = snapshot;
  for (const childId of ungroupedNodeIds) {
    const child = nextSnapshot.nodes[childId];
    const transform = command.preserveWorldTransform && child && nodeSupportsTransform(nextSnapshot, child)
      ? getLocalNodeTransformForParent(nextSnapshot, childId, node.parentId)
      : null;
    const nodeState = reparentNode(nextSnapshot.nodes, nextSnapshot.rootNodeIds, childId, node.parentId);
    nextSnapshot = syncPayloadsFromNodes({
      ...nextSnapshot,
      nodes: nodeState.nodes,
      rootNodeIds: nodeState.rootNodeIds
    });
    if (transform) {
      nextSnapshot = setNodeTransformInSnapshot(nextSnapshot, childId, transform);
    }
  }

  return {
    ...nextSnapshot,
    selection: normalizeNodeSelection(nextSnapshot, {
      mode: "replace",
      nodeIds: ungroupedNodeIds,
      primaryNodeId: ungroupedNodeIds[0] ?? null
    })
  };
}

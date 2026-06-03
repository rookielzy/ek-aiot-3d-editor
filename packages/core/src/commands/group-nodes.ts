import { getSelectedNodeIds, normalizeNodeSelection } from "../selection/selection";
import { createId, createTransform } from "../snapshot/defaults";
import { getTopLevelNodeIds, reparentNode } from "../snapshot/hierarchy";
import { getLocalNodeTransformForParent } from "../snapshot/transforms";
import type { SceneGroupNode, SceneSnapshot } from "../snapshot/types";
import { nodeSupportsTransform, setNodeTransformInSnapshot, syncPayloadsFromNodes } from "./node-state";
import type { GroupNodesCommand } from "./types";

export function applyGroupNodes(snapshot: SceneSnapshot, command: GroupNodesCommand): SceneSnapshot {
  const selectedNodeIds = command.nodeIds ?? getSelectedNodeIds(snapshot);
  const topLevelNodeIds = getTopLevelNodeIds(snapshot, selectedNodeIds);
  const primaryNodeId = command.primaryNodeId ?? snapshot.selection.nodeId ?? topLevelNodeIds[0] ?? null;

  if (!primaryNodeId) {
    throw new Error("Group requires a primary selected node.");
  }
  if (!topLevelNodeIds.includes(primaryNodeId)) {
    throw new Error("Group primary node must be a top-level selected node.");
  }
  if (topLevelNodeIds.length < 1) {
    return snapshot;
  }
  if (command.parentId && !snapshot.nodes[command.parentId]) {
    throw new Error(`Parent node ${command.parentId} does not exist.`);
  }

  const groupNodeId = command.nodeId ?? createId("group");
  if (snapshot.nodes[groupNodeId]) {
    throw new Error(`Node ${groupNodeId} already exists.`);
  }

  const parentId = command.parentId ?? snapshot.nodes[primaryNodeId]?.parentId ?? null;
  const groupNode: SceneGroupNode = {
    id: groupNodeId,
    kind: "group",
    name: command.name ?? "Group",
    parentId: null,
    children: [],
    transform: createTransform(command.transform),
    ...(command.metadata ? { metadata: { ...command.metadata } } : {})
  };

  let nextSnapshot: SceneSnapshot = {
    ...snapshot,
    nodes: {
      ...snapshot.nodes,
      [groupNodeId]: groupNode
    },
    rootNodeIds: [...snapshot.rootNodeIds, groupNodeId]
  };

  const groupState = reparentNode(nextSnapshot.nodes, nextSnapshot.rootNodeIds, groupNodeId, parentId);
  nextSnapshot = {
    ...nextSnapshot,
    nodes: groupState.nodes,
    rootNodeIds: groupState.rootNodeIds
  };

  for (const nodeId of topLevelNodeIds) {
    const transform = shouldPreserveWorldTransform(nextSnapshot, nodeId, command)
      ? getLocalNodeTransformForParent(nextSnapshot, nodeId, groupNodeId)
      : null;
    const nodeState = reparentNode(nextSnapshot.nodes, nextSnapshot.rootNodeIds, nodeId, groupNodeId);
    nextSnapshot = syncPayloadsFromNodes({
      ...nextSnapshot,
      nodes: nodeState.nodes,
      rootNodeIds: nodeState.rootNodeIds
    });
    if (transform) {
      nextSnapshot = setNodeTransformInSnapshot(nextSnapshot, nodeId, transform);
    }
  }

  return {
    ...nextSnapshot,
    selection: normalizeNodeSelection(nextSnapshot, { mode: "replace", nodeId: groupNodeId })
  };
}

function shouldPreserveWorldTransform(snapshot: SceneSnapshot, nodeId: string, command: GroupNodesCommand): boolean {
  if (command.preserveWorldTransform === false) {
    return false;
  }
  const node = snapshot.nodes[nodeId];
  return Boolean(node && nodeSupportsTransform(snapshot, node));
}

import { reparentNode } from "../snapshot/hierarchy";
import { getLocalNodeTransformForParent } from "../snapshot/transforms";
import type { SceneSnapshot, Transform } from "../snapshot/types";
import { nodeSupportsTransform, setNodeTransformInSnapshot, syncPayloadsFromNodes } from "./node-state";
import type { ReparentNodeCommand } from "./types";

export function applyReparentNode(snapshot: SceneSnapshot, command: ReparentNodeCommand): SceneSnapshot {
  const node = snapshot.nodes[command.nodeId];
  if (!node) {
    throw new Error(`Node ${command.nodeId} does not exist.`);
  }
  if (command.parentId && !snapshot.nodes[command.parentId]) {
    throw new Error(`Parent node ${command.parentId} does not exist.`);
  }

  const transform = resolveReparentTransform(snapshot, command);
  const nodeState = reparentNode(snapshot.nodes, snapshot.rootNodeIds, command.nodeId, command.parentId);
  let nextSnapshot = syncPayloadsFromNodes({
    ...snapshot,
    nodes: nodeState.nodes,
    rootNodeIds: nodeState.rootNodeIds
  });

  if (transform) {
    nextSnapshot = setNodeTransformInSnapshot(nextSnapshot, command.nodeId, transform);
  }

  return nextSnapshot;
}

function resolveReparentTransform(snapshot: SceneSnapshot, command: ReparentNodeCommand): Transform | null {
  const node = snapshot.nodes[command.nodeId];
  if (!node) {
    return null;
  }
  if (!nodeSupportsTransform(snapshot, node)) {
    if (command.transform || command.preserveWorldTransform) {
      throw new Error(`Node ${command.nodeId} does not support transforms.`);
    }
    return null;
  }

  if (command.transform) {
    return command.transform;
  }
  if (command.preserveWorldTransform) {
    return getLocalNodeTransformForParent(snapshot, command.nodeId, command.parentId);
  }
  return null;
}

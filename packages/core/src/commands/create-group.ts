import { normalizeNodeSelection, selectionEquals } from "../selection/selection";
import { createId, createTransform } from "../snapshot/defaults";
import { reparentNode } from "../snapshot/hierarchy";
import { cloneTransform, normalizeTransform } from "../snapshot/transforms";
import type { SceneGroupNode, SceneSnapshot } from "../snapshot/types";
import type { CreateGroupCommand } from "./types";

export function applyCreateGroup(snapshot: SceneSnapshot, command: CreateGroupCommand): SceneSnapshot {
  const nodeId = command.nodeId ?? createId("group");
  const parentId = command.parentId ?? null;

  if (snapshot.nodes[nodeId]) {
    throw new Error(`Node ${nodeId} already exists.`);
  }
  if (parentId && !snapshot.nodes[parentId]) {
    throw new Error(`Parent node ${parentId} does not exist.`);
  }

  const group: SceneGroupNode = {
    id: nodeId,
    kind: "group",
    name: command.name ?? "Group",
    parentId: null,
    children: [],
    transform: cloneTransform(normalizeTransform(command.transform ?? createTransform())),
    ...(command.metadata ? { metadata: { ...command.metadata } } : {})
  };

  const withGroup: SceneSnapshot = {
    ...snapshot,
    nodes: {
      ...snapshot.nodes,
      [nodeId]: group
    },
    rootNodeIds: [...snapshot.rootNodeIds, nodeId]
  };
  const nodeState = parentId
    ? reparentNode(withGroup.nodes, withGroup.rootNodeIds, nodeId, parentId)
    : { nodes: withGroup.nodes, rootNodeIds: withGroup.rootNodeIds };
  const nextSnapshot = {
    ...withGroup,
    ...nodeState
  };

  if (!command.select) {
    return nextSnapshot;
  }

  const selection = normalizeNodeSelection(nextSnapshot, { mode: "replace", nodeId });
  return selectionEquals(nextSnapshot.selection, selection)
    ? nextSnapshot
    : { ...nextSnapshot, selection };
}

import { createImportedGlbNodesFromManifest } from "../imported-targets/create";
import { collectNodeSubtreeIds, removeNodesFromHierarchy } from "../snapshot/hierarchy";
import type { SceneSnapshot } from "../snapshot/types";
import { syncPayloadsFromNodes } from "./node-state";
import type { CreateImportedGlbTargetsCommand } from "./types";

export function applyCreateImportedGlbTargets(
  snapshot: SceneSnapshot,
  command: CreateImportedGlbTargetsCommand
): SceneSnapshot {
  const object = snapshot.objects[command.ownerObjectId];
  if (!object) {
    throw new Error(`Owner object ${command.ownerObjectId} does not exist.`);
  }
  if (object.kind !== "glb") {
    throw new Error(`Owner object ${command.ownerObjectId} must be GLB-backed.`);
  }

  const { ownerNode, nodes: importedNodes } = createImportedGlbNodesFromManifest(snapshot, command.ownerObjectId);
  if (!command.replaceExisting && ownerNode.children.some((childId) => snapshot.nodes[childId]?.kind === "imported")) {
    throw new Error(`Owner object ${command.ownerObjectId} already has imported targets.`);
  }

  const removedNodeIds = new Set<string>();
  if (command.replaceExisting) {
    for (const childId of ownerNode.children) {
      if (snapshot.nodes[childId]?.kind === "imported") {
        for (const subtreeNodeId of collectNodeSubtreeIds(snapshot, childId)) {
          removedNodeIds.add(subtreeNodeId);
        }
      }
    }
  }

  const removed = removedNodeIds.size > 0
    ? removeNodesFromHierarchy(snapshot, removedNodeIds)
    : { nodes: snapshot.nodes, rootNodeIds: snapshot.rootNodeIds };
  const existingNodes = removed.nodes;

  for (const nodeId of Object.keys(importedNodes)) {
    if (existingNodes[nodeId]) {
      throw new Error(`Imported target node ${nodeId} already exists.`);
    }
  }

  const childIds = Object.values(importedNodes)
    .filter((node) => node.parentId === ownerNode.id)
    .map((node) => node.id);
  const nextOwnerNode = existingNodes[ownerNode.id];
  if (!nextOwnerNode || nextOwnerNode.kind !== "object") {
    throw new Error(`Owner object ${command.ownerObjectId} does not have an object node.`);
  }

  return syncPayloadsFromNodes({
    ...snapshot,
    nodes: {
      ...existingNodes,
      [ownerNode.id]: {
        ...nextOwnerNode,
        children: [...nextOwnerNode.children, ...childIds]
      },
      ...importedNodes
    },
    rootNodeIds: removed.rootNodeIds
  });
}

import { createObjectNode } from "./defaults";
import type { SceneNode, SceneSnapshot } from "./types";

export function createLightNodeId(lightId: string, nodes: Record<string, SceneNode>): string {
  if (!nodes[lightId]) {
    return lightId;
  }

  const preferred = `${lightId}:light`;
  if (!nodes[preferred]) {
    return preferred;
  }

  let index = 2;
  let candidate = `${preferred}-${index}`;
  while (nodes[candidate]) {
    index += 1;
    candidate = `${preferred}-${index}`;
  }
  return candidate;
}

export function findObjectNodeId(snapshot: SceneSnapshot, objectId: string): string | null {
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind === "object" && node.objectId === objectId) {
      return node.id;
    }
  }
  return null;
}

export function findLightNodeId(snapshot: SceneSnapshot, lightId: string): string | null {
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind === "light" && node.lightId === lightId) {
      return node.id;
    }
  }
  return null;
}

export function syncNodesFromObjectHierarchy(snapshot: SceneSnapshot): Pick<SceneSnapshot, "nodes" | "rootNodeIds"> {
  const nodes: Record<string, SceneNode> = {};
  const rootNodeIds: string[] = [];
  const objectNodeIds = new Map<string, string>();

  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind === "object") {
      objectNodeIds.set(node.objectId, node.id);
    } else {
      nodes[node.id] = { ...node, children: [...node.children] };
      if (!node.parentId && snapshot.rootNodeIds.includes(node.id)) {
        rootNodeIds.push(node.id);
      }
    }
  }

  for (const object of Object.values(snapshot.objects)) {
    objectNodeIds.set(object.id, objectNodeIds.get(object.id) ?? object.id);
  }

  for (const object of Object.values(snapshot.objects)) {
    const nodeId = objectNodeIds.get(object.id)!;
    const importedChildren = Object.values(snapshot.nodes)
      .filter((node) => node.kind === "imported" && node.parentId === nodeId)
      .map((node) => node.id);
    nodes[nodeId] = {
      ...createObjectNode(object),
      id: nodeId,
      parentId: object.parentId ? objectNodeIds.get(object.parentId) ?? object.parentId : null,
      children: [
        ...object.children.map((childId) => objectNodeIds.get(childId) ?? childId),
        ...importedChildren
      ]
    };
  }

  for (const objectId of snapshot.rootObjectIds) {
    const nodeId = objectNodeIds.get(objectId);
    if (nodeId && !rootNodeIds.includes(nodeId)) {
      rootNodeIds.push(nodeId);
    }
  }
  return { nodes, rootNodeIds };
}

export function syncSelectionFromObjectSelection(snapshot: SceneSnapshot): SceneSnapshot["selection"] {
  const nodeIds = snapshot.selection.objectIds
    .map((objectId) => findObjectNodeId(snapshot, objectId))
    .filter((nodeId): nodeId is string => Boolean(nodeId));
  const nodeId = snapshot.selection.objectId
    ? findObjectNodeId(snapshot, snapshot.selection.objectId)
    : nodeIds[0] ?? null;

  return {
    nodeId: nodeId && nodeIds.includes(nodeId) ? nodeId : nodeIds[0] ?? null,
    nodeIds,
    objectId: snapshot.selection.objectId,
    objectIds: [...snapshot.selection.objectIds]
  };
}

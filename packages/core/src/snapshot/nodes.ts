import type { LightDefinition } from "../lights/types";
import { createLightNode, createObjectNode } from "./defaults";
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

export function addObjectNode(snapshot: SceneSnapshot, objectId: string): Pick<SceneSnapshot, "nodes" | "rootNodeIds"> {
  const object = snapshot.objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }
  const parentNodeId = object.parentId ? findObjectNodeId(snapshot, object.parentId) : null;
  const node = {
    ...createObjectNode(object),
    parentId: parentNodeId,
    children: [] as string[]
  };
  const nodes = { ...snapshot.nodes, [node.id]: node };
  let rootNodeIds = snapshot.rootNodeIds;

  if (parentNodeId) {
    const parent = nodes[parentNodeId];
    nodes[parentNodeId] = {
      ...parent,
      children: parent.children.includes(node.id) ? parent.children : [...parent.children, node.id]
    };
  } else {
    rootNodeIds = rootNodeIds.includes(node.id) ? rootNodeIds : [...rootNodeIds, node.id];
  }

  return { nodes, rootNodeIds };
}

export function addLightNode(snapshot: SceneSnapshot, light: LightDefinition): Pick<SceneSnapshot, "nodes" | "rootNodeIds"> {
  const nodeId = createLightNodeId(light.id, snapshot.nodes);
  const node = createLightNode(light, nodeId);
  return {
    nodes: {
      ...snapshot.nodes,
      [nodeId]: node
    },
    rootNodeIds: [...snapshot.rootNodeIds, nodeId]
  };
}

export function removeNodesForObjects(
  snapshot: SceneSnapshot,
  removedObjectIds: Set<string>
): Pick<SceneSnapshot, "nodes" | "rootNodeIds" | "selection"> {
  const removedNodeIds = new Set<string>();
  for (const node of Object.values(snapshot.nodes)) {
    if (node.kind === "object" && removedObjectIds.has(node.objectId)) {
      removedNodeIds.add(node.id);
    }
  }

  return removeNodes(snapshot, removedNodeIds);
}

export function removeNodeForLight(snapshot: SceneSnapshot, lightId: string): Pick<SceneSnapshot, "nodes" | "rootNodeIds" | "selection"> {
  const nodeId = findLightNodeId(snapshot, lightId);
  return removeNodes(snapshot, nodeId ? new Set([nodeId]) : new Set());
}

export function syncObjectNodeTransform(snapshot: SceneSnapshot, objectId: string): Pick<SceneSnapshot, "nodes"> {
  const nodeId = findObjectNodeId(snapshot, objectId);
  if (!nodeId) {
    return { nodes: snapshot.nodes };
  }
  const node = snapshot.nodes[nodeId];
  const object = snapshot.objects[objectId];
  if (!object || node.kind !== "object") {
    return { nodes: snapshot.nodes };
  }
  return {
    nodes: {
      ...snapshot.nodes,
      [nodeId]: {
        ...node,
        name: object.name,
        transform: object.transform
      }
    }
  };
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
    nodes[nodeId] = {
      ...createObjectNode(object),
      id: nodeId,
      parentId: object.parentId ? objectNodeIds.get(object.parentId) ?? object.parentId : null,
      children: object.children.map((childId) => objectNodeIds.get(childId) ?? childId)
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

function removeNodes(
  snapshot: SceneSnapshot,
  removedNodeIds: Set<string>
): Pick<SceneSnapshot, "nodes" | "rootNodeIds" | "selection"> {
  if (removedNodeIds.size === 0) {
    return {
      nodes: snapshot.nodes,
      rootNodeIds: snapshot.rootNodeIds,
      selection: snapshot.selection
    };
  }

  const nodes: Record<string, SceneNode> = {};
  for (const [nodeId, node] of Object.entries(snapshot.nodes)) {
    if (removedNodeIds.has(nodeId)) {
      continue;
    }
    nodes[nodeId] = {
      ...node,
      children: node.children.filter((childId) => !removedNodeIds.has(childId))
    };
  }

  const nodeIds = snapshot.selection.nodeIds.filter((nodeId) => !removedNodeIds.has(nodeId));
  const nodeId = nodeIds.includes(snapshot.selection.nodeId ?? "") ? snapshot.selection.nodeId : nodeIds[0] ?? null;
  const objectIds = snapshot.selection.objectIds.filter((objectId) => {
    const selectedNodeId = findObjectNodeId(snapshot, objectId);
    return selectedNodeId ? !removedNodeIds.has(selectedNodeId) : true;
  });
  const objectId = objectIds.includes(snapshot.selection.objectId ?? "") ? snapshot.selection.objectId : objectIds[0] ?? null;

  return {
    nodes,
    rootNodeIds: snapshot.rootNodeIds.filter((nodeId) => !removedNodeIds.has(nodeId)),
    selection: {
      nodeId,
      nodeIds,
      objectId,
      objectIds
    }
  };
}

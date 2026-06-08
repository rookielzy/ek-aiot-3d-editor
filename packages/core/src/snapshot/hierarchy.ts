import { findObjectNodeId } from "./nodes";
import type { SceneNode, SceneObject, SceneSnapshot } from "./types";

export function collectNodeSubtreeIds(snapshot: SceneSnapshot, nodeId: string): string[] {
  const node = snapshot.nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} does not exist.`);
  }

  const ids = [nodeId];
  for (const childId of node.children) {
    ids.push(...collectNodeSubtreeIds(snapshot, childId));
  }
  return ids;
}

export function isNodeAncestorOf(snapshot: SceneSnapshot, ancestorId: string, descendantId: string): boolean {
  let parentId = snapshot.nodes[descendantId]?.parentId ?? null;
  while (parentId) {
    if (parentId === ancestorId) {
      return true;
    }
    parentId = snapshot.nodes[parentId]?.parentId ?? null;
  }
  return false;
}

export function getTopLevelNodeIds(snapshot: SceneSnapshot, nodeIds: readonly string[]): string[] {
  const selected = new Set(nodeIds);
  return nodeIds.filter((nodeId) => {
    let parentId = snapshot.nodes[nodeId]?.parentId ?? null;
    while (parentId) {
      if (selected.has(parentId)) {
        return false;
      }
      parentId = snapshot.nodes[parentId]?.parentId ?? null;
    }
    return true;
  });
}

export function removeNodesFromHierarchy(snapshot: SceneSnapshot, removedNodeIds: Set<string>): {
  nodes: SceneSnapshot["nodes"];
  rootNodeIds: string[];
} {
  const nodes: SceneSnapshot["nodes"] = {};

  for (const [nodeId, node] of Object.entries(snapshot.nodes)) {
    if (removedNodeIds.has(nodeId)) {
      continue;
    }
    nodes[nodeId] = cloneNodeWithChildren(
      node,
      node.children.filter((childId) => !removedNodeIds.has(childId))
    );
  }

  return {
    nodes,
    rootNodeIds: snapshot.rootNodeIds.filter((nodeId) => !removedNodeIds.has(nodeId))
  };
}

export function reparentNode(
  nodes: SceneSnapshot["nodes"],
  rootNodeIds: string[],
  nodeId: string,
  nextParentId: string | null
): { nodes: SceneSnapshot["nodes"]; rootNodeIds: string[] } {
  const node = nodes[nodeId];
  if (!node) {
    throw new Error(`Node ${nodeId} does not exist.`);
  }
  if (nextParentId && !nodes[nextParentId]) {
    throw new Error(`Parent node ${nextParentId} does not exist.`);
  }
  if (nextParentId === nodeId) {
    throw new Error("Node cannot be parented to itself.");
  }
  let ancestorId = nextParentId;
  while (ancestorId) {
    if (ancestorId === nodeId) {
      throw new Error("Node cannot be parented under its descendant.");
    }
    ancestorId = nodes[ancestorId]?.parentId ?? null;
  }
  assertImportedReparentAllowed(nodes, nodeId, nextParentId);

  const nextNodes = { ...nodes };
  let nextRootNodeIds = [...rootNodeIds];
  const previousParentId = node.parentId;

  if (previousParentId) {
    const previousParent = nextNodes[previousParentId];
    nextNodes[previousParentId] = cloneNodeWithChildren(
      previousParent,
      previousParent.children.filter((childId) => childId !== nodeId)
    );
  } else {
    nextRootNodeIds = nextRootNodeIds.filter((rootId) => rootId !== nodeId);
  }

  if (nextParentId) {
    const nextParent = nextNodes[nextParentId];
    nextNodes[nextParentId] = cloneNodeWithChildren(
      nextParent,
      nextParent.children.includes(nodeId) ? nextParent.children : [...nextParent.children, nodeId]
    );
  } else if (!nextRootNodeIds.includes(nodeId)) {
    nextRootNodeIds.push(nodeId);
  }

  nextNodes[nodeId] = {
    ...node,
    parentId: nextParentId
  };

  return {
    nodes: nextNodes,
    rootNodeIds: nextRootNodeIds
  };
}

function assertImportedReparentAllowed(
  nodes: SceneSnapshot["nodes"],
  nodeId: string,
  nextParentId: string | null
): void {
  const node = nodes[nodeId];
  const parent = nextParentId ? nodes[nextParentId] : undefined;

  if (parent?.kind === "imported" && node.kind !== "imported") {
    throw new Error(`Node ${nodeId} cannot be parented under imported node ${nextParentId}.`);
  }

  if (node.kind !== "imported") {
    return;
  }

  if (!nextParentId || !parent) {
    throw new Error(`Imported node ${nodeId} must remain under its owner object.`);
  }

  if (parent.kind === "object") {
    if (parent.objectId !== node.ownerObjectId) {
      throw new Error(`Imported node ${nodeId} cannot be parented under a different owner object.`);
    }
    return;
  }

  if (parent.kind === "imported") {
    if (parent.ownerObjectId !== node.ownerObjectId) {
      throw new Error(`Imported node ${nodeId} cannot be parented under an imported node with a different owner.`);
    }
    return;
  }

  throw new Error(`Imported node ${nodeId} must be parented under its owner object or imported subtree.`);
}

export function collectObjectSubtreeIds(snapshot: SceneSnapshot, objectId: string): string[] {
  const nodeId = findObjectNodeId(snapshot, objectId);
  if (!nodeId || !snapshot.objects[objectId]) {
    throw new Error(`Object ${objectId} does not exist.`);
  }

  return collectNodeSubtreeIds(snapshot, nodeId)
    .map((subtreeNodeId) => snapshot.nodes[subtreeNodeId])
    .filter((node) => node?.kind === "object")
    .map((node) => node.objectId);
}

export function isAncestorOf(snapshot: SceneSnapshot, ancestorId: string, descendantId: string): boolean {
  const ancestorNodeId = findObjectNodeId(snapshot, ancestorId);
  const descendantNodeId = findObjectNodeId(snapshot, descendantId);
  if (!ancestorNodeId || !descendantNodeId) {
    return false;
  }
  return isNodeAncestorOf(snapshot, ancestorNodeId, descendantNodeId);
}

export function removeObjectsFromHierarchy(snapshot: SceneSnapshot, removedObjectIds: Set<string>): {
  objects: SceneSnapshot["objects"];
  rootObjectIds: string[];
} {
  const objects: SceneSnapshot["objects"] = {};

  for (const [objectId, object] of Object.entries(snapshot.objects)) {
    if (removedObjectIds.has(objectId)) {
      continue;
    }
    objects[objectId] = {
      ...object,
      children: object.children.filter((childId) => !removedObjectIds.has(childId))
    };
  }

  return {
    objects,
    rootObjectIds: snapshot.rootObjectIds.filter((objectId) => !removedObjectIds.has(objectId))
  };
}

export function reparentObject(
  objects: SceneSnapshot["objects"],
  rootObjectIds: string[],
  objectId: string,
  nextParentId: string | null
): { objects: SceneSnapshot["objects"]; rootObjectIds: string[] } {
  const object = objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }
  if (nextParentId && !objects[nextParentId]) {
    throw new Error(`Parent object ${nextParentId} does not exist.`);
  }
  if (nextParentId === objectId) {
    throw new Error("Object cannot be parented to itself.");
  }
  let ancestorId = nextParentId;
  while (ancestorId) {
    if (ancestorId === objectId) {
      throw new Error("Object cannot be parented under its descendant.");
    }
    ancestorId = objects[ancestorId]?.parentId ?? null;
  }

  const nextObjects = { ...objects };
  let nextRootObjectIds = [...rootObjectIds];
  const previousParentId = object.parentId;

  if (previousParentId) {
    const previousParent = nextObjects[previousParentId];
    nextObjects[previousParentId] = {
      ...previousParent,
      children: previousParent.children.filter((childId) => childId !== objectId)
    };
  } else {
    nextRootObjectIds = nextRootObjectIds.filter((rootId) => rootId !== objectId);
  }

  if (nextParentId) {
    const nextParent = nextObjects[nextParentId];
    nextObjects[nextParentId] = {
      ...nextParent,
      children: nextParent.children.includes(objectId) ? nextParent.children : [...nextParent.children, objectId]
    };
  } else if (!nextRootObjectIds.includes(objectId)) {
    nextRootObjectIds.push(objectId);
  }

  nextObjects[objectId] = {
    ...object,
    parentId: nextParentId
  };

  return {
    objects: nextObjects,
    rootObjectIds: nextRootObjectIds
  };
}

export function cloneSceneObject(object: SceneObject, id: string, parentId: string | null, children: string[]): SceneObject {
  return {
    ...object,
    id,
    parentId,
    children: [...children],
    asset: { ...object.asset },
    transform: {
      position: [...object.transform.position],
      rotation: [...object.transform.rotation],
      scale: [...object.transform.scale]
    },
    ...(object.metadata ? { metadata: { ...object.metadata } } : {})
  };
}

function cloneNodeWithChildren(node: SceneNode, children: string[]): SceneNode {
  return {
    ...node,
    children: [...children]
  };
}

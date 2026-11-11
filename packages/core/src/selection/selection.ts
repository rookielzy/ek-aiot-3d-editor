import type { SceneSnapshot } from "../snapshot/types";
import { findObjectNodeId } from "../snapshot/nodes";

export type SelectionMode = "replace" | "add" | "remove" | "toggle" | "clear" | "all";

export interface SelectionState {
  nodeId: string | null;
  nodeIds: string[];
  objectId: string | null;
  objectIds: string[];
}

export interface SelectionInput {
  objectId?: string | null;
  objectIds?: readonly string[];
  primaryObjectId?: string | null;
  mode?: SelectionMode;
}

export interface NodeSelectionInput {
  nodeId?: string | null;
  nodeIds?: readonly string[];
  primaryNodeId?: string | null;
  mode?: SelectionMode;
}

export function normalizeNodeSelection(
  snapshot: SceneSnapshot,
  input: NodeSelectionInput
): SelectionState {
  const mode = input.mode ?? "replace";
  const current = getSelectedNodeIds(snapshot);

  let nodeIds: string[];
  let primaryNodeId = input.primaryNodeId ?? input.nodeId ?? null;

  switch (mode) {
    case "replace":
      nodeIds = input.nodeIds ? [...input.nodeIds] : input.nodeId ? [input.nodeId] : [];
      primaryNodeId = input.primaryNodeId ?? nodeIds[0] ?? null;
      break;
    case "add":
      nodeIds = [...current, ...nodeIdsFromInput(input)];
      primaryNodeId = input.primaryNodeId ?? input.nodeId ?? snapshot.selection.nodeId ?? nodeIds[0] ?? null;
      break;
    case "remove": {
      const removeIds = new Set(nodeIdsFromInput(input));
      nodeIds = current.filter((nodeId) => !removeIds.has(nodeId));
      primaryNodeId = nodeIds.includes(snapshot.selection.nodeId ?? "")
        ? snapshot.selection.nodeId
        : nodeIds[0] ?? null;
      break;
    }
    case "toggle": {
      nodeIds = [...current];
      for (const nodeId of nodeIdsFromInput(input)) {
        if (nodeIds.includes(nodeId)) {
          nodeIds = nodeIds.filter((selectedId) => selectedId !== nodeId);
        } else {
          nodeIds.push(nodeId);
        }
      }
      primaryNodeId = input.primaryNodeId ??
        (nodeIds.includes(input.nodeId ?? "")
          ? input.nodeId ?? null
          : nodeIds.includes(snapshot.selection.nodeId ?? "")
            ? snapshot.selection.nodeId
            : nodeIds[0] ?? null);
      // Callers may name the node they tried to toggle even when the toggle removed it, or keep
      // the node that was primary before; both would leave a primary outside the selection.
      if (primaryNodeId !== null && !nodeIds.includes(primaryNodeId)) {
        primaryNodeId = nodeIds[0] ?? null;
      }
      break;
    }
    case "clear":
      nodeIds = [];
      primaryNodeId = null;
      break;
    case "all":
      nodeIds = getAllNodeIds(snapshot);
      primaryNodeId = input.primaryNodeId ?? snapshot.selection.nodeId ?? nodeIds[0] ?? null;
      break;
  }

  return assertNodeSelectionExists(snapshot, {
    nodeId: primaryNodeId,
    nodeIds: dedupe(nodeIds)
  });
}

export function normalizeSelection(
  snapshot: SceneSnapshot,
  input: SelectionInput
): SelectionState {
  const mode = input.mode ?? "replace";
  const current = getSelectedObjectIds(snapshot);

  let objectIds: string[];
  let primaryObjectId = input.primaryObjectId ?? input.objectId ?? null;

  switch (mode) {
    case "replace":
      objectIds = input.objectIds ? [...input.objectIds] : input.objectId ? [input.objectId] : [];
      primaryObjectId = input.primaryObjectId ?? objectIds[0] ?? null;
      break;
    case "add":
      objectIds = [...current, ...idsFromInput(input)];
      primaryObjectId = input.primaryObjectId ?? input.objectId ?? snapshot.selection.objectId ?? objectIds[0] ?? null;
      break;
    case "remove": {
      const removeIds = new Set(idsFromInput(input));
      objectIds = current.filter((objectId) => !removeIds.has(objectId));
      primaryObjectId = objectIds.includes(snapshot.selection.objectId ?? "")
        ? snapshot.selection.objectId
        : objectIds[0] ?? null;
      break;
    }
    case "toggle": {
      objectIds = [...current];
      for (const objectId of idsFromInput(input)) {
        if (objectIds.includes(objectId)) {
          objectIds = objectIds.filter((selectedId) => selectedId !== objectId);
        } else {
          objectIds.push(objectId);
        }
      }
      primaryObjectId = objectIds.includes(input.objectId ?? "")
        ? input.objectId ?? null
        : objectIds.includes(snapshot.selection.objectId ?? "")
          ? snapshot.selection.objectId
          : objectIds[0] ?? null;
      if (primaryObjectId !== null && !objectIds.includes(primaryObjectId)) {
        primaryObjectId = objectIds[0] ?? null;
      }
      break;
    }
    case "clear":
      objectIds = [];
      primaryObjectId = null;
      break;
    case "all":
      objectIds = [...snapshot.rootObjectIds];
      for (const objectId of Object.keys(snapshot.objects)) {
        if (!objectIds.includes(objectId)) {
          objectIds.push(objectId);
        }
      }
      primaryObjectId = input.primaryObjectId ?? snapshot.selection.objectId ?? objectIds[0] ?? null;
      break;
  }

  return assertSelectionExists(snapshot, {
    objectId: primaryObjectId,
    objectIds: dedupe(objectIds)
  });
}

export function selectionEquals(left: SelectionState, right: SelectionState): boolean {
  return left.nodeId === right.nodeId &&
    left.nodeIds.length === right.nodeIds.length &&
    left.nodeIds.every((nodeId, index) => nodeId === right.nodeIds[index]) &&
    left.objectId === right.objectId &&
    left.objectIds.length === right.objectIds.length &&
    left.objectIds.every((objectId, index) => objectId === right.objectIds[index]);
}

export function getSelectedObjectIds(snapshot: SceneSnapshot): string[] {
  return deriveObjectSelection(snapshot, snapshot.selection.nodeId, getSelectedNodeIds(snapshot)).objectIds;
}

export function getSelectedNodeIds(snapshot: SceneSnapshot): string[] {
  return snapshot.selection.nodeIds.length > 0
    ? [...snapshot.selection.nodeIds]
    : snapshot.selection.nodeId ? [snapshot.selection.nodeId] : [];
}

export function getTopLevelSelectedObjectIds(snapshot: SceneSnapshot, objectIds = getSelectedObjectIds(snapshot)): string[] {
  const selected = new Set(objectIds);
  return objectIds.filter((objectId) => {
    const nodeId = findObjectNodeId(snapshot, objectId);
    let parentNodeId = nodeId ? snapshot.nodes[nodeId]?.parentId ?? null : null;
    while (parentNodeId) {
      const parent = snapshot.nodes[parentNodeId];
      if (parent?.kind === "object" && selected.has(parent.objectId)) {
        return false;
      }
      parentNodeId = parent?.parentId ?? null;
    }
    return true;
  });
}

function nodeIdsFromInput(input: NodeSelectionInput): string[] {
  return dedupe([
    ...(input.nodeIds ?? []),
    ...(input.nodeId ? [input.nodeId] : [])
  ]);
}

function getAllNodeIds(snapshot: SceneSnapshot): string[] {
  const ids: string[] = [];
  const visit = (nodeId: string): void => {
    if (ids.includes(nodeId) || !snapshot.nodes[nodeId]) {
      return;
    }
    ids.push(nodeId);
    for (const childId of snapshot.nodes[nodeId].children) {
      visit(childId);
    }
  };

  for (const nodeId of snapshot.rootNodeIds) {
    visit(nodeId);
  }
  for (const nodeId of Object.keys(snapshot.nodes)) {
    visit(nodeId);
  }
  return ids;
}

function idsFromInput(input: SelectionInput): string[] {
  return dedupe([
    ...(input.objectIds ?? []),
    ...(input.objectId ? [input.objectId] : [])
  ]);
}

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function assertSelectionExists(
  snapshot: SceneSnapshot,
  selection: Pick<SelectionState, "objectId" | "objectIds">
): SelectionState {
  for (const objectId of selection.objectIds) {
    if (!snapshot.objects[objectId]) {
      throw new Error(`Object ${objectId} does not exist.`);
    }
  }

  if (selection.objectId !== null) {
    if (!snapshot.objects[selection.objectId]) {
      throw new Error(`Object ${selection.objectId} does not exist.`);
    }
    if (!selection.objectIds.includes(selection.objectId)) {
      throw new Error(`Primary selected object ${selection.objectId} must be included in selected object IDs.`);
    }
  }

  const nodeIds = selection.objectIds
    .map((objectId) => {
      const nodeId = findObjectNodeId(snapshot, objectId);
      if (!nodeId) {
        throw new Error(`Object ${objectId} does not have a scene node.`);
      }
      return nodeId;
    });
  const primaryNodeId = selection.objectId ? findObjectNodeId(snapshot, selection.objectId) : nodeIds[0] ?? null;

  return assertNodeSelectionExists(snapshot, {
    nodeId: primaryNodeId && nodeIds.includes(primaryNodeId) ? primaryNodeId : nodeIds[0] ?? null,
    nodeIds
  });
}

function assertNodeSelectionExists(
  snapshot: SceneSnapshot,
  selection: Pick<SelectionState, "nodeId" | "nodeIds">
): SelectionState {
  for (const nodeId of selection.nodeIds) {
    if (!snapshot.nodes[nodeId]) {
      throw new Error(`Node ${nodeId} does not exist.`);
    }
  }

  if (selection.nodeId !== null) {
    if (!snapshot.nodes[selection.nodeId]) {
      throw new Error(`Node ${selection.nodeId} does not exist.`);
    }
    if (!selection.nodeIds.includes(selection.nodeId)) {
      throw new Error(`Primary selected node ${selection.nodeId} must be included in selected node IDs.`);
    }
  }

  return {
    ...selection,
    ...deriveObjectSelection(snapshot, selection.nodeId, selection.nodeIds)
  };
}

function deriveObjectSelection(
  snapshot: SceneSnapshot,
  primaryNodeId: string | null,
  nodeIds: readonly string[]
): Pick<SelectionState, "objectId" | "objectIds"> {
  const objectIds = nodeIds
    .map((nodeId) => snapshot.nodes[nodeId])
    .filter((node) => node?.kind === "object")
    .map((node) => node.objectId);
  const primaryNode = primaryNodeId ? snapshot.nodes[primaryNodeId] : undefined;
  const objectId = primaryNode?.kind === "object" ? primaryNode.objectId : objectIds[0] ?? null;

  return {
    objectId,
    objectIds
  };
}

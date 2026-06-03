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

export function normalizeSelection(
  snapshot: SceneSnapshot,
  input: SelectionInput
): SelectionState {
  const mode = input.mode ?? "replace";
  const current = snapshot.selection.objectIds.length > 0
    ? snapshot.selection.objectIds
    : snapshot.selection.objectId ? [snapshot.selection.objectId] : [];

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
    nodeId: null,
    nodeIds: [],
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
  return snapshot.selection.objectIds.length > 0
    ? [...snapshot.selection.objectIds]
    : snapshot.selection.objectId ? [snapshot.selection.objectId] : [];
}

export function getTopLevelSelectedObjectIds(snapshot: SceneSnapshot, objectIds = getSelectedObjectIds(snapshot)): string[] {
  const selected = new Set(objectIds);
  return objectIds.filter((objectId) => {
    let parentId = snapshot.objects[objectId]?.parentId ?? null;
    while (parentId) {
      if (selected.has(parentId)) {
        return false;
      }
      parentId = snapshot.objects[parentId]?.parentId ?? null;
    }
    return true;
  });
}

function idsFromInput(input: SelectionInput): string[] {
  return dedupe([
    ...(input.objectIds ?? []),
    ...(input.objectId ? [input.objectId] : [])
  ]);
}

function dedupe(objectIds: readonly string[]): string[] {
  return [...new Set(objectIds)];
}

function assertSelectionExists(snapshot: SceneSnapshot, selection: SelectionState): SelectionState {
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
    .map((objectId) => findObjectNodeId(snapshot, objectId))
    .filter((nodeId): nodeId is string => Boolean(nodeId));
  const primaryNodeId = selection.objectId ? findObjectNodeId(snapshot, selection.objectId) : nodeIds[0] ?? null;

  return {
    ...selection,
    nodeId: primaryNodeId && nodeIds.includes(primaryNodeId) ? primaryNodeId : nodeIds[0] ?? null,
    nodeIds
  };
}

import { createId } from "../snapshot/defaults";
import { cloneSceneObject } from "../snapshot/hierarchy";
import type { SceneSnapshot } from "../snapshot/types";
import type { PasteObjectsCommand } from "./types";

export function applyPasteObjects(snapshot: SceneSnapshot, command: PasteObjectsCommand): SceneSnapshot {
  const payload = command.payload;
  if (payload.kind !== "ek-aiot-3d-editor-objects" || payload.version !== 1) {
    throw new Error("Unsupported clipboard payload.");
  }
  if (payload.rootObjectIds.length === 0) {
    return snapshot;
  }

  for (const assetId of payload.assetIds) {
    if (!snapshot.assets[assetId]) {
      throw new Error(`Clipboard asset ${assetId} does not exist in the target snapshot.`);
    }
  }

  const idMap = buildObjectIdMap(snapshot, Object.keys(payload.objects), command.objectIdMap);
  const objects: SceneSnapshot["objects"] = { ...snapshot.objects };

  for (const [sourceId, sourceObject] of Object.entries(payload.objects)) {
    const objectId = idMap[sourceId];
    const parentId = sourceObject.parentId && idMap[sourceObject.parentId] ? idMap[sourceObject.parentId] : null;
    const children = sourceObject.children.map((childId) => idMap[childId]).filter((childId): childId is string => Boolean(childId));
    objects[objectId] = cloneSceneObject(sourceObject, objectId, parentId, children);
  }

  const materialIdMap = new Map<string, string>();
  const definitions = { ...snapshot.materials.definitions };
  for (const [materialId, definition] of Object.entries(payload.materials.definitions)) {
    const nextMaterialId = createUniqueId(snapshot.materials.definitions, definitions, `copy:${materialId}`);
    materialIdMap.set(materialId, nextMaterialId);
    definitions[nextMaterialId] = {
      ...definition,
      id: nextMaterialId,
      name: definition.name,
      override: { ...definition.override, textures: definition.override.textures ? { ...definition.override.textures } : undefined }
    };
  }

  const assignments = { ...snapshot.materials.assignments };
  for (const [assignmentId, assignment] of Object.entries(payload.materials.assignments)) {
    const objectId = idMap[assignment.target.objectId];
    if (!objectId) {
      continue;
    }
    const target = assignment.target.kind === "object"
      ? { kind: "object" as const, objectId }
      : { kind: "material-slot" as const, objectId, slotId: assignment.target.slotId };
    const nextAssignmentId = target.kind === "object"
      ? `object:${target.objectId}`
      : `material-slot:${target.objectId}:${target.slotId}`;
    assignments[nextAssignmentId] = {
      ...assignment,
      id: nextAssignmentId,
      materialId: materialIdMap.get(assignment.materialId) ?? assignment.materialId,
      target
    };
  }

  const pastedRootIds = payload.rootObjectIds.map((objectId) => idMap[objectId]).filter((objectId): objectId is string => Boolean(objectId));

  return {
    ...snapshot,
    objects,
    rootObjectIds: [...snapshot.rootObjectIds, ...pastedRootIds],
    selection: {
      objectId: pastedRootIds[0] ?? null,
      objectIds: pastedRootIds
    },
    materials: {
      definitions,
      assignments
    }
  };
}

function buildObjectIdMap(
  snapshot: SceneSnapshot,
  sourceObjectIds: string[],
  providedMap: Record<string, string> | undefined
): Record<string, string> {
  const idMap: Record<string, string> = {};
  const usedIds = new Set(Object.keys(snapshot.objects));
  for (const sourceId of sourceObjectIds) {
    const providedId = providedMap?.[sourceId];
    const objectId = providedId ?? createId("object");
    if (usedIds.has(objectId)) {
      throw new Error(`Object ${objectId} already exists.`);
    }
    usedIds.add(objectId);
    idMap[sourceId] = objectId;
  }
  return idMap;
}

function createUniqueId(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
  preferredId: string
): string {
  if (!current[preferredId] && !next[preferredId]) {
    return preferredId;
  }
  let candidate = createId("material");
  while (current[candidate] || next[candidate]) {
    candidate = createId("material");
  }
  return candidate;
}

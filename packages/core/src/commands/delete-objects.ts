import { getSelectedObjectIds, getTopLevelSelectedObjectIds } from "../selection/selection";
import { collectObjectSubtreeIds, removeObjectsFromHierarchy } from "../snapshot/hierarchy";
import type { SceneSnapshot } from "../snapshot/types";
import type { DeleteObjectsCommand } from "./types";

export function applyDeleteObjects(snapshot: SceneSnapshot, command: DeleteObjectsCommand): SceneSnapshot {
  const targetIds = command.objectIds ?? getSelectedObjectIds(snapshot);
  if (targetIds.length === 0) {
    return snapshot;
  }

  for (const objectId of targetIds) {
    if (!snapshot.objects[objectId]) {
      throw new Error(`Object ${objectId} does not exist.`);
    }
  }

  const topLevelIds = getTopLevelSelectedObjectIds(snapshot, targetIds);
  const removedObjectIds = new Set<string>();
  for (const objectId of topLevelIds) {
    for (const subtreeId of collectObjectSubtreeIds(snapshot, objectId)) {
      removedObjectIds.add(subtreeId);
    }
  }

  const { objects, rootObjectIds } = removeObjectsFromHierarchy(snapshot, removedObjectIds);
  const selectionObjectIds = snapshot.selection.objectIds.filter((objectId) => !removedObjectIds.has(objectId));
  const objectId = selectionObjectIds.includes(snapshot.selection.objectId ?? "")
    ? snapshot.selection.objectId
    : selectionObjectIds[0] ?? null;

  const assignments = Object.fromEntries(
    Object.entries(snapshot.materials.assignments).filter(([, assignment]) => !removedObjectIds.has(assignment.target.objectId))
  );

  return {
    ...snapshot,
    objects,
    rootObjectIds,
    selection: {
      objectId,
      objectIds: selectionObjectIds
    },
    materials: {
      ...snapshot.materials,
      assignments
    }
  };
}

import { getSelectedObjectIds, getTopLevelSelectedObjectIds } from "../selection/selection";
import { collectObjectSubtreeIds } from "../snapshot/hierarchy";
import type { SceneSnapshot } from "../snapshot/types";
import { isJsonCompatible } from "../snapshot/validation";
import type { EditorClipboardPayload } from "./types";

export function createClipboardPayload(snapshot: SceneSnapshot, objectIds = getSelectedObjectIds(snapshot)): EditorClipboardPayload {
  const topLevelIds = getTopLevelSelectedObjectIds(snapshot, objectIds);
  const copiedObjectIds = new Set<string>();

  for (const objectId of topLevelIds) {
    for (const subtreeId of collectObjectSubtreeIds(snapshot, objectId)) {
      copiedObjectIds.add(subtreeId);
    }
  }

  const objects: EditorClipboardPayload["objects"] = {};
  const assetIds = new Set<string>();

  for (const objectId of copiedObjectIds) {
    const object = snapshot.objects[objectId];
    assetIds.add(object.asset.id);
    objects[objectId] = {
      ...object,
      originalId: object.id,
      asset: { ...object.asset },
      children: object.children.filter((childId) => copiedObjectIds.has(childId)),
      transform: {
        position: [...object.transform.position],
        rotation: [...object.transform.rotation],
        scale: [...object.transform.scale]
      },
      ...(object.metadata ? { metadata: { ...object.metadata } } : {})
    };
  }

  const materialIds = new Set<string>();
  const assignments = Object.fromEntries(
    Object.entries(snapshot.materials.assignments)
      .filter(([, assignment]) => copiedObjectIds.has(assignment.target.objectId))
      .map(([assignmentId, assignment]) => {
        materialIds.add(assignment.materialId);
        return [assignmentId, { ...assignment, target: { ...assignment.target } }];
      })
  );
  const definitions = Object.fromEntries(
    [...materialIds]
      .map((materialId) => snapshot.materials.definitions[materialId])
      .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition))
      .map((definition) => [definition.id, definition])
  );

  const payload: EditorClipboardPayload = {
    kind: "ek-aiot-3d-editor-objects",
    version: 1,
    rootObjectIds: topLevelIds,
    objects,
    materials: {
      definitions,
      assignments
    },
    assetIds: [...assetIds]
  };

  if (!isJsonCompatible(payload)) {
    throw new Error("Clipboard payload must be JSON-compatible.");
  }

  return payload;
}

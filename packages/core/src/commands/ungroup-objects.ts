import type { SceneSnapshot } from "../snapshot/types";
import { reparentObject } from "../snapshot/hierarchy";
import { getLocalTransformForParent } from "../snapshot/transforms";
import type { UngroupObjectsCommand } from "./types";

export function applyUngroupObjects(snapshot: SceneSnapshot, command: UngroupObjectsCommand): SceneSnapshot {
  const objectId = command.objectId ?? snapshot.selection.objectId;
  if (!objectId) {
    throw new Error("Ungroup requires a selected object.");
  }
  const object = snapshot.objects[objectId];
  if (!object) {
    throw new Error(`Object ${objectId} does not exist.`);
  }
  if (object.children.length === 0) {
    return snapshot;
  }

  let objects = snapshot.objects;
  let rootObjectIds = snapshot.rootObjectIds;
  for (const childId of object.children) {
    const transform = getLocalTransformForParent({ ...snapshot, objects, rootObjectIds }, childId, object.parentId);
    ({ objects, rootObjectIds } = reparentObject(objects, rootObjectIds, childId, object.parentId));
    objects = {
      ...objects,
      [childId]: {
        ...objects[childId],
        transform
      }
    };
  }

  const ungroupedIds = object.children;
  return {
    ...snapshot,
    objects,
    rootObjectIds,
    selection: {
      objectId: ungroupedIds[0] ?? objectId,
      objectIds: ungroupedIds
    }
  };
}

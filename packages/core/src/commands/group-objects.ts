import { getSelectedObjectIds, getTopLevelSelectedObjectIds } from "../selection/selection";
import { isAncestorOf, reparentObject } from "../snapshot/hierarchy";
import { syncNodesFromObjectHierarchy, syncSelectionFromObjectSelection } from "../snapshot/nodes";
import { getLocalTransformForParent } from "../snapshot/transforms";
import type { SceneSnapshot } from "../snapshot/types";
import type { GroupObjectsCommand } from "./types";

export function applyGroupObjects(snapshot: SceneSnapshot, command: GroupObjectsCommand): SceneSnapshot {
  const selectedIds = command.objectIds ?? getSelectedObjectIds(snapshot);
  const primaryObjectId = command.primaryObjectId ?? snapshot.selection.objectId;
  if (!primaryObjectId) {
    throw new Error("Group requires a primary selected object.");
  }
  if (!snapshot.objects[primaryObjectId]) {
    throw new Error(`Object ${primaryObjectId} does not exist.`);
  }

  const topLevelIds = getTopLevelSelectedObjectIds(snapshot, selectedIds);
  if (!topLevelIds.includes(primaryObjectId)) {
    throw new Error("Group primary object must be a top-level selected object.");
  }
  if (topLevelIds.length < 2) {
    return snapshot;
  }

  let objects = snapshot.objects;
  let rootObjectIds = snapshot.rootObjectIds;
  for (const objectId of topLevelIds) {
    if (objectId === primaryObjectId) {
      continue;
    }
    if (isAncestorOf(snapshot, objectId, primaryObjectId)) {
      throw new Error("Group cannot create an ancestor cycle.");
    }
    const transform = getLocalTransformForParent({ ...snapshot, objects, rootObjectIds }, objectId, primaryObjectId);
    ({ objects, rootObjectIds } = reparentObject(objects, rootObjectIds, objectId, primaryObjectId));
    objects = {
      ...objects,
      [objectId]: {
        ...objects[objectId],
        transform
      }
    };
  }

  const nextSnapshot: SceneSnapshot = {
    ...snapshot,
    objects,
    rootObjectIds,
    selection: {
      nodeId: snapshot.selection.nodeId,
      nodeIds: snapshot.selection.nodeIds,
      objectId: primaryObjectId,
      objectIds: topLevelIds
    }
  };

  const nodeState = syncNodesFromObjectHierarchy(nextSnapshot);
  return {
    ...nextSnapshot,
    ...nodeState,
    selection: syncSelectionFromObjectSelection({ ...nextSnapshot, ...nodeState })
  };
}

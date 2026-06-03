import { reparentObject } from "../snapshot/hierarchy";
import { syncNodesFromObjectHierarchy } from "../snapshot/nodes";
import type { SceneSnapshot } from "../snapshot/types";
import type { ReparentObjectCommand } from "./types";

export function applyReparentObject(snapshot: SceneSnapshot, command: ReparentObjectCommand): SceneSnapshot {
  const { objects, rootObjectIds } = reparentObject(snapshot.objects, snapshot.rootObjectIds, command.objectId, command.parentId);
  const object = objects[command.objectId];
  const nextSnapshot = {
    ...snapshot,
    objects: {
      ...objects,
      [command.objectId]: {
        ...object,
        ...(command.transform ? { transform: command.transform } : {})
      }
    },
    rootObjectIds
  };

  return {
    ...nextSnapshot,
    ...syncNodesFromObjectHierarchy(nextSnapshot)
  };
}

import { reparentObject } from "../snapshot/hierarchy";
import type { SceneSnapshot } from "../snapshot/types";
import type { ReparentObjectCommand } from "./types";

export function applyReparentObject(snapshot: SceneSnapshot, command: ReparentObjectCommand): SceneSnapshot {
  const { objects, rootObjectIds } = reparentObject(snapshot.objects, snapshot.rootObjectIds, command.objectId, command.parentId);
  const object = objects[command.objectId];
  return {
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
}

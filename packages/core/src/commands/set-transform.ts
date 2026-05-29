import { cloneTransform, normalizeTransform, transformEquals } from "../snapshot/transforms";
import type { SceneSnapshot } from "../snapshot/types";
import type { SetTransformCommand } from "./types";

export function applySetTransform(snapshot: SceneSnapshot, command: SetTransformCommand): SceneSnapshot {
  const object = snapshot.objects[command.objectId];
  if (!object) {
    throw new Error(`Object ${command.objectId} does not exist.`);
  }

  const nextTransform = cloneTransform(normalizeTransform({
    ...object.transform,
    ...command.transform
  }));

  if (transformEquals(object.transform, nextTransform)) {
    return snapshot;
  }

  return {
    ...snapshot,
    objects: {
      ...snapshot.objects,
      [command.objectId]: {
        ...object,
        transform: nextTransform
      }
    }
  };
}

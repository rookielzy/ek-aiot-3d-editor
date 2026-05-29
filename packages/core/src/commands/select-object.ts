import type { SceneSnapshot } from "../snapshot/types";
import type { SelectObjectCommand } from "./types";

export function applySelectObject(snapshot: SceneSnapshot, command: SelectObjectCommand): SceneSnapshot {
  if (command.objectId !== null && !snapshot.objects[command.objectId]) {
    throw new Error(`Object ${command.objectId} does not exist.`);
  }

  if (snapshot.selection.objectId === command.objectId) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection: {
      objectId: command.objectId
    }
  };
}

import type { SceneSnapshot } from "../snapshot/types";
import { normalizeSelection, selectionEquals } from "../selection/selection";
import type { SelectObjectCommand, SelectObjectsCommand } from "./types";

export function applySelectObject(snapshot: SceneSnapshot, command: SelectObjectCommand): SceneSnapshot {
  const selection = normalizeSelection(snapshot, { mode: "replace", objectId: command.objectId });
  if (selectionEquals(snapshot.selection, selection)) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection
  };
}

export function applySelectObjects(snapshot: SceneSnapshot, command: SelectObjectsCommand): SceneSnapshot {
  const selection = normalizeSelection(snapshot, command);
  if (selectionEquals(snapshot.selection, selection)) {
    return snapshot;
  }

  return {
    ...snapshot,
    selection
  };
}
